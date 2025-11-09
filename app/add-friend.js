// WeChat Add Friend Module

class FriendManager {
    constructor() {
        this.friends = [];
    }

    init() {
        console.log('[WeChat FriendManager] 初始化');
        this.loadFriends();
        document.addEventListener('wechat-sync-friend', (event) => this.addFriend(event.detail));
    }

    loadFriends() {
        this.friends = JSON.parse(localStorage.getItem('wechat_friends')) || [];
    }

    saveFriends() {
        localStorage.setItem('wechat_friends', JSON.stringify(this.friends));
    }

    addFriend(friendData) {
        if (!this.friends.find(f => f.id === friendData.id)) {
            this.friends.push(friendData);
            this.saveFriends();
            // 如果当前在通讯录界面，则刷新
            if (document.querySelector('.contacts-list')) {
                this.renderContactsTab();
            }
        }
    }

    renderContactsTab() {
        const content = document.getElementById('wechat-content');
        content.innerHTML = `
            <div class="contacts">
                <div class="add-friend-bar">
                    <input type="text" placeholder="输入好友ID添加" id="add-friend-input">
                    <button id="add-friend-btn">添加好友</button>
                </div>
                <div class="create-group-bar">
                    <button id="create-group-btn">新建群聊</button>
                </div>
                <div id="group-list-container"></div>
                <h3>好友</h3>
                <ul class="contacts-list"></ul>
            </div>
        `;
        document.getElementById('add-friend-btn').addEventListener('click', () => this.sendFriendRequest());
        document.getElementById('create-group-btn').addEventListener('click', () => window.groupManager.createGroup());

        // 渲染群组
        if (window.groupManager) {
            window.groupManager.renderGroups(document.getElementById('group-list-container'));
        }

        const list = content.querySelector('.contacts-list');
        this.friends.forEach(f => {
            const item = document.createElement('li');
            item.innerHTML = `<span>${f.name}</span>`;
            item.addEventListener('click', () => {
                if(window.messageApp) {
                    window.messageApp.openChat(f.id);
                }
            });
            list.appendChild(item);
        });
    }

    sendFriendRequest() {
        const input = document.getElementById('add-friend-input');
        const id = input.value.trim();
        if (id) {
            const command = `[添加好友|${id}]`;
            SillyTavern.getContext().sendSystemMessage(command, true);
            input.value = '';
        }
    }
}

window.friendManager = new FriendManager();
function initAddFriend() {
    window.friendManager.init();
}
window.initAddFriend = initAddFriend;