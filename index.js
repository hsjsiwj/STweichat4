// WeChat Simulator Extension for SillyTavern
// Version: 1.2
// Description: 模拟微信界面，基础UI + 简易交互，占位模块可选加载 + 路径探测 + 降级容错
//
// 说明：修复了此前的语法错误与路径识别问题，增强 DOM Ready/降级逻辑，确保即使加载失败也显示悬浮入口。

(function bootstrap() {
  const start = async () => {
    try {
      // 1) 动态确定扩展根路径：.../third-party/<dir>
      let extensionBasePath = '';
      try {
        // 优先 currentScript
        const cs = document.currentScript;
        if (cs && cs.src && /\/index\.js(\?.*)?$/.test(cs.src)) {
          const src = cs.src.replace(location.origin, '');
          extensionBasePath = src.replace(/\/index\.js(\?.*)?$/, '');
        }
        // 退化：扫描所有 script 标签
        if (!extensionBasePath) {
          const tag = Array.from(document.getElementsByTagName('script'))
            .find(s => s.src && s.src.includes('/scripts/extensions/third-party/') && /\/index\.js(\?.*)?$/.test(s.src));
          if (tag && tag.src) {
            const src = tag.src.replace(location.origin, '');
            extensionBasePath = src.replace(/\/index\.js(\?.*)?$/, '');
          }
        }
        // 最终回退：优先仓库目录名 STweichat4，其次 wechat-extension
        if (!extensionBasePath) {
          extensionBasePath = './scripts/extensions/third-party/STweichat4';
        }
      } catch (e) {
        console.warn('[WeChat Simulator] 未能自动解析扩展路径，使用回退路径', e);
        extensionBasePath = './scripts/extensions/third-party/STweichat4';
      }
      window.wechatExtensionPath = extensionBasePath;
      console.log('[WeChat Simulator] 扩展路径:', window.wechatExtensionPath);

      // 2) 集成设置（安全容错）
      try {
        const context = window.SillyTavern?.getContext?.();
        const defaultSettings = { enabled: true, monitorInterval: 3000 };
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
            context.saveSettingsDebounced?.();
          }
        }
      } catch (e) {
        console.warn('[WeChat Simulator] 设置集成失败，不影响基本功能', e);
      }

      // 3) 加载基础样式（拖拽态兜底）
      try {
        const dragCss = document.createElement('link');
        dragCss.rel = 'stylesheet';
        dragCss.href = `${extensionBasePath}/styles/drag-helper.css`;
        document.head.appendChild(dragCss);
      } catch (e) {
        console.warn('[WeChat Simulator] 注入拖拽样式失败', e);
      }

      // 4) 通用加载器
      const loadScript = (url, { optional = false } = {}) =>
        new Promise(resolve => {
          const s = document.createElement('script');
          s.src = url;
          s.onload = () => {
            console.log(`[WeChat Simulator] 模块加载成功: ${url}`);
            resolve({ url, ok: true });
          };
          s.onerror = () => {
            const msg = `[WeChat Simulator] ${optional ? '可选' : '必需'}模块加载失败: ${url}`;
            if (optional) { console.warn(msg); } else { console.error(msg); }
            resolve({ url, ok: false });
          };
          document.head.appendChild(s);
        });

      // 5) 模块列表
      const baseModules = [
        `${extensionBasePath}/drag-helper.js`,
        `${extensionBasePath}/wechat-phone.js`,
      ];
      const optionalModules = [
        'app/context-sync.js',
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
        // 不提前 return，继续创建入口，便于用户可见并调试
      }

      // 7) 启动扩展（无论是否降级，都创建入口）
      initExtension();

      // 8) 可选模块异步加载（不阻塞主流程）
      Promise.all(optionalModules.map(u => loadScript(u, { optional: true }))).then(results => {
        const okCount = results.filter(r => r.ok).length;
        console.log(`[WeChat Simulator] 可选模块加载完成: ${okCount}/${results.length}`);
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

          trigger.addEventListener('click', () => {
            if (window.wechatPhone) {
              window.wechatPhone.toggle();
            } else if (window.WeChatPhone) {
              try {
                window.wechatPhone = new window.WeChatPhone();
                window.wechatPhone.toggle();
              } catch (e) {
                console.warn('[WeChat Simulator] 初始化 WeChatPhone 失败:', e);
              }
            } else {
              console.warn('[WeChat Simulator] 手机框架未就绪（降级模式），仅显示入口按钮');
            }
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
