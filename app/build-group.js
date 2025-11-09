// WeChat Build Group Module

class GroupManager {
    constructor() {
        this.groups = [];
    }

    init() {
        console.log('[WeChat GroupManager] 初始化');
        this.loadGroups();
        document.addEventListener('wechat-sync-group', (event) => this.addGroup(event.detail));
    }

    loadGroups() {
        this.groups = JSON.parse(localStorage.getItem('wechat_groups')) || [];
    }

    saveGroups() {
        localStorage.setItem('wechat_groups', JSON.stringify(this.groups));
    }

    addGroup(groupData) {
        if (!this.groups.find(g => g.id === groupData.id)) {
            this.groups.push(groupData);
            this.saveGroups();
            // 触发UI更新
            if (document.querySelector('.contacts-list')) {
                window.friendManager.renderContactsTab();
            }
        }
    }

    renderGroups(container) {
        if (this.groups.length === 0) return;

        const groupSection = document.createElement('div');
        groupSection.className = 'group-section';
        groupSection.innerHTML = '<h3>群聊</h3><ul class="group-list"></ul>';
        const list = groupSection.querySelector('ul');

        this.groups.forEach(g => {
            const item = document.createElement('li');
            item.innerHTML = `<span>${g.name} (${g.members.length}人)</span>`;
            item.addEventListener('click', () => {
                if(window.messageApp) {
                    // 群聊也视为一个聊天对象
                    window.messageApp.openChat(g.id);
                }
            });
            list.appendChild(item);
        });
        container.appendChild(groupSection);
    }

    createGroup() {
        const name = prompt('请输入群聊名称:');
        if (name) {
            const command = `[创建群组|${name}]`;
            SillyTavern.getContext().sendSystemMessage(command, true);
        }
    }
}

window.groupManager = new GroupManager();
function initBuildGroup() {
    window.groupManager.init();
}
window.initBuildGroup = initBuildGroup;