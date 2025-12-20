// Franchise Management Module
// Handles franchise loading, display, drag-drop reordering, and library matching
import { 
  FRANCHISE_MEDIA_LABELS, 
  FRANCHISE_NORMALIZE_MIGRATION_KEY,
  PRIMARY_LIST_TYPES,
  DRAG_SCROLL_EDGE_PX,
  DRAG_SCROLL_STEP_PX
} from './config.js';
import { 
  createEl, 
  extractPrimaryYear, 
  safeLocalStorageGet, 
  safeLocalStorageSet,
  sanitizeYear,
  normalizeTitleKey,
  titleSortKey,
  parseRuntimeMinutes,
  parseEpisodeValue
} from './utils.js';
import { 
  franchiseSectionEl, 
  franchiseShelfEl, 
  franchiseMetaEl, 
  franchiseSortYearBtn 
} from './dom.js';
import { 
  listCaches, 
  finishedCaches, 
  currentUser 
} from './state.js';
import { getFirebaseDatabase } from './firebase.js';
import {
  ref,
  onValue,
  update,
  set,
  get
} from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-database.js';

// ============================================
// STATE
// ============================================
const franchiseState = {
  loaded: false,
  records: [],
};

let franchiseSortMode = 'default';

const franchiseDragState = {
  activeEntryId: null,
  activeFranchiseId: null,
  activeTrack: null,
  placeholder: null,
};

let franchiseDragEventsBound = false;
let franchiseWheelUnsubscribe = null;
const listeners = {};

// ============================================
// GETTERS/SETTERS
// ============================================
export function getFranchiseState() {
  return franchiseState;
}

export function getFranchiseSortMode() {
  return franchiseSortMode;
}

export function setFranchiseSortMode(mode) {
  franchiseSortMode = mode;
}

export function isFranchiseLoaded() {
  return franchiseState.loaded;
}

export function getFranchiseRecords() {
  return franchiseState.records;
}

export function setFranchiseRecords(records) {
  franchiseState.records = records;
}

export function setFranchiseLoaded(value) {
  franchiseState.loaded = value;
}

// ============================================
// LOAD FRANCHISES FROM FIREBASE
// ============================================
export function loadFranchises() {
  const db = getFirebaseDatabase();
  if (listeners.franchises) {
    listeners.franchises();
    delete listeners.franchises;
  }
  if (!currentUser || !db) {
    resetFranchiseSection();
    return;
  }
  if (franchiseShelfEl) {
    franchiseShelfEl.innerHTML = '<div class="franchise-empty small">Loading franchises...</div>';
  }
  const path = ref(db, `users/${currentUser.uid}/franchises`);
  const off = onValue(path, (snap) => {
    const raw = snap.val() || {};
    franchiseState.records = normalizeFranchiseCollection(raw);
    franchiseState.loaded = true;
    renderFranchiseShelf();
    refreshFranchiseLibraryMatches();
    runFranchiseNormalizationMigrationOnce();
  }, (err) => {
    console.warn('Franchise load failed', err);
    franchiseState.loaded = true;
    if (franchiseShelfEl) {
      franchiseShelfEl.innerHTML = '<div class="franchise-empty small">Unable to load franchises.</div>';
    }
    updateFranchiseMeta([]);
  });
  listeners.franchises = off;
}

export function resetFranchiseSection() {
  franchiseState.loaded = false;
  franchiseState.records = [];
  franchiseSortMode = 'default';
  if (franchiseSectionEl) {
    franchiseSectionEl.classList.add('hidden');
  }
  if (franchiseShelfEl) {
    franchiseShelfEl.innerHTML = '';
  }
  if (franchiseMetaEl) {
    franchiseMetaEl.innerHTML = '';
  }
}

// ============================================
// FRANCHISE YEAR HELPERS
// ============================================
export function getFranchiseYear(record) {
  if (!record || !Array.isArray(record.entries)) return 9999;
  let minYear = 9999;
  record.entries.forEach(entry => {
    const year = parseInt(extractPrimaryYear(entry.year || entry.releaseDate || ''), 10);
    if (year && year < minYear) minYear = year;
  });
  return minYear;
}

// ============================================
// RENDER FRANCHISE SHELF
// ============================================
export function renderFranchiseShelf(callbacks = {}) {
  updateFranchiseMeta(franchiseState.records);
  
  if (!franchiseState.loaded) {
    return;
  }
  
  let records = franchiseState.records || [];
  
  if (franchiseSortMode === 'yearAsc') {
    records = records.slice().sort((a, b) => getFranchiseYear(a) - getFranchiseYear(b));
  } else if (franchiseSortMode === 'yearDesc') {
    records = records.slice().sort((a, b) => getFranchiseYear(b) - getFranchiseYear(a));
  }
  
  if (!franchiseShelfEl) return;
  
  franchiseShelfEl.innerHTML = '';
  
  if (!records.length) {
    if (franchiseSectionEl) {
      franchiseSectionEl.classList.add('hidden');
    }
    return;
  }
  
  if (franchiseSectionEl) {
    franchiseSectionEl.classList.remove('hidden');
  }
  
  ensureFranchiseDragEvents();
  
  records.forEach(record => {
    const card = buildFranchiseCard(record);
    if (card) {
      franchiseShelfEl.appendChild(card);
    }
  });
}

// ============================================
// UPDATE FRANCHISE META
// ============================================
export function updateFranchiseMeta(records) {
  if (!franchiseMetaEl) return;
  franchiseMetaEl.innerHTML = '';
  if (!franchiseState.loaded || !records || !records.length) return;
  
  const totalFranchises = records.length;
  const totalEntries = records.reduce((sum, r) => sum + (Array.isArray(r.entries) ? r.entries.length : 0), 0);
  
  franchiseMetaEl.appendChild(buildFranchiseMetaPill(totalFranchises, 'Franchises'));
  franchiseMetaEl.appendChild(buildFranchiseMetaPill(totalEntries, 'Entries'));
}

export function buildFranchiseMetaPill(value, label) {
  const pill = createEl('span', 'franchise-meta-pill');
  pill.appendChild(createEl('span', 'franchise-meta-value', { text: String(value) }));
  pill.appendChild(createEl('span', 'franchise-meta-label', { text: label }));
  return pill;
}

// ============================================
// BUILD FRANCHISE CARD
// ============================================
export function buildFranchiseCard(record) {
  if (!record) return null;
  const card = createEl('article', 'franchise-card');
  const header = createEl('div', 'franchise-card-header');
  const titleBlock = createEl('div', 'franchise-card-title-block');
  const title = createEl('h3', 'franchise-card-title', { text: record.name || 'Franchise' });
  titleBlock.appendChild(title);
  if (record.tagline) {
    titleBlock.appendChild(createEl('p', 'franchise-card-subtitle', { text: record.tagline }));
  } else if (record.synopsis) {
    titleBlock.appendChild(createEl('p', 'franchise-card-subtitle', { text: record.synopsis }));
  }
  header.appendChild(titleBlock);

  const metaRow = createEl('div', 'franchise-card-meta');
  const totalEntries = record.stats?.totalEntries ?? record.entries.length;
  metaRow.appendChild(buildFranchiseMetaPill(totalEntries, totalEntries === 1 ? 'Entry' : 'Entries'));
  const tracked = record.stats?.libraryMatches || 0;
  if (tracked > 0) {
    metaRow.appendChild(buildFranchiseMetaPill(tracked, 'Tracked'));
  }
  const remaining = record.stats?.remainingCount || Math.max(totalEntries - (record.stats?.finishedCount || 0), 0);
  if (remaining > 0) {
    metaRow.appendChild(buildFranchiseMetaPill(remaining, 'Remaining'));
  }
  header.appendChild(metaRow);
  card.appendChild(header);

  card.appendChild(buildFranchiseTimeline(record));
  return card;
}

// ============================================
// BUILD FRANCHISE TIMELINE
// ============================================
export function buildFranchiseTimeline(record) {
  const wrapper = createEl('div', 'franchise-timeline');
  if (!Array.isArray(record.entries) || !record.entries.length) {
    wrapper.appendChild(createEl('div', 'franchise-empty small', { text: 'No timeline entries yet.' }));
    return wrapper;
  }
  const track = createEl('div', 'franchise-track');
  track.dataset.franchiseId = record.id || '';
  record.entries.forEach((entry, index) => {
    const node = buildFranchiseTimelineEntry(record, entry, index);
    if (node) track.appendChild(node);
  });
  if (!track.childElementCount) {
    wrapper.appendChild(createEl('div', 'franchise-empty small', { text: 'No timeline entries yet.' }));
    return wrapper;
  }
  wrapper.appendChild(track);
  return wrapper;
}

// ============================================
// BUILD FRANCHISE TIMELINE ENTRY
// ============================================
export function buildFranchiseTimelineEntry(record, entry, index) {
  if (!entry) return null;
  const entryEl = createEl('div', 'franchise-entry');
  entryEl.classList.add(`media-${entry.mediaType || 'movie'}`);
  if (entry.isFinished) entryEl.classList.add('is-finished');
  if (entry.libraryMatch) entryEl.classList.add('in-library');
  entryEl.dataset.entryId = entry.id || '';
  entryEl.dataset.franchiseId = record?.id || '';
  entryEl.setAttribute('draggable', 'true');

  const header = createEl('div', 'franchise-entry-header');
  const orderLabel = resolveFranchiseEntryOrderLabel(record, entry, index);
  if (orderLabel) {
    const orderContainer = createEl('div', 'franchise-order-container');
    const upBtn = createEl('button', 'franchise-order-btn', { text: '▲' });
    upBtn.onclick = (e) => {
      e.stopPropagation();
      moveFranchiseEntry(record, entry, -1);
    };
    const label = createEl('span', 'franchise-entry-order', { text: orderLabel });
    const downBtn = createEl('button', 'franchise-order-btn', { text: '▼' });
    downBtn.onclick = (e) => {
      e.stopPropagation();
      moveFranchiseEntry(record, entry, 1);
    };
    orderContainer.appendChild(upBtn);
    orderContainer.appendChild(label);
    orderContainer.appendChild(downBtn);
    header.appendChild(orderContainer);
  }
  header.appendChild(createEl('span', 'franchise-entry-badge', { text: entry.badgeLabel || FRANCHISE_MEDIA_LABELS[entry.mediaType] || 'Entry' }));
  entryEl.appendChild(header);

  entryEl.appendChild(createEl('div', 'franchise-entry-title', { text: entry.title || 'Untitled entry' }));
  if (entry.subtitle) {
    entryEl.appendChild(createEl('div', 'franchise-entry-subtitle', { text: entry.subtitle }));
  }

  const metaBits = [];
  if (entry.releaseLabel) metaBits.push(entry.releaseLabel);
  if (entry.runtimeMinutes) metaBits.push(`${entry.runtimeMinutes} min`);
  if (entry.episodes) metaBits.push(`${entry.episodes} ep`);
  if (entry.watchStatusLabel && entry.watchStatus !== 'finished') metaBits.push(entry.watchStatusLabel);
  if (metaBits.length) {
    entryEl.appendChild(createEl('div', 'franchise-entry-meta', { text: metaBits.join(' • ') }));
  }

  if (entry.notes) {
    entryEl.appendChild(createEl('p', 'franchise-entry-notes', { text: entry.notes }));
  }

  const statusText = entry.libraryMatch
    ? (entry.isFinished ? 'Finished in your library' : 'In your library')
    : (entry.highlightLabel || entry.watchStatusLabel || entry.releaseStatusLabel || '');
  if (statusText) {
    entryEl.appendChild(createEl('div', 'franchise-entry-status', { text: statusText }));
  }

  return entryEl;
}

// ============================================
// MOVE FRANCHISE ENTRY
// ============================================
export async function moveFranchiseEntry(record, entry, direction) {
  const db = getFirebaseDatabase();
  if (!record || !record.id || !entry || !currentUser || !db) return;
  const entries = record.entries || [];
  const currentIndex = entries.findIndex(e => e.id === entry.id);
  if (currentIndex === -1) return;
  const targetIndex = currentIndex + direction;
  if (targetIndex < 0 || targetIndex >= entries.length) return;
  const targetEntry = entries[targetIndex];

  const updateItemOrder = async (itemEntry, newOrder) => {
    if (!itemEntry || !itemEntry.listType) return;
    const itemId = itemEntry.listEntryId || itemEntry.id;
    if (!itemId) return;
    const isFinished = itemEntry.isFinished;
    const path = isFinished 
      ? `users/${currentUser.uid}/finished/${itemEntry.listType}/${itemId}`
      : `users/${currentUser.uid}/${itemEntry.listType}/${itemId}`;
    try {
      await update(ref(db, path), { seriesOrder: newOrder });
    } catch (e) {
      console.warn("Failed to update item seriesOrder", e);
    }
  };

  const franchiseRef = ref(db, `users/${currentUser.uid}/franchises/${record.id}`);
  try {
    const snapshot = await get(franchiseRef);
    const rawRecord = snapshot.val();
    if (rawRecord) {
      let rawEntries = rawRecord.entries || rawRecord.timeline || [];
      if (Array.isArray(rawEntries)) {
        const rawCurrentIndex = rawEntries.findIndex(e => (e.id === entry.id) || (e.entryId === entry.id));
        const rawTargetIndex = rawEntries.findIndex(e => (e.id === targetEntry.id) || (e.entryId === targetEntry.id));
        if (rawCurrentIndex !== -1 && rawTargetIndex !== -1) {
           const temp = rawEntries[rawCurrentIndex];
           rawEntries[rawCurrentIndex] = rawEntries[rawTargetIndex];
           rawEntries[rawTargetIndex] = temp;
           await update(franchiseRef, { entries: rawEntries });
        }
      }
    }
  } catch (e) {
    console.warn("Failed to update franchise record", e);
  }

  await Promise.all([
    updateItemOrder(entry, targetIndex + 1),
    updateItemOrder(targetEntry, currentIndex + 1)
  ]);
}

// ============================================
// RESOLVE FRANCHISE ENTRY ORDER LABEL
// ============================================
export function resolveFranchiseEntryOrderLabel(record, entry, index) {
  if (typeof index === 'number') {
    return `#${index + 1}`;
  }
  
  if (entry && typeof entry.displayOrder === 'number') {
    return `#${entry.displayOrder + 1}`;
  }

  if (!record || record.orderMode !== 'auto') {
    return entry?.orderLabel || '';
  }
  if (!entry || !entry.id) {
    return entry?.orderLabel || '';
  }
  const entries = Array.isArray(record.entries) ? record.entries : [];
  const position = entries.findIndex(item => item && item.id === entry.id);
  if (position === -1) {
    return entry.orderLabel || '';
  }
  return `#${position + 1}`;
}

// ============================================
// SETUP FRANCHISE SORT
// ============================================
export function setupFranchiseSort() {
  if (!franchiseSortYearBtn) return;
  
  franchiseSortYearBtn.addEventListener('click', () => {
    if (franchiseSortMode === 'default') {
      franchiseSortMode = 'yearAsc';
    } else if (franchiseSortMode === 'yearAsc') {
      franchiseSortMode = 'yearDesc';
    } else {
      franchiseSortMode = 'default';
    }
    
    updateFranchiseSortButton();
    renderFranchiseShelf();
  });
  
  updateFranchiseSortButton();
}

function updateFranchiseSortButton() {
  if (!franchiseSortYearBtn) return;
  
  let label = 'Sort by Year';
  if (franchiseSortMode === 'yearAsc') {
    label = 'Year ↑';
  } else if (franchiseSortMode === 'yearDesc') {
    label = 'Year ↓';
  }
  
  franchiseSortYearBtn.textContent = label;
}

// ============================================
// DRAG AND DROP
// ============================================
function ensureFranchiseDragEvents() {
  if (franchiseDragEventsBound || !franchiseShelfEl) return;
  franchiseShelfEl.addEventListener('dragstart', handleFranchiseDragStart);
  franchiseShelfEl.addEventListener('dragover', handleFranchiseDragOver);
  franchiseShelfEl.addEventListener('drop', handleFranchiseDrop);
  franchiseShelfEl.addEventListener('dragend', handleFranchiseDragEnd);
  franchiseDragEventsBound = true;
}

function handleFranchiseDragStart(event) {
  const target = event.target instanceof Element ? event.target : null;
  const entry = target?.closest('.franchise-entry');
  if (!entry || entry.classList.contains('franchise-entry-placeholder')) return;
  const track = entry.closest('.franchise-track');
  if (!track) return;
  const draggableCount = track.querySelectorAll('.franchise-entry:not(.franchise-entry-placeholder)').length;
  if (draggableCount <= 1) {
    event.preventDefault();
    event.stopPropagation();
    return;
  }
  const entryId = entry.dataset.entryId;
  const franchiseId = track.dataset.franchiseId || entry.dataset.franchiseId;
  if (!entryId || !franchiseId) return;
  franchiseDragState.activeEntryId = entryId;
  franchiseDragState.activeFranchiseId = franchiseId;
  franchiseDragState.activeTrack = track;
  removeFranchisePlaceholder();
  entry.classList.add('is-dragging');
  track.classList.add('is-dragging');
  enableFranchiseWheelScroll();
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', franchiseDragState.activeEntryId || '');
  }
}

function handleFranchiseDragOver(event) {
  if (!franchiseDragState.activeEntryId) return;
  const target = event.target instanceof Element ? event.target : null;
  const track = target?.closest('.franchise-track');
  if (!track || track.dataset.franchiseId !== franchiseDragState.activeFranchiseId) return;
  event.preventDefault();
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'move';
  }
  autoScrollDuringDrag(event);
  const placeholder = getFranchiseDragPlaceholder();
  if (placeholder.parentElement !== track) {
    track.appendChild(placeholder);
  }
  let targetEntry = target?.closest('.franchise-entry');
  if (!targetEntry) {
    targetEntry = getFranchiseEntryFromPosition(track, event.clientX);
    if (!targetEntry) {
      track.appendChild(placeholder);
      return;
    }
  }
  if (targetEntry === placeholder) {
    return;
  }
  if (targetEntry.classList.contains('is-dragging')) {
    return;
  }
  const rect = targetEntry.getBoundingClientRect();
  const insertBefore = event.clientX < rect.left + rect.width / 2;
  if (insertBefore) {
    track.insertBefore(placeholder, targetEntry);
  } else {
    track.insertBefore(placeholder, targetEntry.nextSibling);
  }
}

function handleFranchiseDrop(event) {
  if (!franchiseDragState.activeEntryId) return;
  const target = event.target instanceof Element ? event.target : null;
  const track = target?.closest('.franchise-track');
  if (!track || track.dataset.franchiseId !== franchiseDragState.activeFranchiseId) {
    clearFranchiseDragState();
    return;
  }
  event.preventDefault();
  const orderedEntryIds = computeFranchiseDropOrder(track);
  clearFranchiseDragState();
  if (orderedEntryIds && orderedEntryIds.length) {
    applyFranchiseEntryOrder(track.dataset.franchiseId || '', orderedEntryIds);
  }
}

function handleFranchiseDragEnd() {
  clearFranchiseDragState();
}

function computeFranchiseDropOrder(track) {
  const movingId = franchiseDragState.activeEntryId;
  if (!track || !movingId) return null;
  const placeholder = franchiseDragState.placeholder;
  const currentIds = Array.from(track.querySelectorAll('.franchise-entry'))
    .filter(node => !node.classList.contains('franchise-entry-placeholder'))
    .map(node => node.dataset.entryId)
    .filter(Boolean);
  if (!placeholder || placeholder.parentElement !== track) {
    return currentIds;
  }
  const insertionIndex = getFranchisePlaceholderIndex(track, placeholder);
  const withoutMoving = currentIds.filter(id => id !== movingId);
  const clampedIndex = Math.max(0, Math.min(withoutMoving.length, insertionIndex));
  withoutMoving.splice(clampedIndex, 0, movingId);
  return withoutMoving;
}

function getFranchisePlaceholderIndex(track, placeholder) {
  if (!track || !placeholder) return 0;
  let index = 0;
  const children = Array.from(track.children);
  for (const child of children) {
    if (child === placeholder) {
      break;
    }
    if (child.classList && child.classList.contains('franchise-entry') && !child.classList.contains('franchise-entry-placeholder')) {
      index += 1;
    }
  }
  return index;
}

function getFranchiseEntryFromPosition(track, clientX) {
  if (!track || clientX === undefined || clientX === null) return null;
  const entries = Array.from(track.querySelectorAll('.franchise-entry:not(.franchise-entry-placeholder)'));
  if (!entries.length) return null;
  let closestEntry = null;
  let smallestDelta = Infinity;
  entries.forEach(entry => {
    if (entry.classList.contains('is-dragging')) return;
    const rect = entry.getBoundingClientRect();
    const center = rect.left + rect.width / 2;
    const delta = Math.abs(clientX - center);
    if (delta < smallestDelta) {
      smallestDelta = delta;
      closestEntry = entry;
    }
  });
  return closestEntry;
}

function getFranchiseDragPlaceholder() {
  if (franchiseDragState.placeholder) return franchiseDragState.placeholder;
  const placeholder = document.createElement('div');
  placeholder.className = 'franchise-entry franchise-entry-placeholder';
  placeholder.setAttribute('aria-hidden', 'true');
  placeholder.setAttribute('draggable', 'false');
  placeholder.innerHTML = '<span>Drop here</span>';
  franchiseDragState.placeholder = placeholder;
  return placeholder;
}

function removeFranchisePlaceholder() {
  const placeholder = franchiseDragState.placeholder;
  if (placeholder && placeholder.parentElement) {
    placeholder.parentElement.removeChild(placeholder);
  }
}

function clearFranchiseDragState() {
  removeFranchisePlaceholder();
  if (franchiseShelfEl) {
    const draggingEntry = franchiseShelfEl.querySelector('.franchise-entry.is-dragging');
    if (draggingEntry) draggingEntry.classList.remove('is-dragging');
  }
  if (franchiseDragState.activeTrack) {
    franchiseDragState.activeTrack.classList.remove('is-dragging');
  }
  disableFranchiseWheelScroll();
  franchiseDragState.activeEntryId = null;
  franchiseDragState.activeFranchiseId = null;
  franchiseDragState.activeTrack = null;
}

export function enableFranchiseWheelScroll(callback) {
  if (franchiseWheelUnsubscribe) return;
  const handler = (event) => {
    if (!franchiseDragState.activeEntryId || !franchiseDragState.activeTrack) return;
    const delta = event.deltaY !== 0 ? event.deltaY : event.deltaX;
    if (!delta) return;
    event.preventDefault();
    franchiseDragState.activeTrack.scrollLeft += delta;
  };
  window.addEventListener('wheel', handler, { passive: false });
  franchiseWheelUnsubscribe = () => {
    window.removeEventListener('wheel', handler);
    franchiseWheelUnsubscribe = null;
  };
  return franchiseWheelUnsubscribe;
}

export function disableFranchiseWheelScroll() {
  if (franchiseWheelUnsubscribe) {
    franchiseWheelUnsubscribe();
  }
}

function applyFranchiseEntryOrder(franchiseId, orderedEntryIds) {
  if (!franchiseId || !Array.isArray(orderedEntryIds) || !orderedEntryIds.length) return;
  const record = franchiseState.records.find(item => item.id === franchiseId);
  if (!record) return;
  const currentOrder = record.entries.map(entry => entry.id);
  if (arraysShallowEqual(currentOrder, orderedEntryIds)) return;
  const entryMap = new Map(record.entries.map(entry => [entry.id, entry]));
  const orderSet = new Set(orderedEntryIds);
  const orderedEntries = orderedEntryIds.map((entryId, index) => {
    const entry = entryMap.get(entryId);
    if (entry) {
      entry.displayOrder = index;
      return entry;
    }
    return null;
  }).filter(Boolean);
  entryMap.forEach((entry, entryId) => {
    if (!orderSet.has(entryId)) {
      orderedEntries.push(entry);
    }
  });
  record.entries = orderedEntries;
  record.entryOrder = orderedEntryIds.slice();
  record.orderMode = 'auto';
  renderFranchiseShelf();
  persistFranchiseEntryOrder(franchiseId, orderedEntryIds);
}

function persistFranchiseEntryOrder(franchiseId, orderedEntryIds) {
  const db = getFirebaseDatabase();
  if (!currentUser || !db || !franchiseId) return;
  const path = ref(db, `users/${currentUser.uid}/franchises/${franchiseId}/entryOrder`);
  set(path, orderedEntryIds).catch(err => {
    console.warn('Failed to save franchise entry order', err);
  });
  const modePath = ref(db, `users/${currentUser.uid}/franchises/${franchiseId}/orderMode`);
  set(modePath, 'auto').catch(err => {
    console.warn('Failed to save franchise order mode', err);
  });
}

function arraysShallowEqual(a, b) {
  if (a === b) return true;
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function autoScrollDuringDrag(event, container = null) {
  if (!event) return;
  const clientY = event.clientY;
  if (clientY === undefined || clientY === null) return;
  const edgePx = typeof DRAG_SCROLL_EDGE_PX === 'number' ? DRAG_SCROLL_EDGE_PX : 60;
  const stepPx = typeof DRAG_SCROLL_STEP_PX === 'number' ? DRAG_SCROLL_STEP_PX : 15;
  if (container && container instanceof Element) {
    const rect = container.getBoundingClientRect();
    if (!rect || rect.height <= 0) {
      return;
    }
    if (clientY < rect.top + edgePx) {
      container.scrollTop -= stepPx;
      return;
    }
    if (clientY > rect.bottom - edgePx) {
      container.scrollTop += stepPx;
    }
    return;
  }
  const viewportHeight = window.innerHeight || document.documentElement?.clientHeight || 0;
  if (!viewportHeight) return;
  if (clientY < edgePx) {
    window.scrollBy(0, -stepPx);
  } else if (clientY > viewportHeight - edgePx) {
    window.scrollBy(0, stepPx);
  }
}

// ============================================
// NORMALIZATION
// ============================================
export function normalizeFranchiseCollection(raw) {
  let records = [];
  if (Array.isArray(raw)) {
    records = raw;
  } else if (raw && typeof raw === 'object') {
    records = Object.entries(raw).map(([id, value]) => ({ ...(value || {}), id }));
  }
  return records.map((record, index) => normalizeFranchiseRecord(record, index)).filter(Boolean).sort((a, b) => {
    if (a.order !== b.order) return a.order - b.order;
    return titleSortKey(a.name).localeCompare(titleSortKey(b.name));
  });
}

export function normalizeFranchiseRecord(source, fallbackIndex = 0) {
  if (!source) return null;
  const id = source.id || source.franchiseId || `franchise-${fallbackIndex + 1}`;
  const entryOrder = Array.isArray(source.entryOrder) ? source.entryOrder.filter(Boolean) : null;
  const inferredMode = entryOrder && entryOrder.length ? 'auto' : 'manual';
  const orderMode = source.orderMode === 'auto' ? 'auto' : (source.orderMode === 'manual' ? 'manual' : inferredMode);
  const entries = normalizeFranchiseEntries(source.entries || source.timeline || source.parts || source.mediaItems || [], entryOrder);
  const record = {
    id,
    name: source.name || source.title || `Franchise ${fallbackIndex + 1}`,
    tagline: source.tagline || source.subtitle || '',
    synopsis: source.description || source.summary || '',
    order: resolveFranchiseDisplayOrder(source, fallbackIndex),
    updatedAt: Number(source.updatedAt || source.updated || source.timestamp || 0) || 0,
    entries,
    entryOrder,
    orderMode,
  };
  record.stats = computeFranchiseStats(entries);
  return record;
}

export function normalizeFranchiseEntries(rawEntries, customOrderList = null) {
  let entries = [];
  if (Array.isArray(rawEntries)) {
    entries = rawEntries;
  } else if (rawEntries && typeof rawEntries === 'object') {
    entries = Object.entries(rawEntries).map(([id, value]) => ({ ...(value || {}), id }));
  }
  const customOrderMap = Array.isArray(customOrderList)
    ? customOrderList.reduce((acc, entryId, index) => {
        if (entryId) acc[entryId] = index;
        return acc;
      }, {})
    : null;
  const normalized = entries.map((entry, index) => {
    const normalizedEntry = normalizeFranchiseEntry(entry, index);
    if (normalizedEntry && customOrderMap && customOrderMap[normalizedEntry.id] !== undefined) {
      normalizedEntry.displayOrder = customOrderMap[normalizedEntry.id];
    }
    return normalizedEntry;
  }).filter(Boolean);
  return normalized.sort((a, b) => {
    if (customOrderMap) {
      const aOrder = customOrderMap[a.id];
      const bOrder = customOrderMap[b.id];
      if (aOrder !== undefined || bOrder !== undefined) {
        if (aOrder === undefined) return 1;
        if (bOrder === undefined) return -1;
        if (aOrder !== bOrder) return aOrder - bOrder;
      }
    }
    if (a.displayOrder !== b.displayOrder) return a.displayOrder - b.displayOrder;
    if (a.releaseDate && b.releaseDate && a.releaseDate !== b.releaseDate) {
      return a.releaseDate < b.releaseDate ? -1 : 1;
    }
    if ((a.releaseYear || 0) !== (b.releaseYear || 0)) {
      return (a.releaseYear || 0) - (b.releaseYear || 0);
    }
    return titleSortKey(a.title).localeCompare(titleSortKey(b.title));
  });
}

export function normalizeFranchiseEntry(source, fallbackIndex = 0) {
  if (!source) return null;
  const id = source.id || source.entryId || `entry-${fallbackIndex + 1}`;
  const rawMediaType = coerceFranchiseMediaType(source.mediaType || source.type || source.category || source.format, source);
  const seasonNumber = Number.isFinite(Number(source.seasonNumber)) ? Number(source.seasonNumber) : null;
  const mediaType = seasonNumber !== null && rawMediaType !== 'tv' ? 'tv' : rawMediaType;
  const listType = resolveFranchiseListType(mediaType, source.listType);
  const releaseDate = sanitizeFranchiseDate(source.releaseDate || source.airDate || source.date || '');
  const releaseYearStr = sanitizeYear(source.year || source.releaseYear || releaseDate);
  const releaseYear = releaseYearStr ? Number(releaseYearStr) : null;
  const releaseLabel = formatFranchiseReleaseLabel(releaseDate, releaseYearStr);
  const watchStatus = normalizeFranchiseWatchStatus(source.watchStatus || source.status || source.progress);
  const entry = {
    id,
    title: source.title || source.name || source.episodeTitle || source.seriesTitle || 'Untitled entry',
    subtitle: source.subtitle || source.seriesTitle || '',
    mediaType,
    listType,
    releaseDate,
    releaseYear,
    releaseLabel,
    watchStatus,
    watchStatusLabel: formatFranchiseWatchStatusLabel(watchStatus),
    releaseStatusLabel: formatFranchiseReleaseStatusLabel(normalizeFranchiseReleaseStatus(source.releaseStatus || source.availability)),
    highlightLabel: source.highlight || source.nextAction || '',
    notes: source.notes || source.summary || '',
    badgeLabel: formatFranchiseBadgeLabel(mediaType, { ...source, seasonNumber }),
    orderLabel: source.phase || source.arc || source.era || source.timelineLabel || '',
    runtimeMinutes: parseRuntimeMinutes(source.runtimeMinutes || source.runtime || source.duration),
    episodes: parseEpisodeValue(source.episodes || source.episodeCount || source.totalEpisodes),
    seasonNumber,
    tmdbId: source.tmdbId || source.tmdbID || null,
    imdbId: source.imdbId || source.imdbID || null,
    aniListId: source.aniListId || null,
    listEntryId: source.listEntryId || source.listId || source.libraryId || null,
    displayOrder: resolveFranchiseDisplayOrder(source, fallbackIndex),
    libraryMatch: false,
    isFinished: watchStatus === 'finished',
  };
  return entry;
}

function coerceFranchiseMediaType(value, source = {}) {
  if (source && source.mediaType && typeof source.mediaType === 'object') {
    value = source.mediaType.type || source.mediaType.name || value;
  }
  const normalized = String(value || '').trim().toLowerCase();
  const looksLikeSeason = source && (source.seasonNumber !== undefined || source.episodes);
  if (!normalized && looksLikeSeason) {
    return 'tv';
  }
  if (['movie', 'film', 'feature'].includes(normalized)) return 'movie';
  if (['season', 'tv_season', 'series_season', 'tvseason', 'tv-season'].includes(normalized)) return 'tv';
  if (['tv', 'show', 'series'].includes(normalized)) return 'tv';
  if (['special', 'ova', 'ona', 'short'].includes(normalized)) return 'special';
  return normalized || 'movie';
}

function resolveFranchiseListType(mediaType, provided) {
  if (provided && PRIMARY_LIST_TYPES && PRIMARY_LIST_TYPES.includes(provided)) {
    return provided;
  }
  if (mediaType === 'tv' || mediaType === 'season' || mediaType === 'tvSeason') return 'tvShows';
  if (mediaType === 'special') return 'movies';
  return 'movies';
}

function resolveFranchiseDisplayOrder(source, fallbackIndex = 0) {
  const candidates = [source.order, source.sort, source.timelineOrder, source.rank, source.position];
  for (const candidate of candidates) {
    const numeric = Number(candidate);
    if (Number.isFinite(numeric)) {
      return numeric;
    }
  }
  const dateValue = sanitizeFranchiseDate(source.releaseDate || source.date || '');
  if (dateValue) {
    const timestamp = Date.parse(dateValue);
    if (Number.isFinite(timestamp)) {
      return timestamp;
    }
  }
  const yearValue = Number(sanitizeYear(source.year || source.releaseYear));
  if (Number.isFinite(yearValue)) {
    return yearValue * 1000;
  }
  return fallbackIndex;
}

function sanitizeFranchiseDate(value) {
  if (!value) return '';
  const match = String(value).match(/(\d{4})(?:[-/.]?(\d{1,2}))?(?:[-/.]?(\d{1,2}))?/);
  if (!match) return '';
  const year = match[1];
  const month = match[2] ? match[2].padStart(2, '0') : '01';
  const day = match[3] ? match[3].padStart(2, '0') : '01';
  return `${year}-${month}-${day}`;
}

function formatFranchiseReleaseLabel(releaseDate, releaseYear) {
  if (releaseDate) {
    const [year, month] = releaseDate.split('-');
    if (year && month) {
      const monthIndex = Number(month) - 1;
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      if (monthIndex >= 0 && monthIndex < monthNames.length) {
        return `${monthNames[monthIndex]} ${year}`;
      }
      return year;
    }
  }
  if (releaseYear) return releaseYear;
  return '';
}

function normalizeFranchiseWatchStatus(value) {
  if (!value) return '';
  const normalized = String(value).trim().toLowerCase();
  if (['finished', 'complete', 'completed', 'watched', 'done'].includes(normalized)) return 'finished';
  if (['watching', 'in_progress', 'in-progress', 'ongoing', 'current'].includes(normalized)) return 'in-progress';
  if (['planned', 'backlog', 'pending', 'queue', 'queued', 'up next', 'up-next'].includes(normalized)) return 'pending';
  if (['skipped', 'dropped', 'abandoned'].includes(normalized)) return 'skipped';
  return normalized;
}

function normalizeFranchiseReleaseStatus(value) {
  if (!value) return '';
  const normalized = String(value).trim().toLowerCase();
  if (['released', 'available'].includes(normalized)) return 'released';
  if (['upcoming', 'announced', 'tba'].includes(normalized)) return 'upcoming';
  if (['delayed', 'hiatus'].includes(normalized)) return 'delayed';
  return normalized;
}

function formatFranchiseWatchStatusLabel(status) {
  switch (status) {
    case 'finished':
      return 'Finished';
    case 'in-progress':
      return 'In progress';
    case 'pending':
      return 'Backlog';
    case 'skipped':
      return 'Skipped';
    default:
      return status ? status.replace(/_/g, ' ').replace(/\b\w/g, ch => ch.toUpperCase()) : '';
  }
}

function formatFranchiseReleaseStatusLabel(status) {
  switch (status) {
    case 'released':
      return 'Released';
    case 'upcoming':
      return 'Upcoming';
    case 'delayed':
      return 'Delayed';
    default:
      return status ? status.replace(/_/g, ' ').replace(/\b\w/g, ch => ch.toUpperCase()) : '';
  }
}

function formatFranchiseBadgeLabel(mediaType, source = {}) {
  if (source.badge) return source.badge;

  const seasonNumeric = Number(source.seasonNumber);
  if (Number.isFinite(seasonNumeric)) {
    return `S${String(seasonNumeric).padStart(2, '0')}`;
  }

  if (source.part) {
    const numeric = Number(source.part);
    if (Number.isFinite(numeric)) {
      return `Part ${numeric}`;
    }
  }

  return FRANCHISE_MEDIA_LABELS[mediaType] || 'Entry';
}

// ============================================
// LIBRARY MATCHING
// ============================================
export function refreshFranchiseLibraryMatches() {
  if (!franchiseState.loaded || !Array.isArray(franchiseState.records) || !franchiseState.records.length) return;
  let updated = false;
  franchiseState.records.forEach(record => {
    let recordChanged = false;
    record.entries.forEach(entry => {
      const match = resolveFranchiseLibraryMatch(entry);
      const isMatched = Boolean(match);
      if (entry.libraryMatch !== isMatched) {
        entry.libraryMatch = isMatched;
        recordChanged = true;
        updated = true;
      }
      if (isMatched && !entry.isFinished && match && (match.finishedAt || match.finishedDate)) {
        entry.isFinished = true;
        recordChanged = true;
      }
    });
    if (recordChanged) {
      record.stats = computeFranchiseStats(record.entries);
    }
  });
  if (updated) {
    renderFranchiseShelf();
  } else {
    updateFranchiseMeta(franchiseState.records);
  }
}

export function resolveFranchiseLibraryMatch(entry) {
  if (!entry || !entry.listType) return null;
  const pools = [listCaches[entry.listType] || {}, finishedCaches[entry.listType] || {}];
  for (const pool of pools) {
    if (!pool) continue;
    if (entry.listEntryId && pool[entry.listEntryId]) {
      return pool[entry.listEntryId];
    }
    if (entry.tmdbId) {
      const match = Object.values(pool).find(item => Number(item.tmdbId) === Number(entry.tmdbId));
      if (match) return match;
    }
    if (entry.imdbId) {
      const match = Object.values(pool).find(item => item.imdbId && item.imdbId === entry.imdbId);
      if (match) return match;
    }
    if (entry.title) {
      const targetTitle = normalizeTitleKey(entry.title);
      const match = Object.values(pool).find(item => normalizeTitleKey(item.title) === targetTitle && (!entry.releaseYear || sanitizeYear(item.year) === String(entry.releaseYear)));
      if (match) return match;
    }
  }
  return null;
}

export function computeFranchiseStats(entries) {
  const stats = {
    totalEntries: Array.isArray(entries) ? entries.length : 0,
    finishedCount: 0,
    libraryMatches: 0,
    remainingCount: 0,
  };
  if (!Array.isArray(entries)) {
    return stats;
  }
  entries.forEach(entry => {
    if (!entry) return;
    if (entry.isFinished || entry.watchStatus === 'finished') {
      stats.finishedCount += 1;
    }
    if (entry.libraryMatch) {
      stats.libraryMatches += 1;
    }
  });
  stats.remainingCount = Math.max(stats.totalEntries - stats.finishedCount, 0);
  return stats;
}

// ============================================
// MIGRATION
// ============================================
export function hasFranchiseNormalizationRun() {
  return safeLocalStorageGet(FRANCHISE_NORMALIZE_MIGRATION_KEY) === '1';
}

export function markFranchiseNormalizationComplete() {
  safeLocalStorageSet(FRANCHISE_NORMALIZE_MIGRATION_KEY, '1');
}

async function runFranchiseNormalizationMigrationOnce() {
  if (hasFranchiseNormalizationRun()) return;
  const db = getFirebaseDatabase();
  if (!currentUser || !db) return;
  if (!franchiseState.records || !franchiseState.records.length) {
    markFranchiseNormalizationComplete();
    return;
  }
  
  try {
    for (const record of franchiseState.records) {
      if (!record || !record.id || !Array.isArray(record.entries)) continue;
      const updates = {};
      record.entries.forEach((entry, index) => {
        if (!entry || !entry.id) return;
        const basePath = `entries/${index}`;
        if (entry.listType) updates[`${basePath}/listType`] = entry.listType;
        if (entry.mediaType) updates[`${basePath}/mediaType`] = entry.mediaType;
        if (entry.releaseDate) updates[`${basePath}/releaseDate`] = entry.releaseDate;
        if (entry.releaseYear) updates[`${basePath}/releaseYear`] = entry.releaseYear;
      });
      if (Object.keys(updates).length) {
        const recordRef = ref(db, `users/${currentUser.uid}/franchises/${record.id}`);
        await update(recordRef, updates);
      }
    }
    markFranchiseNormalizationComplete();
  } catch (err) {
    console.warn('Franchise normalization migration failed', err);
  }
}
