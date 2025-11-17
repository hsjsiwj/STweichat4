/**
 * WeChat Importer - 历史标签扫描器
 * 需求：读取以往记录，扫描当前角色卡的所有楼层消息中形如 [好友id|昵称|ID] 的标签，自动建立好友与列表摘要
 * 集成点：
 *  - 进入“微信”页时可调用 window.wechatImporter.importIfNeeded()
 *  - 手动入口：window.wechatImporter.forceImport()（用于按钮/菜单）
 */
/* global SillyTavern */
(function () {
  'use strict';

  if (window.wechatImporter) return;

  // 统一日志
  function log(...args) {
    try {
      console.log('[WeChat Importer]', ...args);
    } catch (e) { /* ignore */ void 0; }
  }
  function warn(...args) {
    try {
      console.warn('[WeChat Importer]', ...args);
    } catch (e) { /* ignore */ void 0; }
  }

  // 获取 ST 上下文
  function getST() {
    try {
      return window.SillyTavern?.getContext?.() || null;
    } catch {
      return null;
    }
  }

  // 获取“当前会话”的所有消息（尽可能完整）
  async function getAllMessages() {
    const st = getST();

    // 新 API：优先
    try {
      if (st?.getCurrentChatMessages) {
        const arr = await st.getCurrentChatMessages();
        if (Array.isArray(arr)) return arr;
      }
    } catch (e) {
      warn('getCurrentChatMessages 失败，回退 window.chat', e);
    }

    // 旧全局
    try {
      if (Array.isArray(window.chat)) return window.chat;
    } catch {
      /* ignore */
    }

    // DOM 兜底：扫描 mesid="1" 容器内的楼层文本
    try {
      const nodes = Array.from(
        document.querySelectorAll('[mesid="1"] .message, [mesid="1"] .mes_text, .mes_text')
      );
      if (nodes.length) {
        const arr = nodes
          .map(n => String(n.textContent || '').trim())
          .filter(t => t.length)
          .map(t => ({ mes: t, text: t, content: t, message: t }));
        if (arr.length) return arr;
      }
    } catch { /* ignore */ }

    return [];
  }

  // 解析标签 [好友id|昵称|ID]
  function extractFriendsFromText(text) {
    if (!text || typeof text !== 'string') return [];
    // 兼容 ASCII/全角括号与分隔符，并兼容“好友ID”
    // 说明：无需对 [ 、| 、- 进行多余转义；仅对 ] 在字符类中转义
    const re = /[[【](?:好友id|好友ID)\s*[|｜]\s*([^|\]】]+?)\s*[|｜]\s*([0-9A-Za-z_－-]+)\s*[\]】]/g;
    const found = [];
    let m;
    while ((m = re.exec(text)) !== null) {
      const name = String(m[1] || '').trim();
      const id = String(m[2] || '').trim();
      if (!id) continue;
      found.push({ name, id });
    }
    return found;
  }

  // 标准化消息文本
  function takeMessageText(m) {
    try {
      return String(m?.mes ?? m?.text ?? m?.content ?? m?.message ?? '').trim();
    } catch {
      return '';
    }
  }

  // 刷新当前 UI（按需）
  function refreshCurrentUI() {
    try {
      const phone = window.wechatPhone;
      if (!phone) return;
      phone._ensureState?.();
      const tab = phone.currentTab || 'chat';
      if (tab === 'contacts') {
        phone.renderContacts?.();
      } else if (tab === 'chat') {
        // 刷列表摘要
        phone.renderChatList?.();
      }
      // 尝试覆盖列表示例的摘要（本地叠加）
      try {
        const root = document.getElementById('wechat-content');
        window.wechatLocalStore?.updateList?.(root);
      } catch (e) { /* ignore */ void 0; }
    } catch (e) {
      warn('刷新 UI 失败', e);
    }
  }

  // 一次完整扫描导入
  async function importFromHistoryInternal() {
    const msgs = await getAllMessages();
    if (!msgs.length) {
      return { scanned: 0, added: 0, unique: 0, ids: [] };
    }

    const uniqueIds = new Set();
    let scanned = 0;
    let addedCount = 0;

    for (const m of msgs) {
      const text = takeMessageText(m);
      if (!text) continue;
      scanned += 1;

      // 直接用 wechatLocalStore 的解析器，保证存储结构一致
      try {
        const added = window.wechatLocalStore?.captureFromText?.(text) || [];
        if (Array.isArray(added) && added.length) {
          // 统计唯一 id
          for (const it of added) {
            if (it?.id) uniqueIds.add(String(it.id));
          }
          addedCount += added.length;
        }
      } catch (e) {
        // 兜底：本地解析
        const found = extractFriendsFromText(text);
        if (found.length > 0) {
          // 用 captureFromText 再次写入
          try {
            const r = window.wechatLocalStore?.captureFromText?.(text) || [];
            if (Array.isArray(r) && r.length) {
              for (const it of r) {
                if (it?.id) uniqueIds.add(String(it.id));
              }
              addedCount += r.length;
            }
          } catch (e) { /* ignore */ void 0; }
        }
      }
    }

    // 刷新列表摘要与 UI
    try {
      const root = document.getElementById('wechat-content');
      window.wechatLocalStore?.updateList?.(root);
    } catch (e) { /* ignore */ void 0; }

    refreshCurrentUI();

    return { scanned, added: addedCount, unique: uniqueIds.size, ids: Array.from(uniqueIds) };
  }

  // 为每个会话去重导入：避免重复全量扫描
  function getCurrentChatIdSafe() {
    try {
      const st = getST();
      const id = st?.getCurrentChatId?.() ?? st?.chatId;
      return id !== undefined && id !== null ? String(id) : 'current';
    } catch {
      return 'current';
    }
  }

  async function importIfNeeded() {
    try {
      const chatId = getCurrentChatIdSafe();
      const key = 'wechatImporter.importedMap';
      const raw = localStorage.getItem(key);
      const map = raw ? JSON.parse(raw) : {};
      if (map && map[chatId]) {
        // 已导入过本会话，跳过
        return null;
      }
      const res = await importFromHistoryInternal();
      map[chatId] = { t: Date.now(), unique: res.unique };
      localStorage.setItem(key, JSON.stringify(map));

      log(`自动导入完成：会话 ${chatId}，扫描 ${res.scanned} 条消息，新增标签 ${res.added}（唯一 ${res.unique}）。`);
      return res;
    } catch (e) {
      warn('importIfNeeded 失败', e);
      return null;
    }
  }

  async function forceImport(showDialog = true) {
    try {
      const res = await importFromHistoryInternal();
      // 清理“已导入”标记，允许再次自动判断
      try {
        const chatId = getCurrentChatIdSafe();
        const key = 'wechatImporter.importedMap';
        const raw = localStorage.getItem(key);
        const map = raw ? JSON.parse(raw) : {};
        map[chatId] = { t: Date.now(), unique: res.unique };
        localStorage.setItem(key, JSON.stringify(map));
      } catch (e) { /* ignore */ void 0; }

      const msg = `历史扫描完成：\n- 扫描消息：${res.scanned}\n- 新增标签记录（含重复）：${res.added}\n- 唯一好友ID数：${res.unique}\n- 好友ID：${res.ids.join(', ') || '(无)'}`;
      log(msg);
      if (showDialog) {
        try {
          alert(msg);
        } catch (e) { /* ignore */ void 0; }
      }
      return res;
    } catch (e) {
      warn('forceImport 失败', e);
      try {
        alert('扫描失败，请查看控制台。');
      } catch (e) { /* ignore */ void 0; }
      return null;
    }
  }

  window.wechatImporter = {
    importIfNeeded,
    forceImport,
    // 仅扫描，不写入（调试用）
    async dryRun() {
      const msgs = await getAllMessages();
      let total = 0;
      const ids = new Set();
      for (const m of msgs) {
        const text = takeMessageText(m);
        if (!text) continue;
        const found = extractFriendsFromText(text);
        for (const it of found) {
          ids.add(it.id);
          total += 1;
        }
      }
      const res = { scanned: msgs.length, matched: total, unique: ids.size, ids: Array.from(ids) };
      log('dryRun 结果：', res);
      return res;
    },
  };

  log('Importer 已就绪');
})();
