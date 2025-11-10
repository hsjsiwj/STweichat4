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

        // 固定显示方案：手机主界面不再可拖拽，始终完整显示在视口（等比缩放 + 居中）
        // 悬浮“💬”图标仍可拖拽（在 index.js 中处理）
        const BASE_W = 375;
        const BASE_H = 812;

        const fitToViewport = () => {
            const vw = Math.max(0, window.innerWidth || document.documentElement.clientWidth || 0);
            const vh = Math.max(0, window.innerHeight || document.documentElement.clientHeight || 0);
            const safeW = Math.max(0, vw - 20); // 四边留白 10px
            const safeH = Math.max(0, vh - 20);
            const scale = Math.min(1, safeW / BASE_W, safeH / BASE_H);

            frame.style.width = BASE_W + 'px';
            frame.style.height = BASE_H + 'px';
            frame.style.top = '50%';
            frame.style.left = '50%';
            frame.style.transformOrigin = 'center center';
            frame.style.transform = `translate(-50%, -50%) scale(${scale})`;
        };

        fitToViewport();
        window.addEventListener('resize', fitToViewport);
        // 暴露给外部调试
        this._fitToViewport = fitToViewport;
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

        // 顶部搜索按钮（占位搜索面板）
        const searchBtn = frame.querySelector('.wechat-header .search');
        if (searchBtn) {
            searchBtn.addEventListener('click', () => {
                if (typeof this.showSearchPanel === 'function') {
                    this.showSearchPanel();
                } else {
                    const kw = prompt('搜索联系人/聊天：');
                    if (kw && kw.trim()) {
                        this.setTitle(`搜索: ${kw.trim()}`);
                    }
                }
            });
        }

        // 顶部“＋”按钮（弹出菜单：发起群聊/添加朋友/扫一扫）
        const addBtn = frame.querySelector('.wechat-header .add');
        if (addBtn) {
            addBtn.addEventListener('click', (e) => {
                if (typeof this.toggleAddMenu === 'function') {
                    this.toggleAddMenu(e);
                }
            });
        }
    }

    // 简易搜索面板（占位版）
    showSearchPanel() {
        const frame = document.getElementById('wechat-frame');
        let panel = frame.querySelector('#wechat-search-panel');
        if (!panel) {
            panel = document.createElement('div');
            panel.id = 'wechat-search-panel';
            panel.style.cssText = `
                position: absolute;
                top: 64px;
                left: 10px;
                right: 10px;
                background: #fff;
                border: 1px solid #e5e5e5;
                border-radius: 8px;
                box-shadow: 0 8px 24px rgba(0,0,0,0.10);
                padding: 10px;
                z-index: 10001;
            `;
            panel.innerHTML = `
                <div style="display:flex;gap:8px;align-items:center;">
                    <input id="wechat-search-input" type="text" placeholder="搜索" style="flex:1;height:36px;border:1px solid #e5e5e5;border-radius:6px;padding:0 10px;outline:none;">
                    <button id="wechat-search-cancel" style="height:36px;padding:0 12px;border:none;background:#f0f0f0;border-radius:6px;cursor:pointer;">取消</button>
                </div>
            `;
            frame.appendChild(panel);

            panel.querySelector('#wechat-search-cancel')?.addEventListener('click', () => {
                panel.style.display = 'none';
            });

            const input = panel.querySelector('#wechat-search-input');
            input?.addEventListener('keydown', (ev) => {
                if (ev.key === 'Enter') {
                    const val = (input.value || '').trim();
                    this.setTitle(val ? `搜索: ${val}` : '微信');
                    panel.style.display = 'none';
                }
            });
        } else {
            panel.style.display = 'block';
        }
        this.setTitle('搜索');
    }

    // 顶部“＋”菜单（占位版）
    toggleAddMenu(evt) {
        const frame = document.getElementById('wechat-frame');
        let menu = frame.querySelector('#wechat-add-menu');
        if (!menu) {
            menu = document.createElement('div');
            menu.id = 'wechat-add-menu';
            menu.style.cssText = `
                position: absolute;
                top: 54px;
                right: 10px;
                width: 180px;
                background: #fff;
                border: 1px solid #e5e5e5;
                border-radius: 8px;
                box-shadow: 0 8px 24px rgba(0,0,0,0.12);
                overflow: hidden;
                z-index: 10001;
            `;
            menu.innerHTML = `
                <div class="item" data-act="group" style="padding:10px 12px;cursor:pointer;border-bottom:1px solid #f2f2f2;">发起群聊</div>
                <div class="item" data-act="add" style="padding:10px 12px;cursor:pointer;border-bottom:1px solid #f2f2f2;">添加朋友</div>
                <div class="item" data-act="scan" style="padding:10px 12px;cursor:pointer;">扫一扫</div>
            `;
            frame.appendChild(menu);

            menu.addEventListener('click', (e) => {
                const t = e.target;
                if (!(t instanceof Element)) return;
                const act = t.getAttribute('data-act');
                switch (act) {
                    case 'group':
                        alert('发起群聊（占位）');
                        break;
                    case 'add':
                        alert('添加朋友（占位）');
                        break;
                    case 'scan':
                        alert('扫一扫（占位）');
                        break;
                }
                this.closeAddMenu();
            });
        }
        menu.style.display = (menu.style.display === 'block') ? 'none' : 'block';

        // 点击外部关闭
        const handleOutside = (ev) => {
            if (!menu) return;
            if (!menu.contains(ev.target)) {
                this.closeAddMenu();
                document.removeEventListener('mousedown', handleOutside, true);
                document.removeEventListener('touchstart', handleOutside, true);
            }
        };
        document.addEventListener('mousedown', handleOutside, true);
        document.addEventListener('touchstart', handleOutside, true);
    }

    closeAddMenu() {
        const frame = document.getElementById('wechat-frame');
        const menu = frame?.querySelector('#wechat-add-menu');
        if (menu) menu.style.display = 'none';
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

        // 绑定点击进入聊天详情（角色占位会话尝试切换到对应角色）
        content.querySelectorAll('.chat-item').forEach(el => {
            el.addEventListener('click', async () => {
                const id = el.getAttribute('data-id');
                const chat = demoChats.find(c => c.id === id) || { id, name: el.getAttribute('data-name') || '聊天' };

                // 如果是角色占位：尝试切换到对应角色并刷新
                if (id && id.startsWith('char:') && window.WeChatSwitch && typeof window.WeChatSwitch.trySwitchToCharacter === 'function') {
                    const cid = id.split(':')[1];
                    const switched = await window.WeChatSwitch.trySwitchToCharacter(cid);
                    if (switched && window.refreshWeChatContext) {
                        await window.refreshWeChatContext();
                    }
                }

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

        const pushMyMsg = (text, targetId) => {
  const wrap = document.createElement('div');
  wrap.style.cssText = 'display:flex;justify-content:flex-end;margin:8px 0;';
  const safe = String(text).replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const idLine = (targetId !== undefined && targetId !== null)
    ? `<div style="color:#999;font-size:12px;margin:0 4px 2px 0;text-align:right;">id:${targetId}</div>`
    : '';
  wrap.innerHTML = `<div style="max-width:70%;">${idLine}<div style="padding:8px 10px;border-radius:8px;background:#95ec69;box-shadow:0 1px 2px rgba(0,0,0,0.06);font-size:14px;line-height:20px;color:#111;">${safe}</div></div>`;
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
        if (this.isVisible && typeof this.startClock === 'function') {
            try { this.startClock(); } catch (e) { /* 忽略 */ }
        }
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

/* === WeChat Extension: dynamic context binding patch ===
   - 将聊天页与 wechatContext 对接（若存在），否则回退演示数据
   - 监听 wechat-context-updated 事件，自动刷新“微信”页（列表/详情）
   - 不改动原有类定义，通过 prototype 覆写保障向后兼容
*/
(function () {
  if (typeof WeChatPhone === 'undefined' || !WeChatPhone.prototype) return;
  const P = WeChatPhone.prototype;

  // 初始化状态字段
  P._ensureState = function () {
    if (!this.currentTab) this.currentTab = 'chat';
    if (!this.currentView) this.currentView = 'list';
    if (!this.currentChatId) this.currentChatId = null;
    if (!this._currentChatName) this._currentChatName = '';
  };

  // 动态渲染：聊天列表（优先使用 wechatContext）
  P._renderChatListDynamic = function () {
    this._ensureState();
    const content = document.getElementById('wechat-content');

    const demoChats = [
      { id: 'a1', name: '小明', last: '明天一起吃饭？', time: '下午 3:08', unread: 2, avatar: '🟢' },
      { id: 'b2', name: '学习交流群', last: '今晚八点开会', time: '下午 2:12', unread: 0, avatar: '🟡' },
      { id: 'c3', name: '小红', last: '收到~', time: '昨天', unread: 1, avatar: '🟣' },
    ];

    const ctx = window.wechatContext;
    const st = window.SillyTavern?.getContext?.();
    const currentIdGuess = String(st?.getCurrentChatId?.() || 'current');
    const useCtx = ctx && ctx.ready && Array.isArray(ctx.chats) && ctx.chats.length > 0;
    const chats = useCtx ? ctx.chats : demoChats;

    content.innerHTML = `
      <div class="chat-list">
        ${chats
          .map(
            (c) => `
          <div class="chat-item" data-id="${c.id}" data-name="${c.name}" style="display:flex;align-items:center;padding:12px 14px;border-bottom:1px solid #eee;cursor:pointer;">
            <div class="avatar" style="width:44px;height:44px;border-radius:8px;background:#f5f5f5;display:flex;align-items:center;justify-content:center;font-size:20px;margin-right:12px;">
              ${c.avatar || '🟢'}
            </div>
            <div style="flex:1;min-width:0;">
              <div style="display:flex;justify-content:space-between;align-items:center;">
                <div style="font-size:16px;color:#111;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:70%;">${c.name}</div>
                <div style="font-size:12px;color:#999;">${c.time || ''}</div>
              </div>
              <div style="display:flex;justify-content:space-between;align-items:center;margin-top:4px;">
                <div style="font-size:13px;color:#666;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:80%;">${c.last || ''}</div>
                ${c.unread ? `<span style="background:#f54d4d;color:#fff;border-radius:10px;padding:0 6px;font-size:12px;line-height:18px;min-width:18px;text-align:center;">${c.unread}</span>` : ''}
              </div>
            </div>
          </div>
        `
          )
          .join('')}
      </div>
    `;

    // 绑定点击进入聊天详情（角色占位会话尝试切换到对应角色）
    content.querySelectorAll('.chat-item').forEach((el) => {
      el.addEventListener('click', async () => {
        const id = el.getAttribute('data-id');
        const name = el.getAttribute('data-name') || '聊天';

        // 如果是角色占位：尝试切换到对应角色并刷新
        if (id && id.startsWith('char:') && window.WeChatSwitch && typeof window.WeChatSwitch.trySwitchToCharacter === 'function') {
          const cid = id.split(':')[1];
          const switched = await window.WeChatSwitch.trySwitchToCharacter(cid);
          if (switched && window.refreshWeChatContext) {
            await window.refreshWeChatContext();
          }
        }

        let msgs = [];
        if (useCtx && ctx.messagesByChatId) {
          msgs = ctx.messagesByChatId[id] || [];
        }

        this._renderChatDetailDynamic({ id, name }, msgs);
      });
    });

    this.currentView = 'list';
    this.currentChatId = null;
    this._currentChatName = '';
  };

  // 动态渲染：聊天详情（支持传入消息，或自动从 wechatContext 获取）
  P._renderChatDetailDynamic = function (chat, providedMessages) {
    this._ensureState();
    const content = document.getElementById('wechat-content');
    const chatId = chat?.id || 'current';
    const chatName = chat?.name || '聊天';

    let msgs = Array.isArray(providedMessages) ? providedMessages : [];
    if (!msgs.length) {
      const ctx = window.wechatContext;
    const st = window.SillyTavern?.getContext?.();
    const currentIdGuess = String(st?.getCurrentChatId?.() || 'current');
      if (ctx && ctx.ready && ctx.messagesByChatId && ctx.messagesByChatId[chatId]) {
        msgs = ctx.messagesByChatId[chatId];
      }
      // 兜底演示
      if (!msgs.length) {
        msgs = [
          { from: 'other', text: '你好～' },
          { from: 'me', text: '你好，有什么事吗？' },
        ];
      }
    }

    this.setTitle(chatName);

    content.innerHTML = `
      <div class="chat-detail" style="display:flex;flex-direction:column;height:100%;">
        <div class="messages" style="flex:1;overflow:auto;background:#f7f7f7;padding:10px 10px 60px;">
          ${msgs
            .map(
              (m) => `
            <div style="display:flex;${m.from === 'me' ? 'justify-content:flex-end;' : 'justify-content:flex-start;'}margin:8px 0;">
              <div style="max-width:70%;padding:8px 10px;border-radius:8px;background:${m.from === 'me' ? '#95ec69' : '#fff'};box-shadow:0 1px 2px rgba(0,0,0,0.06);font-size:14px;line-height:20px;color:#111;">
                ${String(m.text || '').replace(/</g, '&lt;').replace(/>/g, '&gt;')}
              </div>
            </div>
          `
            )
            .join('')}
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

// 根据设置推导“目标ID”（支持 extensionSettings.wechat_simulator.idSource/customIdPath）
function deriveTargetId(raw) {
  try {
    const st = window.SillyTavern?.getContext?.();
    const setns = st?.extensionSettings?.wechat_simulator || {};
    const source = String(setns.idSource ?? 'characterId');

    const resolveCustomPath = (ctx, path) => {
      try {
        if (!path) return '';
        // 提供 currentChatId 方便表达式直接取用
        const currentChatId = ctx?.getCurrentChatId?.() ?? ctx?.chatId;
        // 允许从 ctx 上用点/下标访问：如 characters[characterId].name 或 currentChatId
        // 注意：仅在本地页面内执行，用于 UI 前缀，不会发送到服务端执行代码
        const fn = new Function('ctx', 'currentChatId', `
          try { with(ctx) { return (${path}); } } catch(e){ return ''; }
        `);
        return fn(ctx, currentChatId);
      } catch (_) { return ''; }
    };

    switch (source) {
      case 'characterId': {
        if (st?.characterId !== undefined && st?.characterId !== null) return String(st.characterId);
        break;
      }
      case 'chatId': {
        const cid = st?.getCurrentChatId?.() ?? st?.chatId;
        if (cid !== undefined && cid !== null) return String(cid);
        break;
      }
      case 'characterName': {
        const name = st?.characters?.[st?.characterId]?.name;
        if (name) return String(name);
        break;
      }
      case 'customPath': {
        const p = String(setns.customIdPath ?? '').trim();
        const val = resolveCustomPath(st || {}, p);
        if (val !== undefined && val !== null && String(val).length) return String(val);
        break;
      }
    }
  } catch (_) { /* ignore */ void 0; }
  // 回退：char:<cid> -> cid；否则 raw；最后 'current'
  try {
    if (raw && typeof raw === 'string' && raw.startsWith('char:')) return raw.split(':')[1];
  } catch (_) { /* ignore */ void 0; }
  return String(raw || 'current');
}
    const pushMyMsg = (text, targetId) => {
  const wrap = document.createElement('div');
  wrap.style.cssText = 'display:flex;justify-content:flex-end;margin:8px 0;';
  const safe = String(text).replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const idLine = (targetId !== undefined && targetId !== null)
    ? `<div style="color:#999;font-size:12px;margin:0 4px 2px 0;text-align:right;">id:${targetId}</div>`
    : '';
  wrap.innerHTML = `<div style="max-width:70%;">${idLine}<div style="padding:8px 10px;border-radius:8px;background:#95ec69;box-shadow:0 1px 2px rgba(0,0,0,0.06);font-size:14px;line-height:20px;color:#111;">${safe}</div></div>`;
  messages.appendChild(wrap);
  messages.scrollTop = messages.scrollHeight;
};

    // 自动侦测 ST 输入区与发送按钮并尝试发送；失败则回退本地回显
    function trySendToSillyTavern(text, rawChatId) {
      try {
        const st = window.SillyTavern?.getContext?.();
        const autoSend = st?.extensionSettings?.wechat_simulator?.autoSendToST;
        const allowAuto = (autoSend === undefined) ? true : !!autoSend;
        if (!allowAuto) return false;

        const targetId = deriveTargetId(rawChatId);
        const outbound = `发送给id:${targetId}\n\n${text}`;

        // 常见输入框/按钮选择器集合（优先级从高到低）
        const inputSelectors = [
          '#send_textarea', 'textarea#send_textarea',
          'textarea[name="send_textarea"]',
          '[data-testid="send-textarea"]',
          'textarea#sendText', 'textarea[name="sendText"]',
          '.send-textarea textarea', '.send-textarea'
        ];
        const buttonSelectors = [
          '#send_but', 'button#send_but',
          '[data-testid="send-button"]',
          'button[aria-label="Send"]',
          '.send_button', '.send-btn', 'button.send'
        ];

        const inputEl = inputSelectors.map(sel => document.querySelector(sel)).find(Boolean);
        const buttonEl = buttonSelectors.map(sel => document.querySelector(sel)).find(Boolean);

        if (!inputEl) {
          // 兜底：尝试找到页面里唯一可见的大 textarea
          const all = Array.from(document.querySelectorAll('textarea'));
          const guess = all.find(t => t.offsetParent !== null && t.clientHeight >= 24);
          if (guess) {
            guess.focus();
            guess.value = outbound;
            guess.dispatchEvent(new Event('input', { bubbles: true }));
            // 回车尝试提交
            guess.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
            return true;
          }
          return false;
        }

        // 写入文本并触发 input
        inputEl.focus();
        inputEl.value = outbound;
        inputEl.dispatchEvent(new Event('input', { bubbles: true }));

        // 优先点击按钮；若无按钮则模拟回车
        if (buttonEl) {
          buttonEl.click();
        } else {
          inputEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        }
        return true;
      } catch (e) {
        console.warn('[WeChat Simulator] trySendToSillyTavern 失败:', e);
        return false;
      }
    }

    send.addEventListener('click', () => {
      const val = (input.value || '').trim();
      if (!val) return;

      const targetId = deriveTargetId(chatId);
      // 本地立即回显（带目标 id）
      pushMyMsg(val, targetId);

      // 发送到 SillyTavern（带“发送给id:xxx”前缀与空行）
      trySendToSillyTavern(val, chatId);

      input.value = '';
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        send.click();
      }
    });

    this.currentView = 'detail';
    this.currentChatId = chatId;
    this._currentChatName = chatName;
  };

  // 刷新“微信”页（由 wechat-context-updated 驱动）
  P._onWechatContextUpdated = function () {
    try {
      this._ensureState();
      if (this.currentTab !== 'chat') return;
      if (this.currentView === 'list') {
        this._renderChatListDynamic();
      } else if (this.currentView === 'detail' && this.currentChatId) {
        const ctx = window.wechatContext;
    const st = window.SillyTavern?.getContext?.();
    const currentIdGuess = String(st?.getCurrentChatId?.() || 'current');
        const msgs =
          ctx && ctx.ready && ctx.messagesByChatId ? ctx.messagesByChatId[this.currentChatId] || [] : [];
        this._renderChatDetailDynamic({ id: this.currentChatId, name: this._currentChatName || '聊天' }, msgs);
      }
    } catch (_) {
      // 忽略刷新异常
    }
  };

  // 覆写 loadTabContent：记录 currentTab 并调用动态渲染
  const _oldLoad = P.loadTabContent;
  P.loadTabContent = function (tab) {
    this._ensureState();
    this.currentTab = tab;
    switch (tab) {
      case 'chat':
        this.setTitle('微信');
        this._renderChatListDynamic();
        break;
      case 'contacts':
        this.setTitle('通讯录');
        if (typeof this.renderContacts === 'function') {
          this.renderContacts();
        }
        break;
      case 'discover':
        this.setTitle('发现');
        if (typeof this.renderDiscover === 'function') {
          this.renderDiscover();
        }
        break;
      case 'me':
        this.setTitle('我');
        if (typeof this.renderMe === 'function') {
          this.renderMe();
        }
        break;
      default:
        if (typeof _oldLoad === 'function') _oldLoad.call(this, tab);
        break;
    }
  };

  // 事件绑定（只绑定一次）
  if (!window._wechatContextPatched) {
    document.addEventListener('wechat-context-updated', () => {
      if (window.wechatPhone && typeof window.wechatPhone._onWechatContextUpdated === 'function') {
        window.wechatPhone._onWechatContextUpdated();
      }
    });
    window._wechatContextPatched = true;
  }

  // 若 context-sync 已存在则启动；否则等它异步加载后再启动也可
  if (typeof window.initContextSync === 'function') {
    try {
      window.initContextSync();
    } catch (e) { console.warn('[WeChat Simulator] initContextSync failed:', e); }
  }
})();

/* === WeChat Extension: header back button + clock patch ===
   - 为聊天详情页提供头部返回按钮（返回到会话列表）
   - 状态栏时间每分钟自动刷新
   - 以原型增强的方式添加，无需侵入原类定义
*/
(function () {
  if (typeof WeChatPhone === 'undefined' || !WeChatPhone.prototype) return;
  const P = WeChatPhone.prototype;

  // 开启状态栏时间刷新（每分钟）
  P.startClock = function startClock() {
    const getTimeEl = () => document.querySelector('.wechat-status-bar .time');
    const update = () => {
      const el = getTimeEl();
      if (!el) return;
      const now = new Date();
      el.textContent = now.toLocaleTimeString('zh-CN', { hour12: false, hour: '2-digit', minute: '2-digit' });
    };
    if (this._clockTimer) clearInterval(this._clockTimer);
    update(); // 立即执行一次
    this._clockTimer = setInterval(update, 60 * 1000);
  };

  // 根据当前视图更新头部导航（显示/隐藏返回）
  P.updateHeaderNav = function updateHeaderNav() {
    const header = document.querySelector('.wechat-header');
    if (!header) return;

    // 确保存在 back 元素（插在最前）
    let backEl = header.querySelector('.back');
    if (!backEl) {
      backEl = document.createElement('span');
      backEl.className = 'back';
      backEl.title = '返回';
      backEl.style.cursor = 'pointer';
      backEl.textContent = '‹';
      backEl.style.fontSize = '20px';
      backEl.style.color = '#07C160';
      backEl.style.marginRight = '8px';
      header.insertBefore(backEl, header.firstChild);

      backEl.addEventListener('click', () => {
        // 仅在聊天详情内返回列表
        if (this.currentTab === 'chat' && this.currentView === 'detail') {
          this.loadTabContent('chat'); // 切换回“微信”页（列表）
        }
      });
    }

    // 显示条件：仅在“聊天详情”视图
    const showBack = this.currentTab === 'chat' && this.currentView === 'detail';
    backEl.style.display = showBack ? 'inline-block' : 'none';
  };

  // 在动态渲染函数执行后自动更新头部返回状态
  if (typeof P._renderChatListDynamic === 'function') {
    const _oldList = P._renderChatListDynamic;
    P._renderChatListDynamic = function () {
      const ret = _oldList.apply(this, arguments);
      if (typeof this.updateHeaderNav === 'function') this.updateHeaderNav();
      return ret;
    };
  }
  if (typeof P._renderChatDetailDynamic === 'function') {
    const _oldDetail = P._renderChatDetailDynamic;
    P._renderChatDetailDynamic = function () {
      const ret = _oldDetail.apply(this, arguments);
      if (typeof this.updateHeaderNav === 'function') this.updateHeaderNav();
      return ret;
    };
  }

  // DOM 加载后尝试启动时钟
  document.addEventListener('DOMContentLoaded', () => {
    if (window.wechatPhone && typeof window.wechatPhone.startClock === 'function') {
      try {
        window.wechatPhone.startClock();
      } catch (e) {
        console.warn('[WeChat Simulator] startClock failed:', e);
      }
    }
  });
})();

/* === WeChat Extension: dynamic override (safe after class ready) ===
   - 解决前置补丁在类定义前执行导致未生效的问题
   - 等待 WeChatPhone 定义后，覆盖 renderChatList/renderChatDetail/loadTabContent 为“多会话聚合 + 动态绑定”版本
*/
(function waitAndOverride() {
  function override() {
    if (typeof window.WeChatPhone === 'undefined' || !window.WeChatPhone.prototype) return false;
    const P = window.WeChatPhone.prototype;

    // 安全初始化内部状态
    if (!P._ensureState) {
      P._ensureState = function () {
        if (!this.currentTab) this.currentTab = 'chat';
        if (!this.currentView) this.currentView = 'list';
        if (!this.currentChatId) this.currentChatId = null;
        if (!this._currentChatName) this._currentChatName = '';
      };
    }

    // 覆盖：聊天列表（优先使用 wechatContext 的聚合）
    P.renderChatList = function renderChatList() {
      this._ensureState();
      const content = document.getElementById('wechat-content');

      const demoChats = [
        { id: 'a1', name: '小明', last: '明天一起吃饭？', time: '下午 3:08', unread: 2, avatar: '🟢' },
        { id: 'b2', name: '学习交流群', last: '今晚八点开会', time: '下午 2:12', unread: 0, avatar: '🟡' },
        { id: 'c3', name: '小红', last: '收到~', time: '昨天', unread: 1, avatar: '🟣' },
      ];

      const ctx = window.wechatContext;
      const useCtx = ctx && ctx.ready && Array.isArray(ctx.chats) && ctx.chats.length > 0;
      const chats = useCtx ? ctx.chats : demoChats;

      content.innerHTML = `
        <div class="chat-list">
          ${chats.map(c => `
            <div class="chat-item" data-id="${c.id}" data-name="${c.name}"
                 style="display:flex;align-items:center;padding:12px 14px;border-bottom:1px solid #eee;cursor:pointer;">
              <div class="avatar" style="width:44px;height:44px;border-radius:8px;background:#f5f5f5;display:flex;align-items:center;justify-content:center;font-size:20px;margin-right:12px;">
                ${c.avatar || '🟢'}
              </div>
              <div style="flex:1;min-width:0;">
                <div style="display:flex;justify-content:space-between;align-items:center;">
                  <div style="font-size:16px;color:#111;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:70%;">${c.name}</div>
                  <div style="font-size:12px;color:#999;">${c.time || ''}</div>
                </div>
                <div style="display:flex;justify-content:space-between;align-items:center;margin-top:4px;">
                  <div style="font-size:13px;color:#666;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:80%;">${c.last || ''}</div>
                  ${c.unread ? `<span style="background:#f54d4d;color:#fff;border-radius:10px;padding:0 6px;font-size:12px;line-height:18px;min-width:18px;text-align:center;">${c.unread}</span>` : ''}
                </div>
              </div>
            </div>
          `).join('')}
        </div>
      `;

      // 点击进入详情
      content.querySelectorAll('.chat-item').forEach(el => {
        el.addEventListener('click', async () => {
          const rawId = el.getAttribute('data-id');
          const name = el.getAttribute('data-name') || '聊天';
          let switchedToChar = false;

          // 若为“角色占位会话”，先尝试切换到对应角色并刷新上下文
          if (rawId && rawId.startsWith('char:') && window.WeChatSwitch && typeof window.WeChatSwitch.trySwitchToCharacter === 'function') {
            const cid = rawId.split(':')[1];
            try {
              const switched = await window.WeChatSwitch.trySwitchToCharacter(cid);
              switchedToChar = !!switched;
              if (switched && typeof window.refreshWeChatContext === 'function') {
                await window.refreshWeChatContext();
              } else {
                // 等待 ST 内部刷新
                await new Promise(r => setTimeout(r, 400));
              }
            } catch (e) {
              console.warn('[WeChat Simulator] 切换角色失败:', e);
            }
          }

          // 计算有效的 chatId：如果是占位会话，则以 ST 当前会话ID 为准，避免 messagesByChatId 键不一致
          const st = window.SillyTavern?.getContext?.();
          let effectiveId = rawId;
          try {
            const currentId = String(st?.getCurrentChatId?.() || rawId);
            if (switchedToChar || (rawId && rawId.startsWith('char:'))) {
              effectiveId = currentId;
            }
          } catch (_) { /* 忽略 */ }

          // 优先直接从 ST API 拉取当前会话历史，失败再回退到 wechatContext 缓存
          async function fetchStMessages() {
            try {
              const arr = await st?.getCurrentChatMessages?.();
              if (!Array.isArray(arr) || arr.length === 0) return [];
              // 轻量标准化
              return arr.map(m => {
                const isUser = (m?.is_user === true) || (m?.isUser === true) || (m?.role === 'user') || (m?.name === 'You') || (m?.user === true) || (m?.author === 'user');
                const text = String(m?.mes ?? m?.text ?? m?.content ?? m?.message ?? '').trim();
                return { from: isUser ? 'me' : 'other', text };
              }).filter(x => x.text !== '');
            } catch (e) {
              return [];
            }
          }

          let msgs = await fetchStMessages();

          if (!msgs.length) {
            // 读取最新上下文的消息映射
            try {
              const ctx2 = window.wechatContext;
              if (ctx2 && ctx2.ready && ctx2.messagesByChatId) {
                msgs = ctx2.messagesByChatId[effectiveId] || ctx2.messagesByChatId[rawId] || [];
              }
            } catch (_) { /* 忽略 */ }
          }

          this.renderChatDetail({ id: effectiveId, name }, msgs);
        });
      });

      this.currentView = 'list';
      this.currentChatId = null;
      this._currentChatName = '';
      // 更新头部返回显隐（如果之前补丁存在）
      if (typeof this.updateHeaderNav === 'function') this.updateHeaderNav();
    };

    // 覆盖：聊天详情（支持传入消息或自动从 ctx 获取）
    P.renderChatDetail = function renderChatDetail(chat, providedMessages) {
      this._ensureState();
      const content = document.getElementById('wechat-content');
      const chatId = (chat && chat.id) || 'current';
      const chatName = (chat && chat.name) || '聊天';

      let msgs = Array.isArray(providedMessages) ? providedMessages : [];
      const ctx = window.wechatContext;
      if (!msgs.length && ctx && ctx.ready && ctx.messagesByChatId) {
        msgs = ctx.messagesByChatId[chatId] || [];
      }
      if (!msgs.length) {
        msgs = [
          { from: 'other', text: '你好～' },
          { from: 'me', text: '你好，有什么事吗？' },
        ];
      }

      this.setTitle(chatName);

      content.innerHTML = `
        <div class="chat-detail" style="display:flex;flex-direction:column;height:100%;">
          <div class="messages" style="flex:1;overflow:auto;background:#f7f7f7;padding:10px 10px 60px;">
            ${msgs.map(m => `
              <div style="display:flex;${m.from === 'me' ? 'justify-content:flex-end;' : 'justify-content:flex-start;'}margin:8px 0;">
                <div style="max-width:70%;padding:8px 10px;border-radius:8px;background:${m.from === 'me' ? '#95ec69' : '#fff'};box-shadow:0 1px 2px rgba(0,0,0,0.06);font-size:14px;line-height:20px;color:#111;">
                  ${String(m.text || '').replace(/</g, '&lt;').replace(/>/g, '&gt;')}
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

      const pushMyMsg = (text, targetId) => {
  const wrap = document.createElement('div');
  wrap.style.cssText = 'display:flex;justify-content:flex-end;margin:8px 0;';
  const safe = String(text).replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const idLine = (targetId !== undefined && targetId !== null)
    ? `<div style="color:#999;font-size:12px;margin:0 4px 2px 0;text-align:right;">id:${targetId}</div>`
    : '';
  wrap.innerHTML = `<div style="max-width:70%;">${idLine}<div style="padding:8px 10px;border-radius:8px;background:#95ec69;box-shadow:0 1px 2px rgba(0,0,0,0.06);font-size:14px;line-height:20px;color:#111;">${safe}</div></div>`;
  messages.appendChild(wrap);
  messages.scrollTop = messages.scrollHeight;
};

      send.addEventListener('click', () => {
        const val = (input.value || '').trim();
        if (!val) return;
        const targetId = deriveTargetId(chatId);
        pushMyMsg(val, targetId);
        input.value = '';

        // 发送到 SillyTavern（带“发送给id:xxx”前缀与空行）
        try {
          const st = window.SillyTavern?.getContext?.();
          const autoSend = st?.extensionSettings?.wechat_simulator?.autoSendToST;
          const allowAuto = (autoSend === undefined) ? true : !!autoSend;
          if (allowAuto) {
            const outbound = `发送给id:${targetId}\n\n${val}`;
            const inputSelectors = [
              '#send_textarea', 'textarea#send_textarea',
              'textarea[name="send_textarea"]',
              '[data-testid="send-textarea"]',
              'textarea#sendText', 'textarea[name="sendText"]',
              '.send-textarea textarea', '.send-textarea'
            ];
            const buttonSelectors = [
              '#send_but', 'button#send_but',
              '[data-testid="send-button"]',
              'button[aria-label="Send"]',
              '.send_button', '.send-btn', 'button.send'
            ];
            const inputEl = inputSelectors.map(sel => document.querySelector(sel)).find(Boolean);
            const buttonEl = buttonSelectors.map(sel => document.querySelector(sel)).find(Boolean);
            if (inputEl) {
              inputEl.focus();
              inputEl.value = outbound;
              inputEl.dispatchEvent(new Event('input', { bubbles: true }));
              if (buttonEl) { buttonEl.click(); }
              else { inputEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); }
            } else {
              const all = Array.from(document.querySelectorAll('textarea'));
              const guess = all.find(t => t.offsetParent !== null && t.clientHeight >= 24);
              if (guess) {
                guess.focus();
                guess.value = outbound;
                guess.dispatchEvent(new Event('input', { bubbles: true }));
                guess.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
              }
            }
          }
        } catch (e) {
          console.warn('[WeChat Simulator] override send bridge failed:', e);
        }
      });
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') send.click();
      });

      this.currentView = 'detail';
      this.currentChatId = chatId;
      this._currentChatName = chatName;
      if (typeof this.updateHeaderNav === 'function') this.updateHeaderNav();
    };

    // 覆盖：tab 切换，确保聊天页使用动态渲染
    const oldLoad = P.loadTabContent;
    P.loadTabContent = function (tab) {
      this._ensureState();
      this.currentTab = tab;
      switch (tab) {
        case 'chat':
          this.setTitle('微信');
          this.renderChatList();
          break;
        case 'contacts':
          this.setTitle('通讯录');
          if (typeof this.renderContacts === 'function') this.renderContacts();
          break;
        case 'discover':
          this.setTitle('发现');
          if (typeof this.renderDiscover === 'function') this.renderDiscover();
          break;
        case 'me':
          this.setTitle('我');
          if (typeof this.renderMe === 'function') this.renderMe();
          break;
        default:
          if (typeof oldLoad === 'function') oldLoad.call(this, tab);
          break;
      }
    };

    // 绑定 wechat-context-updated：自动刷新当前页面
    if (!window._wechatDynamicBound) {
      document.addEventListener('wechat-context-updated', () => {
        if (!window.wechatPhone) return;
        try {
          window.wechatPhone._ensureState?.();
          if (window.wechatPhone.currentTab === 'chat') {
            if (window.wechatPhone.currentView === 'list') {
              window.wechatPhone.renderChatList();
            } else if (window.wechatPhone.currentView === 'detail' && window.wechatPhone.currentChatId) {
              const ctx = window.wechatContext;
              const msgs = ctx?.messagesByChatId?.[window.wechatPhone.currentChatId] || [];
              window.wechatPhone.renderChatDetail({ id: window.wechatPhone.currentChatId, name: window.wechatPhone._currentChatName || '聊天' }, msgs);
            }
          }
        } catch (e) {
          console.warn('[WeChat Simulator] 自动刷新失败:', e);
        }
      });
      window._wechatDynamicBound = true;
    }

    // 若 context-sync 已可用，确保启动
    if (typeof window.initContextSync === 'function') {
      try { window.initContextSync(); } catch (e) { console.warn('[WeChat Simulator] initContextSync failed:', e); }
    }

    return true;
  }

  if (!override()) {
    const t = setInterval(() => { if (override()) clearInterval(t); }, 100);
  }
})();

/* === WeChat Extension: ST 会话切换助手（多会话按需切换） === */
(function () {
  // 避免重复定义
  if (window.WeChatSwitch && typeof window.WeChatSwitch.trySwitchToCharacter === 'function') return;

  window.WeChatSwitch = {
    /**
     * 尝试切换到指定角色（cid 为 SillyTavern 内部角色 id/索引）
     * 返回：true=已尝试切换（可能需要等待 ST 自身刷新），false=未能切换
     */
    async trySwitchToCharacter(cid) {
      try {
        const st = window.SillyTavern?.getContext?.();
        if (!st) return false;

        // 1) 优先尝试常见 API
        const apiCandidates = [st.selectCharacter, st.setCharacterId, st.setCharacter, st.switchCharacter];
        for (const fn of apiCandidates) {
          if (typeof fn === 'function') {
            try {
              const r = fn.call(st, cid);
              if (r && typeof r.then === 'function') await r;
              await new Promise(r2 => setTimeout(r2, 200));
              return true;
            } catch (_) { /* 继续尝试其它 API */ }
          }
        }

        // 2) DOM 方式：尝试点击角色列表项
        const selectors = [
          `[data-chid="${cid}"]`,
          `[data-character-id="${cid}"]`,
          `.character[data-id="${cid}"]`,
        ];
        for (const sel of selectors) {
          const node = document.querySelector(sel);
          if (node) {
            node.click();
            await new Promise(r2 => setTimeout(r2, 300));
            return true;
          }
        }

        // 3) 最后回退：尝试写入字段（不保证 ST 会响应）
        try {
          st.characterId = cid;
          await new Promise(r2 => setTimeout(r2, 200));
          return true;
        } catch (e) { /* ignore */ }

        return false;
      } catch (e) {
        console.warn('[WeChat Simulator] trySwitchToCharacter error:', e);
        return false;
      }
    }
  };
})();
