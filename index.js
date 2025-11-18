// WeChat Simulator Extension for SillyTavern
// Version: 1.2
// Description: 模拟微信界面，基础UI + 简易交互，占位模块可选加载 + 路径探测 + 降级容错
//
// 说明：修复了此前的语法错误与路径识别问题，增强 DOM Ready/降级逻辑，确保即使加载失败也显示悬浮入口。

(function bootstrap() {
  const start = async () => {
    try {
      // 1) 动态确定扩展根路径：.../third-party/<dir>
// 修正：避免误匹配其它扩展（例如 ST-Prompt-Template），并校验 JS MIME
let extensionBasePath = '';
async function resolveBasePath() {
  const scripts = Array.from(document.getElementsByTagName('script'));
  const preferredDirs = [
    '/scripts/extensions/third-party/STweichat4',
    '/scripts/extensions/third-party/STweichat4/dist',
    // 移除可能导致混淆的路径
  ];

  // 从 currentScript 获取候选
  const currentSrc = (document.currentScript && document.currentScript.src) || '';
  const addParentIfValid = (src) => {
    if (src && src.includes('/scripts/extensions/third-party/') && /\/index\.js(\?.*)?$/.test(src)) {
      const rel = src.replace(location.origin, '').replace(/\/index\.js(\?.*)?$/, '');
      if (!preferredDirs.includes(rel)) preferredDirs.unshift(rel);
    }
  };
  addParentIfValid(currentSrc);

  // 从所有 script 中挑选匹配 index.js 的路径，优先包含 STweichat4
  const stHit = scripts.find(
    s => s.src && s.src.includes('/scripts/extensions/third-party/STweichat4/') && /\/index\.js(\?.*)?$/.test(s.src),
  );
  addParentIfValid(stHit && stHit.src);

  const anyHit = scripts.find(
    s => s.src && s.src.includes('/scripts/extensions/third-party/') && /\/index\.js(\?.*)?$/.test(s.src),
  );
  addParentIfValid(anyHit && anyHit.src);

  // 校验候选：使用 HEAD 请求检测 wechat-phone.js 是否存在且为 javascript
  const isGood = async (base) => {
    try {
      const resp = await fetch(`${base}/wechat-phone.js`, { method: 'HEAD' });
      // 宽松校验：只要请求成功即可，避免因 content-type 误判导致错误回退
      return resp.ok;
    } catch {
      return false;
    }
  };

  for (const base of preferredDirs) {
    // 统一为绝对路径（以 / 开头），避免相对路径被错误解析到其它扩展目录
    const abs = base.startsWith('/') ? base : base.replace(/^\.\//, '/');
    // 仅尝试 third-party 目录
    if (!abs.startsWith('/scripts/extensions/third-party/')) continue;
    /* eslint-disable no-await-in-loop */
    if (await isGood(abs)) return abs;
    /* eslint-enable no-await-in-loop */
  }
  return '/scripts/extensions/third-party/STweichat4';
}
extensionBasePath = await resolveBasePath();
window.wechatExtensionPath = extensionBasePath;
console.log('[WeChat Simulator] 扩展路径解析为:', window.wechatExtensionPath);

      // 2) 集成设置（安全容错）
      try {
        const context = window.SillyTavern?.getContext?.();
        const defaultSettings = {
          enabled: true,
          monitorInterval: 3000,
          autoOpen: true,
          autoSendToST: true,
        };
        if (context) {
          if (!context.extensionSettings.wechat_simulator) {
            context.extensionSettings.wechat_simulator = { ...defaultSettings };
            context.saveSettingsDebounced?.();
          } else {
            for (const k of Object.keys(defaultSettings)) {
              if (context.extensionSettings.wechat_simulator[k] === undefined) {
                context.extensionSettings.wechat_simulator[k] = defaultSettings[k];
              }
            }
            // 强制清理旧版本遗留的 ID 配置，避免 Edge/Chrome 行为不一致
            delete context.extensionSettings.wechat_simulator.idSource;
            delete context.extensionSettings.wechat_simulator.customIdPath;
            context.saveSettingsDebounced?.();
          }
        }
      } catch (e) {
        console.warn('[WeChat Simulator] 设置集成失败，不影响基本功能', e);
      }

      // 2.5) 注入设置面板（如果存在 #extensions_settings）
      function createWechatSettingsUI() {
        try {
          const ctx = window.SillyTavern?.getContext?.();
          const root = document.getElementById('extensions_settings');
          if (!ctx || !root) return;
          if (document.getElementById('wechat_simulator_settings')) return;

          const setns = ctx.extensionSettings?.wechat_simulator || {};
          const autoChecked = !!(setns.autoSendToST ?? true);

          const panel = document.createElement('div');
          panel.id = 'wechat_simulator_settings';
          panel.innerHTML = `
            <div class="inline-drawer">
              <div class="inline-drawer-toggle inline-drawer-header">
                <b>微信模拟器</b>
                <div class="inline-drawer-icon fa-solid fa-circle-chevron-down"></div>
              </div>
              <div class="inline-drawer-content">
                <div class="flex-container" style="display:flex;flex-direction:column;gap:10px;max-width:680px;">
                  <label class="checkbox_label" for="wechat_auto_send_to_st" style="display:flex;gap:8px;align-items:center;">
                    <input id="wechat_auto_send_to_st" type="checkbox" ${autoChecked ? 'checked' : ''}/>
                    <span>自动将发送输入转发到 SillyTavern 输入框</span>
                  </label>
                </div>
              </div>
            </div>
          `;
          root.appendChild(panel);

          // 事件：自动发送
          const cb = document.getElementById('wechat_auto_send_to_st');
          cb?.addEventListener('change', () => {
            const v = !!cb.checked;
            try {
              ctx.extensionSettings.wechat_simulator.autoSendToST = v;
              ctx.saveSettingsDebounced?.();
            } catch (err) {
              console.warn('[WeChat Simulator] 保存 autoSendToST 失败:', err);
            }
          });
        } catch (err) {
          console.warn('[WeChat Simulator] 设置面板创建失败:', err);
        }
      }
      createWechatSettingsUI();

      // 3) 加载基础样式（拖拽态兜底，带 MIME fallback）
      async function loadCss(url) {
        return new Promise(resolve => {
          try {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = url;
            link.onload = () => resolve({ ok: true, via: 'link' });
            link.onerror = async () => {
              // MIME 被严格检查或 404 时，改为拉取文本并以内联 <style> 注入
              try {
                const resp = await fetch(url);
                const css = await resp.text();
                const style = document.createElement('style');
                style.textContent = css;
                document.head.appendChild(style);
                console.warn('[WeChat Simulator] CSS MIME fallback via <style>:', url);
                resolve({ ok: true, via: 'inline' });
              } catch (err) {
                console.error('[WeChat Simulator] CSS load failed:', url, err);
                resolve({ ok: false });
              }
            };
            document.head.appendChild(link);
          } catch (e) {
            console.warn('[WeChat Simulator] loadCss failed:', url, e);
            resolve({ ok: false });
          }
        });
      }
      await loadCss(`${extensionBasePath}/styles/drag-helper.css`);
      // 兜底加载主样式，避免 manifest 未生效时无样式
      await loadCss(`${extensionBasePath}/styles/wechat-phone.css`);

      // 4) 通用加载器（带 MIME fallback：失败后以 fetch+Blob 注入）
      const loadScript = (url, { optional = false } = {}) =>
        new Promise(resolve => {
          try {
            const tag = document.createElement('script');
            tag.src = url;
            tag.onload = () => {
              console.log(`[WeChat Simulator] 模块加载成功: ${url}`);
              resolve({ url, ok: true, via: 'script' });
            };
            tag.onerror = async () => {
              // 第一次失败，尝试以 fetch 文本 + Blob URL 注入，绕过 text/plain MIME 限制
              console.warn(`[WeChat Simulator] 模块加载失败: ${url}`);
              if (optional) {
                console.warn(`[WeChat Simulator] 可选模块加载失败，继续执行: ${url}`);
                resolve({ url, ok: false });
              } else {
                // 对于必需模块，尝试一次 Blob URL 加载
                try {
                  const resp = await fetch(url, { cache: 'no-store' });
                  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
                  const code = await resp.text();
                  const blob = new Blob([code], { type: 'application/javascript' });
                  const objUrl = URL.createObjectURL(blob);
                  const tag2 = document.createElement('script');
                  tag2.src = objUrl;
                  tag2.onload = () => {
                    URL.revokeObjectURL(objUrl);
                    console.warn(`[WeChat Simulator] 通过 Blob URL 加载成功: ${url}`);
                    resolve({ url, ok: true, via: 'blob' });
                  };
                  tag2.onerror = () => {
                    URL.revokeObjectURL(objUrl);
                    console.error(`[WeChat Simulator] 必需模块加载失败(二次): ${url}`);
                    resolve({ url, ok: false });
                  };
                  document.head.appendChild(tag2);
                } catch (err) {
                  console.error(`[WeChat Simulator] 必需模块加载失败(fetch): ${url}`, err);
                  resolve({ url, ok: false });
                }
              }
            };
            document.head.appendChild(tag);
          } catch (e) {
            console.error(`[WeChat Simulator] 模块加载异常: ${url}`, e);
            resolve({ url, ok: false });
          }
        });

      // 5) 模块列表
      const baseModules = [
        `${extensionBasePath}/drag-helper.js`,
        `${extensionBasePath}/wechat-phone.js`,
      ];
      const optionalModules = [
        'app/context-sync.js',
        'app/importer.js',         // 历史标签扫描器：读取以往记录 [好友id|昵称|ID]
        'app/message-app.js',
        'app/add-friend.js',
        'app/build-group.js',
        'app/moments-app.js',
        'app/shop-app.js',
      ].map(p => `${extensionBasePath}/${p}`);

      // 6) 加载基础模块（并行）
      const baseResults = await Promise.all(baseModules.map(u => loadScript(u)));
      const baseOk = baseResults.every(r => r.ok);
      if (!baseOk) {
        console.error('[WeChat Simulator] 基础模块加载失败，进入降级模式：仅创建悬浮按钮（功能受限）');
        
        // 记录具体哪些模块加载失败
        baseResults.forEach(result => {
          if (!result.ok) {
            console.error(`[WeChat Simulator] 失败模块: ${result.url}`);
          }
        });
        
        // 尝试单独重新加载每个失败的模块
        for (const result of baseResults) {
          if (!result.ok) {
            try {
              const retryResult = await loadScript(result.url);
              if (retryResult.ok) {
                console.log(`[WeChat Simulator] 重试加载成功: ${result.url}`);
              }
            } catch (e) {
              console.error(`[WeChat Simulator] 重试加载失败: ${result.url}`, e);
            }
          }
        }
      }

      // 7) 启动扩展（无论是否降级，都创建入口）
      initExtension();

      // 创建实例并按设置尝试自动打开
      await ensurePhoneInstance(6);
      try {
        const ctx = window.SillyTavern?.getContext?.();
        const autoOpen = !!(ctx?.extensionSettings?.wechat_simulator?.autoOpen ?? true);
        if (autoOpen && window.wechatPhone && typeof window.wechatPhone.toggle === 'function') {
          window.wechatPhone.toggle();
        }
      } catch (e) {
        console.warn('[WeChat Simulator] 自动打开失败:', e);
      }

      // 8) 可选模块异步加载（不阻塞主流程）
      Promise.all(optionalModules.map(u => loadScript(u, { optional: true }))).then(results => {
        const okCount = results.filter(r => r.ok).length;
        console.log(`[WeChat Simulator] 可选模块加载完成: ${okCount}/${results.length}`);
        // 可选模块初始化（若存在）
        try {
          if (window.initContextSync) window.initContextSync();
          if (window.initMessageApp) window.initMessageApp();
          if (window.initMomentsApp) window.initMomentsApp();
        } catch (e) {
          console.warn('[WeChat Simulator] 可选模块初始化失败:', e);
        }
      });

      // 9) 初始化入口按钮与容错实例化
      function initExtension() {
        // 悬浮按钮（兜底内联样式，避免样式未加载导致不可见）
        if (!document.getElementById('wechat-trigger')) {
          const trigger = document.createElement('div');
          trigger.id = 'wechat-trigger';
          trigger.className = 'wechat-button';
          Object.assign(trigger.style, {
            position: 'fixed',
            bottom: '100px',
            right: '20px',
            width: '60px',
            height: '60px',
            borderRadius: '50%',
            zIndex: '9999',
            background: '#07C160',
            color: '#fff',
            fontSize: '24px',
            lineHeight: '60px',
            textAlign: 'center',
            cursor: 'grab',
            boxShadow: '0 6px 18px rgba(7, 193, 96, 0.35)',
          });
          trigger.innerText = '💬';
          trigger.title = '打开微信模拟器';
          document.body.appendChild(trigger);

          trigger.addEventListener('click', async () => {
            // 已有实例
            if (window.wechatPhone && typeof window.wechatPhone.toggle === 'function') {
              window.wechatPhone.toggle();
              return;
            }
            // 尝试通过类直接创建
            if (window.WeChatPhone) {
              try {
                window.wechatPhone = new window.WeChatPhone();
                window.wechatPhone.toggle();
                return;
              } catch (e) {
                console.warn('[WeChat Simulator] 初始化 WeChatPhone 失败:', e);
              }
            }
            // 退化：如果全局有初始化函数（非模块顶层函数），调用它
            if (typeof window.initWeChatPhone === 'function') {
              try {
                window.initWeChatPhone();
                if (window.wechatPhone && typeof window.wechatPhone.toggle === 'function') {
                  window.wechatPhone.toggle();
                  return;
                }
              } catch (e) {
                console.warn('[WeChat Simulator] 调用 initWeChatPhone 失败:', e);
              }
            }
            // 最后再轮询若干次（等待脚本异步加载完成）
            const ok = await ensurePhoneInstance(6);
            if (ok && window.wechatPhone && typeof window.wechatPhone.toggle === 'function') {
              window.wechatPhone.toggle();
              return;
            }
            console.warn('[WeChat Simulator] 手机框架未就绪（降级模式），仅显示入口按钮');
          });

          if (window.DragHelper) {
            try {
              new window.DragHelper(trigger, { storageKey: 'wechat-trigger-position' });
            } catch (e) {
              console.warn('[WeChat Simulator] DragHelper 初始化失败:', e);
            }
          }
        }

        // 若基础模块成功且类已定义，但 DOMContentLoaded 已过去，主动实例化一次
        if (!window.wechatPhone && window.WeChatPhone) {
          try {
            window.wechatPhone = new window.WeChatPhone();
          } catch (e) {
            console.warn('[WeChat Simulator] 主动创建 WeChatPhone 实例失败:', e);
          }
        }

        console.log('[WeChat Simulator] 扩展初始化完成（降级容错已启用）');
      }

      // 实用函数：等待并确保 wechatPhone 实例创建
      async function ensurePhoneInstance(retries = 10) {
        // 已有实例
        if (window.wechatPhone) return true;
        // 类存在则直接创建
        if (window.WeChatPhone) {
          try { window.wechatPhone = new window.WeChatPhone(); return true; } catch (e) {
            console.warn('[WeChat Simulator] 创建 WeChatPhone 实例失败:', e);
          }
        }
        // 若全局有初始化函数，调用
        if (typeof window.initWeChatPhone === 'function') {
          try {
            window.initWeChatPhone();
            if (window.wechatPhone) return true;
          } catch (e) {
            console.warn('[WeChat Simulator] 调用 initWeChatPhone 失败:', e);
          }
        }
        // 递归等待
        if (retries <= 0) return false;
        await new Promise(r => setTimeout(r, 500));
        return ensurePhoneInstance(retries - 1);
      }

      // 10) 暴露调试助手，便于在控制台快速定位“为何没有悬浮按钮/报错”
      window.WeChatSim = {
        path: () => window.wechatExtensionPath,
        printStatus() {
          const status = {
            extensionPath: window.wechatExtensionPath,
            hasDragHelper: !!window.DragHelper,
            hasWeChatPhoneClass: !!window.WeChatPhone,
            hasWeChatPhoneInstance: !!window.wechatPhone,
            triggerExists: !!document.getElementById('wechat-trigger'),
            cssWechatLoaded: !!Array.from(document.styleSheets || []).find(s => (s.href || '').includes('wechat-phone.css')),
            cssDragLoaded: !!Array.from(document.styleSheets || []).find(s => (s.href || '').includes('drag-helper.css')),
          };
          console.log('[WeChat Simulator] Debug Status:', status);
          return status;
        }
      };
    } catch (e) {
      console.error('[WeChat Simulator] 启动失败:', e);
      // 即使致命失败，也尽量提供按钮用于可见提示
      try {
        if (!document.getElementById('wechat-trigger')) {
          const trigger = document.createElement('div');
          trigger.id = 'wechat-trigger';
          Object.assign(trigger.style, {
            position: 'fixed',
            bottom: '100px',
            right: '20px',
            width: '60px',
            height: '60px',
            borderRadius: '50%',
            zIndex: '9999',
            background: '#07C160',
            color: '#fff',
            fontSize: '24px',
            lineHeight: '60px',
            textAlign: 'center',
            cursor: 'grab',
            boxShadow: '0 6px 18px rgba(7, 193, 96, 0.35)',
          });
          trigger.innerText = '💬';
          trigger.title = '打开微信模拟器';
          document.body.appendChild(trigger);
        }
      } catch (e) { console.warn('[WeChat Simulator] 显示降级入口按钮失败:', e); }
    }
  };

  // 兼容 jQuery 未注入场景
  if (typeof window.jQuery === 'function') {
    window.jQuery(start);
  } else if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
