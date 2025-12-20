// Collapsible Card Rendering Module
// Handles the advanced collapsible card building for movies, TV shows, and anime
import { ANIME_STATUS_PRIORITY, COLLAPSIBLE_LISTS, MEDIA_TYPE_LABELS, SERIES_BULK_DELETE_LISTS, TMDB_API_KEY } from './config.js';
import { 
  listCaches, 
  finishedCaches, 
  expandedCards, 
  seriesGroups,
  getSeriesGroupEntries,
  seriesSortState,
  showFinishedOnly,
  currentUser
} from './state.js';
import { createEl, debounce, titleSortKey, sanitizeYear, numericSeriesOrder, truncateText, normalizeTitleKey } from './utils.js';
import { isCollapsibleList, buildSeriesLine, buildActorPreview, buildFinishedRatingBadge } from './cards.js';
import { 
  mergeSeriesEntriesAcrossLists, 
  buildSeriesEntryKey,
  compareSeriesEntries,
  collectSeriesEntriesAcrossLists,
  invalidateSeriesCrossListCache
} from './seriesGrouping.js';
import { openEditModal } from './modals.js';
import { handleFinishRequest, deleteItem, deleteSeriesEntries, updateItem } from './crud.js';
import { getUserRegion, ensureTmdbIdentity, fetchWatchProviders } from './metadata.js';
import { getFirebaseDatabase } from './firebase.js';
import { ref, update } from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-database.js';

// ============================================
// SERIES TREE DRAG STATE
// ============================================
const seriesTreeDragState = {
  activeNode: null,
  listElement: null,
  placeholder: null,
  cardId: null,
  listType: null,
  cardElement: null,
  entries: null,
  entryMap: null,
  activeEntryKey: null,
};
let seriesTreeDragEventsBound = false;
let seriesTreeWheelUnsubscribe = null;

// ============================================
// CARD TITLE AUTO-SIZING
// ============================================
const cardTitleResizeQueue = new Set();
let cardTitleResizeScheduled = false;
const cardTitleResizeHandlers = new WeakMap();

export function queueCardTitleAutosize(card) {
  if (!card) return;
  cardTitleResizeQueue.add(card);
  if (!cardTitleResizeScheduled) {
    cardTitleResizeScheduled = true;
    requestAnimationFrame(flushCardTitleAutosizeQueue);
  }
}

export function ensureCardTitleResizeListener(card) {
  if (!card || cardTitleResizeHandlers.has(card)) return;
  const handler = (event) => {
    if (event && event.target !== card) return;
    if (event && event.propertyName && !/width|flex|grid|padding|margin|gap/.test(event.propertyName)) {
      return;
    }
    queueCardTitleAutosize(card);
  };
  card.addEventListener('transitionend', handler);
  cardTitleResizeHandlers.set(card, handler);
}

function flushCardTitleAutosizeQueue() {
  cardTitleResizeScheduled = false;
  if (!cardTitleResizeQueue.size) return;
  cardTitleResizeQueue.forEach(card => applyCardTitleAutosize(card));
  cardTitleResizeQueue.clear();
}

function applyCardTitleAutosize(card) {
  if (!card) return;
  const titleEl = card.querySelector('.movie-card-header .title') || card.querySelector('.card-header .title');
  if (!titleEl) return;
  autosizeTitleElement(titleEl);
}

export function autosizeTitleElement(titleEl) {
  if (!titleEl) return;
  const container = titleEl.parentElement;
  const availableWidth = container?.clientWidth || titleEl.clientWidth;
  if (!availableWidth) return;
  if (!titleEl.dataset.baseFontSize) {
    const computed = window.getComputedStyle(titleEl);
    titleEl.dataset.baseFontSize = computed.fontSize || '16px';
  }
  titleEl.classList.add('single-line-title');
  titleEl.style.fontSize = titleEl.dataset.baseFontSize;
  const baseFontPx = parseFloat(titleEl.dataset.baseFontSize) || 16;
  let fontPx = baseFontPx;
  const minFontPx = Math.max(baseFontPx * 0.65, 10);
  let iterations = 0;
  while (titleEl.scrollWidth > availableWidth && fontPx > minFontPx && iterations < 24) {
    fontPx -= 0.5;
    titleEl.style.fontSize = `${fontPx}px`;
    iterations += 1;
  }
}

export const recalcCardTitleSizes = debounce(() => {
  document.querySelectorAll('.single-line-title').forEach(titleEl => autosizeTitleElement(titleEl));
}, 200);

// ============================================
// ANIME KEYWORD DETECTION
// ============================================
export function itemHasAnimeKeyword(item) {
  if (!item) return false;
  if (item.hasAnimeKeyword === true) return true;
  const candidates = [
    item.franchiseKeywordName,
    item.keywordName,
    item.franchiseKeywordLabel,
    item.listType,
    item.animeFormat,
    item.mediaType,
  ].filter(Boolean).map(v => String(v).toLowerCase());
  return candidates.some(v => v.includes('anime'));
}

// ============================================
// ANIME MOVIE DETECTION
// ============================================
export function isAnimeMovieEntry(item) {
  if (!item) return false;
  const format = String(item.animeFormat || item.format || '').trim().toUpperCase();
  return format === 'MOVIE' || format === 'FILM';
}

// ============================================
// FORMAT ANIME RUNTIME LABEL
// ============================================
export function formatAnimeRuntimeLabel(item) {
  if (!item) return '';
  const duration = parseEpisodeValue(item.animeDuration);
  if (!duration) return '';
  if (isAnimeMovieEntry(item)) {
    return `${duration} min`;
  }
  return `${duration} min/ep`;
}

// ============================================
// COLLAPSIBLE CARD EXPANSION STATE
// ============================================
export function ensureExpandedSet(listType) {
  let store = expandedCards[listType];
  if (!(store instanceof Set)) {
    store = new Set(store ? [store] : []);
    expandedCards[listType] = store;
  }
  return store;
}

export function toggleCardExpansion(listType, cardId, callbacks = {}) {
  const { updateStates, resetSeriesCard } = callbacks;
  if (!(listType in expandedCards)) return;
  const expandedSet = ensureExpandedSet(listType);
  
  if (expandedSet.has(cardId)) {
    expandedSet.delete(cardId);
    if (isCollapsibleList(listType) && typeof resetSeriesCard === 'function') {
      resetSeriesCard(listType, cardId);
    }
  } else {
    expandedSet.add(cardId);
  }
  
  if (typeof updateStates === 'function') {
    updateStates(listType);
  }
}

// ============================================
// POSTER & ARTWORK BUILDING
// ============================================
export function buildPosterNode(posterUrl, title = '', isPrimary = false) {
  const node = createEl('div', posterUrl ? 'artwork' : 'artwork placeholder');
  if (posterUrl) {
    const img = createEl('img');
    img.src = posterUrl;
    img.alt = `${title || 'Poster'} artwork`;
    img.loading = 'lazy';
    node.appendChild(img);
  } else {
    node.textContent = 'No Poster';
  }
  if (isPrimary) {
    node.classList.add('artwork-primary');
  }
  return node;
}

export function buildSeriesPosterStackItems(activeItem, seriesEntries = []) {
  const items = [];
  const seen = new Set();
  function addItem(source) {
    if (!source) return;
    const poster = source.poster || '';
    const key = poster || `title:${source.title || ''}`;
    if (seen.has(key)) return;
    seen.add(key);
    items.push({ poster: poster || '', title: source.title || '' });
  }
  if (activeItem) addItem(activeItem);
  seriesEntries.forEach(entry => addItem(entry?.item));
  return items.filter(entry => entry.poster);
}

export function computeDeckStepValues({ isExpanded = false, visibleCount = 0 } = {}) {
  if (visibleCount <= 1) {
    return { baseStep: 0, hoverStep: 0 };
  }
  const deckWidth = isExpanded ? 260 : 175;
  const posterWidth = isExpanded ? 160 : 112;
  const availableShift = Math.max(deckWidth - posterWidth, 12);
  const minStep = Math.max(12, posterWidth * 0.15);
  const maxStep = Math.max(minStep, posterWidth * 0.72);
  const rawStep = availableShift / Math.max(visibleCount - 1, 1);
  const baseStep = Math.min(maxStep, Math.max(minStep, rawStep));
  const hoverStep = Math.min(baseStep * 1.75, maxStep * 1.25);
  return { baseStep, hoverStep };
}

// ============================================
// STATUS LABELS
// ============================================
export function formatTvStatusLabel(value) {
  if (!value) return '';
  return value.toString().replace(/_/g, ' ').replace(/\b\w/g, ch => ch.toUpperCase());
}

export function formatAnimeStatusLabel(value) {
  if (!value) return '';
  return String(value).replace(/_/g, ' ').replace(/\b\w/g, ch => ch.toUpperCase());
}

export function formatAnimeFormatLabel(value) {
  if (!value) return '';
  return String(value).replace(/_/g, ' ').replace(/\b\w/g, ch => ch.toUpperCase());
}

// ============================================
// EPISODE COUNTING
// ============================================
export function extractEpisodeCount(entry) {
  if (!entry) return 0;
  const seasonFields = ['animeSeasonSummaries', 'tvSeasonSummaries'];
  for (const field of seasonFields) {
    const total = sumSeasonEpisodeCounts(entry[field]);
    if (total > 0) return total;
  }
  const directCandidates = [entry.animeEpisodes, entry.totalEpisodes, entry.episodes];
  for (const candidate of directCandidates) {
    const parsed = parseEpisodeValue(candidate);
    if (parsed > 0) return parsed;
  }
  return 0;
}

export function sumSeasonEpisodeCounts(seasons) {
  if (!Array.isArray(seasons) || !seasons.length) return 0;
  return seasons.reduce((total, season) => {
    const parsed = parseEpisodeValue(season?.episodeCount);
    return parsed > 0 ? total + parsed : total;
  }, 0);
}

export function parseEpisodeValue(value) {
  if (value === undefined || value === null) return 0;
  if (typeof value === 'number') {
    return Number.isFinite(value) && value > 0 ? value : 0;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return 0;
    if (/season/i.test(trimmed) && !/episod|\bep\b/i.test(trimmed)) return 0;
    const match = trimmed.match(/(\d+(?:\.\d+)?)/);
    if (!match) return 0;
    const parsed = Number(match[1]);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  }
  return 0;
}

export function formatAnimeEpisodesLabel(count) {
  const parsed = Number(count);
  if (!Number.isFinite(parsed) || parsed <= 0) return '';
  return `${parsed} ep${parsed === 1 ? '' : 's'}`;
}

// ============================================
// ANIME SEASON FIELD DETECTION
// ============================================
export function getAnimeSeasonField(item) {
  if (!item) return null;
  if (Array.isArray(item.animeSeasonSummaries) && item.animeSeasonSummaries.length) {
    return 'animeSeasonSummaries';
  }
  if (Array.isArray(item.tvSeasonSummaries) && item.tvSeasonSummaries.length) {
    return 'tvSeasonSummaries';
  }
  return null;
}

// ============================================
// SERIES BADGE METRICS
// ============================================
export function deriveSeriesBadgeMetrics(listType, cardId, fallbackItem, providedEntries = null) {
  const normalizedListType = listType || 'anime';
  let entries = [];
  
  if (providedEntries && Array.isArray(providedEntries) && providedEntries.length > 0) {
    entries = providedEntries.map(entry => entry && entry.item).filter(Boolean);
  } else if (cardId && isCollapsibleList(normalizedListType)) {
    const groupEntries = getSeriesGroupEntries(normalizedListType, cardId);
    if (groupEntries && groupEntries.length) {
      entries = groupEntries.map(entry => entry && entry.item).filter(Boolean);
    }
  }
  
  if (!entries.length && fallbackItem) {
    entries = [fallbackItem];
  }
  if (!entries.length) return null;

  const formatLabels = new Map();
  let movieCount = 0;
  let totalEpisodes = 0;
  let bestStatus = '';
  let bestPriority = -1;

  entries.forEach(entry => {
    if (!entry) return;
    const rawFormat = entry.animeFormat || entry.imdbType || '';
    if (rawFormat) {
      const normalized = String(rawFormat).toUpperCase();
      if (!formatLabels.has(normalized)) {
        formatLabels.set(normalized, formatAnimeFormatLabel(rawFormat));
      }
      if (normalized === 'MOVIE') movieCount++;
    }
    const epValue = extractEpisodeCount(entry);
    const isMovie = isAnimeMovieEntry(entry);
    if (epValue > 0 && !isMovie) {
      totalEpisodes += epValue;
    }
    const status = (entry.animeStatus || entry.status || '').toUpperCase();
    if (status) {
      const priority = ANIME_STATUS_PRIORITY[status] || 0;
      if (priority > bestPriority) {
        bestPriority = priority;
        bestStatus = status;
      }
    }
  });

  return {
    formatLabels: Array.from(formatLabels.values()),
    movieCount,
    totalEpisodes,
    statusLabel: bestStatus,
  };
}

// ============================================
// SERIES NAME RESOLUTION
// ============================================
export function resolveSeriesNameFromEntries(seriesEntries, fallbackItem) {
  if (Array.isArray(seriesEntries) && seriesEntries.length) {
    const first = seriesEntries[0];
    if (first?.item?.seriesName) return first.item.seriesName;
    if (first?.seriesName) return first.seriesName;
  }
  return fallbackItem?.seriesName || '';
}

export function resolveSeriesCardTitleParts(item, context = {}) {
  const defaultTitle = item?.title || '(no title)';
  const seriesName = resolveSeriesNameFromEntries(context.seriesEntries, item);
  if (!context.isExpanded && seriesName) {
    return { titleText: seriesName, subtitleText: '' };
  }
  return { titleText: defaultTitle, subtitleText: '' };
}

// ============================================
// MEDIA BADGE CHIPS
// ============================================
export function buildMediaSummaryBadges(listType, item, context = {}) {
  if (!item) return null;
  const chips = collectMediaBadgeChips(listType, item, context);
  const flaggedAnime = itemHasAnimeKeyword(item);
  
  if (flaggedAnime && !chips.some(chip => typeof chip === 'string' && chip.toLowerCase() === 'anime')) {
    chips.unshift('Anime');
  } else if (listType === 'tvShows' && !chips.some(c => typeof c === 'string' && c.toLowerCase().includes('tv'))) {
    chips.unshift('TV Show');
  } else if (listType === 'movies' && !chips.some(c => typeof c === 'string' && c.toLowerCase().includes('movie'))) {
    chips.unshift('Movie');
  }
  
  if (!chips.length) return null;
  
  const isTv = listType === 'tvShows';
  const rowClass = (isTv ? 'tv-summary-badges' : 'anime-summary-badges') + ' secondary-info';
  const chipClass = isTv ? 'tv-chip' : 'anime-chip';
  const row = createEl('div', rowClass);
  
  if (context.cardId) row.dataset.cardId = context.cardId;
  if (context.listType) row.dataset.listType = context.listType;
  if (flaggedAnime) row.dataset.animeKeyword = 'true';
  
  chips.forEach(text => {
    const isAnimeChip = flaggedAnime && text === 'Anime';
    row.appendChild(createEl('span', isAnimeChip ? 'anime-chip' : chipClass, { text }));
  });
  
  return row;
}

export function collectMediaBadgeChips(listType, item, context = {}) {
  if (listType === 'tvShows') {
    return buildTvStatChips(item, context);
  }
  if (listType === 'movies' || listType === 'anime') {
    return buildSeriesBadgeChips(listType, context.cardId, item, context);
  }
  return [];
}

export function buildSeriesBadgeChips(listType, cardId, item, context = {}) {
  const metrics = deriveSeriesBadgeMetrics(listType, cardId, item, context.seriesEntries);
  if (!metrics) return [];
  const chips = [];
  
  let displayLabels = metrics.formatLabels;
  if (metrics.movieCount > 0) {
    displayLabels = displayLabels.filter(l => l.toLowerCase() !== 'movie');
  }

  if (displayLabels.length) {
    chips.push(displayLabels.join(' / '));
  }
  if (metrics.movieCount > 0) {
    chips.push(`${metrics.movieCount} movie${metrics.movieCount === 1 ? '' : 's'}`);
  }
  if (metrics.totalEpisodes > 0) {
    chips.push(`${metrics.totalEpisodes} ep total`);
  }
  return chips;
}

// ============================================
// TV STAT CHIPS
// ============================================
export function getTvSeasonCount(item) {
  if (!item) return 0;
  const direct = Number(item.tvSeasonCount);
  if (Number.isFinite(direct) && direct > 0) return direct;
  if (Array.isArray(item.tvSeasonSummaries)) {
    return item.tvSeasonSummaries.filter(s => s && (s.seasonNumber !== undefined && s.seasonNumber !== null)).length;
  }
  return 0;
}

export function getTvEpisodeCount(item) {
  if (!item) return 0;
  const direct = Number(item.tvEpisodeCount);
  if (Number.isFinite(direct) && direct > 0) return direct;
  if (Array.isArray(item.tvSeasonSummaries)) {
    return item.tvSeasonSummaries.reduce((total, season) => {
      const count = Number(season?.episodeCount);
      return Number.isFinite(count) && count > 0 ? total + count : total;
    }, 0);
  }
  return 0;
}

export function formatTvRuntimeLabel(item) {
  if (!item) return '';
  const runtime = Number(item.tvEpisodeRuntime);
  if (Number.isFinite(runtime) && runtime > 0) {
    return `${runtime} min/ep`;
  }
  if (typeof item.runtime === 'string') {
    const match = item.runtime.match(/(\d+)\s*min/);
    if (match) {
      const value = Number(match[1]);
      if (Number.isFinite(value)) {
        return item.runtime.includes('/ep') ? `${value} min/ep` : `${value} min`;
      }
    }
  }
  return '';
}

export function buildTvStatChips(item, context = {}) {
  if (!item) return [];

  // Collapsed view for multi-entry series
  if (context && context.isExpanded === false) {
    let entries = context.seriesEntries;
    if (!entries && context.cardId) {
      entries = getSeriesGroupEntries('tvShows', context.cardId);
    }
    
    if (entries && entries.length > 1) {
      let totalSeasons = 0;
      let totalEpisodes = 0;
      
      entries.forEach(entry => {
        const it = entry.item;
        if (!it) return;
        const sCount = getTvSeasonCount(it);
        totalSeasons += (sCount > 0 ? sCount : 1);
        totalEpisodes += getTvEpisodeCount(it);
      });

      const chips = [];
      if (totalSeasons > 0) chips.push(`${totalSeasons} seasons`);
      if (totalEpisodes > 0) chips.push(`${totalEpisodes} episodes`);
      return chips;
    }
  }

  if (Array.isArray(item.cachedTvBadges) && item.cachedTvBadges.length) {
    const badges = item.cachedTvBadges.slice();
    const filteredBadges = badges.filter(b => {
      const lower = b.toLowerCase();
      return !lower.includes('ended') && !lower.includes('returning') && !lower.includes('canceled');
    });
    if (context && context.isExpanded === false) {
      return filteredBadges.filter(b => !b.includes('min/ep') && !b.includes('min'));
    }
    return filteredBadges;
  }
  
  return computeTvBadgeStrings(item, context);
}

export function computeTvBadgeStrings(source, context = {}) {
  if (!source) return [];
  const chips = [];
  
  const seasonCount = getTvSeasonCount(source);
  if (seasonCount > 0) {
    chips.push(`${seasonCount} season${seasonCount === 1 ? '' : 's'}`);
  }
  
  const episodeCount = getTvEpisodeCount(source);
  if (episodeCount > 0) {
    chips.push(`${episodeCount} episode${episodeCount === 1 ? '' : 's'}`);
  }
  
  const runtimeLabel = formatTvRuntimeLabel(source);
  if (runtimeLabel) {
    const shouldHide = context && context.isExpanded === false;
    if (!shouldHide) {
      chips.push(runtimeLabel);
    }
  }
  
  return chips;
}

// ============================================
// STATUS BADGE
// ============================================
export function buildStatusBadge(listType, item, context = {}) {
  let statusLabel = '';
  if (listType === 'tvShows') {
    statusLabel = formatTvStatusLabel(item?.tvStatus || item?.status);
  } else if (listType === 'anime') {
    const metrics = deriveSeriesBadgeMetrics(listType, context.cardId, item, context.seriesEntries);
    if (metrics && metrics.statusLabel) {
      statusLabel = formatAnimeStatusLabel(metrics.statusLabel);
    }
  } else if (listType === 'movies') {
    if (item?.status) statusLabel = item.status;
  }

  if (!statusLabel) return null;
  return createEl('span', 'status-badge', { text: statusLabel });
}

// ============================================
// MOVIE META TEXT
// ============================================
export function buildMovieMetaText(item) {
  if (!item) return '';
  const parts = [];
  if (item.year) parts.push(item.year);
  if (item.director) parts.push(item.director);
  if (item.imdbRating) parts.push(`IMDb ${item.imdbRating}`);
  if (item.runtime) parts.push(item.runtime);
  return parts.filter(Boolean).join(' • ');
}

export function buildMovieExtendedMeta(item) {
  if (!item) return null;
  const parts = [];
  if (item.metascore) parts.push(`Metascore: ${item.metascore}`);
  if (item.originalLanguage) parts.push(`Language: ${item.originalLanguage}`);
  if (item.budget) parts.push(`Budget: ${item.budget}`);
  if (item.revenue) parts.push(`Revenue: ${item.revenue}`);
  if (!parts.length) return null;
  return createEl('div', 'extended-meta', { text: parts.join(' • ') });
}

export function buildMovieGenreRow(item) {
  if (!item) return null;
  const genres = Array.isArray(item.genres) ? item.genres : [];
  if (!genres.length) return null;
  return createEl('div', 'genre-row', { text: `Genres: ${genres.join(', ')}` });
}

export function buildMovieCastLine(item) {
  const actorPreview = buildActorPreview(item?.actors, 5);
  if (!actorPreview) return null;
  return createEl('div', 'cast-line', { text: `Cast: ${actorPreview}` });
}

// ============================================
// BUILD WATCH NOW SECTION (WHERE TO WATCH)
// ============================================
export function buildWatchNowSection(listType, item, inline = false) {
  if (!TMDB_API_KEY) return null;
  
  const region = getUserRegion();
  const block = inline ? createEl('span', 'watch-now-inline') : createEl('div', 'watch-now-block');
  
  const btnClass = inline ? 'meta-link' : 'btn secondary';
  const btn = createEl('button', btnClass, { text: 'Watch Now' });
  if (!inline) {
    const controlRow = createEl('div', 'watch-now-controls');
    controlRow.style.display = 'flex';
    controlRow.style.gap = '.5rem';
    controlRow.style.alignItems = 'center';
    controlRow.appendChild(btn);
    block.appendChild(controlRow);
  } else {
    block.appendChild(btn);
  }

  const dropdown = createEl('div', 'watch-dropdown');
  dropdown.style.display = 'none';
  dropdown.style.marginTop = inline ? '.25rem' : '.5rem';
  dropdown.style.background = 'var(--card-bg, #1f1f1f)';
  dropdown.style.border = '1px solid var(--border, #333)';
  dropdown.style.borderRadius = '8px';
  dropdown.style.padding = '.5rem';
  dropdown.style.boxShadow = '0 4px 14px rgba(0,0,0,0.3)';
  dropdown.textContent = 'Loading…';
  block.appendChild(dropdown);

  let opened = false;
  let loaded = false;
  let cache = item.__watchProvidersCache || null;

  function toggle() {
    opened = !opened;
    dropdown.style.display = opened ? 'block' : 'none';
    if (opened && !loaded) {
      loadProviders();
    }
  }

  async function loadProviders() {
    loaded = true;
    try {
      if (cache && cache.expiresAt && Date.now() < cache.expiresAt) {
        renderProviders(cache.payload, cache.region);
        return;
      }
      const ident = await ensureTmdbIdentity(listType, item);
      if (!ident) {
        dropdown.textContent = 'Watch options not found.';
        return;
      }
      const data = await fetchWatchProviders(ident.mediaType, ident.tmdbId);
      if (!data || !data.results) {
        dropdown.textContent = 'Watch options not available.';
        return;
      }
      
      const preferred = data.results[region] || data.results.US || data.results.GB || null;
      const effectiveRegion = preferred ? (preferred.iso_3166_1 || region) : region;
      const payload = { 
        link: preferred?.link || '',
        flatrate: preferred?.flatrate || [],
        free: preferred?.free || [],
        ads: preferred?.ads || [],
        rent: preferred?.rent || [],
        buy: preferred?.buy || [] 
      };
      
      item.__watchProvidersCache = cache = { region: effectiveRegion, payload, expiresAt: Date.now() + 6 * 60 * 60 * 1000 };
      renderProviders(payload, effectiveRegion);
    } catch (err) {
      console.warn('Watch providers load failed', err);
      dropdown.textContent = 'Unable to load watch options.';
    }
  }

  function renderProviders(payload, effRegion) {
    dropdown.innerHTML = '';
    const groups = [
      { key: 'flatrate', label: 'Streaming' },
      { key: 'free', label: 'Free' },
      { key: 'ads', label: 'With Ads' },
      { key: 'rent', label: 'Rent' },
      { key: 'buy', label: 'Buy' },
    ];
    let any = false;
    groups.forEach(g => {
      const list = payload[g.key];
      if (Array.isArray(list) && list.length) {
        any = true;
        const header = createEl('div', 'watch-group-header small', { text: g.label });
        header.style.opacity = '0.8';
        header.style.margin = '.25rem 0 .25rem 0';
        dropdown.appendChild(header);
        const row = createEl('div', 'watch-chip-row');
        row.style.display = 'flex';
        row.style.flexWrap = 'wrap';
        row.style.gap = '.375rem';
        list.forEach(p => {
          if (!p || !p.provider_name) return;
          const chip = createEl('a', 'watch-chip');
          chip.href = payload.link || '#';
          chip.target = '_blank';
          chip.rel = 'noopener noreferrer';
          chip.style.display = 'inline-flex';
          chip.style.alignItems = 'center';
          chip.style.gap = '.375rem';
          chip.style.padding = '.25rem .5rem';
          chip.style.borderRadius = '999px';
          chip.style.background = 'var(--chip-bg, #2a2a2a)';
          chip.style.border = '1px solid var(--border, #333)';
          chip.style.textDecoration = 'none';
          chip.style.color = 'inherit';
          if (p.logo_path) {
            const img = createEl('img');
            img.src = `https://image.tmdb.org/t/p/w45${p.logo_path}`;
            img.alt = p.provider_name;
            img.width = 18; img.height = 18;
            img.style.borderRadius = '3px';
            chip.appendChild(img);
          }
          const name = createEl('span', 'watch-chip-label small', { text: p.provider_name });
          chip.appendChild(name);
          row.appendChild(chip);
        });
        dropdown.appendChild(row);
      }
    });

    if (!any) {
      const empty = createEl('div', 'small', { text: 'No providers found for this region.' });
      empty.style.marginTop = '.25rem';
      dropdown.appendChild(empty);
    }
  }

  btn.addEventListener('click', (ev) => { ev.preventDefault?.(); ev.stopPropagation(); toggle(); });
  dropdown.addEventListener('click', (ev) => ev.stopPropagation());

  return block;
}

export function buildMovieLinks(listType, item) {
  if (!item) return null;
  const links = [];
  if (item.imdbUrl) links.push({ href: item.imdbUrl, label: 'IMDb' });
  if (item.trailerUrl) links.push({ href: item.trailerUrl, label: 'Trailer' });
  if (item.previewLink) links.push({ href: item.previewLink, label: 'Preview' });
  
  const container = createEl('div', 'movie-links');
  links.forEach(link => {
    const anchor = createEl('a', 'meta-link', { text: link.label });
    anchor.href = link.href;
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
    container.appendChild(anchor);
  });
  
  // Add Watch Now section for movies
  if (listType === 'movies' && TMDB_API_KEY) {
    const watchInline = buildWatchNowSection(listType, item, true);
    if (watchInline) container.appendChild(watchInline);
  }
  
  // Return container if it has any children
  return container.children.length ? container : null;
}

// ============================================
// BUILD COLLAPSIBLE MOVIE CARD (MAIN ENTRY POINT)
// ============================================
export function buildCollapsibleMovieCard(listType, id, item, positionIndex = 0, options = {}) {
  const { hideCard = false, displayEntryId = id, interactive = true } = options;
  const card = createEl('div', 'card collapsible movie-card');
  card.dataset.id = id;
  card.dataset.index = String(positionIndex);
  card.dataset.entryId = displayEntryId;
  card.dataset.listType = listType;
  
  if (itemHasAnimeKeyword(item)) {
    card.dataset.isAnime = 'true';
  }
  if (hideCard) {
    card.classList.add('series-hidden');
  }
  if (ensureExpandedSet(listType).has(id)) {
    card.classList.add('expanded');
  }
  if (interactive) {
    card.addEventListener('click', (ev) => {
      // Don't toggle if clicking on a button or link
      if (ev.target.closest('button, a, input, textarea, select')) return;
      toggleCardExpansion(listType, id, {
        updateStates: () => updateCollapsibleCardStates(listType)
      });
    });
  }
  if (options.isUnified) {
    card.dataset.isUnified = 'true';
  }
  
  renderMovieCardContent(card, listType, id, item, displayEntryId, options);
  ensureCardTitleResizeListener(card);
  return card;
}

// ============================================
// RENDER MOVIE CARD CONTENT
// ============================================
export function renderMovieCardContent(card, listType, cardId, item, entryId = cardId, options = {}) {
  if (!card) return;
  card.dataset.entryId = entryId;
  
  // Remove existing content
  card.querySelectorAll('.movie-card-summary, .movie-card-details').forEach(el => el.remove());
  
  const isExpanded = card.classList.contains('expanded');
  const isUnified = options.isUnified || card.dataset.isUnified === 'true';
  
  // Get series entries
  let seriesEntries = null;
  if (isUnified && seriesGroups.unified) {
    seriesEntries = seriesGroups.unified.get(cardId) || null;
  } else if (isCollapsibleList(listType)) {
    seriesEntries = getSeriesGroupEntries(listType, cardId);
  }
  
  const contentListType = options.contentListType || listType;
  
  // Build callbacks for series tree interactions
  const callbacks = {
    renderMovieCardContent,
    moveSeriesTreeNode,
  };
  
  const context = { cardId, entryId, seriesEntries, isExpanded, listType: contentListType, callbacks };
  
  const summary = buildMovieCardSummary(contentListType, item, context);
  const details = buildMovieCardDetails(contentListType, cardId, entryId, item, context);
  
  card.insertBefore(summary, card.firstChild || null);
  card.appendChild(details);
  queueCardTitleAutosize(card);
}

// ============================================
// BUILD MOVIE CARD SUMMARY (COLLAPSED VIEW)
// ============================================
export function buildMovieCardSummary(listType, item, context = {}) {
  const summary = createEl('div', 'movie-card-summary');
  summary.appendChild(buildMovieArtwork(listType, item, context));
  summary.appendChild(buildMovieCardInfo(listType, item, context));
  return summary;
}

// ============================================
// BUILD MOVIE ARTWORK
// ============================================
export function buildMovieArtwork(listType, item, context = {}) {
  const wrapper = createEl('div', 'artwork-wrapper');
  const seriesEntries = Array.isArray(context.seriesEntries) ? context.seriesEntries : [];
  const stackItems = buildSeriesPosterStackItems(item, seriesEntries);
  const shouldStack = stackItems.length > 1 || (!context.isExpanded && stackItems.length > 0);
  
  if (shouldStack) {
    wrapper.classList.add('artwork-stack-wrapper');
    const stackClasses = ['artwork-stack'];
    if (!context.isExpanded) {
      stackClasses.push('artwork-deck', 'artwork-deck-collapsed');
    } else {
      stackClasses.push('artwork-deck', 'artwork-deck-expanded');
    }
    const stack = createEl('div', stackClasses.join(' '));
    const visibleItems = stackItems.slice(0, 3);
    const { baseStep, hoverStep } = computeDeckStepValues({
      isExpanded: Boolean(context.isExpanded),
      visibleCount: visibleItems.length,
    });
    if (!Number.isNaN(baseStep)) {
      stack.style.setProperty('--deck-step', `${baseStep}px`);
      stack.style.setProperty('--deck-hover-step', `${hoverStep}px`);
    }
    visibleItems.forEach((entry, index) => {
      const art = buildPosterNode(entry.poster, entry.title, index === 0);
      art.classList.add('artwork-stack-item');
      stack.appendChild(art);
    });
    if (stackItems.length > 3) {
      const spill = createEl('div', 'artwork-stack-count', { text: `+${stackItems.length - 3}` });
      stack.appendChild(spill);
    }
    wrapper.appendChild(stack);
    const statusBadge = buildStatusBadge(listType, item, context);
    if (statusBadge) wrapper.appendChild(statusBadge);
    return wrapper;
  }

  const fallbackPoster = stackItems.length ? stackItems[0].poster : '';
  const fallbackTitle = stackItems.length ? stackItems[0].title : '';
  const posterNode = buildPosterNode(item?.poster || fallbackPoster, item?.title || fallbackTitle || 'Poster');
  if (posterNode) {
    wrapper.appendChild(posterNode);
    const statusBadge = buildStatusBadge(listType, item, context);
    if (statusBadge) wrapper.appendChild(statusBadge);
    return wrapper;
  }
  wrapper.appendChild(createEl('div', 'artwork placeholder', { text: 'No Poster' }));
  const statusBadge = buildStatusBadge(listType, item, context);
  if (statusBadge) wrapper.appendChild(statusBadge);
  return wrapper;
}

// ============================================
// BUILD MOVIE CARD INFO (HEADER + BADGES)
// ============================================
export function buildMovieCardInfo(listType, item, context = {}) {
  const info = createEl('div', 'movie-card-info');
  const header = createEl('div', 'movie-card-header');
  
  const { titleText, subtitleText } = resolveSeriesCardTitleParts(item, context);
  const title = createEl('div', 'title', { text: titleText });
  header.appendChild(title);
  
  if (subtitleText) {
    header.appendChild(createEl('div', 'series-card-subtitle', { text: subtitleText }));
  }
  
  const ratingBadge = buildFinishedRatingBadge(item);
  if (ratingBadge) {
    header.appendChild(ratingBadge);
  }
  
  info.appendChild(header);

  if (isCollapsibleList(listType)) {
    const badges = buildMediaSummaryBadges(listType, item, { ...context, listType, isExpanded: true });
    if (badges) info.appendChild(badges);
  }

  return info;
}

// ============================================
// SERIES TREE BLOCK (FRANCHISE ORDER)
// ============================================
export function getSeriesTreeEntries(listType, cardId, options = {}) {
  if (!listType || !cardId) return [];
  const { sourceEntries = null, displayItem = null } = options;
  if (Array.isArray(sourceEntries) && sourceEntries.length) {
    return sourceEntries;
  }
  const store = seriesGroups[listType] || seriesGroups.unified;
  const baseEntries = store?.get(cardId) || null;
  const resolvedItem = displayItem || getItemFromCache(listType, cardId);
  const merged = mergeSeriesEntriesAcrossLists(listType, cardId, resolvedItem, baseEntries);
  return Array.isArray(merged) ? merged : [];
}

export function buildSeriesTreeBlock(listType, cardId, providedEntries = null, callbacks = {}) {
  const entries = getSeriesTreeEntries(listType, cardId, { sourceEntries: providedEntries });
  if (!entries || entries.length <= 1) return null;

  const block = createEl('div', 'series-tree detail-block');
  block.dataset.cardId = cardId;
  block.dataset.listType = listType;

  const list = createEl('div', 'series-tree-list');
  list.dataset.cardId = cardId;
  list.dataset.listType = listType;

  const renderList = (items, isSorted = false) => {
    list.innerHTML = '';
    items.forEach((entry, index) => {
      const node = buildSeriesTreeNode(listType, entry, index, isSorted, callbacks);
      if (node) {
        list.appendChild(node);
      }
    });
  };

  const isYearSort = seriesSortState.get(cardId) || false;

  const handleSort = (btn) => {
    seriesSortState.set(cardId, true);
    btn.classList.add('active');
    const sorted = [...entries].sort((a, b) => {
      const yearA = Number(a.item?.year) || 9999;
      const yearB = Number(b.item?.year) || 9999;
      if (yearA !== yearB) return yearA - yearB;
      return (a.item?.title || '').localeCompare(b.item?.title || '');
    });
    renderList(sorted, true);
  };

  const header = buildSeriesTreeHeader(entries.length, listType, cardId, handleSort);
  block.appendChild(header);

  if (isYearSort) {
    const btn = header.querySelector('.series-sort-btn');
    if (btn) handleSort(btn);
  } else {
    renderList(entries);
  }

  if (!list.children.length) return null;
  const listWrapper = createEl('div', 'series-tree-scroll');
  listWrapper.appendChild(list);
  block.appendChild(listWrapper);
  
  // Enable drag events for reordering
  ensureSeriesTreeDragEvents();
  
  return block;
}

function buildSeriesTreeHeader(count, listType, cardId, onSort) {
  const heading = createEl('div', 'series-tree-heading');
  
  const leftSide = createEl('div', 'series-tree-heading-left');
  leftSide.style.display = 'flex';
  leftSide.style.alignItems = 'center';
  leftSide.style.gap = '0.75rem';

  leftSide.appendChild(createEl('div', 'series-tree-heading-title', { text: 'Franchise order' }));
  
  if (onSort) {
    const sortBtn = createEl('button', 'btn secondary small series-sort-btn', { text: 'Sort by Year' });
    sortBtn.type = 'button';
    sortBtn.style.padding = '0.2rem 0.5rem';
    sortBtn.style.fontSize = '0.75rem';
    sortBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      onSort(sortBtn);
    });
    leftSide.appendChild(sortBtn);
  }

  heading.appendChild(leftSide);

  const rightSide = createEl('div', 'series-tree-heading-right');
  rightSide.appendChild(createEl('div', 'series-tree-heading-count', { text: `${count} ${count === 1 ? 'entry' : 'entries'}` }));
  heading.appendChild(rightSide);
  return heading;
}

function buildSeriesTreeNode(listType, entry, fallbackIndex = 0, forceIndex = false, callbacks = {}) {
  if (!entry || !entry.item) return null;
  const { item } = entry;
  const entryListType = entry.listType || listType;
  const node = createEl('div', 'series-tree-node');
  node.dataset.entryId = entry.id || '';
  node.dataset.listType = entryListType || '';
  node.dataset.entryKey = buildSeriesTreeNodeKey(entry, listType);
  node.setAttribute('draggable', 'true');

  const orderLabel = forceIndex ? (fallbackIndex + 1) : resolveSeriesNodeOrder(entry, fallbackIndex);
  
  const orderContainer = createEl('div', 'series-tree-order-container');
  const upBtn = createEl('button', 'series-tree-order-btn', { text: '▲' });
  upBtn.onclick = (e) => {
    e.stopPropagation();
    if (callbacks.moveSeriesTreeNode) {
      callbacks.moveSeriesTreeNode(listType, entry, -1);
    }
  };
  const label = createEl('div', 'series-tree-order', { text: `#${orderLabel}` });
  const downBtn = createEl('button', 'series-tree-order-btn', { text: '▼' });
  downBtn.onclick = (e) => {
    e.stopPropagation();
    if (callbacks.moveSeriesTreeNode) {
      callbacks.moveSeriesTreeNode(listType, entry, 1);
    }
  };
  orderContainer.appendChild(upBtn);
  orderContainer.appendChild(label);
  orderContainer.appendChild(downBtn);
  node.appendChild(orderContainer);

  const poster = buildSeriesTreePoster(item);
  if (poster) {
    node.appendChild(poster);
  }

  const body = createEl('div', 'series-tree-body');
  const titleRow = createEl('div', 'series-tree-title-row');
  titleRow.appendChild(createEl('div', 'series-tree-node-title', { text: item.title || '(no title)' }));
  const mediaLabel = buildSeriesTreeMediaLabel(entryListType);
  if (mediaLabel) {
    titleRow.appendChild(mediaLabel);
  }
  const statusBadge = buildSeriesTreeStatusBadge(item);
  if (statusBadge) {
    titleRow.appendChild(statusBadge);
  }
  body.appendChild(titleRow);

  const meta = buildSeriesTreeMeta(item);
  if (meta) {
    body.appendChild(meta);
  }

  const seriesLineEl = buildSeriesLine(item, 'series-tree-line');
  if (seriesLineEl) {
    body.appendChild(seriesLineEl);
  }

  const plot = buildSeriesTreePlot(item);
  if (plot) {
    body.appendChild(plot);
  }

  if (item.notes) {
    body.appendChild(createEl('div', 'series-tree-notes', { text: item.notes }));
  }

  node.appendChild(body);
  
  node.addEventListener('click', (e) => {
    e.stopPropagation();
    const card = node.closest('.card');
    if (card && callbacks.renderMovieCardContent) {
      const cardListType = card.dataset.listType;
      const cardId = card.dataset.id;
      const isUnified = card.dataset.isUnified === 'true';
      callbacks.renderMovieCardContent(card, cardListType, cardId, item, entry.id, { 
        isUnified,
        contentListType: entryListType 
      });
    }
  });

  return node;
}

function buildSeriesTreeNodeKey(entry, fallbackListType) {
  const sourceType = entry?.listType || fallbackListType || 'unknown';
  const entryId = entry?.id || 'unknown';
  return `${sourceType}::${entryId}`;
}

function resolveSeriesNodeOrder(entry, fallbackIndex = 0) {
  const numericOrder = numericSeriesOrder(entry?.order ?? entry?.item?.seriesOrder);
  if (numericOrder !== null && numericOrder !== undefined) {
    return numericOrder;
  }
  return fallbackIndex + 1;
}

function buildSeriesTreePoster(item) {
  const wrapper = createEl('div', 'series-tree-poster');
  if (item.poster) {
    const img = createEl('img');
    img.src = item.poster;
    img.alt = `${item.title || 'Poster'} artwork`;
    img.loading = 'lazy';
    wrapper.appendChild(img);
  } else {
    wrapper.classList.add('placeholder');
    wrapper.textContent = 'No Poster';
  }
  return wrapper;
}

function buildSeriesTreeStatusBadge(item) {
  const status = deriveSeriesTreeStatus(item);
  if (!status) return null;
  const badge = createEl('span', 'series-tree-status', { text: status.label });
  if (status.state) {
    badge.dataset.state = status.state;
  }
  return badge;
}

function buildSeriesTreeMediaLabel(listType) {
  if (!listType) return null;
  const label = MEDIA_TYPE_LABELS[listType];
  if (!label) return null;
  const badge = createEl('span', 'series-tree-media', { text: label });
  badge.dataset.type = listType;
  return badge;
}

function deriveSeriesTreeStatus(item) {
  if (!item) return null;
  if (item.finished || item.finishedAt) {
    return { label: 'Finished', state: 'finished' };
  }
  const candidates = [item.watchStatus, item.animeStatus, item.status];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const normalized = String(candidate).trim().toLowerCase();
    if (!normalized) continue;
    if (normalized.startsWith('finish') || normalized.startsWith('complete')) {
      return { label: 'Finished', state: 'finished' };
    }
    if (normalized.startsWith('watch')) {
      return { label: 'Watching', state: 'watching' };
    }
    if (normalized.startsWith('soon') || normalized.startsWith('plan')) {
      return { label: 'Soon™', state: 'soon' };
    }
    if (normalized.startsWith('releas') || normalized === 'airing' || normalized === 'ongoing') {
      return { label: 'Airing', state: 'airing' };
    }
    if (normalized.startsWith('hiatus') || normalized.startsWith('pause')) {
      return { label: 'Hiatus', state: 'paused' };
    }
    if (normalized.startsWith('cancel')) {
      return { label: 'Cancelled', state: 'cancelled' };
    }
    if (normalized.startsWith('not') || normalized === 'tba') {
      return { label: 'Announced', state: 'soon' };
    }
    return { label: normalized.replace(/_/g, ' ').replace(/\b\w/g, ch => ch.toUpperCase()), state: 'other' };
  }
  return null;
}

function buildSeriesTreeMeta(item) {
  if (!item) return null;
  const parts = [];
  if (item.year) parts.push(item.year);
  
  const isMovie = isAnimeMovieEntry(item) || (item.imdbType && String(item.imdbType).toLowerCase() === 'movie');
  
  let episodeCount = null;
  if (!isMovie) {
    if (item.seasonNumber !== undefined && (item.episodes || item.episodeCount)) {
      episodeCount = Number(item.episodes || item.episodeCount);
    } else {
      episodeCount = extractEpisodeCount(item);
    }
    if (episodeCount > 0) {
      parts.push(`${episodeCount} ep`);
    }
  }
  const runtimeLabel = item.runtime || formatAnimeRuntimeLabel(item);
  if (runtimeLabel) {
    parts.push(runtimeLabel);
  }
  if (item.director) {
    parts.push(item.director);
  }
  if (!parts.length) return null;
  return createEl('div', 'series-tree-meta', { text: parts.join(' • ') });
}

function buildSeriesTreePlot(item) {
  const text = typeof item.plot === 'string' ? item.plot.trim() : '';
  if (!text) return null;
  return createEl('div', 'series-tree-plot', { text: truncateText(text, 240) });
}

// ============================================
// BUILD MOVIE CARD DETAILS (EXPANDED VIEW)
// ============================================
export function buildMovieCardDetails(listType, cardId, entryId, item, context = {}) {
  const { callbacks = {} } = context;
  const details = createEl('div', 'collapsible-details movie-card-details');
  const infoStack = createEl('div', 'movie-card-detail-stack');
  
  const metaText = buildMovieMetaText(item);
  if (metaText) {
    infoStack.appendChild(createEl('div', 'meta', { text: metaText }));
  }

  const extendedMeta = buildMovieExtendedMeta(item);
  if (extendedMeta) {
    infoStack.appendChild(extendedMeta);
  }

  const genreRow = buildMovieGenreRow(item);
  if (genreRow) {
    infoStack.appendChild(genreRow);
  }

  const seriesLine = buildSeriesLine(item);
  if (seriesLine) {
    infoStack.appendChild(seriesLine);
  }

  const actorLine = buildMovieCastLine(item);
  if (actorLine) {
    infoStack.appendChild(actorLine);
  }

  const links = buildMovieLinks(listType, item);
  if (links) {
    infoStack.appendChild(links);
  }

  if (infoStack.children.length) {
    details.appendChild(infoStack);
  }

  if (item.plot) {
    details.appendChild(createEl('div', 'plot-summary detail-block', { text: item.plot.trim() }));
  }

  if (item.notes) {
    details.appendChild(createEl('div', 'notes detail-block', { text: item.notes }));
  }

  // Build series tree block (franchise order) for collapsible lists
  let seriesBlock = null;
  if (isCollapsibleList(listType)) {
    seriesBlock = buildSeriesTreeBlock(listType, cardId, context.seriesEntries, callbacks);
  }
  const hasFranchiseOrder = Boolean(seriesBlock);

  // Build type-specific detail blocks
  if (listType === 'anime') {
    const animeBlock = buildAnimeDetailBlock(listType, entryId, item, { suppressSeasons: hasFranchiseOrder });
    if (animeBlock) {
      details.appendChild(animeBlock);
    }
  }

  if (listType === 'tvShows') {
    const tvBlock = buildTvDetailBlock(listType, entryId, item, { suppressSeasons: hasFranchiseOrder });
    if (tvBlock) {
      details.appendChild(tvBlock);
    }
  }

  // Add series tree block after type-specific blocks
  if (seriesBlock) {
    details.appendChild(seriesBlock);
  }

  // Add action buttons
  const actions = buildMovieCardActions(listType, entryId || cardId, item);
  if (actions) {
    details.appendChild(actions);
  }

  return details;
}

// ============================================
// BUILD ANIME DETAIL BLOCK
// ============================================
export function buildAnimeDetailBlock(listType, entryId, item, options = {}) {
  const { suppressSeasons = false } = options;
  if (!item) return null;
  const block = createEl('div', 'detail-block anime-detail-block');
  const chips = [];
  
  if (!isAnimeMovieEntry(item)) {
    const episodeLabel = formatAnimeEpisodesLabel(extractEpisodeCount(item) || item.animeEpisodes);
    if (episodeLabel) chips.push(episodeLabel);
    if (item.animeDuration) chips.push(`${item.animeDuration} min/ep`);
  }
  if (item.animeFormat) chips.push(formatAnimeFormatLabel(item.animeFormat));
  if (item.animeStatus) chips.push(formatAnimeStatusLabel(item.animeStatus));
  
  if (chips.length) {
    const row = createEl('div', 'anime-stats-row');
    chips.forEach(text => row.appendChild(createEl('span', 'anime-chip', { text })));
    block.appendChild(row);
  }
  
  if (Array.isArray(item.animeGenres) && item.animeGenres.length) {
    const genres = createEl('div', 'anime-genres', { text: `Genres: ${item.animeGenres.join(', ')}` });
    block.appendChild(genres);
  }
  
  if (item.aniListUrl) {
    const link = createEl('a', 'meta-link', { text: 'View on MyAnimeList' });
    link.href = item.aniListUrl;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    block.appendChild(link);
  }
  
  return block.children.length ? block : null;
}

// ============================================
// BUILD TV DETAIL BLOCK
// ============================================
export function buildTvDetailBlock(listType, entryId, item, options = {}) {
  const { suppressSeasons = false } = options;
  if (!item) return null;
  const chips = buildTvStatChips(item, { isExpanded: true });
  const hasChips = chips.length > 0;
  
  if (!hasChips) return null;
  
  const block = createEl('div', 'detail-block tv-detail-block');
  if (hasChips) {
    const row = createEl('div', 'tv-stats-row');
    row.dataset.cardId = entryId || '';
    row.dataset.listType = listType;
    chips.forEach(text => row.appendChild(createEl('span', 'tv-chip', { text })));
    block.appendChild(row);
  }
  
  return block;
}

// ============================================
// BUILD MOVIE CARD ACTIONS
// ============================================
export function buildMovieCardActions(listType, id, item, options = {}) {
  const { variant = 'details' } = options;
  const classNames = ['actions', 'collapsible-actions'];
  if (variant === 'inline') {
    classNames.push('inline-actions');
  }
  const actions = createEl('div', classNames.join(' '));
  
  const configs = [
    {
      className: 'btn secondary',
      label: 'Edit',
      handler: () => openEditModal(listType, id, item)
    },
    {
      className: 'btn success',
      label: 'Finished',
      handler: () => handleFinishRequest(listType, id)
    },
    ...(SERIES_BULK_DELETE_LISTS.has(listType) && item?.seriesName ? [{
      className: 'btn danger',
      label: 'Delete Series',
      handler: () => deleteSeriesEntries(listType, item.seriesName)
    }] : []),
    {
      className: 'btn ghost',
      label: 'Delete',
      handler: () => deleteItem(listType, id, { fromFinished: showFinishedOnly })
    }
  ];

  configs.forEach(cfg => {
    const btn = createEl('button', cfg.className, { text: cfg.label });
    btn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      cfg.handler();
    });
    actions.appendChild(btn);
  });

  return actions;
}

// ============================================
// UPDATE COLLAPSIBLE CARD STATES
// ============================================
export function updateCollapsibleCardStates(listType) {
  const expandedSet = expandedCards[listType];
  
  document.querySelectorAll(`.card.collapsible.movie-card[data-list-type="${listType}"]`).forEach(card => {
    const cardId = card.dataset.id;
    const isMatch = expandedSet instanceof Set
      ? expandedSet.has(cardId)
      : expandedSet === cardId;
    const wasExpanded = card.classList.contains('expanded');
    card.classList.toggle('expanded', isMatch);
    
    // Re-render content if expansion state changed
    if (wasExpanded !== isMatch) {
      const item = getItemFromCache(listType, cardId);
      if (item) {
        renderMovieCardContent(card, listType, cardId, item, card.dataset.entryId);
      }
    }
    queueCardTitleAutosize(card);
  });
}

// ============================================
// HELPER: GET ITEM FROM CACHE
// ============================================
function getItemFromCache(listType, id) {
  const cache = listCaches[listType] || {};
  const finishedCache = finishedCaches[listType] || {};
  return cache[id] || finishedCache[id] || null;
}

// ============================================
// WINDOW RESIZE LISTENER
// ============================================
if (typeof window !== 'undefined') {
  window.addEventListener('resize', recalcCardTitleSizes);
}

// ============================================
// SERIES TREE MOVE & REORDER
// ============================================
export async function moveSeriesTreeNode(listType, entry, direction) {
  if (!entry || !entry.item) return;
  const seriesName = entry.item.seriesName;
  if (!seriesName) return;

  const entries = collectSeriesEntriesAcrossLists(seriesName);
  if (!entries || !entries.length) return;
  
  entries.sort(compareSeriesEntries);
  
  const currentIndex = entries.findIndex(e => e.id === entry.id && (e.listType === entry.listType || (!e.listType && !entry.listType)));
  if (currentIndex === -1) return;
  
  const targetIndex = currentIndex + direction;
  if (targetIndex < 0 || targetIndex >= entries.length) return;
  
  // Swap entries
  const temp = entries[currentIndex];
  entries[currentIndex] = entries[targetIndex];
  entries[targetIndex] = temp;

  // Find the card element
  const treeList = document.querySelector('.series-tree-list');
  const cardId = treeList ? treeList.dataset.cardId : entry.id;
  const cardElement = document.querySelector(`.card[data-id="${cardId}"]`) || treeList?.closest('.card');

  applySeriesTreeReorder(listType, cardId, entries, cardElement);
}

function applySeriesTreeReorder(listType, cardId, orderedEntries, cardElement) {
  if (!listType || !cardId || !Array.isArray(orderedEntries) || !orderedEntries.length) return;
  
  const orderUpdates = [];
  const orderMap = new Map();
  
  orderedEntries.forEach((entry, index) => {
    if (!entry || !entry.id) return;
    const newOrder = index + 1;
    const entryListType = entry.listType || listType;
    orderMap.set(buildSeriesEntryKey(entryListType, entry.id, entry.item), newOrder);
    if (entry.order !== newOrder) {
      orderUpdates.push({ entry, newOrder });
    }
    entry.order = newOrder;
    if (entry.item) {
      entry.item.seriesOrder = newOrder;
    }
    updateCachedSeriesOrderValue(entry, newOrder);
  });
  
  if (!orderMap.size) return;
  
  const store = seriesGroups[listType];
  if (store && store.has(cardId)) {
    const existing = store.get(cardId) || [];
    existing.sort((a, b) => {
      const keyA = buildSeriesEntryKey(a.listType || listType, a.id, a.item);
      const keyB = buildSeriesEntryKey(b.listType || listType, b.id, b.item);
      const orderA = orderMap.get(keyA) || Number.MAX_SAFE_INTEGER;
      const orderB = orderMap.get(keyB) || Number.MAX_SAFE_INTEGER;
      if (orderA !== orderB) return orderA - orderB;
      return compareSeriesEntries(a, b);
    });
    store.set(cardId, existing);
  }
  
  applySeriesOrderSnapshotUpdates(listType, orderMap);
  
  if (orderUpdates.length) {
    persistSeriesTreeOrderUpdates(orderUpdates);
  }
  
  invalidateSeriesCrossListCache();
  
  if (cardElement) {
    refreshSeriesCardContent(cardElement);
  }
}

function applySeriesOrderSnapshotUpdates(listType, orderMap) {
  if (!orderMap || !orderMap.size) return;
  
  [listCaches, finishedCaches].forEach(cacheMap => {
    const store = cacheMap && cacheMap[listType];
    if (!store) return;
    
    Object.entries(store).forEach(([id, item]) => {
      if (!item) return;
      const key = buildSeriesEntryKey(listType, id, item);
      const newOrder = orderMap.get(key);
      if (newOrder !== undefined) {
        item.seriesOrder = newOrder;
      }
    });
  });
}

function persistSeriesTreeOrderUpdates(changedEntries) {
  const db = getFirebaseDatabase();
  if (!currentUser || !db || !Array.isArray(changedEntries) || !changedEntries.length) return;
  
  const tasks = changedEntries.map(({ entry, newOrder }) => {
    if (!entry || !entry.listType || !entry.id) return null;
    
    if (entry.isVirtualSeason) {
      const isFinished = Boolean(entry.item && entry.item.finishedAt);
      const rootPath = isFinished 
        ? `users/${currentUser.uid}/finished/${entry.listType}/${entry.parentId}`
        : `users/${currentUser.uid}/${entry.listType}/${entry.parentId}`;
      const seasonPath = `${rootPath}/${entry.seasonField}/${entry.seasonIndex}`;
      return update(ref(db, seasonPath), { seriesOrder: newOrder }).catch(err => {
        console.warn('Failed to update virtual season order', err);
      });
    }

    const isFinished = Boolean(entry.item && entry.item.finishedAt);
    if (isFinished) {
       const path = `users/${currentUser.uid}/finished/${entry.listType}/${entry.id}`;
       return update(ref(db, path), { seriesOrder: newOrder }).catch(err => {
          console.warn('Failed to update series order (finished)', err);
       });
    }

    return updateItem(entry.listType, entry.id, { seriesOrder: newOrder }).catch(err => {
      console.warn('Failed to update series order', err);
    });
  }).filter(Boolean);
  
  if (tasks.length) {
    Promise.allSettled(tasks).catch(err => {
      console.warn('Series order persistence failed', err);
    });
  }
}

function updateCachedSeriesOrderValue(entry, newOrder) {
  if (!entry || !entry.listType || !entry.id) return;
  
  if (entry.isVirtualSeason) {
    [listCaches, finishedCaches].forEach(cacheMap => {
      const store = cacheMap && cacheMap[entry.listType];
      if (store && store[entry.parentId]) {
        const parent = store[entry.parentId];
        const seasons = parent[entry.seasonField];
        if (seasons && seasons[entry.seasonIndex]) {
          seasons[entry.seasonIndex].seriesOrder = newOrder;
        }
      }
    });
    return;
  }

  [listCaches, finishedCaches].forEach(cacheMap => {
    const store = cacheMap && cacheMap[entry.listType];
    if (store && store[entry.id]) {
      store[entry.id].seriesOrder = newOrder;
    }
  });
}

function refreshSeriesCardContent(cardElement) {
  if (!cardElement) return;
  const listType = cardElement.dataset.listType;
  const cardId = cardElement.dataset.id;
  const entryId = cardElement.dataset.entryId || cardId;
  if (!listType || !cardId) return;
  
  const item = getItemFromCache(listType, entryId) || getItemFromCache(listType, cardId);
  if (!item) return;
  
  renderMovieCardContent(cardElement, listType, cardId, item, entryId);
}

// ============================================
// SERIES TREE DRAG EVENTS
// ============================================
export function ensureSeriesTreeDragEvents() {
  if (seriesTreeDragEventsBound) return;
  document.addEventListener('dragstart', handleSeriesTreeDragStart);
  document.addEventListener('dragover', handleSeriesTreeDragOver);
  document.addEventListener('drop', handleSeriesTreeDrop);
  document.addEventListener('dragend', handleSeriesTreeDragEnd);
  seriesTreeDragEventsBound = true;
}

function handleSeriesTreeDragStart(event) {
  const target = event.target instanceof Element ? event.target : null;
  const node = target?.closest('.series-tree-node');
  if (!node || node.classList.contains('series-tree-placeholder')) return;
  const list = node.closest('.series-tree-list');
  if (!list || list.children.length <= 1) return;
  const listType = list.dataset.listType || node.closest('.series-tree')?.dataset.listType || '';
  const cardId = list.dataset.cardId || node.closest('.series-tree')?.dataset.cardId || '';
  const entries = getSeriesTreeEntries(listType, cardId);
  if (!entries.length) return;
  const entryMap = new Map(entries.map(entry => [buildSeriesTreeNodeKey(entry, listType), entry]));
  seriesTreeDragState.activeNode = node;
  seriesTreeDragState.listElement = list;
  seriesTreeDragState.placeholder = null;
  seriesTreeDragState.cardId = cardId;
  seriesTreeDragState.listType = listType;
  seriesTreeDragState.cardElement = node.closest('.card.collapsible.movie-card');
  seriesTreeDragState.entries = entries;
  seriesTreeDragState.entryMap = entryMap;
  seriesTreeDragState.activeEntryKey = node.dataset.entryKey || node.dataset.entryId || '';
  node.classList.add('is-dragging');
  list.classList.add('is-dragging');
  enableSeriesTreeWheelScroll();
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', node.dataset.entryId || '');
  }
}

function handleSeriesTreeDragOver(event) {
  if (!seriesTreeDragState.activeNode) return;
  const list = seriesTreeDragState.listElement;
  if (!list) return;
  const target = event.target instanceof Element ? event.target : null;
  if (target && !target.closest('.series-tree-list') && target !== list) {
    return;
  }
  event.preventDefault();
  const placeholder = getSeriesTreePlaceholder();
  if (placeholder.parentElement !== list) {
    list.appendChild(placeholder);
  }
  let targetNode = target?.closest('.series-tree-node');
  if (!targetNode || targetNode === placeholder) {
    targetNode = getSeriesTreeNodeFromPosition(list, event.clientY);
    if (!targetNode) {
      list.appendChild(placeholder);
      return;
    }
  }
  if (targetNode === seriesTreeDragState.activeNode) return;
  const rect = targetNode.getBoundingClientRect();
  const insertBefore = event.clientY < rect.top + rect.height / 2;
  if (insertBefore) {
    list.insertBefore(placeholder, targetNode);
  } else {
    list.insertBefore(placeholder, targetNode.nextSibling);
  }
}

function handleSeriesTreeDrop(event) {
  if (!seriesTreeDragState.activeNode) return;
  const list = seriesTreeDragState.listElement;
  if (!list) {
    clearSeriesTreeDragState();
    return;
  }
  const target = event.target instanceof Element ? event.target : null;
  if (target && !target.closest('.series-tree-list') && target !== list) {
    clearSeriesTreeDragState();
    return;
  }
  event.preventDefault();
  const orderedKeys = computeSeriesTreeDropOrder();
  const listType = seriesTreeDragState.listType;
  const cardId = seriesTreeDragState.cardId;
  const cardElement = seriesTreeDragState.cardElement;
  const entryMap = seriesTreeDragState.entryMap;
  let orderedEntries = null;
  if (orderedKeys && orderedKeys.length) {
    orderedEntries = orderedKeys
      .map(key => entryMap?.get(key) || null)
      .filter(Boolean);
    if ((!orderedEntries || !orderedEntries.length) && listType && cardId) {
      const fallbackEntries = getSeriesTreeEntries(listType, cardId);
      const fallbackMap = new Map(fallbackEntries.map(entry => [buildSeriesTreeNodeKey(entry, listType), entry]));
      orderedEntries = orderedKeys.map(key => fallbackMap.get(key)).filter(Boolean);
    }
  }
  clearSeriesTreeDragState();
  if (orderedEntries && orderedEntries.length) {
    applySeriesTreeReorder(listType, cardId, orderedEntries, cardElement);
  }
}

function handleSeriesTreeDragEnd() {
  clearSeriesTreeDragState();
}

function getSeriesTreePlaceholder() {
  if (seriesTreeDragState.placeholder) return seriesTreeDragState.placeholder;
  const placeholder = document.createElement('div');
  placeholder.className = 'series-tree-node series-tree-placeholder';
  placeholder.setAttribute('draggable', 'false');
  placeholder.textContent = 'Drop here';
  seriesTreeDragState.placeholder = placeholder;
  return placeholder;
}

function removeSeriesTreePlaceholder() {
  const placeholder = seriesTreeDragState.placeholder;
  if (placeholder && placeholder.parentElement) {
    placeholder.parentElement.removeChild(placeholder);
  }
}

function getSeriesTreeNodeFromPosition(list, clientY) {
  if (!list || clientY === undefined || clientY === null) return null;
  const nodes = Array.from(list.querySelectorAll('.series-tree-node'))
    .filter(node => !node.classList.contains('series-tree-placeholder'));
  if (!nodes.length) return null;
  let closest = null;
  let smallest = Infinity;
  nodes.forEach(node => {
    if (node.classList.contains('is-dragging')) return;
    const rect = node.getBoundingClientRect();
    const center = rect.top + rect.height / 2;
    const delta = Math.abs(clientY - center);
    if (delta < smallest) {
      smallest = delta;
      closest = node;
    }
  });
  return closest;
}

function computeSeriesTreeDropOrder() {
  const list = seriesTreeDragState.listElement;
  const placeholder = seriesTreeDragState.placeholder;
  const movingKey = seriesTreeDragState.activeEntryKey
    || seriesTreeDragState.activeNode?.dataset.entryKey
    || seriesTreeDragState.activeNode?.dataset.entryId;
  if (!list || !movingKey) return null;
  const nodes = Array.from(list.querySelectorAll('.series-tree-node'))
    .filter(node => !node.classList.contains('series-tree-placeholder'));
  const currentKeys = nodes
    .map(node => node.dataset.entryKey || node.dataset.entryId)
    .filter(Boolean);
  if (!placeholder || placeholder.parentElement !== list) {
    return currentKeys;
  }
  let insertionIndex = 0;
  for (const child of Array.from(list.children)) {
    if (child === placeholder) {
      break;
    }
    if (child.classList && child.classList.contains('series-tree-node') && !child.classList.contains('series-tree-placeholder')) {
      insertionIndex += 1;
    }
  }
  insertionIndex = Math.max(0, Math.min(currentKeys.length, insertionIndex));
  const withoutMoving = currentKeys.filter(key => key !== movingKey);
  withoutMoving.splice(insertionIndex, 0, movingKey);
  return withoutMoving;
}

function clearSeriesTreeDragState() {
  removeSeriesTreePlaceholder();
  if (seriesTreeDragState.activeNode) {
    seriesTreeDragState.activeNode.classList.remove('is-dragging');
  }
  if (seriesTreeDragState.listElement) {
    seriesTreeDragState.listElement.classList.remove('is-dragging');
  }
  disableSeriesTreeWheelScroll();
  seriesTreeDragState.activeNode = null;
  seriesTreeDragState.listElement = null;
  seriesTreeDragState.placeholder = null;
  seriesTreeDragState.cardId = null;
  seriesTreeDragState.listType = null;
  seriesTreeDragState.cardElement = null;
  seriesTreeDragState.entries = null;
  seriesTreeDragState.entryMap = null;
  seriesTreeDragState.activeEntryKey = null;
}

function enableSeriesTreeWheelScroll() {
  if (seriesTreeWheelUnsubscribe) return;
  const handler = (event) => {
    if (!seriesTreeDragState.activeNode || !seriesTreeDragState.listElement) return;
    const scrollContainer = seriesTreeDragState.listElement.closest('.series-tree-scroll');
    if (!scrollContainer) return;
    const delta = event.deltaY !== 0 ? event.deltaY : event.deltaX;
    if (!delta) return;
    event.preventDefault();
    scrollContainer.scrollTop += delta;
  };
  window.addEventListener('wheel', handler, { passive: false });
  seriesTreeWheelUnsubscribe = () => {
    window.removeEventListener('wheel', handler);
    seriesTreeWheelUnsubscribe = null;
  };
}

function disableSeriesTreeWheelScroll() {
  if (seriesTreeWheelUnsubscribe) {
    seriesTreeWheelUnsubscribe();
  }
}
