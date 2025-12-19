import { COLLAPSIBLE_LISTS, SERIES_BULK_DELETE_LISTS } from './config.js';
import { createEl, titleSortKey, sanitizeYear, numericSeriesOrder } from './utils.js';

const expandedCards = { movies: new Set(), tvShows: new Set(), anime: new Set() };

export function isCollapsibleList(listType) {
  return COLLAPSIBLE_LISTS.has(listType);
}

export function getExpandedCards() {
  return expandedCards;
}

export function ensureExpandedSet(listType) {
  let store = expandedCards[listType];
  if (!(store instanceof Set)) {
    store = new Set(store ? [store] : []);
    expandedCards[listType] = store;
  }
  return store;
}

export function isCardExpanded(listType, cardId) {
  const expandedSet = expandedCards[listType];
  if (!expandedSet) return false;
  return expandedSet instanceof Set ? expandedSet.has(cardId) : expandedSet === cardId;
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

export function buildStandardCard(listType, id, item, callbacks = {}) {
  const { openEditModal, handleFinishRequest, deleteItem, deleteSeriesEntries, showFinishedOnly } = callbacks;
  
  const card = createEl('div', 'card');
  card.dataset.listType = listType;
  card.dataset.id = id;

  if (item.poster) {
    const artwork = createEl('div', 'artwork');
    const img = createEl('img');
    img.src = item.poster;
    img.alt = `${item.title || 'Poster'} artwork`;
    img.loading = 'lazy';
    artwork.appendChild(img);
    card.appendChild(artwork);
  }

  const body = createEl('div', 'card-body');
  body.appendChild(buildStandardCardHeader(item));

  const metaText = buildStandardMetaText(listType, item);
  if (metaText) {
    body.appendChild(createEl('div', 'meta', { text: metaText }));
  }

  if (listType !== 'books') {
    const seriesLine = buildSeriesLine(item);
    if (seriesLine) body.appendChild(seriesLine);
    const actorLine = buildStandardActorLine(item);
    if (actorLine) body.appendChild(actorLine);
  }

  appendMediaLinks(body, item);

  if (item.plot) {
    const cleanPlot = item.plot.trim();
    const plotText = cleanPlot.length > 220 ? `${cleanPlot.slice(0, 217)}…` : cleanPlot;
    body.appendChild(createEl('div', 'plot-summary', { text: plotText }));
  }
  if (item.notes) {
    body.appendChild(createEl('div', 'notes', { text: item.notes }));
  }

  card.appendChild(body);
  card.appendChild(buildStandardCardActions(listType, id, item, callbacks));
  return card;
}

export function buildStandardCardHeader(item) {
  const header = createEl('div', 'card-header');
  header.appendChild(createEl('div', 'title', { text: item.title || '(no title)' }));
  const ratingBadge = buildFinishedRatingBadge(item);
  if (ratingBadge) {
    header.appendChild(ratingBadge);
  }
  return header;
}

export function buildStandardMetaText(listType, item) {
  const metaParts = [];
  if (item.year) metaParts.push(item.year);
  if (listType === 'books') {
    if (item.author) metaParts.push(item.author);
    if (item.pageCount) metaParts.push(`${item.pageCount} pages`);
  } else {
    if (item.director) metaParts.push(item.director);
    if (item.imdbRating) metaParts.push(`IMDb ${item.imdbRating}`);
    if (item.runtime) metaParts.push(item.runtime);
  }
  return metaParts.filter(Boolean).join(' • ');
}

export function buildStandardActorLine(item) {
  const actorPreview = buildActorPreview(item.actors, 5);
  if (!actorPreview) return null;
  return createEl('div', 'actor-line', { text: `Cast: ${actorPreview}` });
}

export function buildActorPreview(actorsValue, limit = 5) {
  if (!actorsValue) return '';
  const list = typeof actorsValue === 'string' 
    ? actorsValue.split(',').map(s => s.trim()).filter(Boolean)
    : Array.isArray(actorsValue) ? actorsValue : [];
  if (!list.length) return '';
  const preview = list.slice(0, limit);
  const remaining = list.length - limit;
  let result = preview.join(', ');
  if (remaining > 0) {
    result += ` +${remaining} more`;
  }
  return result;
}

export function buildSeriesLine(item) {
  if (!item || !item.seriesName) return null;
  const parts = [item.seriesName];
  if (item.seriesOrder !== undefined && item.seriesOrder !== null) {
    parts.push(`#${item.seriesOrder}`);
  }
  return createEl('div', 'series-line', { text: parts.join(' ') });
}

export function appendMediaLinks(container, item) {
  const links = [];
  if (item.imdbUrl) {
    links.push({ href: item.imdbUrl, label: 'View on IMDb' });
  }
  if (item.trailerUrl) {
    links.push({ href: item.trailerUrl, label: 'Watch Trailer' });
  }
  if (item.previewLink) {
    links.push({ href: item.previewLink, label: 'Preview Book' });
  }
  links.forEach(link => {
    const anchor = createEl('a', 'meta-link', { text: link.label });
    anchor.href = link.href;
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
    container.appendChild(anchor);
  });
}

export function buildStandardCardActions(listType, id, item, callbacks = {}) {
  const { openEditModal, handleFinishRequest, deleteItem, deleteSeriesEntries, showFinishedOnly } = callbacks;
  
  const actions = createEl('div', 'actions');

  const editBtn = createEl('button', 'btn secondary', { text: 'Edit' });
  editBtn.addEventListener('click', () => {
    if (typeof openEditModal === 'function') {
      openEditModal(listType, id, item);
    }
  });
  actions.appendChild(editBtn);

  const finishBtn = createEl('button', 'btn success', { text: 'Finished' });
  finishBtn.addEventListener('click', async (ev) => {
    ev.stopPropagation();
    if (typeof handleFinishRequest === 'function') {
      await handleFinishRequest(listType, id);
    }
  });
  actions.appendChild(finishBtn);

  if (SERIES_BULK_DELETE_LISTS.has(listType) && item?.seriesName) {
    const deleteSeriesBtn = createEl('button', 'btn danger', { text: 'Delete Series' });
    deleteSeriesBtn.addEventListener('click', () => {
      if (typeof deleteSeriesEntries === 'function') {
        deleteSeriesEntries(listType, item.seriesName);
      }
    });
    actions.appendChild(deleteSeriesBtn);
  }

  const deleteBtn = createEl('button', 'btn ghost', { text: 'Delete' });
  deleteBtn.addEventListener('click', () => {
    if (typeof deleteItem === 'function') {
      deleteItem(listType, id, { fromFinished: showFinishedOnly });
    }
  });
  actions.appendChild(deleteBtn);

  return actions;
}

export function buildFinishedRatingBadge(item) {
  if (!item || !item.finishedRating) return null;
  const badge = createEl('span', 'finished-rating-badge');
  badge.textContent = `${item.finishedRating}/10`;
  return badge;
}

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

export function updateCollapsibleCardStates(listType, callbacks = {}) {
  const { refreshSeriesCardContent, queueCardTitleAutosize } = callbacks;
  const expandedSet = expandedCards[listType];
  
  document.querySelectorAll(`.card.collapsible.movie-card[data-list-type="${listType}"]`).forEach(card => {
    const isMatch = expandedSet instanceof Set
      ? expandedSet.has(card.dataset.id)
      : expandedSet === card.dataset.id;
    const wasExpanded = card.classList.contains('expanded');
    card.classList.toggle('expanded', isMatch);
    
    if (wasExpanded !== isMatch && typeof refreshSeriesCardContent === 'function') {
      refreshSeriesCardContent(card);
    }
    if (typeof queueCardTitleAutosize === 'function') {
      queueCardTitleAutosize(card);
    }
  });
}

export function truncateText(text, maxLength) {
  if (!text) return '';
  const clean = text.trim();
  if (clean.length <= maxLength) return clean;
  return clean.slice(0, maxLength - 1) + '…';
}
