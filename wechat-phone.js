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
    // 加上时间戳强制刷新，避免浏览器缓存旧样式（底栏图标仍显示截图的问题）
    const ts = Date.now();
    cssLink.href = `${window.wechatExtensionPath}/styles/wechat-phone.css?v=${ts}`;
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

    // 强制覆盖图标为 Emoji（避免旧样式或缓存造成的位图图标残留）
    (function injectEmojiIconStyle() {
      const styleFix = document.createElement('style');
      styleFix.setAttribute('data-wechat-style-fix', 'emoji-icons');
      styleFix.textContent = `
            .wechat-nav-item .icon { background-image: none !important; }
            .wechat-nav-item .icon::after {
              display: block;
              text-align: center;
              line-height: 24px;
              font-size: 18px;
            }
            .wechat-nav-item .icon.chat::after { content: '💬'; }
            .wechat-nav-item .icon.contacts::after { content: '👥'; }
            .wechat-nav-item .icon.discover::after { content: '🧭'; }
            .wechat-nav-item .icon.me::after { content: '👤'; }

            .wechat-header .search { background-image: none !important; }
            .wechat-header .search::after {
              content: '🔍';
              display: block;
              text-align: center;
              line-height: 24px;
              font-size: 16px;
            }
            .wechat-header .add { background-image: none !important; }
            .wechat-header .add::after {
              content: '＋';
              display: block;
              text-align: center;
              line-height: 24px;
              font-size: 18px;
            }`;
      // 若之前已注入，先移除再注入，确保最新生效
      try {
        const old = document.querySelector('style[data-wechat-style-fix="emoji-icons"]');
        if (old) old.remove();
      } catch (e) {
        /* ignore */
      }
      document.head.appendChild(styleFix);
    })();

    // 清理历史 frame 位置存档，防止上次拖拽残留导致越界（仅悬浮图标可拖拽，手机本体不拖拽）
    try {
      localStorage.removeItem('wechat-frame-pos');
    } catch (e) {
      /* ignore */
    }

    // 启用拖拽（以标题栏为手柄），并自动校正越界位置，防止“半个界面超出视口且无法拖拽”
    // 拖拽实例延后由 _setupOrUpdateDragHelper 按缩放状态决定是否启用
    this._drag = null;

    // 标题栏双击快速回中
    try {
      const hdr = frame.querySelector('.wechat-header');
      if (hdr) {
        hdr.addEventListener('dblclick', () => {
          if (typeof this.recenter === 'function') this.recenter();
        });
      }
    } catch (e) {
      /* ignore */
    }

    const resetIfOffscreen = () => {
      try {
        const rect = frame.getBoundingClientRect();
        const vw = Math.max(0, window.innerWidth || document.documentElement.clientWidth || 0);
        const vh = Math.max(0, window.innerHeight || document.documentElement.clientHeight || 0);
        // 显著越界（任一边完全溢出或中心脱离视口）
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        const out =
          rect.right < 10 ||
          rect.bottom < 10 ||
          rect.left > vw - 10 ||
          rect.top > vh - 10 ||
          centerX < 0 ||
          centerX > vw ||
          centerY < 0 ||
          centerY > vh;

        if (out) {
          if (typeof this.recenter === 'function') {
            this.recenter();
          } else {
            frame.style.left = '50%';
            frame.style.top = '50%';
            frame.style.transformOrigin = 'center center';
            fitToViewport();
          }
        }
      } catch (e) {
        /* ignore */
      }
    };
    // 初次校正 + 监听窗口变化
    setTimeout(resetIfOffscreen, 0);
    window.addEventListener('resize', resetIfOffscreen);

    // ESC 键快速关闭
    document.addEventListener('keydown', ev => {
      if (ev.key === 'Escape' && this.isVisible) {
        this.toggle();
      }
    });

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
      // 记录当前缩放，供拖拽启停策略使用
      this._currentScale = scale;
      frame.style.transform = `translate(-50%, -50%) scale(${scale})`;
    };

    fitToViewport();
    // 暴露给外部调试
    this._fitToViewport = fitToViewport;

    // 依据缩放状态启用/关闭拖拽，避免缩放(<1)时拖拽导致越界
    this._setupOrUpdateDragHelper = () => {
      try {
        if (!window.DragHelper) return;
        if (this._currentScale && this._currentScale < 0.999) {
          if (this._drag && typeof this._drag.destroy === 'function') {
            this._drag.destroy();
          }
          this._drag = null;
          return;
        }
        if (!this._drag) {
          this._drag = new window.DragHelper(frame, {
            boundary: document.documentElement,
            dragHandle: '.wechat-header',
            savePosition: false,
            clickThreshold: 3,
            touchTimeout: 150,
          });
        }
      } catch (e) {
        /* ignore */
      }
    };

    // 提供公开方法：快速回中 + 重新适配
    this.recenter = () => {
      try {
        localStorage.removeItem('wechat-frame-pos');
      } catch (e) {
        /* ignore */
      }
      frame.style.left = '50%';
      frame.style.top = '50%';
      frame.style.transformOrigin = 'center center';
      fitToViewport();
      if (this._setupOrUpdateDragHelper) {
        this._setupOrUpdateDragHelper();
      }
    };

    // 初始化拖拽状态，并在窗口变化时更新且防越界
    if (this._setupOrUpdateDragHelper) {
      this._setupOrUpdateDragHelper();
    }
    window.addEventListener('resize', () => {
      fitToViewport();
      if (this._setupOrUpdateDragHelper) {
        this._setupOrUpdateDragHelper();
      }
      resetIfOffscreen();
    });
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
      addBtn.addEventListener('click', e => {
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
      input?.addEventListener('keydown', ev => {
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
                width: 200px;
                background: #fff;
                border: 1px solid #e5e5e5;
                border-radius: 8px;
                box-shadow: 0 8px 24px rgba(0,0,0,0.12);
                overflow: hidden;
                z-index: 10001;
            `;
      menu.innerHTML = `
                <div class="item" data-act="add" style="padding:10px 12px;cursor:pointer;border-bottom:1px solid #f2f2f2;">添加朋友（输入ID）</div>
                <div class="item" data-act="scan" style="padding:10px 12px;cursor:pointer;">粘贴标签文本添加</div>
            `;
      frame.appendChild(menu);

      const refreshUI = () => {
        try {
          if (window.wechatPhone) {
            window.wechatPhone._ensureState?.();
            if (window.wechatPhone.currentTab === 'chat') {
              window.wechatPhone.renderChatList();
            } else if (window.wechatPhone.currentTab === 'contacts') {
              window.wechatPhone.renderContacts();
            }
          }
        } catch (e) { /* ignore */ }
      };

      menu.addEventListener('click', e => {
        const t = e.target;
        if (!(t instanceof Element)) return;
        const act = t.getAttribute('data-act');
        switch (act) {
          case 'add': {
            const fidRaw = prompt('请输入好友ID（数字或字母数字，不含空格）：', '');
            const fid = (fidRaw || '').trim();
            if (!fid) break;
            const name = (prompt('可选：输入好友昵称（可留空）：', '') || '').trim();
            try {
              const ok = window.WeChatFriends?.add?.(String(fid), name);
              if (!ok) alert('添加失败，请确认当前已选中一个角色。');
              else refreshUI();
            } catch (e2) {
              alert('添加失败，请查看控制台。');
            }
            break;
          }
          case 'scan': {
            const text = prompt('请粘贴包含 [好友id|昵称|ID] 的文本：', '');
            if (text && text.trim()) {
              try {
                const added = window.wechatLocalStore?.captureFromText?.(text.trim()) || [];
                if (!added.length) alert('未识别到有效的好友标签。格式示例：[好友id|李雨婷|8823571]');
                refreshUI();
              } catch (e3) {
                alert('解析失败，请检查格式。');
              }
            }
            break;
          }
        }
        this.closeAddMenu();
      });
    }
    menu.style.display = menu.style.display === 'block' ? 'none' : 'block';

    // 点击外部关闭
    const handleOutside = ev => {
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
    // 仅使用当前角色环境的聚合结果，不注入任何默认/演示数据
    const computed = window.wechatLocalStore?.getComputedChatList?.() || [];
    const chats = computed;

    content.innerHTML = `
            <div class="chat-list">
                ${chats
                  .map(
                    c => `
                  <div class="chat-item" data-id="${c.id}" data-name="${c.name || '聊天'}" style="display:flex;align-items:center;padding:12px 14px;border-bottom:1px solid #eee;cursor:pointer;">
                    <div class="avatar" style="width:44px;height:44px;border-radius:8px;background:#f5f5f5;display:flex;align-items:center;justify-content:center;font-size:20px;margin-right:12px;">
                      ${c.avatar || '🟢'}
                    </div>
                    <div style="flex:1;min-width:0;">
                      <div style="display:flex;justify-content:space-between;align-items:center;">
                        <div style="font-size:16px;color:#111;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:70%;">${c.name || '聊天'}</div>
                        <div style="font-size:12px;color:#999;">${c.time || ''}</div>
                      </div>
                      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:4px;">
                        <div style="font-size:13px;color:#666;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:80%;">${c.last || ''}</div>
                        ${c.unread ? `<span style="background:#f54d4d;color:#fff;border-radius:10px;padding:0 6px;font-size:12px;line-height:18px;min-width:18px;text-align:center;">${c.unread}</span>` : ''}
                      </div>
                    </div>
                  </div>
                `,
                  )
                  .join('')}
            </div>
        `;

    // 绑定点击进入聊天详情（角色占位会话尝试切换到对应角色）
    content.querySelectorAll('.chat-item').forEach(el => {
      el.addEventListener('click', async () => {
        const id = el.getAttribute('data-id');
        const name = el.getAttribute('data-name') || '聊天';

        // 如果是角色占位：尝试切换到对应角色并刷新
        if (
          id &&
          id.startsWith('char:') &&
          window.WeChatSwitch &&
          typeof window.WeChatSwitch.trySwitchToCharacter === 'function'
        ) {
          const cid = id.split(':')[1];
          const switched = await window.WeChatSwitch.trySwitchToCharacter(cid);
          if (switched && window.refreshWeChatContext) {
            await window.refreshWeChatContext();
          }
        }

        this.renderChatDetail({ id, name });
      });
    });

    // 根据本地存储刷新列表摘要与时间
    try {
      window.wechatLocalStore?.updateList?.(content);
    } catch (e) {
      /* ignore */
    }
  }

  // 占位版：聊天详情（简单消息 + 输入框）
  renderChatDetail(chat) {
    const content = document.getElementById('wechat-content');
    this.setTitle(chat?.name || '聊天');

    const demoMsgs = [];

    // 合并本地存储消息（优先使用本地；否则回退 demo）
    const msgsToRender = (function () {
      try {
        const store = window.wechatLocalStore?.get?.();
        const st = window.SillyTavern?.getContext?.();

        // 计算可能的键集合：真实会话ID映射 + 角色占位键
        const keys = [];
        const effectiveId = (function () {
          try {
            if (chat?.id && String(chat.id).startsWith('char:')) {
              const cur = st?.getCurrentChatId?.();
              return String(cur || chat.id);
            }
          } catch (e) {
            /* ignore */
          }
          return String(chat?.id || 'current');
        })();
        keys.push(effectiveId);
        try {
          if (chat?.id && String(chat.id).startsWith('char:')) {
            keys.push(String(chat.id));
          }
        } catch (e) {
          /* ignore */
        }

        const merged = [];
        for (const k of keys) {
          const arr = store?.messagesByChatId?.[k] || [];
          if (Array.isArray(arr) && arr.length) merged.push(...arr);
        }

        return merged;
      } catch (e) {
        return [];
      }
    })();

    content.innerHTML = `
            <div class="chat-detail" style="display:flex;flex-direction:column;height:100%;">
                <div class="messages" style="flex:1;overflow:auto;background:#f7f7f7;padding:10px 10px 60px;">
                    ${msgsToRender
                      .map(
                        m => `
                        <div style="display:flex;${m.from === 'me' ? 'justify-content:flex-end;' : 'justify-content:flex-start;'}margin:8px 0;">
                          <div style="max-width:70%;padding:8px 10px;border-radius:8px;background:${m.from === 'me' ? '#95ec69' : '#fff'};box-shadow:0 1px 2px rgba(0,0,0,0.06);font-size:14px;line-height:20px;color:#111;">
                            ${m.text}
                          </div>
                        </div>
                    `,
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

    const pushMyMsg = (text, targetId) => {
      const wrap = document.createElement('div');
      wrap.style.cssText = 'display:flex;justify-content:flex-end;margin:8px 0;';
      const safe = String(text).replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const idLine =
        targetId !== undefined && targetId !== null
          ? `<div style="color:#999;font-size:12px;margin:0 4px 2px 0;text-align:right;">id:${targetId}</div>`
          : '';
      wrap.innerHTML = `<div style="max-width:70%;">${idLine}<div style="padding:8px 10px;border-radius:8px;background:#95ec69;box-shadow:0 1px 2px rgba(0,0,0,0.06);font-size:14px;line-height:20px;color:#111;">${safe}</div></div>`;
      messages.appendChild(wrap);
      messages.scrollTop = messages.scrollHeight;
    };

    send.addEventListener('click', () => {
      const val = (input.value || '').trim();
      if (!val) return;

      // 发送前尝试从文本中捕获并建友/更新
      try { window.wechatLocalStore?.captureFromText?.(val); } catch (e) { /* ignore */ }

      // 计算目标ID（遵循设置：characterId/chatId/characterName/customPath）
      let targetId = '';
      try {
        const st = window.SillyTavern?.getContext?.() || {};
        const setns = st.extensionSettings?.wechat_simulator || {};
        const source = String(setns.idSource ?? 'characterId');
        const currentChatId = st.getCurrentChatId?.() ?? st.chatId;

        const resolveCustomPath = (ctx, path) => {
          try {
            if (!path) return '';
            const fn = new Function(
              'ctx',
              'currentChatId',
              `
                          try { with(ctx) { return (${path}); } } catch(e){ return ''; }
                        `,
            );
            return fn(ctx, currentChatId);
          } catch (e) {
            return '';
          }
        };

        switch (source) {
          case 'characterId':
            if (st.characterId !== undefined && st.characterId !== null) targetId = String(st.characterId);
            break;
          case 'chatId':
            if (currentChatId !== undefined && currentChatId !== null) targetId = String(currentChatId);
            break;
          case 'characterName':
            targetId = st.characters?.[st.characterId]?.name ?? '';
            break;
          case 'customPath': {
            const p = String(setns.customIdPath ?? '').trim();
            targetId = resolveCustomPath(st, p) || '';
            break;
          }
        }
      } catch (e) {
        /* ignore */
      }

      // 兜底：char:<cid> 或 raw id 或 'current'
      if (!targetId) {
        try {
          if (chat?.id && String(chat.id).startsWith('char:')) {
            targetId = String(chat.id).split(':')[1];
          } else {
            targetId = String(chat?.id ?? 'current');
          }
        } catch (e) {
          targetId = 'current';
        }
      }

      // 本地回显带 id 行
      pushMyMsg(val, targetId);
      input.value = '';

      // 注入到 ST（前缀：发送给id:{id}\\n\\n正文）
      try {
        const outbound = `发送给id:${targetId}\n\n${val}`;
        const inputSelectors = [
          '#send_textarea',
          'textarea#send_textarea',
          'textarea[name="send_textarea"]',
          '[data-testid="send-textarea"]',
          'textarea#sendText',
          'textarea[name="sendText"]',
          '.send-textarea textarea',
          '.send-textarea',
        ];
        const buttonSelectors = [
          '#send_but',
          'button#send_but',
          '[data-testid="send-button"]',
          'button[aria-label="Send"]',
          '.send_button',
          '.send-btn',
          'button.send',
        ];
        const inputEl = inputSelectors.map(sel => document.querySelector(sel)).find(Boolean);
        const buttonEl = buttonSelectors.map(sel => document.querySelector(sel)).find(Boolean);
        if (inputEl) {
          inputEl.focus();
          inputEl.value = outbound;
          inputEl.dispatchEvent(new Event('input', { bubbles: true }));
          if (buttonEl) {
            buttonEl.click();
          } else {
            inputEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
          }
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
      } catch (e) {
        /* ignore */
      }
    });
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        send.click();
      }
    });
  }

  // 通讯录：仅显示当前角色环境下已添加的好友（无默认/演示数据）
  renderContacts() {
    const content = document.getElementById('wechat-content');
    try {
      const st = window.SillyTavern?.getContext?.();
      const cKey = (st && st.characterId !== undefined && st.characterId !== null) ? `char:${String(st.characterId)}` : '';
      const store = window.wechatLocalStore?.get?.();
      const friends = (store?.friendsByChar?.[cKey]) || {};
      const items = Object.entries(friends);

      if (!cKey) {
        content.innerHTML = `
          <div class="contacts" style="background:#fff;">
            <div style="padding:16px;color:#f00;">未检测到当前角色，请先选择角色。</div>
          </div>`;
        return;
      }

      if (!items.length) {
        content.innerHTML = `
          <div class="contacts" style="background:#fff;">
            <div style="padding:16px;color:#999;">暂无好友。请发送含有 [好友id|昵称|ID] 的文本，或点击右上角“＋ → 添加朋友”。</div>
          </div>`;
        return;
      }

      const rows = items.map(([fid, v]) => {
        const name = String(v?.name || `好友 ${fid}`);
        return `
          <div class="row" data-id="${cKey}::${fid}" data-name="${name}"
               style="display:flex;align-items:center;padding:12px 14px;border-bottom:1px solid #eee;cursor:pointer;">
            <div style="width:36px;height:36px;border-radius:6px;background:#eaeaea;display:flex;align-items:center;justify-content:center;margin-right:12px;">👤</div>
            <div style="font-size:15px;color:#111;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${name}</div>
            <div style="font-size:12px;color:#999;">${fid}</div>
          </div>`;
      }).join('');

      content.innerHTML = `
        <div class="contacts" style="background:#fff;">
          ${rows}
        </div>`;

      // 绑定点击打开该好友会话
      content.querySelectorAll('.row').forEach(el => {
        el.addEventListener('click', () => {
          const id = el.getAttribute('data-id');
          const name = el.getAttribute('data-name') || '聊天';
          this.renderChatDetail({ id, name });
        });
      });
    } catch (e) {
      content.innerHTML = `
        <div class="contacts" style="background:#fff;">
          <div style="padding:16px;color:#f00;">加载通讯录失败，请查看控制台。</div>
        </div>`;
    }
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
                          ${[1, 2, 3]
                            .map(
                              i => `
                             <div style="padding:12px 14px;border-bottom:1px solid #eee;">
                               <div style="display:flex;align-items:center;">
                                 <div style="width:36px;height:36px;border-radius:6px;background:#eaeaea;display:flex;align-items:center;justify-content:center;margin-right:10px;">👤</div>
                                 <div style="font-size:14px;color:#111;">好友 ${i}</div>
                               </div>
                               <div style="margin-top:8px;color:#222;line-height:20px;">今天的风真大，学习也要加油呀～</div>
                               <div style="margin-top:8px;color:#999;font-size:12px;">2分钟前</div>
                             </div>
                          `,
                            )
                            .join('')}
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
                          ${[1, 2, 3, 4]
                            .map(
                              i => `
                            <div style="background:#fff;border:1px solid #eee;border-radius:8px;overflow:hidden;">
                              <div style="background:#eaeaea;height:90px;display:flex;align-items:center;justify-content:center;">🧩</div>
                              <div style="padding:8px 10px;">
                                <div style="font-size:14px;color:#111;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">好物 ${i}</div>
                                <div style="margin-top:4px;color:#07C160;font-weight:600;">¥ ${(i * 9).toFixed(2)}</div>
                              </div>
                            </div>
                          `,
                            )
                            .join('')}
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
                { icon: '💰', text: '服务' },
                { icon: '⭐', text: '收藏' },
                { icon: '🖼️', text: '相册' },
                { icon: '😊', text: '表情' },
                { icon: '⚙️', text: '设置' },
              ]
                .map(
                  it => `
                <div style="display:flex;align-items:center;padding:12px 14px;background:#fff;border-bottom:1px solid #eee;cursor:pointer;">
                  <div style="width:28px;height:28px;border-radius:6px;background:#eaeaea;display:flex;align-items:center;justify-content:center;margin-right:12px;">${it.icon}</div>
                  <div style="flex:1;color:#111;">${it.text}</div>
                  <div style="color:#ccc;">›</div>
                </div>
              `,
                )
                .join('')}
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
    if (this.isVisible) {
      try {
        if (typeof this.recenter === 'function') this.recenter();
        else if (typeof this._fitToViewport === 'function') this._fitToViewport();
      } catch (e) {
        /* ignore */
      }
    }
    if (this.isVisible && typeof this.startClock === 'function') {
      try {
        this.startClock();
      } catch (e) {
        /* 忽略 */
      }
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

    const computed = window.wechatLocalStore?.getComputedChatList?.() || [];
    const chats = computed;

    content.innerHTML = `
      <div class="chat-list">
        ${chats
          .map(
            c => `
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
        `,
          )
          .join('')}
      </div>
    `;

    // 绑定点击进入聊天详情（角色占位会话尝试切换到对应角色）
    content.querySelectorAll('.chat-item').forEach(el => {
      el.addEventListener('click', async () => {
        const id = el.getAttribute('data-id');
        const name = el.getAttribute('data-name') || '聊天';

        // 如果是角色占位：尝试切换到对应角色并刷新
        if (
          id &&
          id.startsWith('char:') &&
          window.WeChatSwitch &&
          typeof window.WeChatSwitch.trySwitchToCharacter === 'function'
        ) {
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

    // 根据本地存储刷新列表摘要与时间
    try {
      window.wechatLocalStore?.updateList?.(content);
    } catch (e) {
      /* ignore */
    }

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
      // no fallback; keep empty
    }

    this.setTitle(chatName);

    // 捕获文本中的好友标签以自动建友/更新（当前角色环境）
    try {
      msgs.forEach(m => window.wechatLocalStore?.captureFromText?.(String(m?.text || '')));
    } catch (e) { /* ignore */ }

    // 合并本地消息（动态渲染版本：叠加本地到上下文消息上）
    try {
      const store = window.wechatLocalStore?.get?.();
      const st = window.SillyTavern?.getContext?.();
      const keys = [];

      const effectiveId = (function () {
        try {
          if (chatId && String(chatId).startsWith('char:')) {
            const cur = st?.getCurrentChatId?.();
            return String(cur || chatId);
          }
        } catch (e) {
          /* ignore */
        }
        return String(chatId || 'current');
      })();

      keys.push(effectiveId);
      try {
        if (chatId && String(chatId).startsWith('char:')) {
          keys.push(String(chatId));
        }
      } catch (e) {
        /* ignore */
      }

      const mergedLocal = [];
      for (const k of keys) {
        const arr = store?.messagesByChatId?.[k] || [];
        if (Array.isArray(arr) && arr.length) mergedLocal.push(...arr);
      }
      if (mergedLocal.length) {
        msgs = msgs.concat(mergedLocal);
      }
    } catch (e) {
      /* ignore */
    }

    content.innerHTML = `
      <div class="chat-detail" style="display:flex;flex-direction:column;height:100%;">
        <div class="messages" style="flex:1;overflow:auto;background:#f7f7f7;padding:10px 10px 60px;">
          ${msgs
            .map(
              m => `
            <div style="display:flex;${m.from === 'me' ? 'justify-content:flex-end;' : 'justify-content:flex-start;'}margin:8px 0;">
              <div style="max-width:70%;padding:8px 10px;border-radius:8px;background:${m.from === 'me' ? '#95ec69' : '#fff'};box-shadow:0 1px 2px rgba(0,0,0,0.06);font-size:14px;line-height:20px;color:#111;">
                ${String(m.text || '')
                  .replace(/</g, '&lt;')
                  .replace(/>/g, '&gt;')}
              </div>
            </div>
          `,
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
      // 复合键 '<charKey>::<friendId>' 场景：优先提取 friendId 用于发送前缀
      if (typeof raw === 'string' && raw.includes('::')) {
        const parts = raw.split('::');
        return parts[parts.length - 1];
      }
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
            const fn = new Function(
              'ctx',
              'currentChatId',
              `
          try { with(ctx) { return (${path}); } } catch(e){ return ''; }
        `,
            );
            return fn(ctx, currentChatId);
          } catch (_) {
            return '';
          }
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
      } catch (_) {
        /* ignore */ void 0;
      }
      // 回退：char:<cid> -> cid；否则 raw；最后 'current'
      try {
        if (raw && typeof raw === 'string' && raw.startsWith('char:')) return raw.split(':')[1];
      } catch (_) {
        /* ignore */ void 0;
      }
      return String(raw || 'current');
    }
    const pushMyMsg = (text, targetId) => {
      const wrap = document.createElement('div');
      wrap.style.cssText = 'display:flex;justify-content:flex-end;margin:8px 0;';
      const safe = String(text).replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const idLine =
        targetId !== undefined && targetId !== null
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
        const allowAuto = autoSend === undefined ? true : !!autoSend;
        if (!allowAuto) return false;

        const targetId = deriveTargetId(rawChatId);
        const outbound = `发送给id:${targetId}\n\n${text}`;

        // 常见输入框/按钮选择器集合（优先级从高到低）
        const inputSelectors = [
          '#send_textarea',
          'textarea#send_textarea',
          'textarea[name="send_textarea"]',
          '[data-testid="send-textarea"]',
          'textarea#sendText',
          'textarea[name="sendText"]',
          '.send-textarea textarea',
          '.send-textarea',
        ];
        const buttonSelectors = [
          '#send_but',
          'button#send_but',
          '[data-testid="send-button"]',
          'button[aria-label="Send"]',
          '.send_button',
          '.send-btn',
          'button.send',
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

      // 发送前尝试从文本中捕获并建友/更新
      try { window.wechatLocalStore?.captureFromText?.(val); } catch (e) { /* ignore */ }

      const targetId = deriveTargetId(chatId);
      // 本地立即回显（带目标 id）
      pushMyMsg(val, targetId);

      // 发送到 SillyTavern（带“发送给id:xxx”前缀与空行）
      trySendToSillyTavern(val, chatId);

      input.value = '';
    });
    input.addEventListener('keydown', e => {
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
        const msgs = ctx && ctx.ready && ctx.messagesByChatId ? ctx.messagesByChatId[this.currentChatId] || [] : [];
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
    } catch (e) {
      console.warn('[WeChat Simulator] initContextSync failed:', e);
    }
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

      const computed = window.wechatLocalStore?.getComputedChatList?.() || [];
      const chats = computed;

      content.innerHTML = `
        <div class="chat-list">
          ${chats
            .map(
              c => `
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
          `,
            )
            .join('')}
        </div>
      `;

      // 点击进入详情
      content.querySelectorAll('.chat-item').forEach(el => {
        el.addEventListener('click', async () => {
          const rawId = el.getAttribute('data-id');
          const name = el.getAttribute('data-name') || '聊天';
          let switchedToChar = false;

          // 若为“角色占位会话”，先尝试切换到对应角色并刷新上下文
          if (
            rawId &&
            rawId.startsWith('char:') &&
            window.WeChatSwitch &&
            typeof window.WeChatSwitch.trySwitchToCharacter === 'function'
          ) {
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
          } catch (_) {
            /* 忽略 */
          }

          // 优先直接从 ST API 拉取当前会话历史，失败再回退到 wechatContext 缓存
          async function fetchStMessages() {
            try {
              const arr = await st?.getCurrentChatMessages?.();
              if (!Array.isArray(arr) || arr.length === 0) return [];
              // 轻量标准化
              return arr
                .map(m => {
                  const isUser =
                    m?.is_user === true ||
                    m?.isUser === true ||
                    m?.role === 'user' ||
                    m?.name === 'You' ||
                    m?.user === true ||
                    m?.author === 'user';
                  const text = String(m?.mes ?? m?.text ?? m?.content ?? m?.message ?? '').trim();
                  return { from: isUser ? 'me' : 'other', text };
                })
                .filter(x => x.text !== '');
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
            } catch (_) {
              /* 忽略 */
            }
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

      // 叠加或替换为本地消息
      try {
        const store = window.wechatLocalStore?.get?.();
        const st = window.SillyTavern?.getContext?.();
        const keys = [];
        const effectiveId = (function () {
          try {
            if (chatId && String(chatId).startsWith('char:')) {
              const cur = st?.getCurrentChatId?.();
              return String(cur || chatId);
            }
          } catch (e) {
            /* ignore */
          }
          return String(chatId || 'current');
        })();

        keys.push(effectiveId);
        try {
          if (chatId && String(chatId).startsWith('char:')) {
            keys.push(String(chatId));
          }
        } catch (e) {
          /* ignore */
        }

        const mergedLocal = [];
        for (const k of keys) {
          const arr = store?.messagesByChatId?.[k] || [];
          if (Array.isArray(arr) && arr.length) mergedLocal.push(...arr);
        }

        if (!msgs.length && mergedLocal.length) {
          msgs = mergedLocal;
        } else if (mergedLocal.length) {
          msgs = msgs.concat(mergedLocal);
        }
      } catch (e) {
        /* ignore */
      }

      // 若仍为空，保持为空（不注入演示消息）

      this.setTitle(chatName);

      content.innerHTML = `
        <div class="chat-detail" style="display:flex;flex-direction:column;height:100%;">
          <div class="messages" style="flex:1;overflow:auto;background:#f7f7f7;padding:10px 10px 60px;">
            ${msgs
              .map(
                m => `
              <div style="display:flex;${m.from === 'me' ? 'justify-content:flex-end;' : 'justify-content:flex-start;'}margin:8px 0;">
                <div style="max-width:70%;padding:8px 10px;border-radius:8px;background:${m.from === 'me' ? '#95ec69' : '#fff'};box-shadow:0 1px 2px rgba(0,0,0,0.06);font-size:14px;line-height:20px;color:#111;">
                  ${String(m.text || '')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;')}
                </div>
              </div>
            `,
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

      const pushMyMsg = (text, targetId) => {
        const wrap = document.createElement('div');
        wrap.style.cssText = 'display:flex;justify-content:flex-end;margin:8px 0;';
        const safe = String(text).replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const idLine =
          targetId !== undefined && targetId !== null
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
          const allowAuto = autoSend === undefined ? true : !!autoSend;
          if (allowAuto) {
            const outbound = `发送给id:${targetId}\n\n${val}`;
            const inputSelectors = [
              '#send_textarea',
              'textarea#send_textarea',
              'textarea[name="send_textarea"]',
              '[data-testid="send-textarea"]',
              'textarea#sendText',
              'textarea[name="sendText"]',
              '.send-textarea textarea',
              '.send-textarea',
            ];
            const buttonSelectors = [
              '#send_but',
              'button#send_but',
              '[data-testid="send-button"]',
              'button[aria-label="Send"]',
              '.send_button',
              '.send-btn',
              'button.send',
            ];
            const inputEl = inputSelectors.map(sel => document.querySelector(sel)).find(Boolean);
            const buttonEl = buttonSelectors.map(sel => document.querySelector(sel)).find(Boolean);
            if (inputEl) {
              inputEl.focus();
              inputEl.value = outbound;
              inputEl.dispatchEvent(new Event('input', { bubbles: true }));
              if (buttonEl) {
                buttonEl.click();
              } else {
                inputEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
              }
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
      input.addEventListener('keydown', e => {
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
              window.wechatPhone.renderChatDetail(
                { id: window.wechatPhone.currentChatId, name: window.wechatPhone._currentChatName || '聊天' },
                msgs,
              );
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
      try {
        window.initContextSync();
      } catch (e) {
        console.warn('[WeChat Simulator] initContextSync failed:', e);
      }
    }

    return true;
  }

  if (!override()) {
    const t = setInterval(() => {
      if (override()) clearInterval(t);
    }, 100);
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
            } catch (_) {
              /* 继续尝试其它 API */
            }
          }
        }

        // 2) DOM 方式：尝试点击角色列表项
        const selectors = [`[data-chid="${cid}"]`, `[data-character-id="${cid}"]`, `.character[data-id="${cid}"]`];
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
        } catch (e) {
          /* ignore */
        }

        return false;
      } catch (e) {
        console.warn('[WeChat Simulator] trySwitchToCharacter error:', e);
        return false;
      }
    },
  };
})();

/* === WeChat Extension: Local Store patch (persist messages per chat and update list) === */
(function wechatLocalStorePatch() {
  'use strict';

  // Helpers: local store structure
  function getWeChatLocalStore() {
    try {
      const raw = localStorage.getItem('wechatLocalStoreV1');
      if (raw) return JSON.parse(raw);
    } catch (e) {
      /* ignore */
    }
    return { messagesByChatId: {}, lastByChatId: {}, friendsByChar: {} };
  }
  function saveWeChatLocalStore(store) {
    try {
      localStorage.setItem('wechatLocalStoreV1', JSON.stringify(store));
    } catch (e) {
      /* ignore */
    }
  }
  function getCurrentChatIdSafe() {
    try {
      const st = window.SillyTavern?.getContext?.();
      const cur = st?.getCurrentChatId?.();
      if (cur !== undefined && cur !== null) return String(cur);
    } catch (e) {
      /* ignore */
    }
    return 'current';
  }
  function normalizeChatKey(raw) {
    try {
      if (raw && typeof raw === 'string' && raw.startsWith('char:')) {
        // map role placeholder to real current chat id
        const cur = getCurrentChatIdSafe();
        return String(cur || raw);
      }
      return String(raw || getCurrentChatIdSafe());
    } catch (e) {
      return String(raw || 'current');
    }
  }

  // 稳定角色键：返回 'char:<characterId>'，用于分类与列表预览
  function getCharKey() {
    try {
      const st = window.SillyTavern?.getContext?.();
      if (st && st.characterId !== undefined && st.characterId !== null) {
        return `char:${String(st.characterId)}`;
      }
    } catch (e) {
      /* ignore */
    }
    return '';
  }

  // 列表预览用的键解析：char: 开头直接用；否则回退到规范化后的真实会话ID
  function resolveOverlayKey(raw) {
    try {
      if (raw && typeof raw === 'string' && raw.startsWith('char:')) {
        return String(raw);
      }
    } catch (e) {
      /* ignore */
    }
    return normalizeChatKey(raw);
  }

  function appendLocalMessage(chatId, from, text, ts = Date.now()) {
    const store = getWeChatLocalStore();
    const cKey = getCharKey();
    let key = String(chatId || '');

    // 升级为复合键：<charKey>::<friendId>
    if (!key.includes('::') && cKey) {
      key = `${cKey}::${key || 'current'}`;
    }

    if (!store.messagesByChatId[key]) store.messagesByChatId[key] = [];
    store.messagesByChatId[key].push({ from, text, ts });
    store.lastByChatId[key] = { text, ts };
    saveWeChatLocalStore(store);
  }
  function formatTimeShort(ts) {
    try {
      const date = new Date(ts);
      const now = new Date();
      const sameDay =
        date.getFullYear() === now.getFullYear() &&
        date.getMonth() === now.getMonth() &&
        date.getDate() === now.getDate();
      if (sameDay) return date.toLocaleTimeString('zh-CN', { hour12: false, hour: '2-digit', minute: '2-digit' });
      const diff = now - date;
      if (diff > 0 && diff < 86400000) return '昨天';
      return `${date.getMonth() + 1}/${date.getDate()}`;
    } catch {
      return '';
    }
  }
  function updateChatListFromLocal(rootEl) {
    try {
      if (!rootEl) rootEl = document.getElementById('wechat-content');
      const list = rootEl?.querySelector('.chat-list');
      if (!list) return;
      const items = list.querySelectorAll('.chat-item');
      const store = getWeChatLocalStore();
      items.forEach(el => {
        const id = el.getAttribute('data-id') || el.getAttribute('data-chat-id') || '';
        const key = (store.lastByChatId[id] ? id : resolveOverlayKey(id));
        const last = store.lastByChatId[key];
        if (last) {
          // time field (the small right-aligned text on first row)
          // try to find second div in first row (font-size:12px) by structure hints
          const rows = el.querySelectorAll('div[style*="justify-content:space-between"]');
          const headTime = rows[0]?.querySelector('div[style*="font-size:12px"]');
          if (headTime) headTime.textContent = formatTimeShort(last.ts);
          // last summary (font-size:13px section)
          const sub = el.querySelector('div[style*="font-size:13px"]');
          if (sub) sub.textContent = last.text;
        }
      });
    } catch (e) {
      /* ignore */
    }
  }

  // 解析 '<charKey>::<friendId>' 获取友ID
  function extractFriendIdFromComposite(key) {
    if (!key || typeof key !== 'string') return '';
    const parts = key.split('::');
    return parts.length >= 2 ? parts[1] : key;
  }

  // 自动从文本中捕获好友标签 [好友id|角色名|好友id]
  function captureFriendsFromText(text) {
    try {
      if (!text || typeof text !== 'string') return [];
      const cKey = getCharKey();
      if (!cKey) return [];
      const store = getWeChatLocalStore();
      if (!store.friendsByChar) store.friendsByChar = {};
      if (!store.friendsByChar[cKey]) store.friendsByChar[cKey] = {};
      const re = /\[好友id\|([^|\]]+)\|([0-9A-Za-z_-]+)\]/g;
      const added = [];
      let m;
      while ((m = re.exec(text)) !== null) {
        const name = String(m[1] || '').trim();
        const fid = String(m[2] || '').trim();
        if (!fid) continue;
        // 建友或更新名称
        store.friendsByChar[cKey][fid] = {
          name: name || store.friendsByChar[cKey][fid]?.name || `好友 ${fid}`,
          updatedAt: Date.now(),
          createdAt: store.friendsByChar[cKey][fid]?.createdAt || Date.now(),
        };
        added.push({ id: fid, name: store.friendsByChar[cKey][fid].name });

        // 初始化 last 摘要（若无）
        const comp = `${cKey}::${fid}`;
        if (!store.lastByChatId[comp]) {
          store.lastByChatId[comp] = { text: '', ts: Date.now() - 1 };
        }
      }
      saveWeChatLocalStore(store);
      return added;
    } catch (e) { return []; }
  }

  // 计算列表展示用名称
  function getNameForKey(id) {
    try {
      const st = window.SillyTavern?.getContext?.();
      if (typeof id === 'string' && id.includes('::')) {
        const cKey = id.split('::')[0];
        const fid = id.split('::')[1];
        const store = getWeChatLocalStore();
        const name = store?.friendsByChar?.[cKey]?.[fid]?.name;
        return name || `好友 ${fid}`;
      }
      if (typeof id === 'string' && id.startsWith('char:')) {
        const cid = id.split(':')[1];
        const name =
          (Array.isArray(st?.characters) ? st.characters[Number(cid)]?.name : st?.characters?.[cid]?.name) ||
          `好友 ${cid}`;
        return name;
      }
      if (id === 'current') {
        const name =
          (Array.isArray(st?.characters) ? st.characters[st?.characterId]?.name : st?.characters?.[st?.characterId]?.name) ||
          '当前会话';
        return name || '当前会话';
      }
    } catch (e) { /* ignore */ }
    return '会话';
  }

  // 根据本地 lastByChatId 生成“会话列表”（仅当前角色环境），按时间倒序；不再注入任何演示/虚拟好友
  function getComputedChatList() {
    try {
      const store = getWeChatLocalStore();
      const lastMap = store?.lastByChatId || {};
      const cKey = getCharKey();
      if (!cKey) return [];

      const entries = Object.entries(lastMap).filter(([id]) => String(id).startsWith(`${cKey}::`));
      if (entries.length === 0) return [];

      const list = entries.map(([id, v]) => {
        const name = getNameForKey(id);
        return {
          id,
          name,
          last: String(v?.text || ''),
          time: formatTimeShort(Number(v?.ts) || Date.now()),
          unread: 0,
          avatar: '🟢',
          _ts: Number(v?.ts) || 0,
        };
      });

      list.sort((a, b) => b._ts - a._ts);
      return list;
    } catch (e) {
      return [];
    }
  }

  // 首次迁移：清空旧数据（按用户确认），仅执行一次
  try {
    if (!localStorage.getItem('wechatEnvV2Migrated')) {
      localStorage.removeItem('wechatLocalStoreV1');
      localStorage.removeItem('wechatSeededV1');
      localStorage.setItem('wechatEnvV2Migrated', '1');
    }
  } catch (e) { /* ignore */ }

  // Expose to other modules
  window.wechatLocalStore = {
    get: getWeChatLocalStore,
    save: saveWeChatLocalStore,
    append: appendLocalMessage,
    updateList: updateChatListFromLocal,
    getComputedChatList,
    captureFromText: captureFriendsFromText,
  };

  // 控制台友链工具
  window.WeChatFriends = {
    add(friendId, name = '') {
      try {
        const store = getWeChatLocalStore();
        const cKey = getCharKey();
        if (!cKey) return false;
        if (!store.friendsByChar) store.friendsByChar = {};
        if (!store.friendsByChar[cKey]) store.friendsByChar[cKey] = {};
        store.friendsByChar[cKey][friendId] = {
          name: name || store.friendsByChar[cKey][friendId]?.name || `好友 ${friendId}`,
          updatedAt: Date.now(),
          createdAt: store.friendsByChar[cKey][friendId]?.createdAt || Date.now(),
        };
        // 初始化摘要
        const comp = `${cKey}::${friendId}`;
        if (!store.lastByChatId[comp]) store.lastByChatId[comp] = { text: '', ts: Date.now() - 1 };
        saveWeChatLocalStore(store);
        return true;
      } catch (e) { return false; }
    },
    remove(friendId) {
      try {
        const store = getWeChatLocalStore();
        const cKey = getCharKey();
        if (!cKey) return false;
        delete (store.friendsByChar?.[cKey]?.[friendId]);
        const comp = `${cKey}::${friendId}`;
        delete store.lastByChatId[comp];
        delete store.messagesByChatId[comp];
        saveWeChatLocalStore(store);
        return true;
      } catch (e) { return false; }
    },
    list() {
      try {
        const store = getWeChatLocalStore();
        const cKey = getCharKey();
        return Object.entries(store?.friendsByChar?.[cKey] || {}).map(([id, v]) => ({ id, name: v?.name }));
      } catch (e) { return []; }
    },
    clearForCurrentRole() {
      try {
        const store = getWeChatLocalStore();
        const cKey = getCharKey();
        if (!cKey) return false;
        // 清理该角色命名空间的好友与消息
        const friends = store?.friendsByChar?.[cKey] || {};
        for (const fid of Object.keys(friends)) {
          const comp = `${cKey}::${fid}`;
          delete store.lastByChatId[comp];
          delete store.messagesByChatId[comp];
        }
        delete store.friendsByChar[cKey];
        saveWeChatLocalStore(store);
        return true;
      } catch (e) { return false; }
    }
  };

  // Hook: when clicking send button in detail view, persist message
  let lastSentStamp = 0;
  document.addEventListener(
    'click',
    ev => {
      try {
        const t = ev.target;
        if (!(t instanceof Element)) return;
        if (t.id !== 'chat-send') return;
        const input = document.getElementById('chat-input');
        if (!input) return;
        const text = String(input.value || '').trim();
        if (!text) return;
        // avoid double save within 300ms
        const now = Date.now();
        if (now - lastSentStamp < 300) return;
        lastSentStamp = now;

        const phone = window.wechatPhone;
        const chatId = phone?.currentChatId || getCurrentChatIdSafe();
        appendLocalMessage(chatId, 'me', text);
        // after a slight delay, if list is visible, update
        setTimeout(() => updateChatListFromLocal(document.getElementById('wechat-content')), 0);
      } catch (e) {
        /* ignore */
      }
    },
    true,
  );

  // Hook: Enter key in input bar also triggers, but click handler above will run; keep as fallback
  document.addEventListener(
    'keydown',
    ev => {
      try {
        if (ev.key !== 'Enter') return;
        const input = document.getElementById('chat-input');
        if (!input || document.activeElement !== input) return;
        const text = String(input.value || '').trim();
        if (!text) return;
        const now = Date.now();
        if (now - lastSentStamp < 300) return;
        lastSentStamp = now;

        const phone = window.wechatPhone;
        const chatId = phone?.currentChatId || getCurrentChatIdSafe();
        appendLocalMessage(chatId, 'me', text);
        setTimeout(() => updateChatListFromLocal(document.getElementById('wechat-content')), 0);
      } catch (e) {
        /* ignore */
      }
    },
    true,
  );

  // When chat list renders (or context updates), try to overlay local last summaries
  document.addEventListener('wechat-context-updated', () => {
    try {
      updateChatListFromLocal(document.getElementById('wechat-content'));
    } catch (e) {
      /* ignore */
    }
  });

  // Mutation observer to catch chat-list being re-rendered
  try {
    const content = document.getElementById('wechat-content');
    if (content && window.MutationObserver) {
      const obs = new MutationObserver(() => {
        updateChatListFromLocal(content);
      });
      obs.observe(content, { childList: true, subtree: true });
    }
  } catch (e) {
    /* ignore */
  }
})();
