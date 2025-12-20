// Collapsible Card Rendering Module
// Handles the advanced collapsible card building for movies, TV shows, and anime
import { ANIME_STATUS_PRIORITY, COLLAPSIBLE_LISTS, MEDIA_TYPE_LABELS } from './config.js';
import { 
  listCaches, 
  finishedCaches, 
  expandedCards, 
  seriesGroups,
  getSeriesGroupEntries,
  seriesSortState
} from './state.js';
import { createEl, debounce, titleSortKey, sanitizeYear, numericSeriesOrder, truncateText } from './utils.js';
import { isCollapsibleList, buildSeriesLine, buildActorPreview, buildFinishedRatingBadge } from './cards.js';
import { 
  mergeSeriesEntriesAcrossLists, 
  buildSeriesEntryKey,
  compareSeriesEntries 
} from './seriesGrouping.js';

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
  const context = { cardId, entryId, seriesEntries, isExpanded, listType: contentListType };
  
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
  const { variant = 'details', callbacks = {} } = options;
  const classNames = ['actions', 'collapsible-actions'];
  if (variant === 'inline') {
    classNames.push('inline-actions');
  }
  const actions = createEl('div', classNames.join(' '));
  
  const configs = [
    {
      className: 'btn secondary',
      label: 'Edit',
      handler: () => {
        if (callbacks.openEditModal) {
          callbacks.openEditModal(listType, id, item);
        }
      }
    },
    {
      className: 'btn success',
      label: 'Finished',
      handler: () => {
        if (callbacks.handleFinishRequest) {
          callbacks.handleFinishRequest(listType, id);
        }
      }
    },
    {
      className: 'btn ghost',
      label: 'Delete',
      handler: () => {
        if (callbacks.deleteItem) {
          callbacks.deleteItem(listType, id);
        }
      }
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
