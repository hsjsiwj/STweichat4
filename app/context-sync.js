// WeChat Context Sync Module - 数据同步和解析，参考mobile-main context-monitor.js

class ContextSync {
    constructor(settings = {}) {
        this.settings = {
            interval: 3000,
            ...settings,
        };
        this.lastMessageCount = 0;
        this.syncInterval = null;
        this.patterns = {
            message: /\[消息\|(.*?)\|(.*?)\]/g,
            friend: /\[好友\|(.*?)\|(.*?)\]/g,
            group: /\[群组\|(.*?)\|(.*?)\|(.*?)\]/g,
            moment: /\[朋友圈\|(.*?)\|(.*?)\|(.*?)\]/g,
            product: /\[商品\|(.*?)\|(.*?)\|(.*?)\|(.*?)\]/g,
            purchase: /\[购买\|(.*?)\|(.*?)\|(.*?)\]/g,
        };
    }

    start() {
        if (this.syncInterval) {
            console.warn('[WeChat Sync] 同步已在运行中。');
            return;
        }
        console.log('[WeChat Sync] 数据同步启动');
        const context = SillyTavern.getContext();
        this.syncInterval = setInterval(() => this.syncData(context), this.settings.interval);

        // 初始同步
        this.syncData(context);
    }

    stop() {
        if (this.syncInterval) {
            clearInterval(this.syncInterval);
            this.syncInterval = null;
            console.log('[WeChat Sync] 数据同步停止');
        }
    }

    syncData(context) {
        const currentMessages = context.chat; // 使用 context.chat
        if (currentMessages && currentMessages.length > this.lastMessageCount) {
            const newMessages = currentMessages.slice(this.lastMessageCount);
            newMessages.forEach(msg => this.parseMessage(msg.mes));
            this.lastMessageCount = currentMessages.length;
        }
    }

    parseMessage(messageContent) {
        if (!messageContent) return;

        for (const [type, regex] of Object.entries(this.patterns)) {
            // 重置正则表达式的 lastIndex 以确保全局匹配正常工作
            regex.lastIndex = 0;
            let match;
            while ((match = regex.exec(messageContent)) !== null) {
                this.dispatchEvent(type, match);
            }
        }
    }

    dispatchEvent(type, match) {
        let detail = {};
        switch (type) {
            case 'message':
                detail = { sender: match[1], content: match[2] };
                break;
            case 'friend':
                detail = { name: match[1], id: match[2] };
                break;
            case 'group':
                detail = { name: match[1], id: match[2], members: match[3].split(',') };
                break;
            case 'moment':
                detail = { user: match[1], content: match[2], image: match[3] };
                break;
            case 'product':
                detail = { name: match[1], price: parseFloat(match[2]), type: match[3], desc: match[4], id: Date.now().toString() };
                break;
            case 'purchase':
                detail = { name: match[1], qty: parseInt(match[2]), total: parseFloat(match[3]) };
                break;
        }

        const event = new CustomEvent(`wechat-sync-${type}`, { detail });
        document.dispatchEvent(event);
        console.log(`[WeChat Sync] 事件已分发: wechat-sync-${type}`, detail);
    }
}

// 创建并导出实例
window.contextSync = new ContextSync();

// 兼容旧的初始化方式
function initContextSync() {
    window.contextSync.start();
}
function stopContextSync() {
    window.contextSync.stop();
}

window.initContextSync = initContextSync;
window.stopContextSync = stopContextSync;
