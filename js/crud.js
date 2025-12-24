// CRUD Operations - Add, Update, Delete, Finish items
import {
  ref,
  push,
  set,
  update,
  remove,
} from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-database.js';
import { getFirebaseDatabase } from './firebase.js';
import { 
  currentUser, 
  listCaches, 
  finishedCaches,
  setLibraryFullyLoaded 
} from './state.js';
import { 
  FINISH_RATING_MIN, 
  FINISH_RATING_MAX,
  COLLAPSIBLE_LISTS,
  SERIES_BULK_DELETE_LISTS 
} from './config.js';
import { createEl, normalizeTitleKey } from './utils.js';
import { pushNotification } from './notifications.js';
import { modalRoot } from './dom.js';

// ============================================
// ADD ITEM
// ============================================
export function addItem(listType, item) {
  if (!currentUser) {
    throw new Error('Not signed in');
  }
  const db = getFirebaseDatabase();
  const listRef = ref(db, `users/${currentUser.uid}/${listType}`);
  const newRef = push(listRef);
  return set(newRef, item);
}

// ============================================
// UPDATE ITEM
// ============================================
export function updateItem(listType, itemId, changes) {
  if (!currentUser) {
    alert('Not signed in');
    return Promise.reject(new Error('Not signed in'));
  }
  const db = getFirebaseDatabase();
  const itemRef = ref(db, `users/${currentUser.uid}/${listType}/${itemId}`);
  return update(itemRef, changes);
}

// ============================================
// DELETE ITEM
// ============================================
export function deleteItem(listType, itemId, options = {}) {
  if (!currentUser) {
    alert('Not signed in');
    return Promise.reject(new Error('Not signed in'));
  }
  const { fromFinished = false } = options;
  if (!confirm('Delete this item?')) return Promise.resolve();
  
  const db = getFirebaseDatabase();
  const basePath = fromFinished
    ? `users/${currentUser.uid}/finished/${listType}`
    : `users/${currentUser.uid}/${listType}`;
  const itemRef = ref(db, `${basePath}/${itemId}`);
  return remove(itemRef).catch(err => console.error('Delete failed', err));
}

// ============================================
// MOVE ITEM BETWEEN LISTS
// ============================================
export async function moveItemBetweenLists(sourceListType, targetListType, itemId, itemData, callbacks = {}) {
  if (!currentUser) {
    alert('Not signed in');
    throw new Error('Not signed in');
  }
  const cleaned = { ...itemData };
  delete cleaned.__id;
  delete cleaned.__type;
  delete cleaned.__source;
  cleaned.updatedAt = Date.now();
  if (!cleaned.createdAt) {
    cleaned.createdAt = Date.now();
  }
  
  if (callbacks.ensureTvSeriesDefaults && targetListType === 'tvShows') {
    callbacks.ensureTvSeriesDefaults(targetListType, cleaned);
  }
  
  const db = getFirebaseDatabase();
  const targetRef = ref(db, `users/${currentUser.uid}/${targetListType}/${itemId}`);
  await set(targetRef, cleaned);
  const sourceRef = ref(db, `users/${currentUser.uid}/${sourceListType}/${itemId}`);
  await remove(sourceRef);
  
  if (callbacks.invalidateSeriesCrossListCache) {
    callbacks.invalidateSeriesCrossListCache();
  }
}

// ============================================
// RATING UTILITIES
// ============================================
export function normalizeFinishRating(value) {
  if (value === null || value === undefined) {
    return null;
  }
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return null;
  }
  const rounded = Math.round(num);
  if (rounded < FINISH_RATING_MIN || rounded > FINISH_RATING_MAX) {
    return null;
  }
  return rounded;
}

function promptFinishRatingFallback(item) {
  const input = prompt(`Rate "${item.title || 'this entry'}" from ${FINISH_RATING_MIN}-${FINISH_RATING_MAX} stars before finishing:`);
  if (input === null) {
    return null;
  }
  const normalized = normalizeFinishRating(input);
  if (normalized === null) {
    alert(`Please enter a number between ${FINISH_RATING_MIN} and ${FINISH_RATING_MAX}.`);
    return null;
  }
  return normalized;
}

export function promptFinishRating(item, callbacks = {}) {
  if (!modalRoot) {
    return Promise.resolve(promptFinishRatingFallback(item));
  }
  
  if (callbacks.closeAddModal) callbacks.closeAddModal();
  if (callbacks.closeWheelModal) callbacks.closeWheelModal();

  return new Promise(resolve => {
    let selectedRating = null;
    let resolved = false;

    const backdrop = createEl('div', 'modal-backdrop finish-rating-backdrop');
    const modal = createEl('div', 'modal finish-rating-modal');
    const heading = createEl('h3', 'finish-rating-heading', { text: `Rate ${item.title || 'this entry'}` });
    const subtitle = createEl('p', 'finish-rating-subtitle', { text: 'Pick how many stars it earned before filing it in Finished.' });
    const options = createEl('div', 'finish-rating-options');
    const optionButtons = [];

    const preview = createEl('div', 'finish-rating-preview', { text: 'Select a rating to continue.' });
    const actions = createEl('div', 'finish-rating-actions');
    const cancelBtn = createEl('button', 'btn ghost', { text: 'Cancel' });
    const confirmBtn = createEl('button', 'btn success', { text: 'Finish' });
    confirmBtn.disabled = true;

    function selectRating(value) {
      selectedRating = value;
      preview.textContent = `Rated ${value} star${value === 1 ? '' : 's'}`;
      confirmBtn.disabled = false;
      optionButtons.forEach(btn => {
        btn.classList.toggle('is-selected', Number(btn.dataset.rating) === selectedRating);
      });
    }

    function cleanup(result) {
      if (resolved) return;
      resolved = true;
      document.removeEventListener('keydown', handleKeyDown);
      backdrop.removeEventListener('click', handleBackdropClick);
      if (modalRoot) {
        modalRoot.innerHTML = '';
      }
      resolve(result);
    }

    function handleKeyDown(ev) {
      if (ev.key === 'Escape') {
        ev.preventDefault();
        cleanup(null);
      } else if (ev.key === 'Enter' && selectedRating !== null && !confirmBtn.disabled) {
        ev.preventDefault();
        cleanup(selectedRating);
      }
    }

    function handleBackdropClick(ev) {
      if (ev.target === backdrop) {
        cleanup(null);
      }
    }

    for (let rating = FINISH_RATING_MIN; rating <= FINISH_RATING_MAX; rating++) {
      const btn = createEl('button', 'finish-rating-option');
      btn.dataset.rating = String(rating);
      const valueEl = createEl('span', 'finish-rating-value', { text: rating });
      const starEl = createEl('span', 'finish-rating-star', { text: '★' });
      btn.appendChild(valueEl);
      btn.appendChild(starEl);
      btn.addEventListener('click', (ev) => {
        ev.preventDefault();
        selectRating(rating);
      });
      optionButtons.push(btn);
      options.appendChild(btn);
    }

    cancelBtn.addEventListener('click', (ev) => {
      ev.preventDefault();
      cleanup(null);
    });
    confirmBtn.addEventListener('click', (ev) => {
      ev.preventDefault();
      if (selectedRating !== null) {
        cleanup(selectedRating);
      }
    });

    actions.appendChild(cancelBtn);
    actions.appendChild(confirmBtn);

    modal.appendChild(heading);
    modal.appendChild(subtitle);
    modal.appendChild(options);
    modal.appendChild(preview);
    modal.appendChild(actions);
    backdrop.appendChild(modal);
    modalRoot.innerHTML = '';
    modalRoot.appendChild(backdrop);

    document.addEventListener('keydown', handleKeyDown);
    backdrop.addEventListener('click', handleBackdropClick);
  });
}

// ============================================
// FINISH ITEM
// ============================================
export async function finishItem(listType, itemId, ratingValue) {
  if (!currentUser) {
    alert('Not signed in');
    return;
  }
  const cache = listCaches[listType] || {};
  const item = cache[itemId];
  if (!item) {
    alert('Unable to find this entry. Refresh and try again.');
    return;
  }
  const payload = { ...item };
  delete payload.__id;
  delete payload.__type;
  delete payload.__source;
  payload.finishedAt = Date.now();
  const normalizedRating = normalizeFinishRating(ratingValue);
  if (normalizedRating !== null) {
    payload.finishedRating = normalizedRating;
    payload.finishedRatingScale = FINISH_RATING_MAX;
  }

  const db = getFirebaseDatabase();
  const finishedRef = ref(db, `users/${currentUser.uid}/finished/${listType}/${itemId}`);
  const sourceRef = ref(db, `users/${currentUser.uid}/${listType}/${itemId}`);
  try {
    await set(finishedRef, payload);
    await remove(sourceRef);
    const ratingSuffix = normalizedRating !== null ? ` (${normalizedRating}/10)` : '';
    pushNotification({
      title: 'Moved to Finished',
      message: `${item.title || 'Entry'} now lives in your Finished list${ratingSuffix}.`
    });
  } catch (err) {
    console.error('finishItem failed', err);
    pushNotification({
      title: 'Could not finish item',
      message: 'Something went wrong while filing this entry. Please try again.'
    });
  }
}

export async function handleFinishRequest(listType, itemId, callbacks = {}) {
  if (!currentUser) {
    alert('Not signed in');
    return;
  }
  const cache = listCaches[listType] || {};
  const item = cache[itemId];
  if (!item) {
    alert('Unable to find this entry. Refresh and try again.');
    return;
  }
  const rating = await promptFinishRating(item, callbacks);
  if (rating === null) {
    return;
  }
  await finishItem(listType, itemId, rating);
}

// ============================================
// DELETE SERIES
// ============================================
export async function deleteSeriesEntries(listType, seriesName, options = {}) {
  const { fromFinished = false } = options;
  if (!SERIES_BULK_DELETE_LISTS.has(listType)) return;
  if (!currentUser) {
    alert('Not signed in');
    return;
  }
  if (!seriesName) {
    alert('Series name missing for bulk delete.');
    return;
  }
  const normalized = normalizeTitleKey(seriesName);
  if (!normalized) {
    alert('Unable to determine which series to delete.');
    return;
  }
  
  // Check the appropriate cache based on fromFinished flag
  const cache = fromFinished ? (finishedCaches[listType] || {}) : (listCaches[listType] || {});
  const basePath = fromFinished ? `users/${currentUser.uid}/finished/${listType}` : `users/${currentUser.uid}/${listType}`;
  
  const entries = Object.entries(cache).filter(
    ([, item]) => normalizeTitleKey(item?.seriesName || '') === normalized
  );
  if (!entries.length) {
    alert(`No entries found for "${seriesName}".`);
    return;
  }
  const confirmed = confirm(`Delete all ${entries.length} entries in the "${seriesName}" series? This cannot be undone.`);
  if (!confirmed) return;
  
  const db = getFirebaseDatabase();
  const removals = entries.map(([id]) => {
    const itemRef = ref(db, `${basePath}/${id}`);
    return remove(itemRef).catch(err => {
      console.error('Series delete failed', listType, id, err);
      throw err;
    });
  });
  try {
    await Promise.all(removals);
    alert(`Deleted ${entries.length} entr${entries.length === 1 ? 'y' : 'ies'} from "${seriesName}".`);
  } catch (err) {
    alert('Some entries could not be deleted. Please try again.');
  }
}

// ============================================
// MERGE SERIES
// ============================================
export async function mergeSeriesEntriesByName(seriesName, fallbackSeriesName = '', callbacks = {}) {
  const targetName = (seriesName || '').trim();
  if (!targetName) {
    alert('Series name is required to merge.');
    return;
  }
  if (!currentUser) {
    alert('Not signed in');
    return;
  }
  const normalizedTargets = new Set();
  const primaryNormalized = normalizeTitleKey(targetName);
  if (primaryNormalized) normalizedTargets.add(primaryNormalized);
  const fallbackNormalized = normalizeTitleKey(fallbackSeriesName || '');
  if (fallbackNormalized) normalizedTargets.add(fallbackNormalized);
  if (!normalizedTargets.size) {
    alert('Series name is required to merge.');
    return;
  }
  
  // Group entries by their original series name (check both main and finished caches)
  const entriesByGroup = new Map();
  const seenIds = new Set();
  
  const addEntryToGroup = (type, id, entry) => {
    if (!entry) return;
    const entryKey = normalizeTitleKey(entry.seriesName || '');
    if (!entryKey || !normalizedTargets.has(entryKey)) return;
    
    // Avoid duplicates
    const uniqueKey = `${type}:${id}`;
    if (seenIds.has(uniqueKey)) return;
    seenIds.add(uniqueKey);
    
    const groupKey = entryKey;
    if (!entriesByGroup.has(groupKey)) {
      entriesByGroup.set(groupKey, []);
    }
    entriesByGroup.get(groupKey).push({ listType: type, id, item: entry });
  };
  
  // Check all collapsible lists (movies, tvShows, anime)
  COLLAPSIBLE_LISTS.forEach(type => {
    // Check main cache
    const mainStore = listCaches[type] || {};
    Object.entries(mainStore).forEach(([id, entry]) => addEntryToGroup(type, id, entry));
    
    // Check finished cache
    const finishedStore = finishedCaches[type] || {};
    Object.entries(finishedStore).forEach(([id, entry]) => addEntryToGroup(type, id, entry));
  });
  
  if (!entriesByGroup.size) {
    alert(`No entries found for "${targetName}".`);
    return;
  }
  
  // Sort each group by their internal order
  entriesByGroup.forEach((groupEntries) => {
    groupEntries.sort((a, b) => {
      const orderA = a.item.seriesOrder ?? Infinity;
      const orderB = b.item.seriesOrder ?? Infinity;
      if (orderA !== orderB) return orderA - orderB;
      // Secondary sort by year
      const yearA = parseInt(a.item.year) || 9999;
      const yearB = parseInt(b.item.year) || 9999;
      if (yearA !== yearB) return yearA - yearB;
      // Tertiary sort by title
      return (a.item.title || '').localeCompare(b.item.title || '');
    });
  });
  
  // Combine groups: primary series first, then others sorted by earliest year
  const groups = Array.from(entriesByGroup.entries());
  groups.sort((a, b) => {
    // Primary series (matching target name) comes first
    if (a[0] === primaryNormalized) return -1;
    if (b[0] === primaryNormalized) return 1;
    // Otherwise sort by earliest year in group
    const minYearA = Math.min(...a[1].map(e => parseInt(e.item.year) || 9999));
    const minYearB = Math.min(...b[1].map(e => parseInt(e.item.year) || 9999));
    return minYearA - minYearB;
  });
  
  // Flatten into final ordered list
  const entries = groups.flatMap(([, groupEntries]) => groupEntries);
  
  const confirmed = confirm(`Merge ${entries.length} entr${entries.length === 1 ? 'y' : 'ies'} into "${targetName}" and re-number the series (1 through ${entries.length})?`);
  if (!confirmed) return;
  
  const listTypesToRebalance = new Set();
  const seriesSize = entries.length;
  try {
    await Promise.all(entries.map((entry, index) => {
      const payload = {
        seriesName: targetName,
        seriesOrder: index + 1,
        seriesSize,
      };
      listTypesToRebalance.add(entry.listType);
      return updateItem(entry.listType, entry.id, payload).then(() => {
        if (callbacks.updateLocalItemCaches) {
          callbacks.updateLocalItemCaches(entry.listType, entry.id, payload);
        }
      });
    }));
    if (callbacks.rebalanceSeriesOrders) {
      await Promise.all(Array.from(listTypesToRebalance).map(type => 
        callbacks.rebalanceSeriesOrders(type, targetName)
      ));
    }
    
    // Invalidate series cache to refresh UI
    if (callbacks.invalidateSeriesCrossListCache) {
      callbacks.invalidateSeriesCrossListCache();
    }
    
    alert(`Merged ${seriesSize} entr${seriesSize === 1 ? 'y' : 'ies'} in "${targetName}" (numbered 1-${seriesSize}).`);
  } catch (err) {
    console.error('Series merge failed', err);
    alert('Unable to merge this series right now. Please try again.');
  }
}

// ============================================
// UPDATE LOCAL CACHES
// ============================================
export function updateLocalItemCaches(listType, itemId, changes) {
  if (listCaches[listType] && listCaches[listType][itemId]) {
    Object.assign(listCaches[listType][itemId], changes);
  }
  if (finishedCaches[listType] && finishedCaches[listType][itemId]) {
    Object.assign(finishedCaches[listType][itemId], changes);
  }
}

// ============================================
// SPLIT TV SHOW INTO SEASONS
// ============================================
export async function splitTvShowSeasons(itemId, item, fetchAllTvSeasons) {
  if (!currentUser) {
    alert('Not signed in');
    throw new Error('Not signed in');
  }
  
  if (!item.tmdbId) {
    alert('This TV show doesn\'t have TMDB data. Please refresh metadata first.');
    return { success: false };
  }
  
  const showTitle = item.title || 'Unknown Show';
  
  if (!confirm(`Split "${showTitle}" into individual seasons?\n\nThis will create separate entries for each season and group them together.`)) {
    return { success: false };
  }
  
  try {
    pushNotification({ message: `Fetching season data for ${showTitle}...`, type: 'info' });
    
    // Fetch all season details from TMDB
    const seasons = await fetchAllTvSeasons(item.tmdbId);
    
    if (!seasons || seasons.length === 0) {
      alert('Could not fetch season data from TMDB. Please try again.');
      return { success: false };
    }
    
    pushNotification({ message: `Found ${seasons.length} seasons. Creating entries...`, type: 'info' });
    
    const db = getFirebaseDatabase();
    const listRef = ref(db, `users/${currentUser.uid}/tvShows`);
    
    // Use the show title as the series name for grouping
    const seriesName = showTitle;
    
    // Create an entry for each season
    const createdIds = [];
    for (let i = 0; i < seasons.length; i++) {
      const season = seasons[i];
      
      // Build the season entry
      const seasonEntry = {
        title: `${showTitle}: ${season.name}`,
        year: season.year || item.year || null,
        poster: season.poster || item.poster || null,
        plot: season.overview || item.plot || null,
        tmdbId: item.tmdbId,
        imdbId: item.imdbId || null,
        imdbUrl: item.imdbUrl || null,
        trailerUrl: item.trailerUrl || null,
        imdbRating: item.imdbRating || null,
        seriesName: seriesName,
        seriesOrder: season.seasonNumber,
        seasonNumber: season.seasonNumber,
        tvEpisodeCount: season.episodeCount || null,
        episodes: season.episodes || [],
        actors: season.cast?.length ? season.cast.join(', ') : (item.actors || null),
        genres: item.genres || null,
        hasAnimeKeyword: item.hasAnimeKeyword || false,
        tvStatus: item.tvStatus || null,
        tvEpisodeRuntime: item.tvEpisodeRuntime || null,
        originalLanguage: item.originalLanguage || null,
        addedAt: new Date().toISOString(),
        createdAt: Date.now(),
        splitFromId: itemId,
      };
      
      // Clean up null/undefined values
      Object.keys(seasonEntry).forEach(key => {
        if (seasonEntry[key] === null || seasonEntry[key] === undefined) {
          delete seasonEntry[key];
        }
      });
      
      const newRef = push(listRef);
      await set(newRef, seasonEntry);
      createdIds.push(newRef.key);
    }
    
    // Delete the original entry
    const originalRef = ref(db, `users/${currentUser.uid}/tvShows/${itemId}`);
    await remove(originalRef);
    
    pushNotification({ 
      message: `Split "${showTitle}" into ${seasons.length} seasons successfully!`, 
      type: 'success' 
    });
    
    return { 
      success: true, 
      createdIds, 
      deletedId: itemId,
      seasonCount: seasons.length,
      seriesName 
    };
    
  } catch (err) {
    console.error('Split TV show failed', err);
    alert('Failed to split TV show. Please try again.');
    return { success: false, error: err };
  }
}
