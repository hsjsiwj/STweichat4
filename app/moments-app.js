// WeChat Moments Module

class MomentsApp {
    constructor() {
        this.moments = [];
    }

    init() {
        console.log('[WeChat Moments] 初始化');
        this.loadMoments();
        document.addEventListener('wechat-sync-moment', (event) => this.addMoment(event.detail));
    }

    loadMoments() {
        this.moments = JSON.parse(localStorage.getItem('wechat_moments')) || [];
    }

    saveMoments() {
        localStorage.setItem('wechat_moments', JSON.stringify(this.moments));
    }

    addMoment(momentData) {
        this.moments.unshift({ id: Date.now(), ...momentData }); // 新动态置顶
        this.saveMoments();
        if (document.querySelector('.moments-list')) {
            this.renderMoments();
        }
    }

    renderMoments() {
        const content = document.getElementById('wechat-content');
        content.innerHTML = `
            <div class="moments">
                <div class="moments-header">
                    <button id="post-moment-btn">发布</button>
                </div>
                <div class="moments-list"></div>
            </div>
        `;
        document.getElementById('post-moment-btn').addEventListener('click', () => this.postMoment());

        const list = content.querySelector('.moments-list');
        this.moments.forEach(m => {
            const item = document.createElement('div');
            item.className = 'moment-item';
            item.innerHTML = `
                <div class="moment-user">${m.user}</div>
                <p>${m.content}</p>
                ${m.image ? `<img src="${m.image}" class="moment-image">` : ''}
            `;
            list.appendChild(item);
        });
        
        if (window.wechatPhone) {
            window.wechatPhone.setTitle('朋友圈');
        }
    }

    postMoment() {
        const content = prompt('输入动态内容:');
        if (content) {
            const command = `[发布朋友圈|${content}|]`; // 暂无图片
            SillyTavern.getContext().sendSystemMessage(command, true);
            // 模拟立即显示
            this.addMoment({ user: '我', content, image: '' });
        }
    }
}

window.momentsApp = new MomentsApp();
function initMomentsApp() {
    window.momentsApp.init();
}
window.initMomentsApp = initMomentsApp;