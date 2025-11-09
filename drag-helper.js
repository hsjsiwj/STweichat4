// 复制自mobile-main/drag-helper.js的内容
/**
 * 通用拖拽辅助插件
 * 支持PC端和移动端的拖拽功能
 * 确保不影响原有的点击事件
 */

class DragHelper {
  constructor(element, options = {}) {
    this.element = element;
    this.options = {
      boundary: document.body, // 拖拽边界
      clickThreshold: 5, // 移动距离阈值，小于此值视为点击
      dragClass: 'dragging', // 拖拽时添加的CSS类
      savePosition: true, // 是否保存位置
      storageKey: 'drag-position', // localStorage键名
      touchTimeout: 200, // 触摸超时时间（毫秒），超过此时间且未移动则视为长按开始拖拽
      dragHandle: null, // 拖拽手柄选择器，如果指定则只有该元素可以拖拽
      ...options
    };

    this.isDragging = false;
    this.startX = 0;
    this.startY = 0;
    this.startElementX = 0;
    this.startElementY = 0;
    this.moved = false;
    this.startTime = 0;
    this.touchTimer = null;

    this.init();
  }

  init() {
    // 设置元素为可拖拽
    // 不再强制设置position为absolute，尊重元素原有position
    // this.element.style.position = 'absolute';
    this.element.style.cursor = 'grab'; // 默认使用grab光标
    this.element.style.userSelect = 'none';
    this.element.style.webkitUserSelect = 'none';
    this.element.style.mozUserSelect = 'none';
    this.element.style.msUserSelect = 'none';

    // 加载保存的位置
    if (this.options.savePosition) {
      this.loadPosition();
    }

    // 绑定事件
    this.bindEvents();
  }

    bindEvents() {
    // 确定事件绑定的目标元素
    const eventTarget = this.options.dragHandle ?
      this.element.querySelector(this.options.dragHandle) : this.element;

    if (!eventTarget) {
      console.warn('DragHelper: 拖拽手柄元素未找到:', this.options.dragHandle);
      return;
    }

    // PC端事件
    eventTarget.addEventListener('mousedown', this.handleStart.bind(this), { passive: false });
    document.addEventListener('mousemove', this.handleMove.bind(this), { passive: false });
    document.addEventListener('mouseup', this.handleEnd.bind(this), { passive: false });

    // 移动端事件
    eventTarget.addEventListener('touchstart', this.handleStart.bind(this), { passive: false });
    document.addEventListener('touchmove', this.handleMove.bind(this), { passive: false });
    document.addEventListener('touchend', this.handleEnd.bind(this), { passive: false });

    // 防止拖拽时的默认行为
    eventTarget.addEventListener('dragstart', (e) => e.preventDefault());

    // 保存事件目标以便后续销毁
    this.eventTarget = eventTarget;
  }

        handleStart(e) {
    // 如果指定了拖拽手柄，检查是否在手柄上开始拖拽
    if (this.options.dragHandle) {
      const handleElement = this.element.querySelector(this.options.dragHandle);
      if (handleElement && !handleElement.contains(e.target)) {
        return; // 不在拖拽手柄上，忽略事件
      }
    }

    const event = e.type.startsWith('touch') ? e.touches[0] : e;

    this.isDragging = true;
    this.moved = false;
    this.startX = event.clientX;
    this.startY = event.clientY;
    this.startTime = Date.now();

    // 计算当前元素可视位置
    const rect = this.element.getBoundingClientRect();
    this.startElementX = rect.left;
    this.startElementY = rect.top;

    // 关键修复：若元素使用了 transform: translate(...) 实现居中，则在拖拽开始时去除 transform，
    // 同时把当前可视位置固化为 left/top，避免“拖动时位置飘移/跳跃”
    try {
      const computed = window.getComputedStyle(this.element);
      const hasTransform = computed.transform && computed.transform !== 'none';
      // 仅在未设置明确 left/top 时进行固化，避免覆盖已有定位
      const hasLeft = computed.left && computed.left !== 'auto';
      const hasTop = computed.top && computed.top !== 'auto';
      if (hasTransform && (!hasLeft || !hasTop)) {
        // 去除 transform，并将当前位置写入 left/top
        this.element.style.transform = 'none';
        // 对 fixed 元素直接用视口坐标；非 fixed 元素换算为相对 offsetParent 的坐标
        const isFixed = computed.position === 'fixed';
        if (isFixed) {
          this.element.style.left = `${this.startElementX}px`;
          this.element.style.top = `${this.startElementY}px`;
        } else {
          const parentRect = (this.element.offsetParent || document.body).getBoundingClientRect();
          this.element.style.left = `${this.startElementX - parentRect.left}px`;
          this.element.style.top = `${this.startElementY - parentRect.top}px`;
        }
        // 同步拖拽起点
        const newRect = this.element.getBoundingClientRect();
        this.startElementX = newRect.left;
        this.startElementY = newRect.top;
      }
    } catch (fixErr) {
      // 安全忽略
      // console.warn('DragHelper transform fix failed:', fixErr);
    }

    // 清除之前的定时器
    if (this.touchTimer) {
      clearTimeout(this.touchTimer);
      this.touchTimer = null;
    }

    // 只对PC端鼠标事件立即开始拖拽
    if (e.type === 'mousedown') {
      e.preventDefault();
      this.element.classList.add(this.options.dragClass);
      this.element.style.zIndex = '9999';
    } else if (e.type === 'touchstart') {
      // 触摸事件延迟处理，给点击事件一个机会
      this.touchTimer = setTimeout(() => {
        if (this.isDragging && !this.moved) {
          this.element.classList.add(this.options.dragClass);
          this.element.style.zIndex = '9999';
        }
      }, this.options.touchTimeout);
    }
  }

    handleMove(e) {
    if (!this.isDragging) return;

    const event = e.type.startsWith('touch') ? e.touches[0] : e;

    const deltaX = event.clientX - this.startX;
    const deltaY = event.clientY - this.startY;

    // 检查是否移动超过阈值
    if (!this.moved && (Math.abs(deltaX) > this.options.clickThreshold || Math.abs(deltaY) > this.options.clickThreshold)) {
      this.moved = true;
      // 确认开始拖拽，添加视觉反馈并阻止默认行为
      e.preventDefault();
      this.element.classList.add(this.options.dragClass);
      this.element.style.zIndex = '9999';

      // 清除触摸定时器
      if (this.touchTimer) {
        clearTimeout(this.touchTimer);
        this.touchTimer = null;
      }
    }

    if (this.moved) {
      // 继续阻止默认行为以避免滚动等干扰
      e.preventDefault();

      const newX = this.startElementX + deltaX;
      const newY = this.startElementY + deltaY;

      // 边界检查
      const boundedPosition = this.constrainToBoundary(newX, newY);

      this.element.style.left = boundedPosition.x + 'px';
      this.element.style.top = boundedPosition.y + 'px';
    }
  }

  handleEnd(e) {
    if (!this.isDragging) return;

    // 清除触摸定时器
    if (this.touchTimer) {
      clearTimeout(this.touchTimer);
      this.touchTimer = null;
    }

    this.isDragging = false;
    this.element.classList.remove(this.options.dragClass);

    // 如果没有移动超过阈值，不阻止点击事件
    if (!this.moved) {
      this.element.style.zIndex = ''; // 恢复原始z-index
      // 对于触摸事件，如果时间很短且没有移动，确保点击事件能正常触发
      if (e.type === 'touchend') {
        const touchDuration = Date.now() - this.startTime;
        if (touchDuration < this.options.touchTimeout) {
          // 短触摸，让点击事件正常执行
          return;
        }
      }
      return;
    }

    // 保存位置
    if (this.options.savePosition && this.moved) {
      this.savePosition();
    }

    // 延迟恢复z-index，确保拖拽动画完成
    setTimeout(() => {
      this.element.style.zIndex = '';
    }, 100);

    // 如果移动了，阻止后续的点击事件
    if (this.moved) {
      const preventClick = (event) => {
        event.stopPropagation();
        event.preventDefault();
        this.element.removeEventListener('click', preventClick, true);
      };
      this.element.addEventListener('click', preventClick, true);
    }
  }

  constrainToBoundary(x, y) {
    const boundary = this.options.boundary;
    const elementRect = this.element.getBoundingClientRect();
    const boundaryRect = boundary.getBoundingClientRect();

    // 获取元素的当前定位类型
    const computedStyle = window.getComputedStyle(this.element);
    const isFixed = computedStyle.position === 'fixed';

    // 如果是fixed定位，则相对于视口计算边界
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight;

    let minX, minY, maxX, maxY;

    if (isFixed) {
        minX = 0;
        minY = 0;
        maxX = viewportWidth - elementRect.width;
        maxY = viewportHeight - elementRect.height;
    } else {
        // 否则，相对于其offsetParent计算（通常是body）
        minX = boundaryRect.left;
        minY = boundaryRect.top;
        maxX = boundaryRect.right - elementRect.width;
        maxY = boundaryRect.bottom - elementRect.height;
    }

    // 确保元素不会超出边界
    let finalX = Math.max(minX, Math.min(maxX, x));
    let finalY = Math.max(minY, Math.min(maxY, y));

    // 如果元素是fixed定位，并且其父元素是body，则直接设置left/top
    // 否则，需要计算相对于父元素的偏移
    if (isFixed && this.element.offsetParent === document.body) {
        return {
            x: finalX,
            y: finalY
        };
    } else {
        // 对于非fixed或有其他offsetParent的元素，需要计算相对于其offsetParent的left/top
        const parentRect = this.element.offsetParent.getBoundingClientRect();
        return {
            x: finalX - parentRect.left,
            y: finalY - parentRect.top
        };
    }
  }

  savePosition() {
    if (!this.options.savePosition) return;

    const rect = this.element.getBoundingClientRect();
    const position = {
      left: rect.left,
      top: rect.top
    };

    try {
      localStorage.setItem(this.options.storageKey, JSON.stringify(position));
    } catch (error) {
      console.warn('无法保存拖拽位置:', error);
    }
  }

  loadPosition() {
    if (!this.options.savePosition) return;

    try {
      const saved = localStorage.getItem(this.options.storageKey);
      if (saved) {
        const position = JSON.parse(saved);

        // 验证位置是否仍然有效
        const boundedPosition = this.constrainToBoundary(position.left, position.top);

        this.element.style.left = boundedPosition.x + 'px';
        this.element.style.top = boundedPosition.y + 'px';
      }
    } catch (error) {
      console.warn('无法加载拖拽位置:', error);
    }
  }

      // 销毁拖拽功能
  destroy() {
    // 清除定时器
    if (this.touchTimer) {
      clearTimeout(this.touchTimer);
      this.touchTimer = null;
    }

    // 使用保存的事件目标进行清理
    const target = this.eventTarget || this.element;

    target.removeEventListener('mousedown', this.handleStart);
    document.removeEventListener('mousemove', this.handleMove);
    document.removeEventListener('mouseup', this.handleEnd);

    target.removeEventListener('touchstart', this.handleStart);
    document.removeEventListener('touchmove', this.handleMove);
    document.removeEventListener('touchend', this.handleEnd);

    target.removeEventListener('dragstart', (e) => e.preventDefault());

    target.style.cursor = '';
    target.classList.remove(this.options.dragClass);
    target.style.zIndex = '';

    this.eventTarget = null;
  }

  // 静态方法：为元素快速添加拖拽功能
  static makeDraggable(element, options = {}) {
    return new DragHelper(element, options);
  }
}

// 导出到全局作用域
window.DragHelper = DragHelper;
