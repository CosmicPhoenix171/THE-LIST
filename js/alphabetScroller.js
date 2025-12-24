// Alphabet Scroller - A-Z jump bar for quick navigation
import { titleSortKey } from './utils.js';
import { getUnifiedVirtualController } from './virtualScroller.js';

let alphabetScrollerEl = null;
let currentScrollerItems = [];

export function initAlphabetScroller() {
  alphabetScrollerEl = document.getElementById('alphabet-scroller');
  if (!alphabetScrollerEl) return;
  
  const chars = ['#', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')];
  alphabetScrollerEl.innerHTML = chars.map(char => 
    `<div class="alphabet-scroller-item" data-char="${char}">${char}</div>`
  ).join('');
  
  alphabetScrollerEl.addEventListener('click', (ev) => {
    const target = ev.target.closest('.alphabet-scroller-item');
    if (!target) return;
    const char = target.dataset.char;
    handleAlphabetScroll(char);
  });
}

function getSeriesAwareTitle(item) {
  if (!item) return '';
  if (item.seriesName) return item.seriesName;
  return item.title || '';
}

function handleAlphabetScroll(char) {
  if (!currentScrollerItems.length) return;
  
  const targetChar = char === '#' ? '0' : char.toLowerCase();
  const index = currentScrollerItems.findIndex(entry => {
    const item = entry.displayItem || entry.item;
    const title = getSeriesAwareTitle(item);
    const key = titleSortKey(title);
    if (char === '#') {
      return /^[0-9]/.test(key);
    }
    return key.startsWith(targetChar);
  });
  
  if (index !== -1) {
    const controller = getUnifiedVirtualController();
    if (controller) {
      controller.scrollToIndex(index);
    } else {
      // Fallback for non-virtualized grids
      const combinedListEl = document.getElementById('combined-list');
      const grid = combinedListEl?.querySelector('.movies-grid');
      if (grid && grid.children[index]) {
        const node = grid.children[index];
        const headerOffset = 80;
        const elementPosition = node.getBoundingClientRect().top + window.scrollY;
        window.scrollTo({
          top: elementPosition - headerOffset,
          behavior: 'instant'
        });
      }
    }
  }
}

export function updateAlphabetScroller(items, sortMode) {
  if (!alphabetScrollerEl) return;
  
  // Only show for alphabetical sorting with enough items
  const isAlpha = sortMode === 'alphaAsc' || sortMode === 'alphaDesc' || sortMode === 'default';
  
  if (isAlpha && items.length > 20) {
    alphabetScrollerEl.classList.remove('hidden');
    currentScrollerItems = items;
  } else {
    alphabetScrollerEl.classList.add('hidden');
    currentScrollerItems = [];
  }
}
