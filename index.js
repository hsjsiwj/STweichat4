// WeChat Simulator Extension for SillyTavern
// Version: 1.0
// Description: 模拟微信界面，支持聊天、加好友、建群、朋友圈、商城，同步SillyTavern数据

// 移除不存在的性能配置和优化加载器加载，以避免404错误

// 核心初始化
jQuery(async () => {
  // 动态确定扩展路径
  const extensionName = 'STweichat4'; // 这个名字必须和你的git仓库名一致
  const extensionBasePath = `./scripts/extensions/third-party/${extensionName}`;
  window.wechatExtensionPath = extensionBasePath; // 设置全局路径变量

  const context = SillyTavern.getContext();
  // 默认设置
  const defaultSettings = {
    enabled: true,
    monitorInterval: 3000,
  };
  if (!context.extensionSettings.wechat_simulator) {
    context.extensionSettings.wechat_simulator = { ...defaultSettings };
    context.saveSettingsDebounced();
  }

  const modules = [
    'drag-helper',
    'app/context-sync',
    'app/message-app',
    'app/add-friend',
    'app/build-group',
    'app/moments-app',
    'app/shop-app',
    'wechat-phone'
  ];
  let loadedCount = 0;

  const initExtension = () => {
    initContextSync();
    initMessageApp();
    initAddFriend();
    initBuildGroup();
    initMomentsApp();
    initShopApp();
    initWeChatPhone();

    const trigger = document.createElement('div');
    trigger.id = 'wechat-trigger';
    trigger.className = 'wechat-button';
    trigger.innerHTML = '<div style="font-size: 32px; font-weight: bold; color: green;">微信</div>';
    trigger.title = '打开微信模拟器';
    document.body.appendChild(trigger);

    trigger.addEventListener('click', () => {
        if (window.wechatPhone) {
            window.wechatPhone.toggle();
        }
    });

    if (window.DragHelper) {
        new window.DragHelper(trigger);
    }
    
    console.log('[WeChat Simulator] 扩展加载完成');
  };

  modules.forEach(mod => {
    const script = document.createElement('script');
    script.src = `${extensionBasePath}/${mod}.js`;
    script.onload = () => {
      loadedCount++;
      console.log(`${mod} 模块加载完成`);
      if (loadedCount === modules.length) {
        initExtension();
      }
    };
    script.onerror = () => {
        console.error(`[WeChat Simulator] 无法加载模块: ${mod}.js`);
    };
    document.head.appendChild(script);
  });
});
