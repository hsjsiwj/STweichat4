/**
 * WeChat Extension - Context Sync v2 (Multi-chat Aggregation)
 * 目标：
 * - 从 SillyTavern 安全获取“当前会话”消息，并基于角色列表生成“多会话聚合”占位
 * - wechatContext: { chats: ChatItem[], messagesByChatId: Record<string, Msg[]>, ready, lastUpdated }
 * - 每次仅精准拉取“当前会话”的消息，其它会话先以占位摘要呈现（后续可按需增量拉取）
 *
 * ChatItem: { id, name, last, time, unread, avatar }
 * Msg: { from: 'me'|'other', text: string, ts?: number }
 */

/* global SillyTavern */
(function () {
  // 全局上下文对象（若不存在则创建）
  if (!window.wechatContext) {
    window.wechatContext = {
      chats: [],
      messagesByChatId: {},
      ready: false,
      lastUpdated: 0,
      _timer: null,
    };
  }
  const ctx = window.wechatContext;

  // 时间格式（近似微信）
  function formatTime(date) {
    try {
      const now = new Date();
      const isSameDay =
        date.getFullYear() === now.getFullYear() &&
        date.getMonth() === now.getMonth() &&
        date.getDate() === now.getDate();

      if (isSameDay) {
        return date.toLocaleTimeString('zh-CN', { hour12: false, hour: '2-digit', minute: '2-digit' });
      }

      const diff = now - date;
      if (diff > 0 && diff < 86400000) return '昨天';
      return `${date.getMonth() + 1}/${date.getDate()}`;
    } catch {
      return '刚刚';
    }
  }

  // 获取 ST 上下文
  function getSTContext() {
    try {
      return window.SillyTavern?.getContext?.() || null;
    } catch {
      return null;
    }
  }

  // 拉取“当前会话”的消息：优先用新 API，失败回退 window.chat
  async function fetchCurrentMessages() {
    const st = getSTContext();

    // 新 API
    try {
      if (st?.getCurrentChatMessages) {
        const arr = await st.getCurrentChatMessages();
        if (Array.isArray(arr)) return arr;
      }
    } catch {
      /* 忽略，回退 */
    }

    // 回退变量
    try {
      if (Array.isArray(window.chat)) return window.chat;
    } catch {
      /* 忽略 */
    }

    return [];
  }

  // 消息标准化
  function normalizeMessages(rawList) {
    const result = [];

    for (const m of rawList || []) {
      const isUser =
        m?.is_user === true ||
        m?.isUser === true ||
        m?.role === 'user' ||
        m?.name === 'You' ||
        m?.user === true ||
        m?.author === 'user';

      const text = String(m?.mes ?? m?.text ?? m?.content ?? m?.message ?? '').trim();
      const ts =
        (typeof m?.date === 'number' && m.date) ||
        (typeof m?.ts === 'number' && m.ts) ||
        Date.now();

      if (text || isUser !== undefined) {
        result.push({ from: isUser ? 'me' : 'other', text, ts });
      }
    }

    if (!result.length) {
      result.push({ from: 'other', text: '（暂无消息）', ts: Date.now() - 60000 });
    }

    return result;
  }

  /**
   * 生成“多会话聚合”：
   * - 当前会话（置顶，带摘要/时间）
   * - 角色列表映射为其它会话（占位，无摘要时间）
   */
  function buildAggregationV2(currentMessages, st) {
    const currentChatId = String(st?.getCurrentChatId?.() || 'current');
    const currentName =
      st?.characters?.[st?.characterId]?.name ||
      st?.currentCharacter?.name ||
      '当前会话';

    const last = currentMessages[currentMessages.length - 1] || null;
    const currentChatItem = {
      id: currentChatId,
      name: String(currentName),
      last: String(last?.text || ''),
      time: formatTime(new Date(last?.ts || Date.now())),
      unread: 0,
      avatar: '🟢',
    };

    const chats = [currentChatItem];

    // 基于“角色列表”生成其它会话占位
    try {
      const chars = st?.characters;
      if (chars) {
        const entries = Array.isArray(chars)
          ? chars.map((c, idx) => [String(idx), c])
          : Object.entries(chars);

        for (const [cid, cobj] of entries) {
          const name = cobj?.name || `角色 ${cid}`;
          const charChatId = `char:${cid}`;

          // 避免与当前会话重复
          if (charChatId === currentChatId || name === currentName) continue;

          chats.push({
            id: charChatId,
            name: String(name),
            last: '',
            time: '',
            unread: 0,
            avatar: '🟡',
          });
        }
      }
    } catch {
      /* 忽略 */
    }

    // 去重（按 id）
    const uniq = [];
    const seen = new Set();
    for (const c of chats) {
      if (seen.has(c.id)) continue;
      seen.add(c.id);
      uniq.push(c);
    }

    // 排序：当前会话置顶，其余按名称排序
    const sorted = [uniq[0]].concat(
      uniq.slice(1).sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
    );

    // messagesMap：仅当前会话带有实际消息，其他为占位（可延后按需拉取）
    const messagesMap = { [currentChatId]: currentMessages };

    return { chats: sorted, currentChatId, messagesMap };
  }

  // 浅比较 chat 列表
  function shallowEqualChats(a = [], b = []) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      const x = a[i];
      const y = b[i];
      if (!x || !y) return false;
      if (
        x.id !== y.id ||
        x.name !== y.name ||
        x.last !== y.last ||
        x.time !== y.time ||
        x.unread !== y.unread
      ) {
        return false;
      }
    }
    return true;
  }

  // 单次同步
  async function syncOnce() {
    try {
      const st = getSTContext();
      const rawMsgs = await fetchCurrentMessages();
      const msgs = normalizeMessages(rawMsgs);

      const { chats, currentChatId, messagesMap } = buildAggregationV2(msgs, st || {});

      const prevChats = ctx.chats || [];
      const nextChats = chats;

      const prevMsgs = (ctx.messagesByChatId && ctx.messagesByChatId[currentChatId]) || [];
      const msgsChanged = JSON.stringify(prevMsgs) !== JSON.stringify(msgs);
      const chatsChanged = !shallowEqualChats(prevChats, nextChats);

      if (msgsChanged || chatsChanged || !ctx.ready) {
        ctx.chats = nextChats;
        ctx.messagesByChatId = { ...ctx.messagesByChatId, ...messagesMap };
        ctx.ready = true;
        ctx.lastUpdated = Date.now();

        document.dispatchEvent(
          new CustomEvent('wechat-context-updated', {
            detail: { chatId: currentChatId, chats: ctx.chats, messages: msgs },
          })
        );
      }
    } catch (e) {
      // 静默失败，保留上一次数据
      // console.warn('[WeChat ContextSync] 同步失败：', e);
    }
  }

  // 启动/停止轮询
  function startLoop(interval = 3000) {
    if (ctx._timer) return;
    ctx._timer = setInterval(syncOnce, interval);
    syncOnce(); // 立即跑一轮
  }
  function stopLoop() {
    if (ctx._timer) {
      clearInterval(ctx._timer);
      ctx._timer = null;
    }
  }

  // 导出方法
  window.initContextSync = function initContextSync() {
    const st = getSTContext();
    const interval =
      st?.extensionSettings?.wechat_simulator?.monitorInterval || 3000;
    startLoop(interval);
  };
  window.refreshWeChatContext = function refreshWeChatContext() {
    return syncOnce();
  };
  window.stopWeChatContextSync = function stopWeChatContextSync() {
    stopLoop();
  };
})();
