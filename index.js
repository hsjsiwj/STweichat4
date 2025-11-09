// WeChat Simulator Extension for SillyTavern
// Version: 1.1
// Description: 模拟微信界面，基础UI + 简易交互，占位模块可选加载

jQuery(async () => {
  // 动态确定扩展根路径：.../third-party/<dir>
  let extensionBasePath = './scripts/extensions/third-party/wechat-extension';
  try {
    const tag = Array.from(document.getElementsByTagName('script'))
      .find(s => s.src && s.src.includes('/scripts/extensions/third-party/') && /\/index\.js(\?.*)?$/.test(s.src));
    if (tag) {
      // 统一转相对路径，去掉协议域名与末尾 index.js
      const src = tag.src.replace(location.origin, '');
      extensionBasePath = src.replace(/\/index\.js(\?.*)?$/, '');
    }
  } catch (e) {
    console.warn('[WeChat Simulator] 未能自动解析扩展路径，使用默认', e);
  }
  window.wechatExtensionPath = extensionBasePath; // 设置全局路径变量

  // 集成设置
  try {
    const context = SillyTavern.getContext?.();
    const defaultSettings = { enabled: true, monitorInterval: 3000 };
    if (context) {
      if (!context.extensionSettings.wechat_simulator) {
        context.extensionSettings.wechat_simulator = { ...defaultSettings };
        context.saveSettingsDebounced?.();
      } else {
        // 合并新增项
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

  // 加载基础样式（拖拽态）
  const dragCss = document.createElement('link');
  dragCss.rel = 'stylesheet';
  dragCss.href = `${extensionBasePath}/styles/drag-helper.css`;
  document.head.appendChild(dragCss);

  // 基础模块（必须）：拖拽 + 微信框架
  const baseModules = [
    `${extensionBasePath}/drag-helper.js`,
    `${extensionBasePath}/wechat-phone.js`,
  ];

  // 可选模块（存在则加载，不存在也不阻塞）
  const optionalModules = [
    'app/context-sync.js',
    'app/message-app.js',
    'app/add-friend.js',
    'app/build-group.js',
    'app/moments-app.js',
    'app/shop-app.js',
  ].map(p => `${extensionBasePath}/${p}`);

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

  // 并行加载基础模块
  const baseResults = await Promise.all(baseModules.map(u => loadScript(u)));
  const baseOk = baseResults.every(r => r.ok);
  if (!baseOk) {
    console.error('[WeChat Simulator] 基础模块加载失败，停止初始化');
    return;
  }

  // 启动扩展
  initExtension();

  // 异步尝试加载可选模块（不影响主流程）
  Promise.all(optionalModules.map(u => loadScript(u, { optional: true }))).then(results => {
    const okCount = results.filter(r => r.ok).length;
    console.log(`[WeChat Simulator] 可选模块加载完成: ${okCount}/${results.length}`);
  });

  function initExtension() {
    // 创建悬浮触发按钮（内置emoji，避免图标缺失）
    const trigger = document.createElement('div');
    trigger.id = 'wechat-trigger';
    trigger.className = 'wechat-button';
    trigger.style.background = '#07C160';
    trigger.style.color = '#fff';
    trigger.style.fontSize = '24px';
    trigger.style.lineHeight = '60px';
    trigger.style.textAlign = 'center';
    trigger.innerText = '💬';
    trigger.title = '打开微信模拟器';
    document.body.appendChild(trigger);

    trigger.addEventListener('click', () => {
      if (window.wechatPhone) {
        window.wechatPhone.toggle();
      }
    });

    if (window.DragHelper) {
      // 允许拖动按钮
      new window.DragHelper(trigger, { storageKey: 'wechat-trigger-position' });
    }

    console.log('[WeChat Simulator] 扩展加载完成，基础UI已就绪');
  }
});
