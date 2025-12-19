import { PRIMARY_LIST_TYPES, VIRTUALIZATION_THRESHOLD, MEDIA_TYPE_LABELS } from './config.js';
import { titleSortKey, parseSeriesOrder } from './utils.js';

let listCaches = {};
let finishedCaches = {};
let showFinishedOnly = false;
let libraryFullyLoaded = false;

export function getListCaches() {
  return listCaches;
}

export function getFinishedCaches() {
  return finishedCaches;
}

export function setListCache(listType, data) {
  listCaches[listType] = data;
}

export function setFinishedCache(listType, data) {
  finishedCaches[listType] = data;
}

export function clearListCaches() {
  Object.keys(listCaches).forEach(key => delete listCaches[key]);
}

export function clearFinishedCaches() {
  Object.keys(finishedCaches).forEach(key => delete finishedCaches[key]);
}

export function isShowFinishedOnly() {
  return showFinishedOnly;
}

export function setShowFinishedOnly(value) {
  showFinishedOnly = value;
}

export function isLibraryFullyLoaded() {
  return libraryFullyLoaded;
}

export function setLibraryFullyLoaded(value) {
  libraryFullyLoaded = value;
}

export function getDisplayCacheMap() {
  return showFinishedOnly ? finishedCaches : listCaches;
}

export function getDisplayCache(listType) {
  const map = getDisplayCacheMap();
  return map[listType];
}

export function getSeriesAwareTitle(item) {
  if (!item) return '';
  if (item.seriesName) return item.seriesName;
  return item.title || '';
}

export function sortListEntries(entries, mode = 'title') {
  return entries.slice().sort(([, a], [, b]) => {
    const ta = titleSortKey(getSeriesAwareTitle(a));
    const tb = titleSortKey(getSeriesAwareTitle(b));
    
    if (mode === 'title') {
      if (ta < tb) return -1;
      if (ta > tb) return 1;
      return 0;
    }
    
    if (mode === 'yearAsc' || mode === 'yearDesc') {
      const ya = a && a.year ? parseInt(a.year, 10) : 9999;
      const yb = b && b.year ? parseInt(b.year, 10) : 9999;
      if (ya !== yb) return mode === 'yearAsc' ? ya - yb : yb - ya;
      if (ta < tb) return -1;
      if (ta > tb) return 1;
      return 0;
    }
    
    if (mode === 'director') {
      const da = (a && (a.director || a.author || '')).toLowerCase();
      const db = (b && (b.director || b.author || '')).toLowerCase();
      if (da && db && da !== db) return da < db ? -1 : 1;
      if (ta < tb) return -1;
      if (ta > tb) return 1;
      return 0;
    }
    
    if (mode === 'series') {
      const sa = (a && a.seriesName ? a.seriesName : '').toLowerCase();
      const sb = (b && b.seriesName ? b.seriesName : '').toLowerCase();
      if (sa && sb && sa !== sb) return sa < sb ? -1 : 1;
      const oa = parseSeriesOrder(a && a.seriesOrder);
      const ob = parseSeriesOrder(b && b.seriesOrder);
      if (oa !== ob) return oa - ob;
      if (ta < tb) return -1;
      if (ta > tb) return 1;
      return 0;
    }
    
    if (ta < tb) return -1;
    if (ta > tb) return 1;
    return 0;
  });
}

export function shouldVirtualize(itemCount) {
  return itemCount >= VIRTUALIZATION_THRESHOLD;
}

export function resolveCardRenderItem(listType, entryId, fallbackId) {
  if (!listType) return null;
  const cache = getDisplayCache(listType) || {};
  if (entryId && cache[entryId]) {
    return cache[entryId];
  }
  if (fallbackId && cache[fallbackId]) {
    return cache[fallbackId];
  }
  return null;
}

export function buildUnifiedDisplayEntries(callbacks = {}) {
  const { matchesFilter } = callbacks;
  const displayEntries = [];
  
  PRIMARY_LIST_TYPES.forEach(listType => {
    const cache = getDisplayCache(listType);
    if (!cache) return;
    
    Object.entries(cache).forEach(([id, item]) => {
      if (typeof matchesFilter === 'function' && !matchesFilter(listType, item)) {
        return;
      }
      
      displayEntries.push({
        id,
        listType,
        item,
        title: item.title || '',
        year: item.year || '',
        seriesName: item.seriesName || '',
      });
    });
  });
  
  return displayEntries;
}

export function buildSpinnerCandidates(listType, data) {
  if (!data) return { displayCandidates: [], candidateMap: new Map() };
  
  const displayCandidates = [];
  const candidateMap = new Map();
  
  Object.entries(data).forEach(([id, item]) => {
    if (!item || !item.title) return;
    
    candidateMap.set(id, item);
    displayCandidates.push({
      id,
      title: item.title,
      year: item.year || '',
    });
  });
  
  displayCandidates.sort((a, b) => {
    const titleA = (a.title || '').toLowerCase();
    const titleB = (b.title || '').toLowerCase();
    if (titleA < titleB) return -1;
    if (titleA > titleB) return 1;
    return 0;
  });
  
  return { displayCandidates, candidateMap };
}

export function getMediaTypeLabel(listType) {
  return MEDIA_TYPE_LABELS[listType] || listType;
}
