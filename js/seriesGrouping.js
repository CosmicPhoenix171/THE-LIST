// Series Grouping Module
// Handles grouping entries by series name and managing leader/member relationships
import { COLLAPSIBLE_LISTS } from './config.js';
import {
  listCaches,
  finishedCaches,
  showFinishedOnly,
  seriesGroups,
  crossListSeriesCache,
  seriesIndexVersion,
  setSeriesIndexVersion,
  getDisplayCacheMap,
  setSeriesGroup,
} from './state.js';
import { 
  normalizeTitleKey, 
  titleSortKey, 
  sanitizeYear, 
  numericSeriesOrder 
} from './utils.js';
import { isCollapsibleList } from './cards.js';

// ============================================
// SORT SERIES RECORDS
// ============================================
export function sortSeriesRecords(records) {
  return records.slice().sort((a, b) => {
    const orderA = numericSeriesOrder(a.order);
    const orderB = numericSeriesOrder(b.order);
    const safeA = orderA === null || orderA === undefined ? Number.POSITIVE_INFINITY : orderA;
    const safeB = orderB === null || orderB === undefined ? Number.POSITIVE_INFINITY : orderB;
    if (safeA !== safeB) return safeA - safeB;
    const yearA = parseInt((a.item && a.item.year) ? sanitizeYear(a.item.year) : '', 10) || 9999;
    const yearB = parseInt((b.item && b.item.year) ? sanitizeYear(b.item.year) : '', 10) || 9999;
    if (yearA !== yearB) return yearA - yearB;
    const titleA = titleSortKey(a.item?.title || '');
    const titleB = titleSortKey(b.item?.title || '');
    if (titleA < titleB) return -1;
    if (titleA > titleB) return 1;
    return 0;
  });
}

// ============================================
// PICK SERIES LEADER
// ============================================
export function pickSeriesLeader(entries) {
  if (!entries || !entries.length) return null;
  return entries.reduce((best, candidate) => {
    if (!best) return candidate;
    const candidateOrder = candidate.order;
    const bestOrder = best.order;
    const candidateHasOrder = candidateOrder !== null && candidateOrder !== undefined;
    const bestHasOrder = bestOrder !== null && bestOrder !== undefined;
    if (candidateHasOrder && bestHasOrder) {
      if (candidateOrder === bestOrder) {
        return candidate.index < best.index ? candidate : best;
      }
      return candidateOrder < bestOrder ? candidate : best;
    }
    if (candidateHasOrder) return candidate;
    if (bestHasOrder) return best;
    return candidate.index < best.index ? candidate : best;
  }, null);
}

// ============================================
// RESOLVE SERIES DISPLAY ENTRY
// ============================================
export function resolveSeriesDisplayEntry(listType, leaderId, entries) {
  if (!entries || !entries.length) return null;
  return entries[0];
}

// ============================================
// COLLECT SERIES ENTRIES ACROSS LISTS
// ============================================
export function collectSeriesEntriesAcrossLists(seriesName) {
  const normalizedKey = normalizeTitleKey(seriesName);
  if (!normalizedKey) return [];

  // IMPORTANT:
  // Grouping must not mix main-list entries with finished entries.
  // Cache entries are therefore keyed by the current view mode.
  const modeKey = showFinishedOnly ? 'finished' : 'main';
  const cacheKey = `${modeKey}:${normalizedKey}`;
  
  // Check cache
  const cached = crossListSeriesCache.get(cacheKey);
  if (cached && cached.version === seriesIndexVersion) {
    return cached.entries.slice();
  }
  
  const entries = [];
  const cacheMap = getDisplayCacheMap();
  
  COLLAPSIBLE_LISTS.forEach(type => {
    const pool = cacheMap[type];
    if (!pool) return;
    
    Object.entries(pool).forEach(([id, item]) => {
      if (!item || !item.seriesName) return;
      if (normalizeTitleKey(item.seriesName) !== normalizedKey) return;
      
      // Split season entries are already individual seasons - don't expand their tvSeasonSummaries
      const isSplitSeason = item.splitFromId && item.seasonNumber !== undefined;
      
      // Check for season data (only for non-split entries)
      const seasonField = !isSplitSeason && Array.isArray(item.tvSeasonSummaries) && item.tvSeasonSummaries.length
        ? 'tvSeasonSummaries'
        : (!isSplitSeason && Array.isArray(item.animeSeasonSummaries) && item.animeSeasonSummaries.length ? 'animeSeasonSummaries' : null);
      
      const seasons = seasonField ? item[seasonField] : null;
      
      if (Array.isArray(seasons) && seasons.length > 0) {
        let hasSeasons = false;
        seasons.forEach((season, index) => {
          if (!season) return;
          hasSeasons = true;
          const virtualItem = { ...item, ...season };
          
          if (season.seriesOrder === undefined || season.seriesOrder === null) {
            virtualItem.seriesOrder = null;
          }

          virtualItem.title = season.title || `${item.title}: Season ${season.seasonNumber}`;
          if (season.poster) virtualItem.poster = season.poster;
          
          entries.push({
            id: `${id}_season_${index}`,
            item: virtualItem,
            listType: type,
            order: numericSeriesOrder(season.seriesOrder),
            isVirtualSeason: true,
            parentId: id,
            seasonIndex: index,
            seasonField,
          });
        });
        if (!hasSeasons) {
          entries.push({ id, item, listType: type, order: numericSeriesOrder(item.seriesOrder) });
        }
      } else {
        entries.push({ id, item, listType: type, order: numericSeriesOrder(item.seriesOrder) });
      }
    });
  });
  
  crossListSeriesCache.set(cacheKey, { version: seriesIndexVersion, entries });
  return entries.slice();
}

// ============================================
// MERGE SERIES ENTRIES ACROSS LISTS
// ============================================
export function mergeSeriesEntriesAcrossLists(listType, cardId, displayItem, primaryEntries) {
  const baseEntries = Array.isArray(primaryEntries) ? primaryEntries.slice() : [];
  const seriesName = resolveSeriesNameFromEntries(baseEntries, displayItem);
  
  if (!seriesName) {
    return baseEntries.length ? baseEntries : null;
  }
  
  const crossEntries = collectSeriesEntriesAcrossLists(seriesName);
  const parentIdsWithSeasons = new Set();
  
  crossEntries.forEach(e => {
    if (e.isVirtualSeason && e.parentId) {
      parentIdsWithSeasons.add(e.parentId);
    }
  });

  const merged = [];
  const seen = new Set();
  
  const addEntry = (entry, fallbackListType = listType) => {
    if (!entry || !entry.item) return;
    const entryId = entry.id || cardId;
    
    // Skip parent entries if they have virtual seasons
    if (parentIdsWithSeasons.has(entryId) && !entry.isVirtualSeason) {
      return;
    }

    const entryListType = entry.listType || fallbackListType;
    const key = buildSeriesEntryKey(entryListType, entryId, entry.item);
    if (seen.has(key)) return;
    seen.add(key);
    
    merged.push({
      id: entryId,
      item: entry.item,
      order: entry.order ?? numericSeriesOrder(entry.item?.seriesOrder),
      listType: entryListType,
      isVirtualSeason: entry.isVirtualSeason,
      parentId: entry.parentId,
      seasonIndex: entry.seasonIndex,
      seasonField: entry.seasonField
    });
  };
  
  baseEntries.forEach(entry => addEntry(entry, listType));
  
  if (!baseEntries.length && displayItem) {
    addEntry({ id: cardId, item: displayItem, listType, order: numericSeriesOrder(displayItem.seriesOrder) }, listType);
  }
  
  crossEntries.forEach(entry => addEntry(entry, entry.listType));
  
  if (!merged.length) return null;
  
  merged.sort(compareSeriesEntries);
  return merged;
}

// ============================================
// RESOLVE SERIES NAME FROM ENTRIES
// ============================================
export function resolveSeriesNameFromEntries(entries, fallbackItem) {
  if (Array.isArray(entries)) {
    for (const entry of entries) {
      const candidate = entry?.item?.seriesName;
      if (candidate) return candidate;
    }
  }
  if (fallbackItem && fallbackItem.seriesName) {
    return fallbackItem.seriesName;
  }
  return '';
}

// ============================================
// BUILD SERIES ENTRY KEY
// ============================================
export function buildSeriesEntryKey(listType, entryId, item) {
  const safeType = listType || 'unknown';
  if (entryId) {
    return `${safeType}:${entryId}`;
  }
  const titleKey = titleSortKey(item?.title || '');
  const yearKey = sanitizeYear(item?.year || '') || '----';
  return `${safeType}:${titleKey}:${yearKey}`;
}

// ============================================
// COMPARE SERIES ENTRIES
// ============================================
export function compareSeriesEntries(a, b) {
  const orderA = numericSeriesOrder(a?.order ?? a?.item?.seriesOrder);
  const orderB = numericSeriesOrder(b?.order ?? b?.item?.seriesOrder);
  const safeA = orderA === null || orderA === undefined ? Number.POSITIVE_INFINITY : orderA;
  const safeB = orderB === null || orderB === undefined ? Number.POSITIVE_INFINITY : orderB;
  if (safeA !== safeB) return safeA - safeB;

  const canonicalDate = (item) => {
    if (!item) return { sortKey: 99999999, season: Infinity, tie: '' };
    const isSeason = item.seasonNumber !== undefined && item.seasonNumber !== null;
    const dateFields = [item.airDate, item.releaseDate];
    if (!isSeason) dateFields.push(item.firstAirDate);
    let sortKey = 99999999;
    for (const val of dateFields) {
      if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(val)) {
        sortKey = parseInt(val.replace(/-/g, ''), 10);
        break;
      }
    }
    if (sortKey === 99999999) {
      const yStr = sanitizeYear(String(item.year || item.releaseYear || ''));
      if (yStr) sortKey = parseInt(yStr + '0000', 10);
    }
    const season = isSeason ? Number(item.seasonNumber) : Infinity;
    const tie = titleSortKey(item.title || '');
    return { sortKey, season, tie };
  };

  const aKey = canonicalDate(a?.item);
  const bKey = canonicalDate(b?.item);
  if (aKey.sortKey !== bKey.sortKey) return aKey.sortKey - bKey.sortKey;
  if (aKey.season !== bKey.season) return aKey.season - bKey.season;
  if (aKey.tie !== bKey.tie) return aKey.tie < bKey.tie ? -1 : 1;
  const aId = (a.id || '').toString();
  const bId = (b.id || '').toString();
  return aId.localeCompare(bId);
}

// ============================================
// BUILD UNIFIED ENTRIES WITH SERIES GROUPING
// ============================================
export function collectUnifiedEntriesWithGrouping(primaryListTypes) {
  const allEntries = [];
  const collapsibleEntries = [];
  const cacheMap = getDisplayCacheMap();
  
  primaryListTypes.forEach(listType => {
    const cache = cacheMap[listType] || {};
    const cacheEntries = Object.entries(cache);
    if (!cacheEntries.length) return;
    
    if (isCollapsibleList(listType)) {
      cacheEntries.forEach(([id, item], index) => {
        if (!item) return;
        collapsibleEntries.push({ listType, id, item, index });
      });
    } else {
      cacheEntries.forEach(([id, item], index) => {
        if (!item) return;
        allEntries.push({
          listType,
          id,
          item,
          displayItem: item,
          displayEntryId: id,
          positionIndex: index,
        });
      });
    }
  });

  // Group collapsible entries by series
  const seriesBuckets = new Map();
  const records = [];

  collapsibleEntries.forEach(entry => {
    const { listType, id, item, index } = entry;
    const seriesKey = item.seriesName ? normalizeTitleKey(item.seriesName) : '';
    const order = numericSeriesOrder(item.seriesOrder);
    const record = { listType, id, item, index, seriesKey, order };
    records.push(record);
    
    if (seriesKey) {
      let bucket = seriesBuckets.get(seriesKey);
      if (!bucket) {
        bucket = { entries: [] };
        seriesBuckets.set(seriesKey, bucket);
      }
      bucket.entries.push(record);
    }
  });

  // Build leader-member mapping
  const leaderMembersByCardId = new Map();
  
  seriesBuckets.forEach(bucket => {
    const sortedRecords = sortSeriesRecords(bucket.entries);
    const leader = pickSeriesLeader(sortedRecords);
    if (leader) {
      bucket.leaderId = leader.id;
      const compactEntries = sortedRecords.map(entry => ({
        id: entry.id,
        item: entry.item,
        order: entry.order,
        listType: entry.listType,
      }));
      leaderMembersByCardId.set(leader.id, compactEntries);
    }
  });
  
  // Store in seriesGroups.unified
  seriesGroups.unified = leaderMembersByCardId;

  // Build final entries list
  records.forEach(record => {
    const { listType, id, item, index, seriesKey } = record;
    const bucket = seriesKey ? seriesBuckets.get(seriesKey) : null;
    const hideCard = Boolean(bucket && bucket.leaderId && bucket.leaderId !== id);
    
    let displayItem = item;
    let displayEntryId = id;
    
    // For series leaders, get the best display entry
    if (!hideCard && bucket && bucket.leaderId === id) {
      const entries = leaderMembersByCardId.get(id) || [];
      const active = resolveSeriesDisplayEntry(listType, id, entries);
      if (active && active.item) {
        displayItem = active.item;
        displayEntryId = active.id;
      }
    }

    if (!hideCard) {
      allEntries.push({
        listType,
        id,
        item,
        displayItem,
        displayEntryId,
        positionIndex: index,
      });
    }
  });

  return allEntries;
}

// ============================================
// CLEAR CROSS-LIST CACHE
// ============================================
export function clearCrossListSeriesCache() {
  crossListSeriesCache.clear();
}

// ============================================
// INCREMENT SERIES INDEX VERSION
// ============================================
export function incrementSeriesIndexVersion() {
  setSeriesIndexVersion(seriesIndexVersion + 1);
}

// ============================================
// INVALIDATE SERIES CROSS-LIST CACHE
// ============================================
export function invalidateSeriesCrossListCache() {
  crossListSeriesCache.clear();
  setSeriesIndexVersion(seriesIndexVersion + 1);
}
