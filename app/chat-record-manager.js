/**
 * 聊天记录管理器
 * 负责自动读取和解析聊天记录，集成到现有的微信扩展中
 */
class ChatRecordManager {
    constructor() {
        this.storage = new ChatRecordStorage();
        this.parser = new ChatRecordParser();
        this.renderer = new MessageRenderer();
        this.isActive = false;
        this.observer = null;
        this.currentFriendId = null;
        // 添加防重复缓存
        this.processedMessages = new Set();
        this.init();
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
            mutations.forEach((mutation) => {
                if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                    mutation.addedNodes.forEach((node) => {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            this.checkAndParseChatRecord(node);
                        }
                    });
                }
            });
        });

        // 开始观察
        this.observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    /**
     * 检查并解析聊天记录
     * @param {Element} node - DOM节点
     */
    checkAndParseChatRecord(node) {
        const textContent = node.textContent || '';
        
        // 检查是否包含聊天记录格式
        if (this.parser.isValidChatRecord(textContent)) {
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
        // 首先从新的聊天记录存储中获取
        let friendRecord = this.storage.getFriendRecords(friendId);
        
        // 如果没有找到，尝试从现有的本地存储中获取
        if (!friendRecord) {
            friendRecord = this.getFriendRecordFromLegacyStore(friendId);
        }
        
        if (!friendRecord) return;
        
        const messageContainer = document.querySelector('.chat-messages');
        if (!messageContainer) return;
        
        // 保留现有的消息（如SillyTavern的消息）
        const existingMessages = messageContainer.innerHTML;
        
        // 渲染聊天记录消息
        const chatRecordMessagesHtml = this.renderer.renderMessageList(friendRecord.messages, {
            showTimestamp: true,
            groupByDate: true
        });
        
        // 合并现有消息和聊天记录
        messageContainer.innerHTML = existingMessages + chatRecordMessagesHtml;
        
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
            // 如果图片已经加载完成，跳过
            if (img.complete || img.classList.contains('loaded')) {
                return;
            }
            
            // 添加加载事件
            img.addEventListener('load', () => {
                img.classList.add('loaded');
            });
            
            // 添加错误事件
            img.addEventListener('error', () => {
                img.style.display = 'none';
                const fallback = img.nextElementSibling;
                if (fallback && fallback.classList.contains('sticker-fallback') || fallback.classList.contains('image-fallback')) {
                    fallback.style.display = 'block';
                }
            });
        });
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
                messages: messages.map(msg => ({
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
        this.storage = new ChatRecordStorage();
        
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
            const records = this.parser.parseChatRecord(text);
            if (records.length > 0) {
                this.processChatRecords(records);
                return { success: true, records };
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
        return this.storage.getFriendsList();
    }

    /**
     * 获取好友聊天记录
     * @param {string} friendId - 好友ID
     * @returns {Object|null} 好友聊天记录
     */
    getFriendChatRecords(friendId) {
        return this.storage.getFriendRecords(friendId);
    }

    /**
     * 删除好友聊天记录
     * @param {string} friendId - 好友ID
     * @returns {boolean} 是否删除成功
     */
    deleteFriendChatRecords(friendId) {
        return this.storage.deleteFriendRecords(friendId);
    }

    /**
     * 清空所有聊天记录
     * @returns {boolean} 是否清空成功
     */
    clearAllChatRecords() {
        return this.storage.clearAllRecords();
    }

    /**
     * 导出聊天记录
     * @param {string} friendId - 好友ID，如果不提供则导出所有记录
     * @returns {string} JSON格式的聊天记录
     */
    exportChatRecords(friendId = null) {
        return this.storage.exportRecords(friendId);
    }

    /**
     * 导入聊天记录
     * @param {string} jsonData - JSON格式的聊天记录数据
     * @returns {boolean} 是否导入成功
     */
    importChatRecords(jsonData) {
        return this.storage.importRecords(jsonData);
    }

    /**
     * 销毁聊天记录管理器
     */
    destroy() {
        if (this.observer) {
            this.observer.disconnect();
            this.observer = null;
        }
        
        this.isActive = false;
        console.log('[ChatRecordManager] 聊天记录管理器已停止');
    }
}

// 创建全局实例
window.chatRecordManager = new ChatRecordManager();

// 导出类供其他模块使用
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ChatRecordManager;
}