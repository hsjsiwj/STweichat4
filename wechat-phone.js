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
        switch (tab) {
            case 'chat':
                this.setTitle('微信');
                this.renderChatList();
                break;
            case 'contacts':
                this.setTitle('通讯录');
                this.renderContacts();
                break;
            case 'discover':
                this.setTitle('发现');
                this.renderDiscover();
                break;
            case 'me':
                this.setTitle('我');
                this.renderMe();
                break;
        }
    }

    // 占位版：聊天列表（可点击进入会话详情）
    renderChatList() {
        const content = document.getElementById('wechat-content');
        const demoChats = [
            { id: 'a1', name: '小明', last: '明天一起吃饭？', time: '下午 3:08', unread: 2, avatar: '🟢' },
            { id: 'b2', name: '学习交流群', last: '今晚八点开会', time: '下午 2:12', unread: 0, avatar: '🟡' },
            { id: 'c3', name: '小红', last: '收到~', time: '昨天', unread: 1, avatar: '🟣' },
        ];

        content.innerHTML = `
            <div class="chat-list">
                ${demoChats.map(c => `
                  <div class="chat-item" data-id="${c.id}" style="display:flex;align-items:center;padding:12px 14px;border-bottom:1px solid #eee;cursor:pointer;">
                    <div class="avatar" style="width:44px;height:44px;border-radius:8px;background:#f5f5f5;display:flex;align-items:center;justify-content:center;font-size:20px;margin-right:12px;">
                      ${c.avatar}
                    </div>
                    <div style="flex:1;min-width:0;">
                      <div style="display:flex;justify-content:space-between;align-items:center;">
                        <div style="font-size:16px;color:#111;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:70%;">${c.name}</div>
                        <div style="font-size:12px;color:#999;">${c.time}</div>
                      </div>
                      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:4px;">
                        <div style="font-size:13px;color:#666;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:80%;">${c.last}</div>
                        ${c.unread ? `<span style="background:#f54d4d;color:#fff;border-radius:10px;padding:0 6px;font-size:12px;line-height:18px;min-width:18px;text-align:center;">${c.unread}</span>` : ''}
                      </div>
                    </div>
                  </div>
                `).join('')}
            </div>
        `;

        // 绑定点击进入聊天详情
        content.querySelectorAll('.chat-item').forEach(el => {
            el.addEventListener('click', () => {
                const id = el.getAttribute('data-id');
                const chat = demoChats.find(c => c.id === id);
                this.renderChatDetail(chat);
            });
        });
    }

    // 占位版：聊天详情（简单消息 + 输入框）
    renderChatDetail(chat) {
        const content = document.getElementById('wechat-content');
        this.setTitle(chat?.name || '聊天');

        const demoMsgs = [
            { from: 'other', text: '你好～' },
            { from: 'me', text: '你好，有什么事吗？' },
            { from: 'other', text: chat?.last || '一起学习？' },
        ];

        content.innerHTML = `
            <div class="chat-detail" style="display:flex;flex-direction:column;height:100%;">
                <div class="messages" style="flex:1;overflow:auto;background:#f7f7f7;padding:10px 10px 60px;">
                    ${demoMsgs.map(m => `
                        <div style="display:flex;${m.from === 'me' ? 'justify-content:flex-end;' : 'justify-content:flex-start;'}margin:8px 0;">
                          <div style="max-width:70%;padding:8px 10px;border-radius:8px;background:${m.from === 'me' ? '#95ec69' : '#fff'};box-shadow:0 1px 2px rgba(0,0,0,0.06);font-size:14px;line-height:20px;color:#111;">
                            ${m.text}
                          </div>
                        </div>
                    `).join('')}
                </div>
                <div class="input-bar" style="position:absolute;left:0;right:0;bottom:0;display:flex;gap:8px;align-items:center;padding:8px 10px;background:#fff;border-top:1px solid #eee;">
                    <input id="chat-input" type="text" placeholder="发消息..." style="flex:1;height:36px;border:1px solid #e5e5e5;border-radius:6px;padding:0 10px;outline:none;">
                    <button id="chat-send" class="send-btn" style="height:36px;padding:0 14px;background:#07C160;color:#fff;border:none;border-radius:6px;cursor:pointer;">发送</button>
                </div>
            </div>
        `;

        const input = document.getElementById('chat-input');
        const send = document.getElementById('chat-send');
        const messages = content.querySelector('.messages');

        const pushMyMsg = (text) => {
            const wrap = document.createElement('div');
            wrap.style.cssText = 'display:flex;justify-content:flex-end;margin:8px 0;';
            wrap.innerHTML = `<div style="max-width:70%;padding:8px 10px;border-radius:8px;background:#95ec69;box-shadow:0 1px 2px rgba(0,0,0,0.06);font-size:14px;line-height:20px;color:#111;">${text}</div>`;
            messages.appendChild(wrap);
            messages.scrollTop = messages.scrollHeight;
        };

        send.addEventListener('click', () => {
            const val = (input.value || '').trim();
            if (!val) return;
            pushMyMsg(val);
            input.value = '';
        });
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                send.click();
            }
        });
    }

    // 占位版：通讯录
    renderContacts() {
        const content = document.getElementById('wechat-content');
        const groups = {
            'A': ['阿强', '阿美'],
            'B': ['白露', '冰冰'],
            'C': ['陈晨', '超人'],
        };
        content.innerHTML = `
            <div class="contacts" style="background:#fff;">
              ${Object.keys(groups).map(k => `
                <div class="group">
                  <div style="padding:6px 12px;background:#f7f7f7;color:#666;font-size:12px;">${k}</div>
                  ${groups[k].map(n => `
                    <div class="row" style="display:flex;align-items:center;padding:12px 14px;border-bottom:1px solid #eee;">
                        <div style="width:36px;height:36px;border-radius:6px;background:#eaeaea;display:flex;align-items:center;justify-content:center;margin-right:12px;">😀</div>
                        <div style="font-size:15px;color:#111;">${n}</div>
                    </div>
                  `).join('')}
                </div>
              `).join('')}
            </div>
        `;
    }

    // 占位版：发现
    renderDiscover() {
        const content = document.getElementById('wechat-content');
        content.innerHTML = `
            <div class="discover" style="background:#f7f7f7;">
                <div class="cell" id="discover-moments" style="display:flex;align-items:center;padding:12px 14px;background:#fff;border-bottom:1px solid #eee;cursor:pointer;">
                    <div style="width:28px;height:28px;border-radius:6px;background:#eaeaea;display:flex;align-items:center;justify-content:center;margin-right:12px;">📸</div>
                    <div style="flex:1;color:#111;">朋友圈</div>
                </div>
                <div class="cell" id="discover-shop" style="display:flex;align-items:center;padding:12px 14px;background:#fff;border-bottom:1px solid #eee;cursor:pointer;margin-top:10px;">
                    <div style="width:28px;height:28px;border-radius:6px;background:#eaeaea;display:flex;align-items:center;justify-content:center;margin-right:12px;">🛍️</div>
                    <div style="flex:1;color:#111;">商城</div>
                </div>
            </div>
        `;

        const moments = document.getElementById('discover-moments');
        const shop = document.getElementById('discover-shop');

        if (moments) {
            moments.addEventListener('click', () => {
                // 若有外部模块则调用，否则渲染占位朋友圈
                if (window.momentsApp && typeof window.momentsApp.renderMoments === 'function') {
                    window.momentsApp.renderMoments();
                } else {
                    const c = document.getElementById('wechat-content');
                    this.setTitle('朋友圈');
                    c.innerHTML = `
                        <div style="background:#fff;">
                          ${[1,2,3].map(i => `
                             <div style="padding:12px 14px;border-bottom:1px solid #eee;">
                               <div style="display:flex;align-items:center;">
                                 <div style="width:36px;height:36px;border-radius:6px;background:#eaeaea;display:flex;align-items:center;justify-content:center;margin-right:10px;">👤</div>
                                 <div style="font-size:14px;color:#111;">好友 ${i}</div>
                               </div>
                               <div style="margin-top:8px;color:#222;line-height:20px;">今天的风真大，学习也要加油呀～</div>
                               <div style="margin-top:8px;color:#999;font-size:12px;">2分钟前</div>
                             </div>
                          `).join('')}
                        </div>
                    `;
                }
            });
        }

        if (shop) {
            shop.addEventListener('click', () => {
                if (window.shopApp && typeof window.shopApp.renderShop === 'function') {
                    window.shopApp.renderShop();
                } else {
                    const c = document.getElementById('wechat-content');
                    this.setTitle('商城');
                    c.innerHTML = `
                        <div style="background:#fff;display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:10px;">
                          ${[1,2,3,4].map(i => `
                            <div style="background:#fff;border:1px solid #eee;border-radius:8px;overflow:hidden;">
                              <div style="background:#eaeaea;height:90px;display:flex;align-items:center;justify-content:center;">🧩</div>
                              <div style="padding:8px 10px;">
                                <div style="font-size:14px;color:#111;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">好物 ${i}</div>
                                <div style="margin-top:4px;color:#07C160;font-weight:600;">¥ ${(i*9).toFixed(2)}</div>
                              </div>
                            </div>
                          `).join('')}
                        </div>
                    `;
                }
            });
        }
    }

    // 占位版：我
    renderMe() {
        const content = document.getElementById('wechat-content');
        content.innerHTML = `
            <div class="me" style="background:#f7f7f7;">
              <div style="display:flex;align-items:center;padding:16px;background:#fff;border-bottom:1px solid #eee;">
                <div style="width:54px;height:54px;border-radius:10px;background:#eaeaea;display:flex;align-items:center;justify-content:center;margin-right:12px;">🙂</div>
                <div style="flex:1;">
                  <div style="font-size:16px;color:#111;font-weight:600;">我的昵称</div>
                  <div style="margin-top:4px;color:#999;font-size:12px;">微信号：wx_demo</div>
                </div>
                <div style="color:#ccc;">›</div>
              </div>
              <div style="height:10px;"></div>
              ${[
                { icon:'💰', text:'服务' },
                { icon:'⭐', text:'收藏' },
                { icon:'🖼️', text:'相册' },
                { icon:'😊', text:'表情' },
                { icon:'⚙️', text:'设置' }
              ].map(it => `
                <div style="display:flex;align-items:center;padding:12px 14px;background:#fff;border-bottom:1px solid #eee;cursor:pointer;">
                  <div style="width:28px;height:28px;border-radius:6px;background:#eaeaea;display:flex;align-items:center;justify-content:center;margin-right:12px;">${it.icon}</div>
                  <div style="flex:1;color:#111;">${it.text}</div>
                  <div style="color:#ccc;">›</div>
                </div>
              `).join('')}
            </div>
        `;
    }

    setTitle(title) {
        const titleEl = document.querySelector('.wechat-header .title');
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
