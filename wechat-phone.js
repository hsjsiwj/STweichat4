// WeChat Phone Simulator - 模拟微信主界面和拖拽

class WeChatPhone {
    constructor() {
        this.isVisible = false;
        this.init();
    }

    init() {
        this.loadCSS();
        this.createFrame();
        this.bindNavEvents();
        this.loadTabContent('chat'); // 默认加载聊天
    }

    loadCSS() {
        const cssLink = document.createElement('link');
        cssLink.rel = 'stylesheet';
        cssLink.href = `${window.wechatExtensionPath}/styles/wechat-phone.css`;
        document.head.appendChild(cssLink);
    }

    createFrame() {
        const frame = document.createElement('div');
        frame.id = 'wechat-frame';
        frame.style.display = 'none'; // 默认隐藏
        frame.style.position = 'fixed'; // 确保使用fixed定位
        frame.style.zIndex = '10000'; // 确保z-index足够高
        document.body.appendChild(frame);

        frame.innerHTML = `
            <div class="wechat-status-bar">
                <span class="time">10:00</span>
                <div class="icons">
                    <span class="signal"></span>
                    <span class="wifi"></span>
                    <span class="battery"></span>
                </div>
            </div>
            <div class="wechat-header">
                <span class="title">微信</span>
                <div class="actions">
                    <span class="search"></span>
                    <span class="add"></span>
                </div>
            </div>
            <div class="wechat-content" id="wechat-content"></div>
            <div class="wechat-nav">
                <div class="wechat-nav-item active" data-tab="chat">
                    <div class="icon chat"></div>
                    <span>微信</span>
                </div>
                <div class="wechat-nav-item" data-tab="contacts">
                    <div class="icon contacts"></div>
                    <span>通讯录</span>
                </div>
                <div class="wechat-nav-item" data-tab="discover">
                    <div class="icon discover"></div>
                    <span>发现</span>
                </div>
                <div class="wechat-nav-item" data-tab="me">
                    <div class="icon me"></div>
                    <span>我</span>
                </div>
            </div>
        `;
        
        // 使框架可拖拽
        if (window.DragHelper) {
            new window.DragHelper(frame, { storageKey: 'wechat-frame-position' }); // 移除dragHandle，整个框架可拖拽
        }
    }

    bindNavEvents() {
        const frame = document.getElementById('wechat-frame');
        const navItems = frame.querySelectorAll('.wechat-nav-item');
        navItems.forEach(item => {
            item.addEventListener('click', () => {
                navItems.forEach(i => i.classList.remove('active'));
                item.classList.add('active');
                this.loadTabContent(item.dataset.tab);
            });
        });
    }

    loadTabContent(tab) {
        const content = document.getElementById('wechat-content');
        this.setTitle('微信'); // 默认标题
        switch (tab) {
            case 'chat':
                if (window.messageApp) {
                    window.messageApp.renderChatList();
                } else {
                    content.innerHTML = '<div>聊天模块加载中...</div>';
                }
                break;
            case 'contacts':
                if (window.friendManager) {
                    window.friendManager.renderContactsTab();
                } else {
                    content.innerHTML = '<div>通讯录模块加载中...</div>';
                }
                break;
            case 'discover':
                content.innerHTML = `
                    <ul class="discover-list">
                        <li id="discover-moments">朋友圈</li>
                        <li id="discover-shop">商城</li>
                    </ul>
                `;
                document.getElementById('discover-moments').addEventListener('click', () => {
                    if (window.momentsApp) {
                        window.momentsApp.renderMoments();
                    }
                });
                document.getElementById('discover-shop').addEventListener('click', () => {
                    if (window.shopApp) {
                        window.shopApp.renderShop();
                    }
                });
                break;
            case 'me':
                content.innerHTML = '<div>个人设置（待实现）</div>';
                break;
        }
    }

    setTitle(title) {
        const titleEl = document.querySelector('.wechat-status-bar');
        if (titleEl) {
            titleEl.textContent = title;
        }
    }

    toggle() {
        const frame = document.getElementById('wechat-frame');
        this.isVisible = !this.isVisible;
        frame.style.display = this.isVisible ? 'flex' : 'none';
    }
}

// 初始化微信界面
function initWeChatPhone() {
    if (!window.wechatPhone) {
        window.wechatPhone = new WeChatPhone();
    }
}

// 等待DOM加载
document.addEventListener('DOMContentLoaded', initWeChatPhone);
