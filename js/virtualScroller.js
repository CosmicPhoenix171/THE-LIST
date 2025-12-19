import { VIRTUALIZATION_OVERSCAN, DEFAULT_VIRTUAL_ROW_HEIGHT } from './config.js';
import { findScrollParent } from './utils.js';

const virtualListControllers = new Map();
let unifiedVirtualController = null;

export class VirtualScroller {
  constructor(container, options = {}) {
    this.container = container;
    this.renderItem = options.renderItem;
    this.estimateHeight = Math.max(options.estimateHeight || DEFAULT_VIRTUAL_ROW_HEIGHT, 120);
    this.overscan = Math.max(options.overscan ?? VIRTUALIZATION_OVERSCAN, 2);
    this.hostClass = options.hostClass || '';
    this.onItemsRendered = options.onItemsRendered || null;
    this.scrollTarget = options.scrollTarget || findScrollParent(container) || window;
    this.averageHeight = this.estimateHeight;
    this.items = [];
    this.startIndex = 0;
    this.endIndex = 0;
    this.measureHandle = null;
    this.isDestroyed = false;
    this.itemsPerRow = 1;
    this.rowObserver = null;
    this.ignoreNextScroll = false;
    
    this.setupDom();
    this.bindEvents();
  }

  setupDom() {
    if (!this.container) return;
    this.container.classList.add('virtual-scroll-root');
    this.container.style.overflowAnchor = 'none';

    this.topSpacer = document.createElement('div');
    this.bottomSpacer = document.createElement('div');
    this.itemsHost = document.createElement('div');
    this.topSensor = document.createElement('div');
    this.bottomSensor = document.createElement('div');
    if (this.hostClass) {
      this.itemsHost.className = this.hostClass;
    }
    this.topSensor.className = 'virtual-scroll-sensor';
    this.bottomSensor.className = 'virtual-scroll-sensor';
    this.topSensor.style.height = '1px';
    this.bottomSensor.style.height = '1px';
    this.topSpacer.className = 'virtual-scroll-spacer';
    this.bottomSpacer.className = 'virtual-scroll-spacer';
    this.itemsHost.dataset.virtualHost = 'true';
    this.itemsHost.style.contain = 'layout paint';
    this.itemsHost.style.contentVisibility = 'auto';
    this.container.innerHTML = '';
    this.container.appendChild(this.topSensor);
    this.container.appendChild(this.topSpacer);
    this.container.appendChild(this.itemsHost);
    this.container.appendChild(this.bottomSpacer);
    this.container.appendChild(this.bottomSensor);
  }

  bindEvents() {
    this.handleScroll = this.handleScroll.bind(this);
    this.handleResize = this.handleResize.bind(this);
    const target = this.scrollTarget || window;
    target.addEventListener('scroll', this.handleScroll, { passive: true });
    if (target !== window) {
      window.addEventListener('scroll', this.handleScroll, { passive: true });
    }
    window.addEventListener('resize', this.handleResize, { passive: true });
    if (window.ResizeObserver && this.container) {
      this.resizeObserver = new ResizeObserver(() => this.scheduleRender(true));
      this.resizeObserver.observe(this.container);
      if (target instanceof Element) {
        this.resizeObserver.observe(target);
      }
    }
    this.setupObservers();
  }

  unbindEvents() {
    const target = this.scrollTarget || window;
    target.removeEventListener('scroll', this.handleScroll);
    if (target !== window) {
      window.removeEventListener('scroll', this.handleScroll);
    }
    window.removeEventListener('resize', this.handleResize);
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    this.teardownObservers();
  }

  handleScroll() {
    if (this.ignoreNextScroll) {
      this.ignoreNextScroll = false;
      return;
    }
    this.scheduleRender();
  }

  handleResize() {
    this.scheduleRender();
  }

  scrollToIndex(index) {
    if (index < 0 || index >= this.items.length) return;
    const itemsPerRow = Math.max(1, this.itemsPerRow || 1);
    const row = Math.floor(index / itemsPerRow);
    
    const rect = this.container.getBoundingClientRect();
    const target = this.scrollTarget || window;
    
    const containerTop = rect.top + (target === window ? (window.scrollY || document.documentElement.scrollTop) : 0);
    
    if (target === window) {
      const scrollTop = window.scrollY || document.documentElement.scrollTop;
      const absoluteTop = rect.top + scrollTop;
      window.scrollTo({ top: absoluteTop + (row * this.averageHeight), behavior: 'auto' });
    } else {
      target.scrollTop = row * this.averageHeight;
    }
    
    this.scheduleRender(true);
  }

  destroy() {
    this.isDestroyed = true;
    this.unbindEvents();
    if (this.measureHandle) {
      cancelAnimationFrame(this.measureHandle);
      this.measureHandle = null;
    }
    if (this.container) {
      this.container.classList.remove('virtual-scroll-root');
      this.container.innerHTML = '';
    }
  }

  setItems(entries = []) {
    this.items = Array.isArray(entries) ? entries : [];
    this.startIndex = 0;
    this.endIndex = 0;
    this.updateSpacers();
    this.scheduleRender(true);
  }

  setupObservers() {
    if (!this.topSensor || !this.bottomSensor) return;
    if (this.rowObserver) this.rowObserver.disconnect();
    const options = { root: null, rootMargin: '600px 0px 600px 0px', threshold: 0 };
    this.rowObserver = new IntersectionObserver((entries) => {
      if (this.isDestroyed) return;
      for (const entry of entries) {
        if (entry.isIntersecting) {
          this.scheduleRender();
          break;
        }
      }
    }, options);
    this.rowObserver.observe(this.topSensor);
    this.rowObserver.observe(this.bottomSensor);
  }

  teardownObservers() {
    if (this.rowObserver) {
      this.rowObserver.disconnect();
      this.rowObserver = null;
    }
  }

  scheduleRender(force = false) {
    if (this.isDestroyed) return;
    this.renderVisibleRange();
  }

  getViewportOffsets() {
    const rect = this.container.getBoundingClientRect();
    const target = this.scrollTarget || window;
    if (target === window) {
      const scrollY = window.scrollY || window.pageYOffset || document.documentElement.scrollTop || 0;
      const top = rect.top + scrollY;
      const bottom = top + rect.height;
      return { top, bottom };
    }
    const targetRect = target.getBoundingClientRect();
    const scrollTop = target.scrollTop || 0;
    const top = rect.top - targetRect.top + scrollTop;
    const bottom = top + rect.height;
    return { top, bottom };
  }

  getViewportRange() {
    const target = this.scrollTarget || window;
    if (target === window) {
      const scrollTop = window.scrollY || window.pageYOffset || document.documentElement.scrollTop || 0;
      const height = window.innerHeight || document.documentElement.clientHeight || 0;
      return { top: scrollTop, bottom: scrollTop + height };
    }
    const scrollTop = target.scrollTop || 0;
    const height = target.clientHeight || 0;
    return { top: scrollTop, bottom: scrollTop + height };
  }

  renderVisibleRange() {
    if (!this.container || !this.items.length) {
      this.itemsHost.innerHTML = '';
      this.updateSpacers();
      this.onItemsRendered?.(0, 0, []);
      return;
    }

    const rect = this.container.getBoundingClientRect();
    const zeroHeight = !rect || rect.height <= 0;
    if (zeroHeight) {
      this.startIndex = 0;
      this.endIndex = Math.min(this.items.length, Math.max(60, this.overscan * 8));
      this.renderWindow();
      return;
    }

    const { top: viewportTop, bottom: viewportBottom } = this.getViewportRange();
    const { top: containerTop, bottom: containerBottom } = this.getViewportOffsets();
    const startBoundary = Math.max(viewportTop, containerTop);
    const endBoundary = Math.min(viewportBottom, containerBottom);
    const relativeTop = Math.max(0, startBoundary - containerTop);
    const relativeBottom = Math.max(relativeTop + this.estimateHeight, endBoundary - containerTop);
    const itemsPerRow = Math.max(1, this.itemsPerRow || 1);
    const safeRowHeight = Math.max(1, this.averageHeight * 0.9);
    
    const totalRows = Math.max(1, Math.ceil(this.items.length / itemsPerRow));
    const visibleRows = Math.max(1, Math.ceil((relativeBottom - relativeTop) / safeRowHeight));
    
    const effectiveOverscan = Math.max(this.overscan, 4);
    
    const startRow = Math.max(0, Math.floor(relativeTop / this.averageHeight) - effectiveOverscan);
    let endRow = Math.min(totalRows, startRow + visibleRows + (effectiveOverscan * 2));
    if (relativeBottom >= containerBottom - containerTop) {
      endRow = totalRows;
    }
    const nextStart = Math.max(0, startRow * itemsPerRow);
    const nextEnd = Math.min(this.items.length, endRow * itemsPerRow);

    if (nextStart === this.startIndex && nextEnd === this.endIndex) {
      return;
    }

    this.startIndex = nextStart;
    this.endIndex = nextEnd;
    this.renderWindow();
  }

  renderWindow() {
    if (!this.itemsHost) return;
    this.itemsHost.innerHTML = '';
    if (this.startIndex >= this.endIndex) {
      this.updateSpacers();
      this.onItemsRendered?.(0, 0, []);
      return;
    }

    const fragment = document.createDocumentFragment();
    for (let i = this.startIndex; i < this.endIndex; i++) {
      const entry = this.items[i];
      if (!entry) continue;
      const node = this.renderItem(entry, i);
      if (!node) continue;
      node.dataset.virtualIndex = String(i);
      fragment.appendChild(node);
    }
    this.itemsHost.appendChild(fragment);
    this.updateLayoutMetrics();
    this.updateSpacers();
    this.measureRenderedHeights();
    this.onItemsRendered?.(this.startIndex, this.endIndex, Array.from(this.itemsHost.children));
  }

  updateSpacers() {
    const itemsPerRow = Math.max(1, this.itemsPerRow || 1);
    const totalRows = Math.max(1, Math.ceil(this.items.length / itemsPerRow));
    const startRow = Math.floor(this.startIndex / itemsPerRow);
    const endRow = Math.ceil(this.endIndex / itemsPerRow);
    const before = startRow * this.averageHeight;
    const after = Math.max((totalRows - endRow) * this.averageHeight, 0);
    if (this.topSpacer) {
      this.topSpacer.style.height = before ? `${before}px` : '0px';
    }
    if (this.bottomSpacer) {
      this.bottomSpacer.style.height = after ? `${after}px` : '0px';
    }
  }

  updateLayoutMetrics() {
    if (!this.itemsHost) return;
    const hostWidth = this.itemsHost.getBoundingClientRect().width || 0;
    let sample = this.itemsHost.firstElementChild;
    if (sample && sample.getBoundingClientRect().width === 0 && this.itemsHost.children.length > 1) {
       sample = this.itemsHost.children[1];
    }
    
    const sampleWidth = sample ? sample.getBoundingClientRect().width : 0;
    const nextPerRow = sampleWidth && hostWidth ? Math.max(1, Math.floor(hostWidth / sampleWidth)) : 1;
    this.itemsPerRow = nextPerRow;
  }

  measureRenderedHeights() {
    if (!this.itemsHost || !this.itemsHost.children.length) return;
    
    if (this.measureHandle) cancelAnimationFrame(this.measureHandle);
    this.measureHandle = requestAnimationFrame(() => {
      if (!this.itemsHost || !this.itemsHost.children.length) return;
      
      this.updateLayoutMetrics();

      let total = 0;
      const nodes = Array.from(this.itemsHost.children);
      let validNodes = 0;
      
      nodes.forEach(node => {
        if (node && node.offsetHeight > 0) {
          total += node.offsetHeight;
          validNodes++;
        }
      });
      
      if (!validNodes) return;
      
      const avgItemHeight = total / validNodes;
      
      const oldAverage = this.averageHeight;
      const alpha = 0.1; 
      this.averageHeight = (oldAverage * (1 - alpha)) + (avgItemHeight * alpha);
      
      const itemsPerRow = Math.max(1, this.itemsPerRow || 1);
      const startRow = Math.floor(this.startIndex / itemsPerRow);
      const heightDelta = (this.averageHeight - oldAverage) * startRow;

      this.updateSpacers();

      if (Math.abs(heightDelta) > 0.5) {
        const target = this.scrollTarget || window;
        
        this.ignoreNextScroll = true;
      
        requestAnimationFrame(() => {
            if (target === window) {
              window.scrollBy(0, heightDelta);
            } else {
              target.scrollTop += heightDelta;
            }
            
            setTimeout(() => {
              this.ignoreNextScroll = false;
            }, 50);
        });
      }
    });
  }
}

export function getVirtualListController(key) {
  return virtualListControllers.get(key) || null;
}

export function ensureVirtualListController(key, container, options) {
  if (!container) return null;
  let controller = virtualListControllers.get(key);
  if (controller && controller.container !== container) {
    controller.destroy();
    controller = null;
  }
  if (!controller) {
    controller = new VirtualScroller(container, options);
    virtualListControllers.set(key, controller);
  }
  return controller;
}

export function destroyVirtualListController(key) {
  const existing = virtualListControllers.get(key);
  if (existing) {
    existing.destroy();
    virtualListControllers.delete(key);
  }
}

export function ensureUnifiedVirtualizer(container, options) {
  if (!container) return null;
  if (unifiedVirtualController && unifiedVirtualController.container !== container) {
    unifiedVirtualController.destroy();
    unifiedVirtualController = null;
  }
  if (!unifiedVirtualController) {
    unifiedVirtualController = new VirtualScroller(container, options);
  }
  return unifiedVirtualController;
}

export function destroyUnifiedVirtualizer() {
  if (unifiedVirtualController) {
    unifiedVirtualController.destroy();
    unifiedVirtualController = null;
  }
}

export function getUnifiedVirtualController() {
  return unifiedVirtualController;
}
