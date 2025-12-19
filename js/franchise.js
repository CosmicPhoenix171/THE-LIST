import { FRANCHISE_MEDIA_LABELS, FRANCHISE_NORMALIZE_MIGRATION_KEY } from './config.js';
import { createEl, extractPrimaryYear, safeLocalStorageGet, safeLocalStorageSet } from './utils.js';
import { franchiseSectionEl, franchiseShelfEl, franchiseMetaEl, franchiseSortYearBtn } from './dom.js';

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
}

export function getFranchiseYear(record) {
  if (!record || !Array.isArray(record.entries)) return 9999;
  let minYear = 9999;
  record.entries.forEach(entry => {
    const year = parseInt(extractPrimaryYear(entry.year || entry.releaseDate || ''), 10);
    if (year && year < minYear) minYear = year;
  });
  return minYear;
}

export function renderFranchiseShelf(callbacks = {}) {
  const { buildFranchiseCard } = callbacks;
  
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
  
  records.forEach(record => {
    const card = typeof buildFranchiseCard === 'function' 
      ? buildFranchiseCard(record)
      : buildDefaultFranchiseCard(record);
    if (card) {
      franchiseShelfEl.appendChild(card);
    }
  });
}

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

function buildDefaultFranchiseCard(record) {
  if (!record) return null;
  
  const card = createEl('div', 'franchise-card');
  card.dataset.franchiseId = record.id || '';
  
  const header = createEl('div', 'franchise-header');
  header.appendChild(createEl('h3', 'franchise-title', { text: record.name || 'Untitled Franchise' }));
  card.appendChild(header);
  
  if (Array.isArray(record.entries) && record.entries.length) {
    const timeline = createEl('div', 'franchise-timeline');
    record.entries.forEach(entry => {
      const entryEl = createEl('div', 'franchise-entry');
      entryEl.dataset.entryId = entry.id || '';
      
      const title = entry.title || entry.name || 'Untitled';
      const year = extractPrimaryYear(entry.year || entry.releaseDate || '');
      const mediaLabel = FRANCHISE_MEDIA_LABELS[entry.mediaType] || entry.mediaType || '';
      
      entryEl.appendChild(createEl('span', 'entry-title', { text: title }));
      if (year) {
        entryEl.appendChild(createEl('span', 'entry-year', { text: year }));
      }
      if (mediaLabel) {
        entryEl.appendChild(createEl('span', 'entry-type', { text: mediaLabel }));
      }
      
      timeline.appendChild(entryEl);
    });
    card.appendChild(timeline);
  }
  
  return card;
}

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

export function normalizeFranchiseCollection(raw) {
  if (!raw || typeof raw !== 'object') return [];
  
  return Object.entries(raw).map(([id, data]) => {
    if (!data) return null;
    
    const record = {
      id,
      name: data.name || data.title || 'Untitled',
      entries: [],
    };
    
    if (Array.isArray(data.entries)) {
      record.entries = data.entries.map((entry, index) => ({
        id: entry.id || `${id}-entry-${index}`,
        title: entry.title || entry.name || '',
        year: entry.year || entry.releaseDate || '',
        mediaType: entry.mediaType || 'movie',
        order: entry.order ?? index,
        ...entry,
      }));
    } else if (data.entries && typeof data.entries === 'object') {
      record.entries = Object.entries(data.entries).map(([entryId, entry]) => ({
        id: entryId,
        title: entry.title || entry.name || '',
        year: entry.year || entry.releaseDate || '',
        mediaType: entry.mediaType || 'movie',
        order: entry.order ?? 0,
        ...entry,
      }));
    }
    
    return record;
  }).filter(Boolean);
}

export function hasFranchiseNormalizationRun() {
  return safeLocalStorageGet(FRANCHISE_NORMALIZE_MIGRATION_KEY) === '1';
}

export function markFranchiseNormalizationComplete() {
  safeLocalStorageSet(FRANCHISE_NORMALIZE_MIGRATION_KEY, '1');
}

export function enableFranchiseWheelScroll(callback) {
  if (franchiseWheelUnsubscribe) return;
  
  const handler = (ev) => {
    if (typeof callback === 'function') {
      callback(ev);
    }
  };
  
  document.addEventListener('wheel', handler, { passive: false });
  
  franchiseWheelUnsubscribe = () => {
    document.removeEventListener('wheel', handler);
    franchiseWheelUnsubscribe = null;
  };
  
  return franchiseWheelUnsubscribe;
}

export function disableFranchiseWheelScroll() {
  if (franchiseWheelUnsubscribe) {
    franchiseWheelUnsubscribe();
  }
}
