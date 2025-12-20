// Collapsible Card Rendering Module
// Handles the advanced collapsible card building for movies, TV shows, and anime
import { ANIME_STATUS_PRIORITY, COLLAPSIBLE_LISTS } from './config.js';
import { 
  listCaches, 
  finishedCaches, 
  expandedCards, 
  seriesGroups,
  getSeriesGroupEntries 
} from './state.js';
import { createEl, debounce } from './utils.js';
import { isCollapsibleList, buildSeriesLine, buildActorPreview, buildFinishedRatingBadge } from './cards.js';

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

export function buildMovieLinks(listType, item) {
  if (!item) return null;
  const links = [];
  if (item.imdbUrl) links.push({ href: item.imdbUrl, label: 'IMDb' });
  if (item.trailerUrl) links.push({ href: item.trailerUrl, label: 'Trailer' });
  if (item.previewLink) links.push({ href: item.previewLink, label: 'Preview' });
  if (!links.length) return null;
  
  const container = createEl('div', 'movie-links');
  links.forEach(link => {
    const anchor = createEl('a', 'meta-link', { text: link.label });
    anchor.href = link.href;
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
    container.appendChild(anchor);
  });
  return container;
}

// ============================================
// WINDOW RESIZE LISTENER
// ============================================
if (typeof window !== 'undefined') {
  window.addEventListener('resize', recalcCardTitleSizes);
}
