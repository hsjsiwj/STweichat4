/**
 * 聊天记录管理器
 * 负责自动读取和解析聊天记录，集成到现有的微信扩展中
 */
class ChatRecordManager {
    constructor() {
        this.isActive = false;
        this.observer = null;
        this.currentFriendId = null;
        // 添加防重复缓存 - 改进的去重机制
        this.processedMessages = new Set();
        this.lastProcessedContent = '';
        this.lastProcessedContentHash = ''; // 添加内容哈希缓存
        this.debounceTimer = null;
        this.isProcessing = false;
        this.processingTimeout = null;
        
        // 增强的去重机制 - 参考mobile-main实现
        this.contentHashCache = new Map(); // 内容哈希缓存，提高性能
        this.batchProcessingQueue = []; // 批处理队列
        this.isBatchProcessing = false; // 批处理状态标记
        this.lastProcessTime = 0; // 上次处理时间
        this.processingLock = false; // 处理锁，防止并发

        // 延迟初始化依赖类，等待它们加载完成
        this.initialized = false;
        this.initDependencies();

        // 尽早初始化基础功能
        this.init();
    }

    /**
     * 初始化依赖类
     */
    initDependencies() {
        // 尝试立即初始化依赖类
        this.checkAndInitDependencies();

        // 如果依赖类未加载，设置定时检查
        if (!this.initialized) {
            const checkInterval = setInterval(() => {
                this.checkAndInitDependencies();
                if (this.initialized) {
                    clearInterval(checkInterval);
                }
            }, 500);

            // 10秒后停止检查，避免无限循环
            setTimeout(() => {
                clearInterval(checkInterval);
                if (!this.initialized) {
                    console.warn('[ChatRecordManager] 依赖类初始化超时，某些功能可能不可用');
                }
            }, 10000);
        }
    }

    /**
     * 检查并初始化依赖类
     */
    checkAndInitDependencies() {
        if (this.initialized) return;

        try {
            if (typeof ChatRecordStorage !== 'undefined') {
                this.storage = new ChatRecordStorage();
            } else {
                console.warn('[ChatRecordManager] ChatRecordStorage 类未加载');
            }

            if (typeof ChatRecordParser !== 'undefined') {
                this.parser = new ChatRecordParser();
            } else {
                console.warn('[ChatRecordManager] ChatRecordParser 类未加载');
            }

            if (typeof MessageRenderer !== 'undefined') {
                this.renderer = new MessageRenderer();
            } else {
                console.warn('[ChatRecordManager] MessageRenderer 类未加载');
            }

            // 如果所有关键依赖都已加载，标记为已初始化
            if (this.storage && this.parser && this.renderer) {
                this.initialized = true;
                console.log('[ChatRecordManager] 所有依赖类已加载并初始化');
            }
        } catch (error) {
            console.error('[ChatRecordManager] 依赖类初始化失败:', error);
        }
    }

    /**
     * 初始化聊天记录管理器
     */
    init() {
        // 等待DOM加载完成
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.setup());
        } else {
            this.setup();
        }
    }

    /**
     * 设置聊天记录管理器
     */
    setup() {
        // 加载CSS样式
        this.loadStyles();

        // 设置消息监听器
        this.setupMessageListener();

        // 集成到现有的微信扩展
        this.integrateWithWeChatExtension();

        this.isActive = true;
        console.log('[ChatRecordManager] 聊天记录管理器已启动');
    }

    /**
     * 加载CSS样式
     */
    loadStyles() {
        const cssLink = document.createElement('link');
        cssLink.rel = 'stylesheet';
        cssLink.href = `${window.wechatExtensionPath}/styles/chat-record.css`;
        document.head.appendChild(cssLink);
    }

    /**
     * 设置消息监听器
     */
    setupMessageListener() {
        // 监听DOM变化，检测新的聊天记录
        this.observer = new MutationObserver((mutations) => {
            // 使用防抖机制，避免频繁触发
            if (this.debounceTimer) {
                clearTimeout(this.debounceTimer);
            }

            this.debounceTimer = setTimeout(() => {
                this.handleMutations(mutations);
            }, 300); // 300ms防抖延迟
        });

        // 开始观察
        this.observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    /**
     * 处理DOM变化 - 增强版本，参考mobile-main实现
     * @param {MutationRecord[]} mutations - DOM变化记录
     */
    handleMutations(mutations) {
        // 如果正在处理中，跳过
        if (this.isProcessing || this.processingLock) {
            return;
        }

        // 添加超时保护，避免长时间卡死
        if (this.processingTimeout) {
            clearTimeout(this.processingTimeout);
        }

        // 设置处理超时
        this.processingTimeout = setTimeout(() => {
            console.warn('[ChatRecordManager] 处理超时，强制重置状态');
            this.isProcessing = false;
            this.processingLock = false;
            if (this.debounceTimer) {
                clearTimeout(this.debounceTimer);
                this.debounceTimer = null;
            }
        }, 5000); // 5秒超时

        // 查找所有可能包含聊天记录的文本节点
        let foundNewContent = false;
        const textNodes = [];
        const chatRecordPattern = /\[和[^\]]+的聊天\]/g;

        mutations.forEach((mutation) => {
            if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        // 检查元素本身及其子元素是否包含聊天记录
                        const textContent = node.textContent || '';
                        if (chatRecordPattern.test(textContent)) {
                            textNodes.push(node);
                            foundNewContent = true;
                        }
                    } else if (node.nodeType === Node.TEXT_NODE) {
                        // 检查文本节点是否包含聊天记录
                        const textContent = node.textContent || '';
                        if (chatRecordPattern.test(textContent)) {
                            textNodes.push(node);
                            foundNewContent = true;
                        }
                    }
                });
            }
        });

        if (!foundNewContent) {
            // 清除超时定时器并返回
            if (this.processingTimeout) {
                clearTimeout(this.processingTimeout);
                this.processingTimeout = null;
            }
            return;
        }

        // 合并所有找到的文本内容
        const combinedContent = textNodes.map(node => node.textContent || '').join('\n');
        
        // 生成内容哈希，用于更精确的去重
        const contentHash = this.simpleHash(combinedContent);
        
        // 多层去重检查 - 参考mobile-main实现
        // 1. 基础哈希检查
        if (contentHash === this.lastProcessedContentHash) {
            // 清除超时定时器并返回
            if (this.processingTimeout) {
                clearTimeout(this.processingTimeout);
                this.processingTimeout = null;
            }
            return;
        }
        
        // 2. 时间窗口检查 - 防止短时间内重复处理
        const now = Date.now();
        const timeSinceLastProcess = now - this.lastProcessTime;
        if (timeSinceLastProcess < 1000 && this.isSimilarContent(combinedContent, this.lastProcessedContent)) {
            // 清除超时定时器并返回
            if (this.processingTimeout) {
                clearTimeout(this.processingTimeout);
                this.processingTimeout = null;
            }
            return;
        }

        // 设置处理锁，防止并发处理
        this.processingLock = true;
        this.isProcessing = true;

        try {
            // 确保依赖已初始化
            if (!this.initialized) {
                this.checkAndInitDependencies();
                if (!this.initialized) {
                    return;
                }
            }

            // 解析聊天记录
            const records = this.parser.parseChatRecord(combinedContent);
            if (records.length > 0) {
                // 使用增强的去重机制
                const filteredRecords = this.enhancedFilterDuplicateRecords(records);
                if (filteredRecords.length > 0) {
                    this.processChatRecords(filteredRecords);
                    // 只有在确实处理了新记录时才更新哈希
                    this.lastProcessedContentHash = contentHash;
                    this.lastProcessedContent = combinedContent;
                    this.lastProcessTime = Date.now();
                    console.log(`[ChatRecordManager] 处理了 ${filteredRecords.length} 条新记录，更新内容哈希`);
                } else {
                    console.log(`[ChatRecordManager] 检测到 ${records.length} 条记录，但都已存在，跳过处理`);
                }
            }
        } catch (error) {
            console.error('[ChatRecordManager] 处理聊天记录时出错:', error);
        } finally {
            // 处理完成，重置标记和超时
            this.isProcessing = false;
            this.processingLock = false;
            if (this.processingTimeout) {
                clearTimeout(this.processingTimeout);
                this.processingTimeout = null;
            }
        }
    }

    /**
     * 过滤重复记录
     * @param {Array} records - 聊天记录数组
     * @returns {Array} 过滤后的记录
     */
    filterDuplicateRecords(records) {
        const filteredRecords = [];

        records.forEach(record => {
            // 以消息内容构建稳定签名（类型+内容）
            const signature = Array.isArray(record.messages)
                ? record.messages.map(m => `${m.type}|${m.content}`).join('||')
                : '';
            const recordKey = `${record.friendId}|${this.simpleHash(signature)}`;

            // 检查是否已处理过此记录批次
            if (this.processedMessages.has(recordKey)) {
                return;
            }

            // 添加到已处理集合
            this.processedMessages.add(recordKey);
            filteredRecords.push(record);
        });

        // 限制缓存大小，避免内存泄漏
        if (this.processedMessages.size > 200) {
            const entries = Array.from(this.processedMessages);
            this.processedMessages = new Set(entries.slice(-100)); // 保留最近100条
        }

        return filteredRecords;
    }

    /**
     * 增强的去重机制 - 参考mobile-main实现
     * @param {Array} records - 聊天记录数组
     * @returns {Array} 过滤后的记录
     */
    enhancedFilterDuplicateRecords(records) {
        const filteredRecords = [];
        const now = Date.now();

        // 批处理优化 - 参考mobile-main实现
        if (this.isBatchProcessing) {
            // 如果正在批处理，添加到队列
            this.batchProcessingQueue.push(...records);
            return filteredRecords;
        }

        // 标记批处理开始
        this.isBatchProcessing = true;

        try {
            records.forEach(record => {
                // 为每条消息生成唯一标识
                const messageSignatures = Array.isArray(record.messages)
                    ? record.messages.map(m => {
                        // 使用内容哈希缓存提高性能
                        if (!this.contentHashCache.has(m.content)) {
                            this.contentHashCache.set(m.content, this.simpleHash(m.content));
                        }
                        const contentHash = this.contentHashCache.get(m.content);
                        return `${m.type}|${contentHash}`;
                    })
                    : [];

                // 构建记录级别的唯一标识
                const recordSignature = messageSignatures.join('||');
                const recordKey = `${record.friendId}|${this.simpleHash(recordSignature)}`;

                // 多层去重检查
                // 1. 基础去重检查
                if (this.processedMessages.has(recordKey)) {
                    return;
                }

                // 2. 时间窗口去重 - 防止短时间内重复处理相同内容
                const timeSinceLastProcess = now - this.lastProcessTime;
                if (timeSinceLastProcess < 1000 && recordKey === this.lastProcessedContentHash) {
                    return; // 1秒内相同内容跳过
                }

                // 3. 内容相似性检查 - 防止微小变化导致的重复
                if (this.isDuplicateByContentSimilarity(record)) {
                    return;
                }

                // 添加到已处理集合
                this.processedMessages.add(recordKey);
                filteredRecords.push(record);
            });

            // 智能缓存管理 - 参考mobile-main实现
            this.manageCacheSize();

        } finally {
            // 标记批处理结束
            this.isBatchProcessing = false;
            
            // 处理队列中的记录
            if (this.batchProcessingQueue.length > 0) {
                const queuedRecords = this.batchProcessingQueue.splice(0);
                setTimeout(() => {
                    this.enhancedFilterDuplicateRecords(queuedRecords);
                }, 100); // 100ms延迟处理队列
            }
        }

        return filteredRecords;
    }

    /**
     * 基于内容相似性的去重检查
     * @param {Object} record - 聊天记录
     * @returns {boolean} 是否重复
     */
    isDuplicateByContentSimilarity(record) {
        if (!Array.isArray(record.messages) || record.messages.length === 0) {
            return false;
        }

        // 获取最近处理的记录进行比较
        const recentRecords = Array.from(this.processedMessages).slice(-10);
        
        for (const recentKey of recentRecords) {
            const [friendId, signatureHash] = recentKey.split('|');
            
            // 如果好友ID不同，跳过
            if (friendId !== record.friendId) {
                continue;
            }

            // 检查消息数量是否相似
            const messageCountDiff = Math.abs(record.messages.length - this.extractMessageCountFromHash(signatureHash));
            if (messageCountDiff > 2) { // 允许2条消息的差异
                continue;
            }

            // 检查内容相似性
            const recentContent = this.getContentFromHash(signatureHash);
            const currentContent = this.extractContentFromRecord(record);
            
            if (this.isSimilarContent(recentContent, currentContent)) {
                return true;
            }
        }

        return false;
    }

    /**
     * 从哈希中提取消息数量
     * @param {string} hash - 哈希值
     * @returns {number} 消息数量
     */
    extractMessageCountFromHash(hash) {
        // 这是一个简化的实现，实际可能需要更复杂的逻辑
        // 或者可以在缓存中存储更多信息
        return parseInt(hash.slice(0, 3), 36) % 20 || 1;
    }

    /**
     * 从哈希中获取内容
     * @param {string} hash - 哈希值
     * @returns {string} 内容
     */
    getContentFromHash(hash) {
        // 这是一个简化的实现，实际可能需要在缓存中存储原始内容
        return this.contentHashCache.get(hash) || '';
    }

    /**
     * 从记录中提取内容
     * @param {Object} record - 聊天记录
     * @returns {string} 内容
     */
    extractContentFromRecord(record) {
        if (!Array.isArray(record.messages)) {
            return '';
        }

        return record.messages
            .map(m => `${m.type}:${m.content}`)
            .join('||')
            .slice(0, 500); // 限制长度以提高性能
    }

    /**
     * 智能缓存管理 - 参考mobile-main实现
     */
    manageCacheSize() {
        // 限制处理消息缓存大小
        if (this.processedMessages.size > 500) {
            const entries = Array.from(this.processedMessages);
            // 保留最近的200条和最重要的300条
            const recentEntries = entries.slice(-200);
            const importantEntries = entries.slice(0, 300).filter(entry =>
                this.isImportantEntry(entry)
            );
            this.processedMessages = new Set([...importantEntries, ...recentEntries]);
        }

        // 限制内容哈希缓存大小
        if (this.contentHashCache.size > 1000) {
            const entries = Array.from(this.contentHashCache.entries());
            // 保留最近使用的500个
            this.contentHashCache = new Map(entries.slice(-500));
        }
    }

    /**
     * 判断是否为重要条目
     * @param {string} entry - 缓存条目
     * @returns {boolean} 是否重要
     */
    isImportantEntry(entry) {
        // 简单的重要性判断逻辑
        // 可以根据实际需求进行扩展
        return entry.includes('表情包') ||
               entry.includes('图片') ||
               entry.includes('红包') ||
               entry.length > 100;
    }

    /**
     * 检查并解析聊天记录
     * @param {Element} node - DOM节点
     * @deprecated 使用 handleMutations 替代
     */
    checkAndParseChatRecord(node) {
        // 确保依赖已初始化
        if (!this.initialized) {
            this.checkAndInitDependencies();
            if (!this.initialized) return;
        }

        const textContent = node.textContent || '';

        // 检查是否包含聊天记录格式
        if (this.parser && typeof this.parser.isValidChatRecord === 'function' && this.parser.isValidChatRecord(textContent)) {
            const records = this.parser.parseChatRecord(textContent);
            if (records.length > 0) {
                this.processChatRecords(records);
            }
        }
    }

    /**
     * 处理聊天记录
     * @param {Array} records - 解析后的聊天记录
     */
    processChatRecords(records) {
        // 确保依赖已初始化
        if (!this.initialized) {
            this.checkAndInitDependencies();
            if (!this.initialized) return;
        }

        // 保存记录
        this.storage.saveRecords(records);

        // 更新UI
        records.forEach(record => {
            this.updateFriendChatUI(record);
        });

        // 触发事件通知其他组件
        this.dispatchChatRecordUpdate(records);
    }

    /**
     * 更新好友聊天UI
     * @param {Object} record - 聊天记录
     */
    updateFriendChatUI(record) {
        const friendId = record.friendId;

        // 如果当前正在查看该好友的聊天，更新消息显示
        if (this.currentFriendId === friendId) {
            this.displayFriendMessages(friendId);
        }

        // 更新好友列表中的最后消息
        this.updateFriendListItem(record);
    }

    /**
     * 显示好友消息
     * @param {string} friendId - 好友ID
     */
    displayFriendMessages(friendId) {
        // 确保依赖已初始化
        if (!this.initialized) {
            this.checkAndInitDependencies();
            if (!this.initialized) return;
        }

        // 首先从新的聊天记录存储中获取
        let friendRecord = this.storage.getFriendRecords(friendId);

        // 如果没有找到，尝试从现有的本地存储中获取
        if (!friendRecord) {
            friendRecord = this.getFriendRecordFromLegacyStore(friendId);
        }

        if (!friendRecord) return;

        const messageContainer = document.querySelector('.chat-messages');
        if (!messageContainer) return;

        // 渲染聊天记录消息
        const chatRecordMessagesHtml = this.renderer.renderMessageList(friendRecord.messages, {
            showTimestamp: true,
            groupByDate: true
        });

        // 清理旧的聊天记录区（避免重复叠加）
        const oldSection = messageContainer.querySelector(`[data-chat-record-for="${friendId}"]`);
        if (oldSection) {
            oldSection.remove();
        }

        // 创建并插入新的聊天记录区（专属容器，便于下次替换）
        const wrapper = document.createElement('div');
        wrapper.className = 'chat-record-section';
        wrapper.setAttribute('data-chat-record-for', friendId);
        wrapper.innerHTML = chatRecordMessagesHtml;
        messageContainer.appendChild(wrapper);

        // 处理图片加载事件
        this.setupImageLoadEvents(messageContainer);

        // 滚动到底部
        messageContainer.scrollTop = messageContainer.scrollHeight;
    }

    /**
     * 设置图片加载事件
     * @param {Element} container - 消息容器
     */
    setupImageLoadEvents(container) {
        // 为所有图片添加加载事件监听
        const images = container.querySelectorAll('.sticker-image, .message-image');
        images.forEach(img => {
            // 已标记loaded则跳过
            if (img.classList.contains('loaded')) {
                return;
            }

            // 如果图片已经加载完成，立即补上loaded类，避免透明度为0
            if (img.complete) {
                img.classList.add('loaded');
            } else {
                // 添加加载事件
                img.addEventListener('load', () => {
                    img.classList.add('loaded');
                });
            }

            // 添加错误事件（无论complete与否都挂一次）
            img.addEventListener('error', () => {
                this.handleImageError(img);
            });
        });
    }

    /**
     * 处理图片加载错误
     * @param {HTMLImageElement} img - 图片元素
     */
    handleImageError(img) {
        // 隐藏失败的图片
        img.style.display = 'none';

        // 显示回退内容
        const fallback = img.nextElementSibling;
        if (fallback && (fallback.classList.contains('sticker-fallback') || fallback.classList.contains('image-fallback'))) {
            fallback.style.display = 'block';
        }

        // 尝试重新加载图片（使用不同的URL处理方式）
        const originalSrc = img.getAttribute('data-original-src') || img.src;
        if (originalSrc && !img.getAttribute('data-original-src')) {
            // 保存原始URL
            img.setAttribute('data-original-src', originalSrc);

            // 尝试使用MessageRenderer的URL处理方法
            const processedUrl = this.renderer.processImageUrl(originalSrc);
            if (processedUrl !== originalSrc) {
                // 延迟重试加载
                setTimeout(() => {
                    img.src = processedUrl;
                }, 1000);
            }
        }
    }

    /**
     * 从现有本地存储中获取好友记录
     * @param {string} friendId - 好友ID
     * @returns {Object|null} 好友记录
     */
    getFriendRecordFromLegacyStore(friendId) {
        try {
            // 获取当前角色键
            const charKey = this.getCurrentCharacterKey();
            if (!charKey) return null;

            // 从现有本地存储中获取消息
            const store = window.wechatLocalStore?.get?.();
            if (!store) return null;

            const compositeKey = `${charKey}::${friendId}`;
            const messages = store.messagesByChatId?.[compositeKey] || [];

            if (messages.length === 0) return null;

            // 转换为新的格式
            return {
                friendId: friendId,
                friendName: this.getFriendNameFromLegacyStore(friendId),
                messages: messages.map(msg =>({
                    friendName: msg.friendName || '',
                    friendId: friendId,
                    type: msg.type || '文字',
                    content: msg.text || msg.content || '',
                    timestamp: msg.ts || msg.timestamp || Date.now()
                }))
            };
        } catch (error) {
            console.error('[ChatRecordManager] 从现有存储获取记录失败:', error);
            return null;
        }
    }

    /**
     * 从现有本地存储中获取好友名称
     * @param {string} friendId - 好友ID
     * @returns {string} 好友名称
     */
    getFriendNameFromLegacyStore(friendId) {
        try {
            const charKey = this.getCurrentCharacterKey();
            if (!charKey) return `好友 ${friendId}`;

            const store = window.wechatLocalStore?.get?.();
            if (!store) return `好友 ${friendId}`;

            return store.friendsByChar?.[charKey]?.[friendId]?.name || `好友 ${friendId}`;
        } catch (error) {
            return `好友 ${friendId}`;
        }
    }

    /**
     * 获取当前角色键
     * @returns {string} 角色键
     */
    getCurrentCharacterKey() {
        try {
            const st = window.SillyTavern?.getContext?.();
            if (st && st.characterId !== undefined && st.characterId !== null) {
                return `char:${st.characterId}`;
            }
        } catch (error) {
            /* ignore */
        }
        return '';
    }

    /**
     * 更新好友列表项
     * @param {Object} record - 聊天记录
     */
    updateFriendListItem(record) {
        const friendId = record.friendId;
        const lastMessage = record.messages[record.messages.length - 1];

        if (!lastMessage) return;

        // 查找对应的好友列表项
        const friendItem = document.querySelector(`[data-friend-id="${friendId}"]`);
        if (friendItem) {
            // 更新最后消息
            const lastMessageEl = friendItem.querySelector('.last-message');
            if (lastMessageEl) {
                lastMessageEl.textContent = this.getLastMessagePreview(lastMessage);
            }

            // 更新时间
            const timeEl = friendItem.querySelector('.message-time');
            if (timeEl) {
                timeEl.textContent = this.renderer.formatTime(lastMessage.timestamp);
            }
        }
    }

    /**
     * 获取最后消息预览
     * @param {Object} message - 消息对象
     * @returns {string} 消息预览
     */
    getLastMessagePreview(message) {
        switch (message.type) {
            case '表情包':
                return '[表情包]';
            case '图片':
                return '[图片]';
            case '红包':
                return `[红包 ${message.content}元]`;
            case '语音':
                return '[语音]';
            case '视频':
                return '[视频]';
            case '位置':
                return '[位置]';
            case '链接':
                return '[链接]';
            default:
                return message.content.length > 20
                    ? message.content.substring(0, 20) + '...'
                    : message.content;
        }
    }

    /**
     * 触发聊天记录更新事件
     * @param {Array} records - 聊天记录
     */
    dispatchChatRecordUpdate(records) {
        const event = new CustomEvent('chat-record-update', {
            detail: { records }
        });
        document.dispatchEvent(event);
    }

    /**
     * 集成到现有的微信扩展
     */
    integrateWithWeChatExtension() {
        // 监听微信扩展的事件
        document.addEventListener('wechat-context-updated', () => {
            this.handleWeChatContextUpdate();
        });

        // 监听聊天记录更新事件
        document.addEventListener('chat-record-update', (event) => {
            this.handleChatRecordUpdate(event.detail.records);
        });
    }

    /**
     * 处理聊天记录更新事件
     * @param {Array} records - 聊天记录
     */
    handleChatRecordUpdate(records) {
        // 更新好友列表
        if (window.wechatPhone && typeof window.wechatPhone.renderChatList === 'function') {
            window.wechatPhone.renderChatList();
        }
    }

    /**
     * 处理微信扩展上下文更新
     */
    handleWeChatContextUpdate() {
        // 重新加载当前角色的聊天记录
        if (this.initialized) {
            this.storage = new ChatRecordStorage();
        }

        // 如果当前正在查看聊天，刷新显示
        if (this.currentFriendId) {
            this.displayFriendMessages(this.currentFriendId);
        }
    }

    /**
     * 手动解析聊天记录
     * @param {string} text - 聊天记录文本
     * @returns {Object} 解析结果
     */
    manualParseChatRecord(text) {
        try {
            // 确保依赖已初始化
            if (!this.initialized) {
                this.checkAndInitDependencies();
                if (!this.initialized) {
                    return { success: false, message: '依赖类未初始化' };
                }
            }

            const records = this.parser.parseChatRecord(text);
            if (records.length > 0) {
                // 过滤重复记录
                const filteredRecords = this.filterDuplicateRecords(records);
                if (filteredRecords.length > 0) {
                    this.processChatRecords(filteredRecords);
                    return { success: true, records: filteredRecords };
                } else {
                    return { success: false, message: '所有记录都已存在' };
                }
            } else {
                return { success: false, message: '未找到有效的聊天记录格式' };
            }
        } catch (error) {
            console.error('[ChatRecordManager] 手动解析失败:', error);
            return { success: false, message: error.message };
        }
    }

    /**
     * 获取好友列表
     * @returns {Array} 好友列表
     */
    getFriendsList() {
        if (!this.initialized) return [];
        return this.storage.getFriendsList();
    }

    /**
     * 获取好友聊天记录
     * @param {string} friendId - 好友ID
     * @returns {Object|null} 好友聊天记录
     */
    getFriendChatRecords(friendId) {
        if (!this.initialized) return null;
        return this.storage.getFriendRecords(friendId);
    }

    /**
     * 删除好友聊天记录
     * @param {string} friendId - 好友ID
     * @returns {boolean} 是否删除成功
     */
    deleteFriendChatRecords(friendId) {
        if (!this.initialized) return false;
        return this.storage.deleteFriendRecords(friendId);
    }

    /**
     * 清空所有聊天记录
     * @returns {boolean} 是否清空成功
     */
    clearAllChatRecords() {
        if (!this.initialized) return false;
        return this.storage.clearAllRecords();
    }

    /**
     * 导出聊天记录
     * @param {string} friendId - 好友ID，如果不提供则导出所有记录
     * @returns {string} JSON格式的聊天记录
     */
    exportChatRecords(friendId = null) {
        if (!this.initialized) return null;
        return this.storage.exportRecords(friendId);
    }

    /**
     * 导入聊天记录
     * @param {string} jsonData - JSON格式的聊天记录数据
     * @returns {boolean} 是否导入成功
     */
    importChatRecords(jsonData) {
        if (!this.initialized) return false;
        return this.storage.importRecords(jsonData);
    }

    /**
     * 简单字符串哈希（稳定去重键）
     * @param {string} str
     * @returns {string}
     */
    simpleHash(str) {
        try {
            let h = 0;
            for (let i = 0; i < str.length; i++) {
                h = ((h << 5) - h) + str.charCodeAt(i);
                h |= 0;
            }
            // 无符号并压缩为36进制，缩短长度
            return (h >>> 0).toString(36);
        } catch {
            return String(str || '').length.toString(36);
        }
    }

    /**
     * 内容相似性检查 - 参考mobile-main实现
     * @param {string} content1 - 内容1
     * @param {string} content2 - 内容2
     * @returns {boolean} 是否相似
     */
    isSimilarContent(content1, content2) {
        if (!content1 || !content2) {
            return false;
        }

        // 如果内容完全相同，直接返回true
        if (content1 === content2) {
            return true;
        }

        // 计算内容长度差异
        const len1 = content1.length;
        const len2 = content2.length;
        const lengthDiff = Math.abs(len1 - len2);
        const maxLength = Math.max(len1, len2);
        
        // 如果长度差异超过20%，认为不相似
        if (lengthDiff / maxLength > 0.2) {
            return false;
        }

        // 提取关键特征进行比较
        const features1 = this.extractContentFeatures(content1);
        const features2 = this.extractContentFeatures(content2);
        
        // 计算特征相似度
        return this.calculateFeatureSimilarity(features1, features2) > 0.8;
    }

    /**
     * 提取内容特征 - 用于相似性比较
     * @param {string} content - 内容
     * @returns {Object} 特征对象
     */
    extractContentFeatures(content) {
        // 提取好友名称模式
        const friendMatches = content.match(/\[和([^\]]+)的聊天\]/g) || [];
        const friendNames = friendMatches.map(match => match.replace(/\[和([^\]]+)的聊天\]/, '$1'));
        
        // 提取消息类型
        const messageTypes = [];
        if (content.includes('[表情包]')) messageTypes.push('表情包');
        if (content.includes('[图片]')) messageTypes.push('图片');
        if (content.includes('[红包]')) messageTypes.push('红包');
        if (content.includes('[语音]')) messageTypes.push('语音');
        if (content.includes('[视频]')) messageTypes.push('视频');
        if (content.includes('[位置]')) messageTypes.push('位置');
        if (content.includes('[链接]')) messageTypes.push('链接');
        
        // 提取时间戳模式
        const timeMatches = content.match(/\d{1,2}:\d{2}/g) || [];
        
        // 提取消息数量
        const messageCount = (content.match(/(\d{1,2}:\d{2})/g) || []).length;
        
        return {
            friendNames: friendNames.sort(),
            messageTypes: messageTypes.sort(),
            timePatterns: timeMatches.slice(0, 5), // 只取前5个时间戳
            messageCount: messageCount,
            contentLength: content.length,
            hash: this.simpleHash(content)
        };
    }

    /**
     * 计算特征相似度
     * @param {Object} features1 - 特征1
     * @param {Object} features2 - 特征2
     * @returns {number} 相似度（0-1）
     */
    calculateFeatureSimilarity(features1, features2) {
        let similarity = 0;
        let totalWeight = 0;
        
        // 好友名称相似度（权重：0.4）
        if (features1.friendNames.length > 0 || features2.friendNames.length > 0) {
            const nameSimilarity = this.calculateArraySimilarity(features1.friendNames, features2.friendNames);
            similarity += nameSimilarity * 0.4;
            totalWeight += 0.4;
        }
        
        // 消息类型相似度（权重：0.2）
        if (features1.messageTypes.length > 0 || features2.messageTypes.length > 0) {
            const typeSimilarity = this.calculateArraySimilarity(features1.messageTypes, features2.messageTypes);
            similarity += typeSimilarity * 0.2;
            totalWeight += 0.2;
        }
        
        // 消息数量相似度（权重：0.2）
        const countDiff = Math.abs(features1.messageCount - features2.messageCount);
        const maxCount = Math.max(features1.messageCount, features2.messageCount);
        const countSimilarity = maxCount > 0 ? 1 - (countDiff / maxCount) : 1;
        similarity += countSimilarity * 0.2;
        totalWeight += 0.2;
        
        // 内容长度相似度（权重：0.1）
        const lengthDiff = Math.abs(features1.contentLength - features2.contentLength);
        const maxLength = Math.max(features1.contentLength, features2.contentLength);
        const lengthSimilarity = maxLength > 0 ? 1 - (lengthDiff / maxLength) : 1;
        similarity += lengthSimilarity * 0.1;
        totalWeight += 0.1;
        
        // 哈希比较（权重：0.1）
        const hashSimilarity = features1.hash === features2.hash ? 1 : 0;
        similarity += hashSimilarity * 0.1;
        totalWeight += 0.1;
        
        // 如果没有权重，返回0
        if (totalWeight === 0) {
            return 0;
        }
        
        // 归一化相似度
        return similarity / totalWeight;
    }

    /**
     * 计算数组相似度
     * @param {Array} arr1 - 数组1
     * @param {Array} arr2 - 数组2
     * @returns {number} 相似度（0-1）
     */
    calculateArraySimilarity(arr1, arr2) {
        if (arr1.length === 0 && arr2.length === 0) {
            return 1;
        }
        
        if (arr1.length === 0 || arr2.length === 0) {
            return 0;
        }
        
        const set1 = new Set(arr1);
        const set2 = new Set(arr2);
        
        const intersection = new Set([...set1].filter(x => set2.has(x)));
        const union = new Set([...set1, ...set2]);
        
        return intersection.size / union.size;
    }

    /**
     * 获取去重统计信息
     * @returns {Object} 统计信息
     */
    getDeduplicationStats() {
        return {
            processedMessagesCount: this.processedMessages.size,
            contentHashCacheSize: this.contentHashCache.size,
            batchProcessingQueueLength: this.batchProcessingQueue.length,
            isBatchProcessing: this.isBatchProcessing,
            isProcessing: this.isProcessing,
            processingLock: this.processingLock,
            lastProcessTime: this.lastProcessTime,
            lastProcessedContentHash: this.lastProcessedContentHash,
            timeSinceLastProcess: Date.now() - this.lastProcessTime
        };
    }

    /**
     * 清理缓存 - 手动触发
     * @param {Object} options - 清理选项
     */
    clearCache(options = {}) {
        const {
            clearProcessedMessages = false,
            clearContentHashCache = false,
            clearBatchQueue = false,
            clearAll = false
        } = options;

        if (clearAll || clearProcessedMessages) {
            this.processedMessages.clear();
            console.log('[ChatRecordManager] 已清理处理消息缓存');
        }

        if (clearAll || clearContentHashCache) {
            this.contentHashCache.clear();
            console.log('[ChatRecordManager] 已清理内容哈希缓存');
        }

        if (clearAll || clearBatchQueue) {
            this.batchProcessingQueue = [];
            console.log('[ChatRecordManager] 已清理批处理队列');
        }

        if (clearAll) {
            this.lastProcessedContent = '';
            this.lastProcessedContentHash = '';
            this.lastProcessTime = 0;
            console.log('[ChatRecordManager] 已清理所有缓存和状态');
        }

        return this.getDeduplicationStats();
    }

    /**
     * 测试去重功能 - 用于调试
     * @param {string} content - 测试内容
     * @returns {Object} 测试结果
     */
    testDeduplication(content) {
        const testResult = {
            originalContent: content,
            contentHash: this.simpleHash(content),
            isDuplicate: false,
            duplicateReason: '',
            features: this.extractContentFeatures(content)
        };

        // 检查基础哈希重复
        if (testResult.contentHash === this.lastProcessedContentHash) {
            testResult.isDuplicate = true;
            testResult.duplicateReason = '基础哈希重复';
            return testResult;
        }

        // 检查时间窗口重复
        const now = Date.now();
        const timeSinceLastProcess = now - this.lastProcessTime;
        if (timeSinceLastProcess < 1000 && this.isSimilarContent(content, this.lastProcessedContent)) {
            testResult.isDuplicate = true;
            testResult.duplicateReason = '时间窗口内相似内容';
            return testResult;
        }

        // 检查内容相似性
        if (this.isSimilarContent(content, this.lastProcessedContent)) {
            testResult.isDuplicate = true;
            testResult.duplicateReason = '内容相似';
            return testResult;
        }

        return testResult;
    }

    /**
     * 启用调试模式
     * @param {boolean} enabled - 是否启用
     */
    setDebugMode(enabled) {
        this.debugMode = enabled;
        if (enabled) {
            console.log('[ChatRecordManager] 调试模式已启用');
            
            // 暴露调试函数到全局
            window.chatRecordManagerDebug = {
                getStats: () => this.getDeduplicationStats(),
                clearCache: (options) => this.clearCache(options),
                testDeduplication: (content) => this.testDeduplication(content),
                getProcessedMessages: () => Array.from(this.processedMessages),
                getContentHashCache: () => Array.from(this.contentHashCache.entries()),
                forceProcess: (content) => {
                    this.lastProcessedContentHash = '';
                    this.lastProcessTime = 0;
                    return this.manualParseChatRecord(content);
                }
            };
            
            console.log('[ChatRecordManager] 调试函数已暴露到 window.chatRecordManagerDebug');
        } else {
            delete window.chatRecordManagerDebug;
            console.log('[ChatRecordManager] 调试模式已禁用');
        }
    }

    /**
     * 销毁聊天记录管理器
     */
    destroy() {
        if (this.observer) {
            this.observer.disconnect();
            this.observer = null;
        }

        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
            this.debounceTimer = null;
        }

        if (this.processingTimeout) {
            clearTimeout(this.processingTimeout);
            this.processingTimeout = null;
        }

        // 清理所有缓存
        this.clearCache({ clearAll: true });

        this.isActive = false;
        console.log('[ChatRecordManager] 聊天记录管理器已停止');
    }
}

// 延迟创建全局实例，确保所有依赖都已加载
function initChatRecordManager() {
    try {
        if (!window.chatRecordManager) {
            window.chatRecordManager = new ChatRecordManager();
            console.log('[ChatRecordManager] 全局实例已创建');
            
            // 暴露防抖函数供调试使用
            window.chatRecordManager.debouncedProcessChatRecords = function(content, delay = 300) {
                if (this.debounceTimer) {
                    clearTimeout(this.debounceTimer);
                }
                this.debounceTimer = setTimeout(() => {
                    this.processChatRecords(content);
                }, delay);
            }.bind(window.chatRecordManager);
        }
    } catch (error) {
        console.error('[ChatRecordManager] 创建实例失败:', error);
    }
}

// 如果DOM已加载，立即初始化；否则等待DOM加载
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initChatRecordManager);
} else {
    // 延迟一点时间，确保其他模块已加载
    setTimeout(initChatRecordManager, 100);
}

// 导出类供其他模块使用
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ChatRecordManager;
}
