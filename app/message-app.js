// WeChat Message App - 微信聊天模块

class MessageApp {
    constructor() {
        this.chatList = []; // { id, name, avatar, lastMessage, messages: [] }
        this.currentChatId = null;
    }

    init() {
        console.log('[WeChat Message] 聊天模块初始化');
        this.loadChatList();
        document.addEventListener('wechat-sync-message', (event) => this.handleNewMessage(event.detail));
        document.addEventListener('wechat-sync-friend', (event) => this.handleNewFriend(event.detail));
    }

    loadChatList() {
        this.chatList = JSON.parse(localStorage.getItem('wechat_chatList')) || [];
    }

    saveChatList() {
        localStorage.setItem('wechat_chatList', JSON.stringify(this.chatList));
    }
    
    handleNewFriend(friendData) {
        // 当添加新好友时，为他们创建一个空的聊天记录
        if (!this.chatList.find(chat => chat.id === friendData.id)) {
            this.chatList.push({
                id: friendData.id,
                name: friendData.name,
                avatar: 'images/default-avatar.png', // 默认头像
                lastMessage: '我们已经是好友了，开始聊天吧！',
                messages: [],
            });
            this.saveChatList();
        }
    }

    handleNewMessage(messageData) {
        const { sender, content } = messageData;
        let chat = this.chatList.find(c => c.id === sender || c.name === sender);

        if (!chat) {
            console.warn(`[WeChat Message] 收到未知发件人 "${sender}" 的消息，已自动创建聊天。`);
            chat = { id: sender, name: sender, avatar: 'images/default-avatar.png', messages: [] };
            this.chatList.push(chat);
        }

        chat.messages.push({ sender: 'other', content, avatar: chat.avatar });
        chat.lastMessage = content;
        this.saveChatList();

        // 如果正在当前聊天窗口，则实时更新
        if (this.currentChatId === chat.id) {
            this.renderMessages();
        }
        // 如果在聊天列表界面，则更新列表
        if (document.querySelector('.chat-list')) {
            this.renderChatList();
        }
    }

    renderChatList() {
        const content = document.getElementById('wechat-content');
        content.innerHTML = '<ul class="chat-list"></ul>';
        const list = content.querySelector('.chat-list');
        this.chatList.forEach(chat => {
            const item = document.createElement('li');
            item.innerHTML = `
                <img src="${chat.avatar || 'images/default-avatar.png'}" alt="头像">
                <div>
                    <span>${chat.name}</span>
                    <p>${chat.lastMessage || ''}</p>
                </div>
            `;
            item.addEventListener('click', () => this.openChat(chat.id));
            list.appendChild(item);
        });
    }

    openChat(chatId) {
        this.currentChatId = chatId;
        const chat = this.chatList.find(c => c.id === chatId);
        if (!chat) return;

        // 更新手机标题
        if (window.wechatPhone) {
            window.wechatPhone.setTitle(chat.name);
        }

        const content = document.getElementById('wechat-content');
        content.innerHTML = `
            <div class="chat-room">
                <div class="messages" id="messages"></div>
                <div class="input-bar">
                    <input type="text" id="message-input" placeholder="输入消息...">
                    <button id="send-message-btn">发送</button>
                </div>
            </div>
        `;
        document.getElementById('send-message-btn').addEventListener('click', () => this.sendMessage());
        this.renderMessages();
    }

    renderMessages() {
        const messagesDiv = document.getElementById('messages');
        if (!messagesDiv || !this.currentChatId) return;
        
        const chat = this.chatList.find(c => c.id === this.currentChatId);
        if (!chat) return;

        messagesDiv.innerHTML = '';
        chat.messages.forEach(msg => {
            const div = document.createElement('div');
            div.className = msg.sender === 'user' ? 'message-right' : 'message-left';
            div.innerHTML = `<p>${msg.content}</p>`;
            messagesDiv.appendChild(div);
        });
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
    }

    sendMessage() {
        const input = document.getElementById('message-input');
        const message = input.value.trim();
        if (!message || !this.currentChatId) return;

        const chat = this.chatList.find(c => c.id === this.currentChatId);
        if (!chat) return;

        // 更新本地UI
        chat.messages.push({ sender: 'user', content: message });
        chat.lastMessage = message;
        this.renderMessages();
        this.saveChatList();

        // 发送到SillyTavern，并隐藏该消息
        const command = `[发送消息|${this.currentChatId}|${message}]`;
        SillyTavern.getContext().sendSystemMessage(command, true);
        
        input.value = '';
    }
}

window.messageApp = new MessageApp();
function initMessageApp() {
    window.messageApp.init();
}
window.initMessageApp = initMessageApp;