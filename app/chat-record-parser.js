/**
 * 聊天记录解析器
 * 负责解析特定格式的聊天记录文本
 */
class ChatRecordParser {
    // 主解析正则表达式
    static CHAT_RECORD_REGEX = /\[和([^\]]+)的聊天\]((?:\[对方消息\|[^\]]+\])+)/g;
    static MESSAGE_REGEX = /\[对方消息\|([^|]+)\|([^|]+)\|([^|]+)\|([^\]]+)\]/g;

    /**
     * 解析聊天记录文本
     * @param {string} text - 包含聊天记录的文本
     * @returns {Array} 解析后的聊天记录数组
     */
    static parseChatRecord(text) {
        const records = [];
        let match;

        // 重置正则表达式的lastIndex
        this.CHAT_RECORD_REGEX.lastIndex = 0;

        while ((match = this.CHAT_RECORD_REGEX.exec(text)) !== null) {
            const friendName = match[1];
            const messagesText = match[2];

            const messages = this.parseMessages(messagesText);
            if (messages.length > 0) {
                records.push({
                    friendName: friendName,
                    friendId: messages[0].friendId, // 使用第一条消息的好友ID
                    messages: messages
                });
            }
        }

        return records;
    }

    /**
     * 解析单条消息
     * @param {string} messagesText - 消息文本
     * @returns {Array} 解析后的消息数组
     */
    static parseMessages(messagesText) {
        const messages = [];
        let match;

        // 重置正则表达式的lastIndex
        this.MESSAGE_REGEX.lastIndex = 0;

        while ((match = this.MESSAGE_REGEX.exec(messagesText)) !== null) {
            const [, friendName, friendId, messageType, content] = match;
            messages.push({
                friendName: friendName.trim(),
                friendId: friendId.trim(),
                type: messageType.trim(),
                content: content.trim(),
                timestamp: Date.now()
            });
        }

        return messages;
    }

    /**
     * 验证是否为有效的聊天记录格式
     * @param {string} text - 待验证的文本
     * @returns {boolean} 是否为有效格式
     */
    static isValidChatRecord(text) {
        return this.CHAT_RECORD_REGEX.test(text);
    }

    /**
     * 从文本中提取所有可能的聊天记录
     * @param {string} text - 包含聊天记录的文本
     * @returns {Array} 所有提取的聊天记录
     */
    static extractAllChatRecords(text) {
        const records = [];
        const lines = text.split('\n');

        lines.forEach(line => {
            if (this.isValidChatRecord(line)) {
                const parsedRecords = this.parseChatRecord(line);
                records.push(...parsedRecords);
            }
        });

        return records;
    }

    /**
     * 过滤重复记录
     * @param {Array} records - 聊天记录数组
     * @returns {Array} 过滤后的记录
     */
    static filterDuplicateRecords(records) {
        const seen = new Set();
        return records.filter(record => {
            const key = `${record.friendId}_${record.content}_${record.type}`;
            if (seen.has(key)) {
                return false;
            }
            seen.add(key);
            return true;
        });
    }
}

/**
 * 聊天记录存储管理器
 * 负责聊天记录的存储和读取，确保不同角色卡数据隔离
 */
class ChatRecordStorage {
    constructor() {
        this.storageKey = 'wechat_chat_records';
        this.currentCharacterId = this.getCurrentCharacterId();
    }

    /**
     * 获取当前角色卡ID
     * @returns {string} 当前角色卡ID
     */
    getCurrentCharacterId() {
        // 从SillyTavern获取当前角色卡ID
        if (window.SillyTavern && window.SillyTavern.getContext) {
            const context = window.SillyTavern.getContext();
            return context.characterId || 'default';
        }

        // 备用方法：从URL或其他地方获取
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get('char') || 'default';
    }

    /**
     * 获取所有聊天记录
     * @returns {Object} 所有聊天记录
     */
    getAllRecords() {
        try {
            const allData = localStorage.getItem(this.storageKey) || '{}';
            const parsedData = JSON.parse(allData);
            return parsedData[this.currentCharacterId] || {};
        } catch (error) {
            console.error('获取聊天记录失败:', error);
            return {};
        }
    }

    /**
     * 保存聊天记录
     * @param {Array} records - 聊天记录数组
     */
    saveRecords(records) {
        try {
            const allData = localStorage.getItem(this.storageKey) || '{}';
            const parsedData = JSON.parse(allData);

            if (!parsedData[this.currentCharacterId]) {
                parsedData[this.currentCharacterId] = {};
            }

            // 创建全局去重缓存，防止同一会话中的重复消息
            const deduplicationCache = new Set();

            // 合并或更新记录
            records.forEach(record => {
                const friendId = record.friendId;
                if (!parsedData[this.currentCharacterId][friendId]) {
                    parsedData[this.currentCharacterId][friendId] = {
                        friendName: record.friendName,
                        friendId: friendId,
                        messages: [],
                        createdAt: Date.now(),
                        updatedAt: Date.now()
                    };
                }

                // 添加新消息，避免重复
                const existingRecord = parsedData[this.currentCharacterId][friendId];
                record.messages.forEach(newMsg => {
                    // 创建消息的唯一标识
                    const messageKey = `${newMsg.type}_${newMsg.content}_${newMsg.friendId}`;

                    // 检查是否已存在于去重缓存中
                    if (deduplicationCache.has(messageKey)) {
                        return;
                    }

                    // 检查是否已存在于现有消息中（更严格的去重）
                    const isDuplicate = existingRecord.messages.some(existingMsg => {
                        const existingKey = `${existingMsg.type}_${existingMsg.content}_${existingMsg.friendId}`;
                        return existingKey === messageKey;
                    });

                    if (!isDuplicate) {
                        existingRecord.messages.push(newMsg);
                        deduplicationCache.add(messageKey);
                    }
                });

                // 更新时间戳
                existingRecord.updatedAt = Date.now();

                // 按时间戳排序
                existingRecord.messages.sort((a, b) => a.timestamp - b.timestamp);

                // 限制消息数量，避免存储过多
                if (existingRecord.messages.length > 1000) {
                    existingRecord.messages = existingRecord.messages.slice(-1000);
                }
            });

            localStorage.setItem(this.storageKey, JSON.stringify(parsedData));
            return true;
        } catch (error) {
            console.error('保存聊天记录失败:', error);
            return false;
        }
    }

    /**
     * 获取特定好友的聊天记录
     * @param {string} friendId - 好友ID
     * @returns {Object|null} 好友聊天记录
     */
    getFriendRecords(friendId) {
        const allRecords = this.getAllRecords();
        return allRecords[friendId] || null;
    }

    /**
     * 删除特定好友的聊天记录
     * @param {string} friendId - 好友ID
     * @returns {boolean} 是否删除成功
     */
    deleteFriendRecords(friendId) {
        try {
            const allData = localStorage.getItem(this.storageKey) || '{}';
            const parsedData = JSON.parse(allData);

            if (parsedData[this.currentCharacterId] && parsedData[this.currentCharacterId][friendId]) {
                delete parsedData[this.currentCharacterId][friendId];
                localStorage.setItem(this.storageKey, JSON.stringify(parsedData));
                return true;
            }

            return false;
        } catch (error) {
            console.error('删除聊天记录失败:', error);
            return false;
        }
    }

    /**
     * 清空当前角色卡的所有聊天记录
     * @returns {boolean} 是否清空成功
     */
    clearAllRecords() {
        try {
            const allData = localStorage.getItem(this.storageKey) || '{}';
            const parsedData = JSON.parse(allData);

            parsedData[this.currentCharacterId] = {};
            localStorage.setItem(this.storageKey, JSON.stringify(parsedData));
            return true;
        } catch (error) {
            console.error('清空聊天记录失败:', error);
            return false;
        }
    }

    /**
     * 获取所有好友列表
     * @returns {Array} 好友列表
     */
    getFriendsList() {
        const allRecords = this.getAllRecords();
        return Object.values(allRecords).map(record =>({
            friendId: record.friendId,
            friendName: record.friendName,
            lastMessage: record.messages[record.messages.length - 1],
            messageCount: record.messages.length,
            updatedAt: record.updatedAt
        })).sort((a, b) => b.updatedAt - a.updatedAt);
    }

    /**
     * 导出聊天记录
     * @param {string} friendId - 好友ID，如果不提供则导出所有记录
     * @returns {string} JSON格式的聊天记录
     */
    exportRecords(friendId = null) {
        try {
            if (friendId) {
                const record = this.getFriendRecords(friendId);
                return JSON.stringify(record, null, 2);
            } else {
                const allRecords = this.getAllRecords();
                return JSON.stringify(allRecords, null, 2);
            }
        } catch (error) {
            console.error('导出聊天记录失败:', error);
            return null;
        }
    }

    /**
     * 导入聊天记录
     * @param {string} jsonData - JSON格式的聊天记录数据
     * @returns {boolean} 是否导入成功
     */
    importRecords(jsonData) {
        try {
            const data = JSON.parse(jsonData);
            const records = Array.isArray(data) ? data : [data];
            return this.saveRecords(records);
        } catch (error) {
            console.error('导入聊天记录失败:', error);
            return false;
        }
    }
}

// 导出类供其他模块使用
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { ChatRecordParser, ChatRecordStorage };
} else {
    window.ChatRecordParser = ChatRecordParser;
    window.ChatRecordStorage = ChatRecordStorage;
}
