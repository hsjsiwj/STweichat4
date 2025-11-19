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
     * 处理DOM变化 - 优化版本，参考mobile-main实现
     * @param {MutationRecord[]} mutations - DOM变化记录
     */
    handleMutations(mutations) {
        // 如果正在处理中，跳过
        if (this.isProcessing) {
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
        
        // 检查是否与上次处理的内容相同（使用哈希比较，更高效）
        if (contentHash === this.lastProcessedContentHash) {
            // 清除超时定时器并返回
            if (this.processingTimeout) {
                clearTimeout(this.processingTimeout);
                this.processingTimeout = null;
            }
            return;
        }

        // 标记为正在处理
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
                // 过滤重复记录
                const filteredRecords = this.filterDuplicateRecords(records);
                if (filteredRecords.length > 0) {
                    this.processChatRecords(filteredRecords);
                    // 只有在确实处理了新记录时才更新哈希
                    this.lastProcessedContentHash = contentHash;
                    this.lastProcessedContent = combinedContent;
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
