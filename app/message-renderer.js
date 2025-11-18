/**
 * 消息渲染器
 * 负责将不同类型的消息渲染为HTML
 */
class MessageRenderer {
    /**
     * 渲染消息
     * @param {Object} message - 消息对象
     * @param {Object} options - 渲染选项
     * @returns {string} 渲染后的HTML
     */
    static renderMessage(message, options = {}) {
        const { showTimestamp = true, isOwnMessage = false } = options;
        
        let messageHtml = '';
        
        switch (message.type) {
            case '文字':
                messageHtml = this.renderTextMessage(message, options);
                break;
            case '红包':
                messageHtml = this.renderRedPacketMessage(message, options);
                break;
            case '表情包':
                messageHtml = this.renderStickerMessage(message, options);
                break;
            case '图片':
                messageHtml = this.renderImageMessage(message, options);
                break;
            case '语音':
                messageHtml = this.renderVoiceMessage(message, options);
                break;
            case '视频':
                messageHtml = this.renderVideoMessage(message, options);
                break;
            case '位置':
                messageHtml = this.renderLocationMessage(message, options);
                break;
            case '链接':
                messageHtml = this.renderLinkMessage(message, options);
                break;
            default:
                messageHtml = this.renderTextMessage(message, options);
                break;
        }
        
        return `<div class="message-item ${message.type}-message ${isOwnMessage ? 'own-message' : 'friend-message'}" data-timestamp="${message.timestamp}">
            ${messageHtml}
            ${showTimestamp ? `<div class="message-time">${this.formatTime(message.timestamp)}</div>` : ''}
        </div>`;
    }
    
    /**
     * 渲染文字消息
     * @param {Object} message - 消息对象
     * @param {Object} options - 渲染选项
     * @returns {string} 渲染后的HTML
     */
    static renderTextMessage(message, options = {}) {
        const content = this.processMessageContent(message.content);
        return `<div class="message-content text-content">${content}</div>`;
    }
    
    /**
     * 渲染红包消息
     * @param {Object} message - 消息对象
     * @param {Object} options - 渲染选项
     * @returns {string} 渲染后的HTML
     */
    static renderRedPacketMessage(message, options = {}) {
        const amount = message.content;
        return `<div class="message-content red-packet-content">
            <div class="red-packet-icon">🧧</div>
            <div class="red-packet-info">
                <div class="red-packet-amount">¥${amount}</div>
                <div class="red-packet-text">微信红包</div>
            </div>
        </div>`;
    }
    
    /**
     * 渲染表情包消息
     * @param {Object} message - 消息对象
     * @param {Object} options - 渲染选项
     * @returns {string} 渲染后的HTML
     */
    static renderStickerMessage(message, options = {}) {
        const imageUrl = message.content;
        // 确保URL是有效的
        const validUrl = this.ensureValidUrl(imageUrl);
        return `<div class="message-content sticker-content">
            <img src="${validUrl}" alt="表情包" class="sticker-image"
                 onload="this.classList.add('loaded')"
                 onerror="this.style.display='none'; this.nextElementSibling.style.display='block';"
                 crossorigin="anonymous">
            <div class="sticker-fallback" style="display:none;">
                <div class="sticker-error">表情包加载失败</div>
                <div class="sticker-url">${this.escapeHtml(imageUrl)}</div>
            </div>
        </div>`;
    }
    
    /**
     * 渲染图片消息
     * @param {Object} message - 消息对象
     * @param {Object} options - 渲染选项
     * @returns {string} 渲染后的HTML
     */
    static renderImageMessage(message, options = {}) {
        const imageUrl = message.content;
        // 确保URL是有效的
        const validUrl = this.ensureValidUrl(imageUrl);
        return `<div class="message-content image-content">
            <img src="${validUrl}" alt="图片" class="message-image"
                 onload="this.classList.add('loaded')"
                 onerror="this.style.display='none'; this.nextElementSibling.style.display='block';"
                 onclick="window.open('${validUrl}', '_blank')"
                 crossorigin="anonymous">
            <div class="image-fallback" style="display:none;">
                <div class="image-error">图片加载失败</div>
                <div class="image-url">${this.escapeHtml(imageUrl)}</div>
            </div>
        </div>`;
    }
    
    /**
     * 渲染语音消息
     * @param {Object} message - 消息对象
     * @param {Object} options - 渲染选项
     * @returns {string} 渲染后的HTML
     */
    static renderVoiceMessage(message, options = {}) {
        const duration = message.content;
        return `<div class="message-content voice-content">
            <div class="voice-icon">🎵</div>
            <div class="voice-info">
                <div class="voice-duration">${duration}"</div>
                <div class="voice-text">语音消息</div>
            </div>
        </div>`;
    }
    
    /**
     * 渲染视频消息
     * @param {Object} message - 消息对象
     * @param {Object} options - 渲染选项
     * @returns {string} 渲染后的HTML
     */
    static renderVideoMessage(message, options = {}) {
        const videoUrl = message.content;
        return `<div class="message-content video-content">
            <video src="${videoUrl}" class="message-video" controls>
                <div class="video-fallback">
                    <div class="video-error">视频加载失败</div>
                    <div class="video-url">${this.escapeHtml(videoUrl)}</div>
                </div>
            </video>
        </div>`;
    }
    
    /**
     * 渲染位置消息
     * @param {Object} message - 消息对象
     * @param {Object} options - 渲染选项
     * @returns {string} 渲染后的HTML
     */
    static renderLocationMessage(message, options = {}) {
        const location = message.content;
        return `<div class="message-content location-content">
            <div class="location-icon">📍</div>
            <div class="location-info">
                <div class="location-text">${this.escapeHtml(location)}</div>
                <div class="location-label">位置</div>
            </div>
        </div>`;
    }
    
    /**
     * 渲染链接消息
     * @param {Object} message - 消息对象
     * @param {Object} options - 渲染选项
     * @returns {string} 渲染后的HTML
     */
    static renderLinkMessage(message, options = {}) {
        const url = message.content;
        const urlObj = this.parseUrl(url);
        return `<div class="message-content link-content">
            <a href="${url}" target="_blank" class="link-preview">
                <div class="link-icon">🔗</div>
                <div class="link-info">
                    <div class="link-title">${urlObj.title || this.escapeHtml(url)}</div>
                    <div class="link-url">${urlObj.hostname || this.escapeHtml(url)}</div>
                </div>
            </a>
        </div>`;
    }
    
    /**
     * 处理消息内容，支持表情符号、链接等
     * @param {string} content - 原始内容
     * @returns {string} 处理后的内容
     */
    static processMessageContent(content) {
        let processedContent = this.escapeHtml(content);
        
        // 处理链接
        processedContent = this.processLinks(processedContent);
        
        // 处理换行
        processedContent = processedContent.replace(/\n/g, '<br>');
        
        return processedContent;
    }
    
    /**
     * 处理链接
     * @param {string} content - 内容
     * @returns {string} 处理后的内容
     */
    static processLinks(content) {
        const urlRegex = /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_+.~#?&//=]*)/g;
        return content.replace(urlRegex, (url) => {
            return `<a href="${url}" target="_blank" class="message-link">${url}</a>`;
        });
    }
    
    /**
     * 解析URL
     * @param {string} url - URL字符串
     * @returns {Object} 解析后的URL对象
     */
    static parseUrl(url) {
        try {
            const urlObj = new URL(url);
            return {
                hostname: urlObj.hostname,
                pathname: urlObj.pathname,
                search: urlObj.search,
                hash: urlObj.hash,
                title: urlObj.hostname + urlObj.pathname
            };
        } catch (error) {
            return {
                hostname: '',
                pathname: '',
                search: '',
                hash: '',
                title: url
            };
        }
    }
    
    /**
     * HTML转义
     * @param {string} text - 原始文本
     * @returns {string} 转义后的文本
     */
    static escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    /**
     * 格式化时间
     * @param {number} timestamp - 时间戳
     * @returns {string} 格式化后的时间
     */
    static formatTime(timestamp) {
        const date = new Date(timestamp);
        const now = new Date();
        const diffTime = now - date;
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
        
        if (diffDays === 0) {
            // 今天
            return date.toLocaleTimeString('zh-CN', { 
                hour: '2-digit', 
                minute: '2-digit' 
            });
        } else if (diffDays === 1) {
            // 昨天
            return '昨天 ' + date.toLocaleTimeString('zh-CN', { 
                hour: '2-digit', 
                minute: '2-digit' 
            });
        } else if (diffDays < 7) {
            // 本周
            const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
            return weekdays[date.getDay()] + ' ' + date.toLocaleTimeString('zh-CN', { 
                hour: '2-digit', 
                minute: '2-digit' 
            });
        } else {
            // 更早
            return date.toLocaleDateString('zh-CN', { 
                month: '2-digit', 
                day: '2-digit' 
            }) + ' ' + date.toLocaleTimeString('zh-CN', { 
                hour: '2-digit', 
                minute: '2-digit' 
            });
        }
    }
    
    /**
     * 渲染消息列表
     * @param {Array} messages - 消息数组
     * @param {Object} options - 渲染选项
     * @returns {string} 渲染后的HTML
     */
    static renderMessageList(messages, options = {}) {
        const { showTimestamp = true, groupByDate = true } = options;
        
        if (!messages || messages.length === 0) {
            return '<div class="no-messages">暂无消息</div>';
        }
        
        let html = '';
        let lastDate = null;
        
        messages.forEach((message, index) => {
            // 按日期分组
            if (groupByDate) {
                const messageDate = new Date(message.timestamp).toDateString();
                if (messageDate !== lastDate) {
                    lastDate = messageDate;
                    html += `<div class="date-divider">${this.formatDate(message.timestamp)}</div>`;
                }
            }
            
            html += this.renderMessage(message, options);
        });
        
        return html;
    }
    
    /**
     * 格式化日期
     * @param {number} timestamp - 时间戳
     * @returns {string} 格式化后的日期
     */
    static formatDate(timestamp) {
        const date = new Date(timestamp);
        const now = new Date();
        const diffTime = now - date;
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
        
        if (diffDays === 0) {
            return '今天';
        } else if (diffDays === 1) {
            return '昨天';
        } else if (diffDays < 7) {
            const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
            return weekdays[date.getDay()];
        } else {
            return date.toLocaleDateString('zh-CN', { 
                year: 'numeric',
                month: '2-digit', 
                day: '2-digit'
            });
        }
    }
}

// 导出类供其他模块使用
if (typeof module !== 'undefined' && module.exports) {
    module.exports = MessageRenderer;
} else {
    window.MessageRenderer = MessageRenderer;
}