import { PERF_DEBUG_FLAG, RUNTIME_THRESHOLDS, RUNTIME_PILL_UNITS } from './config.js';

export function safeStorageGet(key) {
  try {
    return window.sessionStorage ? window.sessionStorage.getItem(key) : null;
  } catch (_) {
    return null;
  }
}

export function safeStorageSet(key, value) {
  try {
    if (!window.sessionStorage) return;
    window.sessionStorage.setItem(key, value);
  } catch (_) {}
}

export function safeStorageRemove(key) {
  try {
    if (!window.sessionStorage) return;
    window.sessionStorage.removeItem(key);
  } catch (_) {}
}

export function safeLocalStorageGet(key) {
  try {
    return window.localStorage ? window.localStorage.getItem(key) : null;
  } catch (_) {
    return null;
  }
}

export function safeLocalStorageSet(key, value) {
  try {
    if (!window.localStorage) return;
    window.localStorage.setItem(key, value);
  } catch (_) {}
}

export function safeLocalStorageRemove(key) {
  try {
    if (!window.localStorage) return;
    window.localStorage.removeItem(key);
  } catch (_) {}
}

export function debounce(fn, wait = 250) {
  let timeoutId;
  return function debounced(...args) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn.apply(this, args), wait);
  };
}

export function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function createEl(tag, classNames = '', options = {}) {
  const node = document.createElement(tag);
  if (classNames) node.className = classNames;
  if (options.text !== undefined) node.textContent = options.text;
  if (options.html !== undefined) node.innerHTML = options.html;
  if (options.attrs) {
    Object.entries(options.attrs).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        node.setAttribute(key, value);
      }
    });
  }
  return node;
}

export function shouldLogPerfEvents() {
  if (typeof window === 'undefined') return false;
  const flag = window[PERF_DEBUG_FLAG];
  return flag === true || flag === '1';
}

export function logRenderMetrics(eventName, meta = {}) {
  if (!shouldLogPerfEvents()) return;
  const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  const payload = { ...meta };
  if (payload.startTime !== undefined) {
    const duration = Math.max(0, now - payload.startTime);
    payload.durationMs = Number(duration.toFixed(1));
    delete payload.startTime;
  }
  console.info(`[perf] ${eventName}`, payload);
}

export function findScrollParent(node) {
  let current = node?.parentElement || null;
  while (current && current !== document.body && current !== document.documentElement) {
    const style = window.getComputedStyle(current);
    const overflowY = style?.overflowY || '';
    const isScrollable = /auto|scroll|overlay/i.test(overflowY);
    if (isScrollable) return current;
    current = current.parentElement;
  }
  return null;
}

export function formatLibraryStatNumber(value) {
  const num = Number(value) || 0;
  return num.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

export function getRuntimeThresholdClass(totalMinutes) {
  if (totalMinutes < RUNTIME_THRESHOLDS.MINUTES.max) return 'runtime-minutes';
  if (totalMinutes < RUNTIME_THRESHOLDS.HOURS.max) return 'runtime-hours';
  if (totalMinutes < RUNTIME_THRESHOLDS.DAYS.max) return 'runtime-days';
  if (totalMinutes < RUNTIME_THRESHOLDS.MONTHS.max) return 'runtime-months';
  return 'runtime-years';
}

export function createRuntimePillValueMap() {
  return {
    minutes: 0,
    hours: 0,
    days: 0,
    months: 0,
    years: 0,
  };
}

export function formatRuntimePillNumber(value) {
  const amount = Math.max(0, Math.floor(value));
  if (amount === 0) {
    return '00';
  }
  if (amount < 10) {
    return `<span class="runtime-pill-leading-zero">0</span>${amount}`;
  }
  return amount.toString().padStart(2, '0');
}

export function getRuntimeUnitBreakdown(totalMinutes, realisticTimeMode = false) {
  const minutesPerHour = 60;
  const hoursPerDay = realisticTimeMode ? 7 : 24;
  const minutesPerDay = minutesPerHour * hoursPerDay;
  const minutesPerMonth = minutesPerDay * 28;
  const minutesPerYear = minutesPerMonth * 13;
  let remaining = Math.max(0, Math.floor(totalMinutes));
  const years = Math.floor(remaining / minutesPerYear);
  remaining -= years * minutesPerYear;
  const months = Math.floor(remaining / minutesPerMonth);
  remaining -= months * minutesPerMonth;
  const days = Math.floor(remaining / minutesPerDay);
  remaining -= days * minutesPerDay;
  const hours = Math.floor(remaining / minutesPerHour);
  remaining -= hours * minutesPerHour;
  const minutes = remaining;
  return { minutes, hours, days, months, years };
}

export function renderRuntimePillsDisplay(valueMap = createRuntimePillValueMap(), visibilityMap = {}, activeUnit = null) {
  const pills = [...RUNTIME_PILL_UNITS].reverse().map(({ key, label }) => {
    const isVisible = key === 'minutes' || Boolean(visibilityMap[key]);
    if (!isVisible) return '';
    const isActive = activeUnit === key;
    const valueMarkup = formatRuntimePillNumber(valueMap[key] || 0);
    return `
      <span class="runtime-pill runtime-pill-${key} is-visible${isActive ? ' is-active' : ''}">
        <span class="runtime-pill-value">${valueMarkup}</span>
        <span class="runtime-pill-label">${label}</span>
      </span>
    `;
  }).filter(Boolean).join('');
  return `<span class="runtime-pill-row">${pills}</span>`;
}

export function parseRuntimeMinutes(value) {
  if (value === undefined || value === null) return 0;
  if (typeof value === 'number') {
    return Number.isFinite(value) && value > 0 ? value : 0;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return 0;
    const match = trimmed.match(/(\d+)/);
    if (!match) return 0;
    const parsed = Number(match[1]);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  }
  return 0;
}

export function formatRuntimeDuration(totalMinutes) {
  if (!totalMinutes || totalMinutes <= 0) return '';
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const parts = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  return parts.join(' ');
}

export function normalizeTitleKey(title) {
  if (!title) return '';
  return String(title).trim().toLowerCase().replace(/\s+/g, ' ');
}

export function titleSortKey(title) {
  if (!title) return '';
  const t = String(title).trim().toLowerCase();
  return t.replace(/^(?:the|a|an)\b\s+/, '');
}

export function sanitizeYear(value) {
  if (!value) return '';
  const match = String(value).match(/\d{4}/);
  return match ? match[0] : '';
}

export function extractPrimaryYear(value) {
  if (!value) return '';
  const match = String(value).match(/\d{4}/);
  return match ? match[0] : '';
}

export function sanitizeSeriesOrder(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseSeriesOrder(value) {
  if (value === null || value === undefined) return Infinity;
  const num = Number(value);
  return Number.isFinite(num) ? num : Infinity;
}

export function numericSeriesOrder(value) {
  const parsed = parseSeriesOrder(value);
  return (typeof parsed === 'number' && Number.isFinite(parsed) && parsed !== Infinity) ? parsed : null;
}

export function parseEpisodeValue(value) {
  if (value === undefined || value === null) return 0;
  if (typeof value === 'number') {
    return Number.isFinite(value) && value > 0 ? value : 0;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return 0;
    if (/season/i.test(trimmed) && !/episod|\bep\b/i.test(trimmed)) {
      return 0;
    }
    const match = trimmed.match(/(\d+(?:\.\d+)?)/);
    if (!match) return 0;
    const parsed = Number(match[1]);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  }
  return 0;
}

export function parseActorsList(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.filter(Boolean).map(name => String(name).trim()).filter(Boolean);
  const text = String(raw).trim();
  if (!text) return [];
  return text.split(/,\s*/).map(name => name.trim()).filter(Boolean);
}

export function buildTrailerUrl(title, year) {
  if (!title) return '';
  const query = `${title} ${year ? year + ' ' : ''}trailer`.trim();
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
}

export function arraysShallowEqual(a, b) {
  if (a === b) return true;
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

export function setButtonBusy(btn, busy) {
  if (!btn) return;
  btn.disabled = busy;
  if (busy) {
    btn.dataset.originalText = btn.textContent;
    btn.classList.add('busy');
  } else {
    btn.classList.remove('busy');
    if (btn.dataset.originalText) {
      btn.textContent = btn.dataset.originalText;
      delete btn.dataset.originalText;
    }
  }
}
