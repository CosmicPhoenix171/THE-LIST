import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  setPersistence,
  browserLocalPersistence,
  signOut as fbSignOut,
  onAuthStateChanged,
} from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js';
import {
  getDatabase,
  ref,
  push,
  set,
  update,
  remove,
  onValue,
  query,
  orderByChild,
  get
} from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-database.js';

const firebaseConfig = {
  apiKey: 'AIzaSyCWJpMYjSdV9awGRwJ3zyZ_9sDjUrnTu2I',
  authDomain: 'the-list-a700d.firebaseapp.com',
  databaseURL: 'https://the-list-a700d-default-rtdb.firebaseio.com',
  projectId: 'the-list-a700d',
  storageBucket: 'the-list-a700d.firebasestorage.app',
  messagingSenderId: '24313817411',
  appId: '1:24313817411:web:0aba69eaadade9843a27f6',
  measurementId: 'G-YXJ2E2XG42',
};

// TMDb API powers metadata, autocomplete, and franchise info (recommended)
// Create a key at https://www.themoviedb.org/settings/api and paste it here.
const TMDB_API_KEY = '46dcf1eaa2ce4284037a00fdefca9bb8';
const METADATA_SCHEMA_VERSION = 2;

// -----------------------
// App state
let appInitialized = false;
let currentUser = null;
const listeners = {};
let tmdbWarningShown = false;
let spinTimeouts = [];
const actorFilters = { movies: '', tvShows: '', anime: '' };
const expandedCards = { movies: new Set() };
const sortModes = { movies: 'title', tvShows: 'title', anime: 'title', books: 'title' };
const listCaches = {};
const metadataRefreshInflight = new Set();
const AUTOCOMPLETE_LISTS = new Set(['movies', 'tvShows', 'anime']);
const suggestionForms = new Set();
let globalSuggestionClickBound = false;

// DOM references
const loginScreen = document.getElementById('login-screen');
const googleSigninBtn = document.getElementById('google-signin');
const appRoot = document.getElementById('app');
const userNameEl = document.getElementById('user-name');
const signOutBtn = document.getElementById('sign-out');
const backToTopBtn = document.getElementById('back-to-top');
const tabs = document.querySelectorAll('.tab');
const sections = document.querySelectorAll('.section');
const modalRoot = document.getElementById('modal-root');
const wheelSpinnerEl = document.getElementById('wheel-spinner');
const wheelResultEl = document.getElementById('wheel-result');

// firebase instances
let db = null;
let auth = null;
const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

// Initialize Firebase and services
function initFirebase() {
  if (appInitialized) return;
  if (!firebaseConfig || Object.keys(firebaseConfig).length === 0) {
    console.warn('Firebase config is empty. Paste your config into app.js to enable Firebase.');
    // still create a fake environment to avoid runtime exceptions in dev (but DB calls will fail)
  }
  const app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  setPersistence(auth, browserLocalPersistence).catch(err => {
    console.warn('Unable to set auth persistence', err);
  });
  db = getDatabase(app);
  appInitialized = true;

  // Wire UI events
  googleSigninBtn.addEventListener('click', () => signInWithGoogle());
  signOutBtn.addEventListener('click', () => signOut());

  // Tab switching
  tabs.forEach(t => t.addEventListener('click', () => switchSection(t.dataset.section)));

  // Add form handlers
  document.querySelectorAll('.add-form').forEach(form => {
    const listType = form.dataset.list;
    setupFormAutocomplete(form, listType);
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      await addItemFromForm(listType, form);
    });
  });

  document.querySelectorAll('[data-role="actor-filter"]').forEach(input => {
    const listType = input.dataset.list;
    input.addEventListener('input', () => {
      if (!listType || !(listType in actorFilters)) return;
      actorFilters[listType] = input.value;
      const cached = listCaches[listType];
      if (cached) {
        renderList(listType, cached);
      }
    });
  });

  // Sort controls
  document.querySelectorAll('[data-role="sort"]').forEach(sel => {
    const listType = sel.dataset.list;
    sel.addEventListener('change', () => {
      if (!listType) return;
      sortModes[listType] = sel.value;
      const cached = listCaches[listType];
      if (cached) renderList(listType, cached);
    });
  });

  // Wheel
  document.getElementById('spin-wheel').addEventListener('click', () => {
    const src = document.getElementById('wheel-source').value;
    spinWheel(src);
  });

  if (backToTopBtn) {
    backToTopBtn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
    window.addEventListener('scroll', updateBackToTopVisibility, { passive: true });
    updateBackToTopVisibility();
  }
}

// Prompt user to add missing collection parts
function promptAddMissingCollectionParts(listType, collInfo, currentItem) {
  if (!collInfo || !Array.isArray(collInfo.parts)) return;
  const existing = listCaches[listType] ? Object.values(listCaches[listType]) : [];
  const existingKeys = new Set(existing.map(e => normalizeTitleKey(e.title)));
  existingKeys.add(normalizeTitleKey(currentItem.title));
  const missing = collInfo.parts.filter(p => !existingKeys.has(normalizeTitleKey(p.title)));
  if (!missing.length) return;

  const modalRoot = document.getElementById('modal-root');
  modalRoot.innerHTML = '';
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  const modal = document.createElement('div');
  modal.className = 'modal';
  const h = document.createElement('h3');
  h.textContent = `Add missing entries for "${collInfo.collectionName}"?`;
  modal.appendChild(h);
  const sub = document.createElement('p');
  sub.textContent = `Detected ${missing.length} not yet in your list.`;
  modal.appendChild(sub);

  const list = document.createElement('div');
  list.style.display = 'flex';
  list.style.flexDirection = 'column';
  list.style.gap = '.5rem';
  const checkboxes = [];
  missing.forEach(m => {
    const row = document.createElement('label');
    row.style.display = 'flex';
    row.style.alignItems = 'center';
    row.style.gap = '.5rem';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = true;
    cb.dataset.title = m.title;
    cb.dataset.year = m.year || '';
    cb.dataset.order = m.order || '';
    row.appendChild(cb);
    const text = document.createElement('span');
    text.textContent = `${m.order}. ${m.title}${m.year ? ' ('+m.year+')' : ''}`;
    row.appendChild(text);
    list.appendChild(row);
    checkboxes.push(cb);
  });
  modal.appendChild(list);

  const actions = document.createElement('div');
  actions.style.display = 'flex';
  actions.style.gap = '.5rem';
  actions.style.marginTop = '1rem';
  const addBtn = document.createElement('button');
  addBtn.className = 'btn primary';
  addBtn.textContent = 'Add Selected';
  addBtn.addEventListener('click', async () => {
    const toAdd = checkboxes.filter(cb => cb.checked).map(cb => ({
      title: cb.dataset.title,
      year: sanitizeYear(cb.dataset.year),
      seriesName: collInfo.collectionName,
      seriesOrder: cb.dataset.order ? Number(cb.dataset.order) : null,
    }));
    for (const part of toAdd) {
      try {
        if (isDuplicateCandidate(listType, part)) continue;
        const baseTrailerUrl = buildTrailerUrl(part.title, part.year);
        if (baseTrailerUrl) part.trailerUrl = baseTrailerUrl;
        await addItem(listType, part);
      } catch (e) {
        console.warn('Failed to auto-add part', part.title, e);
      }
    }
    modalRoot.innerHTML = '';
  });

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'btn secondary';
  cancelBtn.textContent = 'Skip';
  cancelBtn.addEventListener('click', () => {
    modalRoot.innerHTML = '';
  });

  actions.appendChild(addBtn);
  actions.appendChild(cancelBtn);
  modal.appendChild(actions);
  backdrop.appendChild(modal);
  modalRoot.appendChild(backdrop);
}

function signOut() {
  fbSignOut(auth).catch(err => console.error('Sign-out error', err));
}

function shouldFallbackToRedirect(err) {
  if (!err || !err.code) return false;
  return [
    'auth/operation-not-supported-in-this-environment',
    'auth/popup-blocked',
    'auth/popup-blocked-by-browser',
    'auth/cancelled-popup-request'
  ].includes(err.code);
}

async function signInWithGoogle() {
  if (!auth) {
    console.warn('Tried to sign in before Firebase was initialized.');
    alert('App is still loading. Please try again.');
    return;
  }
  try {
    await signInWithPopup(auth, googleProvider);
  } catch (err) {
    if (err && err.code === 'auth/popup-closed-by-user') return;
    if (shouldFallbackToRedirect(err)) {
      try {
        await signInWithRedirect(auth, googleProvider);
        return;
      } catch (redirectErr) {
        console.error('Redirect fallback failed', redirectErr);
        alert('Google sign-in redirect failed. Please try again.');
        return;
      }
    }
    console.error('Google sign-in failed', err);
    alert('Google sign-in failed. Please try again.');
  }
}

// Listen to auth state changes
function handleAuthState() {
  onAuthStateChanged(auth, (user) => {
    if (user) {
      currentUser = user;
      showAppForUser(user);
    } else {
      currentUser = null;
      showLogin();
      detachAllListeners();
    }
  });
}

async function handleSignInRedirectResult() {
  if (!auth) return;
  try {
    const result = await getRedirectResult(auth);
    if (result && result.user) {
      currentUser = result.user;
      showAppForUser(result.user);
    }
  } catch (err) {
    if (err && err.code === 'auth/no-auth-event') return;
    if (err && err.code === 'auth/redirect-cancelled-by-user') return;
    console.error('Google redirect sign-in failed', err);
    alert('Google sign-in failed after redirect. Please try again.');
  }
}

// UI helpers
function showLogin() {
  loginScreen.classList.remove('hidden');
  appRoot.classList.add('hidden');
  resetFilterState();
  updateBackToTopVisibility();
}

function showAppForUser(user) {
  loginScreen.classList.add('hidden');
  appRoot.classList.remove('hidden');
  userNameEl.textContent = user.displayName || user.email || 'You';
  updateBackToTopVisibility();

  // load default section
  switchSection('movies');
}

function switchSection(sectionId) {
  tabs.forEach(t => t.classList.toggle('active', t.dataset.section === sectionId));
  sections.forEach(s => s.classList.toggle('hidden', s.id !== sectionId));

  // load data when switched to a list
  if (['movies','tvShows','anime','books'].includes(sectionId)) {
    loadList(sectionId);
  }
}

function updateBackToTopVisibility() {
  if (!backToTopBtn) return;
  const shouldShow = window.scrollY > 320 && appRoot && !appRoot.classList.contains('hidden');
  backToTopBtn.classList.toggle('hidden', !shouldShow);
}

// Detach all DB listeners
function detachAllListeners() {
  for (const k in listeners) {
    if (typeof listeners[k] === 'function') listeners[k]();
  }
  Object.keys(listeners).forEach(k => delete listeners[k]);
}

// Load list items in real-time
// listType: movies | tvShows | anime | books
function loadList(listType) {
  if (!currentUser) return;
  const listContainer = document.getElementById(`${listType}-list`);
  listContainer.innerHTML = 'Loading...';

  // remove previous listener for this list
  if (listeners[listType]) {
    listeners[listType]();
    delete listeners[listType];
  }

  const listRef = query(ref(db, `users/${currentUser.uid}/${listType}`), orderByChild('title'));
  const off = onValue(listRef, (snap) => {
    const data = snap.val() || {};
    renderList(listType, data);
    maybeRefreshMetadata(listType, data);
  }, (err) => {
    console.error('DB read error', err);
    listContainer.innerHTML = '<div class="small">Unable to load items.</div>';
  });

  // store unsubscribe
  listeners[listType] = off;
}

function createEl(tag, classNames = '', options = {}) {
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

// Render list items
function renderList(listType, data) {
  listCaches[listType] = data;
  const container = document.getElementById(`${listType}-list`);
  container.innerHTML = '';

  const entries = Object.entries(data || {});
  const supportsActorFilter = Object.prototype.hasOwnProperty.call(actorFilters, listType);
  const filterValue = supportsActorFilter ? (actorFilters[listType] || '').trim().toLowerCase() : '';

  let filtered = entries;
  if (filterValue && supportsActorFilter) {
    filtered = entries.filter(([, item]) => {
      if (!item) return false;
      const tokens = Array.isArray(item.actors) ? item.actors : parseActorsList(item.actors);
      if (tokens && tokens.length) {
        return tokens.some(name => String(name).toLowerCase().includes(filterValue));
      }
      const fallback = String(item.actors || '').toLowerCase();
      return fallback.includes(filterValue);
    });
  }

  if (filtered.length === 0) {
    const message = supportsActorFilter && filterValue
      ? 'No items match this actor filter yet.'
      : 'No items yet. Add something!';
    container.innerHTML = '<div class="small">' + message + '</div>';
    return;
  }

  const mode = sortModes[listType] || 'title';
  filtered.sort(([, a], [, b]) => {
    const ta = titleSortKey(a && a.title ? a.title : '');
    const tb = titleSortKey(b && b.title ? b.title : '');
    if (mode === 'title') {
      if (ta < tb) return -1; if (ta > tb) return 1; return 0;
    }
    if (mode === 'yearAsc' || mode === 'yearDesc') {
      const ya = a && a.year ? parseInt(a.year, 10) : 9999;
      const yb = b && b.year ? parseInt(b.year, 10) : 9999;
      if (ya !== yb) return mode === 'yearAsc' ? ya - yb : yb - ya;
      if (ta < tb) return -1; if (ta > tb) return 1; return 0;
    }
    if (mode === 'director') {
      const da = (a && (a.director || a.author || '')).toLowerCase();
      const db = (b && (b.director || b.author || '')).toLowerCase();
      if (da && db && da !== db) return da < db ? -1 : 1;
      if (ta < tb) return -1; if (ta > tb) return 1; return 0;
    }
    if (mode === 'series') {
      const sa = (a && a.seriesName ? a.seriesName : '').toLowerCase();
      const sb = (b && b.seriesName ? b.seriesName : '').toLowerCase();
      if (sa && sb && sa !== sb) return sa < sb ? -1 : 1;
      const oa = parseSeriesOrder(a && a.seriesOrder);
      const ob = parseSeriesOrder(b && b.seriesOrder);
      if (oa !== ob) return oa - ob;
      if (ta < tb) return -1; if (ta > tb) return 1; return 0;
    }
    // fallback title
    if (ta < tb) return -1; if (ta > tb) return 1; return 0;
  });

  if (listType === 'movies') {
    renderMoviesGrid(container, filtered);
    return;
  }

  renderStandardList(container, listType, filtered);

  if (listType in expandedCards) {
    updateCollapsibleCardStates(listType);
  }
}

function renderMoviesGrid(container, entries) {
  const grid = createEl('div', 'movies-grid');
  const visibleIds = new Set();

  entries.forEach(([id, item], index) => {
    if (!item) return;
    visibleIds.add(id);
    grid.appendChild(buildCollapsibleMovieCard(id, item, index));
  });

  container.appendChild(grid);

  const expandedSet = ensureExpandedSet('movies');
  expandedSet.forEach(cardId => {
    if (!visibleIds.has(cardId)) {
      expandedSet.delete(cardId);
    }
  });

  updateCollapsibleCardStates('movies');
}

function renderStandardList(container, listType, entries) {
  entries.forEach(([id, item]) => {
    if (!item) return;
    container.appendChild(buildStandardCard(listType, id, item));
  });
}

function buildCollapsibleMovieCard(id, item, positionIndex = 0) {
  const card = createEl('div', 'card collapsible movie-card');
  card.dataset.id = id;
  card.dataset.index = String(positionIndex);
  if (ensureExpandedSet('movies').has(id)) {
    card.classList.add('expanded');
  }
  card.addEventListener('click', () => toggleCardExpansion('movies', id));

  card.appendChild(buildMovieCardSummary(item));
  card.appendChild(buildMovieCardDetails('movies', id, item));
  return card;
}

function buildMovieCardSummary(item) {
  const summary = createEl('div', 'movie-card-summary');
  summary.appendChild(buildMovieArtwork(item));
  summary.appendChild(buildMovieCardInfo(item));
  return summary;
}

function buildMovieArtwork(item) {
  const wrapper = createEl('div', 'artwork-wrapper');
  if (item.poster) {
    const poster = createEl('div', 'artwork');
    const img = createEl('img');
    img.src = item.poster;
    img.alt = `${item.title || 'Poster'} artwork`;
    img.loading = 'lazy';
    poster.appendChild(img);
    wrapper.appendChild(poster);
  } else {
    const placeholder = createEl('div', 'artwork placeholder', { text: 'No Poster' });
    wrapper.appendChild(placeholder);
  }
  return wrapper;
}

function buildMovieCardInfo(item) {
  const info = createEl('div', 'movie-card-info');
  const header = createEl('div', 'movie-card-header');
  const title = createEl('div', 'title', { text: item.title || '(no title)' });
  header.appendChild(title);
  info.appendChild(header);

  return info;
}

function buildMovieCardDetails(listType, id, item) {
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

  details.appendChild(buildMovieCardActions(listType, id, item));
  return details;
}

function buildMovieMetaText(item) {
  const metaParts = [];
  if (item.year) metaParts.push(item.year);
  if (item.director) metaParts.push(item.director);
  if (item.runtime) metaParts.push(item.runtime);
  if (item.imdbRating) metaParts.push(`IMDb ${item.imdbRating}`);
  return metaParts.join(' • ');
}

function buildMovieExtendedMeta(item) {
  const parts = [];
  if (item.originalLanguage) parts.push(`Original Language: ${item.originalLanguage}`);
  if (item.budget) parts.push(`Budget: ${item.budget}`);
  if (item.revenue) parts.push(`Revenue: ${item.revenue}`);
  if (!parts.length) return null;
  return createEl('div', 'movie-card-extra-meta', { text: parts.join(' • ') });
}

function buildSeriesLine(item, className = 'series-line') {
  if (!item.seriesName) return null;
  const parts = [`Series: ${item.seriesName}`];
  if (item.seriesOrder !== undefined && item.seriesOrder !== null && item.seriesOrder !== '') {
    parts.push(`Entry ${item.seriesOrder}`);
  }
  if (item.seriesSize) {
    parts.push(`of ${item.seriesSize}`);
  }
  if (item.nextSequel) {
    parts.push(`Next: ${item.nextSequel}`);
  }
  if (item.previousPrequel) {
    parts.push(`Prev: ${item.previousPrequel}`);
  }
  return createEl('div', className, { text: parts.join(' • ') });
}

function buildMovieCastLine(item) {
  const actorPreview = buildActorPreview(item.actors, 12);
  if (!actorPreview) return null;
  return createEl('div', 'actor-line', { text: `Cast: ${actorPreview}` });
}

function buildMovieLinks(listType, item) {
  const links = createEl('div', 'collapsible-links');
  if (item.imdbUrl) {
    const imdb = createEl('a', 'meta-link', { text: 'View on IMDb' });
    imdb.href = item.imdbUrl;
    imdb.target = '_blank';
    imdb.rel = 'noopener noreferrer';
    links.appendChild(imdb);
  }
  if (item.trailerUrl) {
    const trailer = createEl('a', 'meta-link', { text: 'Watch Trailer' });
    trailer.href = item.trailerUrl;
    trailer.target = '_blank';
    trailer.rel = 'noopener noreferrer';
    links.appendChild(trailer);
  }
  // Inline "Watch Now" next to trailer for movies
  if (listType === 'movies' && TMDB_API_KEY) {
    const watchInline = buildWatchNowSection(listType, item, true);
    if (watchInline) links.appendChild(watchInline);
  }
  return links.children.length ? links : null;
}

function buildMovieCardActions(listType, id, item) {
  const actions = createEl('div', 'actions collapsible-actions');
  const configs = [
    {
      className: 'btn secondary',
      label: 'Edit',
      handler: () => openEditModal(listType, id, item)
    },
    {
      className: 'btn ghost',
      label: 'Delete',
      handler: () => deleteItem(listType, id)
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

function buildStandardCard(listType, id, item) {
  const card = createEl('div', 'card');

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
  card.appendChild(buildStandardCardActions(listType, id, item));
  return card;
}

function buildStandardCardHeader(item) {
  const header = createEl('div', 'card-header');
  header.appendChild(createEl('div', 'title', { text: item.title || '(no title)' }));
  return header;
}

function buildStandardMetaText(listType, item) {
  const metaParts = [];
  if (item.year) metaParts.push(item.year);
  if (listType === 'books') {
    if (item.author) metaParts.push(item.author);
  } else {
    if (item.director) metaParts.push(item.director);
    if (item.imdbRating) metaParts.push(`IMDb ${item.imdbRating}`);
    if (item.runtime) metaParts.push(item.runtime);
  }
  return metaParts.filter(Boolean).join(' • ');
}

function buildStandardActorLine(item) {
  const actorPreview = buildActorPreview(item.actors, 5);
  if (!actorPreview) return null;
  return createEl('div', 'actor-line', { text: `Cast: ${actorPreview}` });
}

function appendMediaLinks(container, item) {
  const links = [];
  if (item.imdbUrl) {
    links.push({ href: item.imdbUrl, label: 'View on IMDb' });
  }
  if (item.trailerUrl) {
    links.push({ href: item.trailerUrl, label: 'Watch Trailer' });
  }
  links.forEach(link => {
    const anchor = createEl('a', 'meta-link', { text: link.label });
    anchor.href = link.href;
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
    container.appendChild(anchor);
  });
}

function buildStandardCardActions(listType, id, item) {
  const actions = createEl('div', 'actions');

  const editBtn = createEl('button', 'btn secondary', { text: 'Edit' });
  editBtn.addEventListener('click', () => openEditModal(listType, id, item));
  actions.appendChild(editBtn);

  const deleteBtn = createEl('button', 'btn ghost', { text: 'Delete' });
  deleteBtn.addEventListener('click', () => deleteItem(listType, id));
  actions.appendChild(deleteBtn);

  return actions;
}

function toggleCardExpansion(listType, cardId) {
  if (!(listType in expandedCards)) return;
  const expandedSet = ensureExpandedSet(listType);
  if (expandedSet.has(cardId)) {
    expandedSet.delete(cardId);
  } else {
    expandedSet.add(cardId);
    if (listType === 'movies') {
      collapseMovieCardsBehind(cardId);
    }
  }
  updateCollapsibleCardStates(listType);
}

function collapseMovieCardsBehind(frontCardId) {
  const listEl = document.getElementById('movies-list');
  if (!listEl) return;
  const expandedSet = ensureExpandedSet('movies');
  const cards = listEl.querySelectorAll('.card.collapsible.movie-card.expanded');
  cards.forEach(card => {
    if (card.dataset.id === frontCardId) return;
    expandedSet.delete(card.dataset.id);
    card.classList.remove('expanded');
  });
}

function updateCollapsibleCardStates(listType) {
  const listEl = document.getElementById(`${listType}-list`);
  if (!listEl) return;
  const expandedSet = expandedCards[listType];
  listEl.querySelectorAll('.card.collapsible').forEach(card => {
    const isMatch = expandedSet instanceof Set
      ? expandedSet.has(card.dataset.id)
      : expandedSet === card.dataset.id;
    card.classList.toggle('expanded', isMatch);
  });
}

function ensureExpandedSet(listType) {
  let store = expandedCards[listType];
  if (!(store instanceof Set)) {
    store = new Set(store ? [store] : []);
    expandedCards[listType] = store;
  }
  return store;
}


// Add item from form
async function addItemFromForm(listType, form) {
  const title = (form.title.value || '').trim();
  const notes = (form.notes.value || '').trim();
  const yearRaw = (form.year && form.year.value ? form.year.value.trim() : '');
  const year = sanitizeYear(yearRaw);
  const creatorField = listType === 'books' ? 'author' : 'director';
  const creatorValue = (form[creatorField] && form[creatorField].value ? form[creatorField].value.trim() : '');
  const seriesNameValue = listType === 'books' ? '' : (form.seriesName && form.seriesName.value ? form.seriesName.value.trim() : '');
  const seriesOrderRaw = listType === 'books' ? '' : (form.seriesOrder && form.seriesOrder.value ? form.seriesOrder.value.trim() : '');
  const seriesOrder = listType === 'books' ? null : sanitizeSeriesOrder(seriesOrderRaw);

  if (!title) {
    alert('Title is required');
    return;
  }

  const submitBtn = form.querySelector('button[type="submit"]');
  setButtonBusy(submitBtn, true);

  try {
    let metadata = form.__selectedMetadata || null;
    const selectedImdbId = form.dataset.selectedImdbId || '';
    const selectedTmdbId = form.dataset.selectedTmdbId || '';
    const supportsMetadata = ['movies', 'tvShows', 'anime'].includes(listType);
    const hasMetadataProvider = Boolean(TMDB_API_KEY);
    if (!metadata && supportsMetadata) {
      if (!hasMetadataProvider) {
        maybeWarnAboutTmdbKey();
      } else {
        metadata = await fetchTmdbMetadata(listType, { title, year, imdbId: selectedImdbId, tmdbId: selectedTmdbId });
      }
    }

    const item = {
      title,
      createdAt: Date.now(),
    };
    if (notes) item.notes = notes;
    if (year) item.year = year;
    const baseTrailerUrl = buildTrailerUrl(title, year);
    if (baseTrailerUrl) item.trailerUrl = baseTrailerUrl;

    if (listType === 'books') {
      if (creatorValue) item.author = creatorValue;
    } else {
      if (creatorValue) item.director = creatorValue;
      if (seriesNameValue) item.seriesName = seriesNameValue;
      if (seriesOrder !== null) item.seriesOrder = seriesOrder;
      if (metadata) {
        const metadataUpdates = deriveMetadataAssignments(metadata, item, {
          overwrite: false,
          fallbackTitle: title,
          fallbackYear: year,
          alwaysAssign: ['year', 'imdbId', 'imdbUrl', 'imdbType'],
        });
        Object.assign(item, metadataUpdates);
      }
    }

    if (isDuplicateCandidate(listType, item)) {
      alert("Hey dumbass! It's already in the damn list!");
      return;
    }

    // Auto franchise enrichment (TMDb) for movies if user didn't supply seriesName
    if (listType === 'movies' && TMDB_API_KEY && !item.seriesName && item.title) {
      try {
        const collInfo = await getTmdbCollectionInfo(item.title, item.year, item.imdbId);
        if (collInfo && collInfo.collectionName && Array.isArray(collInfo.parts) && collInfo.parts.length > 1) {
          const idx = collInfo.parts.findIndex(p => p.matchesCurrent);
          if (idx >= 0) {
            item.seriesName = collInfo.collectionName;
            item.seriesOrder = idx + 1; // 1-based order
            // Optionally store total size
            item.seriesSize = collInfo.parts.length;
            if (idx + 1 < collInfo.parts.length) {
              item.nextSequel = collInfo.parts[idx + 1].title;
            }
            if (idx > 0) {
              item.previousPrequel = collInfo.parts[idx - 1].title;
            }
            item._tmdbCollectionInfo = collInfo; // stash for post-add prompt
          }
        }
      } catch (e) {
        console.warn('TMDb enrichment failed', e);
      }
    }

    await addItem(listType, item);

    // After adding, if we have collection info, offer to auto-add missing parts
    if (listType === 'movies' && item._tmdbCollectionInfo) {
      promptAddMissingCollectionParts(listType, item._tmdbCollectionInfo, item);
    }
    form.reset();
    form.__selectedMetadata = null;
    delete form.dataset.selectedImdbId;
    delete form.dataset.selectedTmdbId;
    hideTitleSuggestions(form);
  } catch (err) {
    console.error('Unable to add item', err);
    const message = err && err.message === 'Not signed in'
      ? 'Please sign in to add items.'
      : 'Unable to add item right now. Please try again.';
    alert(message);
  } finally {
    setButtonBusy(submitBtn, false);
  }
}

// Fetch TMDb collection info for a title/year/imdbId
async function getTmdbCollectionInfo(title, year, imdbId) {
  if (!TMDB_API_KEY) return null;
  const q = encodeURIComponent(title);
  let searchUrl = `https://api.themoviedb.org/3/search/movie?api_key=${TMDB_API_KEY}&query=${q}`;
  const yearParam = year && year.length === 4 ? `&year=${year}` : '';
  searchUrl += yearParam;
  let searchData;
  try {
    const resp = await fetch(searchUrl);
    searchData = await resp.json();
  } catch (e) {
    return null;
  }
  if (!searchData || !Array.isArray(searchData.results) || !searchData.results.length) return null;
  const normTitle = title.trim().toLowerCase();
  const pick = searchData.results.reduce((best, cur) => {
    const curTitle = (cur.title || cur.original_title || '').toLowerCase();
    const titleScore = curTitle === normTitle ? 3 : curTitle.includes(normTitle) ? 2 : 1;
    const yearScore = year && cur.release_date && cur.release_date.startsWith(year) ? 2 : 0;
    const total = titleScore + yearScore;
    return total > (best._score || 0) ? Object.assign(cur, {_score: total}) : best;
  }, {});
  if (!pick || !pick.id) return null;
  let detail;
  try {
    const detailResp = await fetch(`https://api.themoviedb.org/3/movie/${pick.id}?api_key=${TMDB_API_KEY}`);
    detail = await detailResp.json();
  } catch (e) {
    return null;
  }
  if (!detail || !detail.belongs_to_collection || !detail.belongs_to_collection.id) return null;
  const collId = detail.belongs_to_collection.id;
  let collData;
  try {
    const collResp = await fetch(`https://api.themoviedb.org/3/collection/${collId}?api_key=${TMDB_API_KEY}`);
    collData = await collResp.json();
  } catch (e) {
    return null;
  }
  if (!collData || !Array.isArray(collData.parts) || collData.parts.length < 2) return null;
  const parts = collData.parts.slice().map(p => ({
    id: p.id,
    title: p.title || p.original_title || '',
    year: p.release_date ? p.release_date.slice(0,4) : '',
    imdbId: p.imdb_id || '',
  })).filter(p => p.title);
  parts.sort((a,b) => {
    const yA = parseInt(a.year,10) || 9999;
    const yB = parseInt(b.year,10) || 9999;
    if (yA !== yB) return yA - yB;
    const tA = a.title.toLowerCase();
    const tB = b.title.toLowerCase();
    if (tA < tB) return -1;
    if (tA > tB) return 1;
    return 0;
  });
  const matchIdx = parts.findIndex(p => {
    if (imdbId && p.imdbId && imdbId === p.imdbId) return true;
    const pNorm = p.title.toLowerCase();
    return pNorm === normTitle || pNorm.includes(normTitle);
  });
  return {
    collectionName: detail.belongs_to_collection.name,
    parts: parts.map((p,i) => ({...p, order: i+1, matchesCurrent: i === matchIdx}))
  };
}

function sanitizeYear(input) {
  if (!input) return '';
  const cleaned = input.replace(/[^0-9]/g, '').slice(0, 4);
  if (cleaned.length !== 4) return '';
  return cleaned;
}

function sanitizeSeriesOrder(input) {
  if (!input) return null;
  const trimmed = String(input).trim();
  if (!trimmed) return null;
  const numeric = Number(trimmed);
  if (Number.isFinite(numeric)) return numeric;
  const fallback = parseFloat(trimmed.replace(/[^0-9.\-]/g, ''));
  if (Number.isFinite(fallback)) return fallback;
  return trimmed;
}

function normalizeTitleKey(title) {
  if (!title) return '';
  return String(title).trim().toLowerCase().replace(/\s+/g, ' ');
}

// Build a sorting key for titles that ignores a leading article like "The", "A", or "An".
function titleSortKey(title) {
  if (!title) return '';
  const t = String(title).trim().toLowerCase();
  // remove a single leading article followed by space: the|a|an (word boundary ensures not matching "there")
  return t.replace(/^(?:the|a|an)\b\s+/, '');
}

function buildComparisonSignature(item) {
  if (!item) return null;
  const imdbId = item.imdbId || item.imdbID || '';
  const title = normalizeTitleKey(item.title || item.Title || '');
  const year = sanitizeYear(item.year || item.Year || '');
  const series = normalizeTitleKey(item.seriesName || '');
  const order = item.seriesOrder !== undefined && item.seriesOrder !== null ? item.seriesOrder : null;
  return { imdbId, title, year, series, order };
}

function signaturesMatch(candidate, existing) {
  if (!candidate || !existing) return false;
  if (candidate.imdbId && existing.imdbId && candidate.imdbId === existing.imdbId) {
    return true;
  }
  if (candidate.title && existing.title) {
    if (candidate.title === existing.title) {
      if (!candidate.year || !existing.year || candidate.year === existing.year) {
        return true;
      }
    }
  }
  if (candidate.series && existing.series && candidate.series === existing.series) {
    if (candidate.order !== null && existing.order !== null && candidate.order === existing.order) {
      return true;
    }
  }
  return false;
}

function isDuplicateCandidate(listType, candidateItem) {
  const cache = listCaches[listType];
  if (!cache) return false;
  const candidateSig = buildComparisonSignature(candidateItem);
  if (!candidateSig) return false;
  return Object.values(cache).some(existing => signaturesMatch(candidateSig, buildComparisonSignature(existing)));
}

function extractPrimaryYear(value) {
  if (!value) return '';
  const match = String(value).match(/\d{4}/);
  return match ? match[0] : '';
}

function parseActorsList(raw) {
  if (!raw || raw === 'N/A') return [];
  const unique = new Set();
  String(raw)
    .split(',')
    .map(part => part.trim())
    .filter(Boolean)
    .forEach(name => {
      if (!unique.has(name)) unique.add(name);
    });
  return Array.from(unique).slice(0, 12);
}

function buildActorPreview(value, limit = 5) {
  if (!value) return '';
  const list = Array.isArray(value)
    ? value.filter(Boolean).map(name => String(name).trim()).filter(Boolean)
    : parseActorsList(value);
  if (!list.length) return '';
  const preview = list.slice(0, limit);
  const truncated = list.length > limit;
  return `${preview.join(', ')}${truncated ? '…' : ''}`;
}

function formatCurrencyShort(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return '';
  if (amount >= 1_000_000_000) return `$${(amount / 1_000_000_000).toFixed(1).replace(/\.0$/, '')}B`;
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (amount >= 1_000) return `$${(amount / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  return `$${amount.toLocaleString()}`;
}

function resolveLanguageName(isoCode, spokenLanguages) {
  if (!isoCode) return '';
  const bucket = Array.isArray(spokenLanguages) ? spokenLanguages : [];
  const match = bucket.find(entry => entry && entry.iso_639_1 === isoCode);
  const name = match?.english_name || match?.name;
  return name || isoCode.toUpperCase();
}

function hasMeaningfulValue(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function deriveMetadataAssignments(metadata, existing = {}, options = {}) {
  if (!metadata) return {};
  const {
    overwrite = false,
    fallbackTitle = existing.title || '',
    fallbackYear = existing.year || '',
    alwaysAssign = [],
  } = options;
  const updates = {};
  const forceKeys = new Set(['metadataVersion', ...(Array.isArray(alwaysAssign) ? alwaysAssign : [])]);

  const setField = (key, value) => {
    if (value === undefined || value === null) return;
    if (typeof value === 'string' && value.trim() === '') return;
    if (Array.isArray(value) && value.length === 0) return;
    if (!overwrite && !forceKeys.has(key) && hasMeaningfulValue(existing[key])) return;
    updates[key] = value;
  };

  const apiYear = metadata.Year && metadata.Year !== 'N/A' ? extractPrimaryYear(metadata.Year) : '';
  setField('year', apiYear);

  const directorFromApi = metadata.Director && metadata.Director !== 'N/A' ? metadata.Director : '';
  setField('director', directorFromApi);

  const imdbIdValue = metadata.imdbID && metadata.imdbID !== 'N/A' ? metadata.imdbID : '';
  setField('imdbId', imdbIdValue);
  if (imdbIdValue) {
    setField('imdbUrl', `https://www.imdb.com/title/${imdbIdValue}/`);
  }

  const rating = metadata.imdbRating && metadata.imdbRating !== 'N/A' ? metadata.imdbRating : '';
  setField('imdbRating', rating);

  const runtime = metadata.Runtime && metadata.Runtime !== 'N/A' ? metadata.Runtime : '';
  setField('runtime', runtime);

  const poster = metadata.Poster && metadata.Poster !== 'N/A' ? metadata.Poster : '';
  setField('poster', poster);

  const plot = metadata.Plot && metadata.Plot !== 'N/A' ? metadata.Plot : '';
  setField('plot', plot);

  const typeValue = metadata.Type && metadata.Type !== 'N/A' ? metadata.Type : '';
  setField('imdbType', typeValue);

  const metascore = metadata.Metascore && metadata.Metascore !== 'N/A' ? metadata.Metascore : '';
  setField('metascore', metascore);

  const actors = parseActorsList(metadata.Actors);
  if (actors.length) {
    setField('actors', actors);
  }

  const originalLanguage = metadata.OriginalLanguage && metadata.OriginalLanguage !== 'N/A' ? metadata.OriginalLanguage : '';
  setField('originalLanguage', originalLanguage);

  const budgetValue = metadata.Budget && metadata.Budget !== 'N/A' ? metadata.Budget : '';
  setField('budget', budgetValue);

  const revenueValue = metadata.Revenue && metadata.Revenue !== 'N/A' ? metadata.Revenue : '';
  setField('revenue', revenueValue);

  const tmdbIdValue = metadata.TmdbID && metadata.TmdbID !== 'N/A' ? metadata.TmdbID : (metadata.TmdbId || '');
  setField('tmdbId', tmdbIdValue);

  const effectiveTitle = (metadata.Title && metadata.Title !== 'N/A') ? metadata.Title : fallbackTitle;
  const effectiveYear = apiYear || fallbackYear;
  if (effectiveTitle) {
    const trailerUrl = buildTrailerUrl(effectiveTitle, effectiveYear);
    setField('trailerUrl', trailerUrl);
  }

  setField('metadataVersion', METADATA_SCHEMA_VERSION);

  return updates;
}

function normalizeStatusValue(status) {
  return String(status || '').trim().toLowerCase();
}

function isSpinnerStatusEligible(item) {
  if (!item) return false;
  if (item.watched === true) return false;
  const normalized = normalizeStatusValue(item.status);
  if (!normalized) return true;
  if (normalized.startsWith('drop')) return false;
  if (normalized.startsWith('complete')) return false;
  if (normalized.startsWith('watched')) return false;
  return true;
}

function isItemWatched(item) {
  if (!item) return false;
  if (typeof item.watched === 'boolean') {
    return item.watched;
  }
  const normalized = normalizeStatusValue(item.status);
  if (!normalized) return false;
  if (normalized.startsWith('complete')) return true;
  if (normalized.startsWith('watched')) return true;
  return false;
}

function parseSeriesOrder(value) {
  if (value === null || value === undefined || value === '') {
    return Number.POSITIVE_INFINITY;
  }
  const num = Number(value);
  if (Number.isFinite(num)) {
    return num;
  }
  const parsed = parseFloat(String(value).replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY;
}

function buildSpinnerCandidates(listType, rawData) {
  const items = Object.values(rawData || {});
  if (!items.length) return [];

  const eligibleItems = items.filter((item) => isSpinnerStatusEligible(item));
  if (!eligibleItems.length) return [];

  const shouldApplySeriesLogic = ['movies', 'tvShows', 'anime'].includes(listType);
  if (!shouldApplySeriesLogic) {
    return eligibleItems.filter(item => !isItemWatched(item));
  }

  const standalone = [];
  const seriesMap = new Map();

  eligibleItems.forEach(item => {
    const seriesNameRaw = typeof item.seriesName === 'string' ? item.seriesName.trim() : '';
    if (seriesNameRaw) {
      const key = seriesNameRaw.toLowerCase();
      if (!seriesMap.has(key)) {
        seriesMap.set(key, []);
      }
      seriesMap.get(key).push({ order: parseSeriesOrder(item.seriesOrder), item });
    } else {
      if (!isItemWatched(item)) {
        standalone.push(item);
      }
    }
  });

  seriesMap.forEach(entries => {
    if (!entries || !entries.length) return;
    entries.sort((a, b) => {
      if (a.order !== b.order) return a.order - b.order;
      const titleA = (a.item && a.item.title ? a.item.title : '').toLowerCase();
      const titleB = (b.item && b.item.title ? b.item.title : '').toLowerCase();
      if (titleA < titleB) return -1;
      if (titleA > titleB) return 1;
      return 0;
    });
    const firstUnwatched = entries.find(entry => entry && entry.item && !isItemWatched(entry.item));
    if (firstUnwatched && firstUnwatched.item) {
      standalone.push(firstUnwatched.item);
    }
  });

  return standalone.sort((a, b) => {
    const titleA = (a && a.title ? a.title : '').toLowerCase();
    const titleB = (b && b.title ? b.title : '').toLowerCase();
    if (titleA < titleB) return -1;
    if (titleA > titleB) return 1;
    return 0;
  });
}

function getMissingMetadataFields(item) {
  if (!item) return [];
  const criticalFields = ['imdbId', 'imdbUrl', 'poster', 'plot', 'actors'];
  return criticalFields.filter(field => !hasMeaningfulValue(item[field]));
}

function needsMetadataRefresh(listType, item) {
  if (!item || !item.title) return false;
  if (!['movies', 'tvShows', 'anime'].includes(listType)) return false;
  if (item.metadataVersion !== METADATA_SCHEMA_VERSION) return true;
  return getMissingMetadataFields(item).length > 0;
}

function refreshMetadataForItem(listType, itemId, item, missingFields = []) {
  if (!TMDB_API_KEY) {
    maybeWarnAboutTmdbKey();
    return;
  }
  const key = `${listType}:${itemId}`;
  if (metadataRefreshInflight.has(key)) return;
  metadataRefreshInflight.add(key);

  const title = item.title || '[untitled]';
  const yearInfo = item.year ? ` (${item.year})` : '';
  console.debug('[Metadata] Refreshing', `${listType}:${itemId}`, `${title}${yearInfo}`, 'missing fields:', missingFields.join(', ') || 'unknown');

  const lookup = {
    title: item.title || '',
    year: item.year || '',
    imdbId: item.imdbId || item.imdbID || '',
    tmdbId: item.tmdbId || item.tmdbID || '',
  };

  fetchTmdbMetadata(listType, lookup).then(metadata => {
    if (!metadata) return;
    const updates = deriveMetadataAssignments(metadata, item, {
      overwrite: false,
      fallbackTitle: item.title || '',
      fallbackYear: item.year || '',
    });
    if (Object.keys(updates).length === 0) return;
    console.debug('[Metadata] Applying updates for', `${listType}:${itemId}`, updates);
    return updateItem(listType, itemId, updates);
  }).catch(err => {
    console.warn('Metadata refresh failed', err);
  }).finally(() => {
    metadataRefreshInflight.delete(key);
  });
}

function maybeRefreshMetadata(listType, data) {
  if (!currentUser) return;
  if (!['movies', 'tvShows', 'anime'].includes(listType)) return;
  if (!TMDB_API_KEY) {
    return;
  }

  Object.entries(data || {}).forEach(([id, item]) => {
    if (!needsMetadataRefresh(listType, item)) return;
    const missingFields = getMissingMetadataFields(item);
    refreshMetadataForItem(listType, id, item, missingFields);
  });
}

function buildTrailerUrl(title, year) {
  if (!title) return '';
  const query = `${title} ${year ? year + ' ' : ''}trailer`.trim();
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
}

function debounce(fn, wait = 250) {
  let timeoutId;
  return function debounced(...args) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn.apply(this, args), wait);
  };
}

function setButtonBusy(button, isBusy) {
  if (!button) return;
  if (isBusy) {
    if (!button.dataset.originalText) {
      button.dataset.originalText = button.textContent;
    }
    button.disabled = true;
    button.textContent = 'Adding...';
  } else {
    button.disabled = false;
    if (button.dataset.originalText) {
      button.textContent = button.dataset.originalText;
      delete button.dataset.originalText;
    }
  }
}

function maybeWarnAboutTmdbKey() {
  if (tmdbWarningShown) return;
  tmdbWarningShown = true;
  const message = 'TMDb API key missing. Metadata lookups, autocomplete, and collection helpers are disabled. Set TMDB_API_KEY in app.js to re-enable them.';
  console.warn(message);
  alert(message);
}

function hideTitleSuggestions(form) {
  if (!form || !form.__suggestionsEl) return;
  const el = form.__suggestionsEl;
  el.classList.remove('visible');
  el.innerHTML = '';
}

function resetFilterState() {
  Object.keys(actorFilters).forEach(key => {
    actorFilters[key] = '';
  });
  Object.keys(expandedCards).forEach(key => {
    expandedCards[key] = new Set();
  });
  Object.keys(listCaches).forEach(key => delete listCaches[key]);
  document.querySelectorAll('[data-role="actor-filter"]').forEach(input => {
    input.value = '';
  });
  document.querySelectorAll('[data-role="sort"]').forEach(sel => {
    const listType = sel.dataset.list;
    const mode = sortModes[listType] || 'title';
    sel.value = mode;
  });
  updateCollapsibleCardStates('movies');
}

function renderTitleSuggestions(container, suggestions, onSelect) {
  container.innerHTML = '';
  if (!suggestions || suggestions.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = 'No matches found';
    container.appendChild(empty);
    return;
  }

  const provider = suggestions[0] && suggestions[0].source;
  if (provider === 'tmdb') {
    const note = document.createElement('div');
    note.className = 'suggestions-note';
    note.textContent = 'Suggestions powered by TMDb.';
    container.appendChild(note);
  }

  suggestions.forEach(suggestion => {
    const button = document.createElement('button');
    button.type = 'button';
    const label = document.createElement('span');
    label.textContent = suggestion.title || '(no title)';
    button.appendChild(label);
    if (suggestion.year) {
      const year = document.createElement('span');
      year.className = 'year';
      year.textContent = suggestion.year;
      button.appendChild(year);
    }
    button.addEventListener('click', () => onSelect && onSelect(suggestion));
    container.appendChild(button);
  });
}

async function fetchTmdbSuggestions(listType, query) {
  if (!TMDB_API_KEY) return [];
  const mediaType = listType === 'movies' ? 'movie' : 'tv';
  const params = new URLSearchParams({
    api_key: TMDB_API_KEY,
    query,
    include_adult: 'false',
    language: 'en-US'
  });
  const merged = [];
  const seenIds = new Set();
  try {
    for (let page = 1; page <= 3; page++) {
      params.set('page', String(page));
      const resp = await fetch(`https://api.themoviedb.org/3/search/${mediaType}?${params.toString()}`);
      if (!resp.ok) {
        if (page === 1) return [];
        break;
      }
      const json = await resp.json();
      if (!json || !Array.isArray(json.results) || !json.results.length) {
        if (page === 1) return [];
        break;
      }
      json.results.forEach(entry => {
        if (!entry || !entry.id || seenIds.has(entry.id)) return;
        seenIds.add(entry.id);
        merged.push(entry);
      });
      if (json.total_pages && page >= json.total_pages) break;
    }
    return merged.map(entry => ({
      title: entry.title || entry.name || '',
      year: extractPrimaryYear(entry.release_date || entry.first_air_date || ''),
      imdbID: '',
      type: mediaType,
      tmdbId: entry.id,
      source: 'tmdb',
    })).filter(suggestion => suggestion.title);
  } catch (err) {
    console.warn('TMDb suggestion lookup failed', err);
    return [];
  }
}

function setupFormAutocomplete(form, listType) {
  if (!form) return;
  const wrapper = form.querySelector('.input-suggest');
  const titleInput = wrapper ? wrapper.querySelector('input[name="title"]') : null;
  const suggestionsEl = wrapper ? wrapper.querySelector('[data-role="title-suggestions"]') : null;
  form.__suggestionsEl = suggestionsEl || null;
  if (!titleInput || !suggestionsEl) return;

  if (!AUTOCOMPLETE_LISTS.has(listType)) {
    return;
  }

  const hasSuggestionProvider = Boolean(TMDB_API_KEY);
  if (!hasSuggestionProvider) {
    maybeWarnAboutTmdbKey();
    return;
  }

  suggestionForms.add(form);
  if (!globalSuggestionClickBound) {
    document.addEventListener('click', (event) => {
      suggestionForms.forEach(f => {
        if (!f.contains(event.target)) hideTitleSuggestions(f);
      });
    });
    globalSuggestionClickBound = true;
  }

  const yearInput = form.querySelector('input[name="year"]');
  const creatorInput = form.querySelector(listType === 'books' ? 'input[name="author"]' : 'input[name="director"]');
  let lastFetchToken = 0;

  const performSearch = debounce(async (query) => {
    const currentToken = ++lastFetchToken;
    const results = await fetchTmdbSuggestions(listType, query);
    if (currentToken !== lastFetchToken) return;
    renderTitleSuggestions(suggestionsEl, results, async (suggestion) => {
      titleInput.value = suggestion.title || '';
      const suggestionYear = extractPrimaryYear(suggestion.year);
      if (yearInput && suggestionYear) {
        yearInput.value = suggestionYear;
      }
      form.__selectedMetadata = null;
      if (suggestion.imdbID) {
        form.dataset.selectedImdbId = suggestion.imdbID;
      } else {
        delete form.dataset.selectedImdbId;
      }
      if (suggestion.tmdbId) {
        form.dataset.selectedTmdbId = suggestion.tmdbId;
      } else {
        delete form.dataset.selectedTmdbId;
      }
      if (TMDB_API_KEY && suggestion.tmdbId) {
        try {
          const detail = await fetchTmdbMetadata(listType, {
            title: suggestion.title,
            year: suggestionYear,
            imdbId: suggestion.imdbID,
            tmdbId: suggestion.tmdbId,
          });
          if (detail) {
            form.__selectedMetadata = detail;
            if (yearInput) {
              const detailYear = extractPrimaryYear(detail.Year);
              if (detailYear) yearInput.value = detailYear;
            }
            if (creatorInput && (!creatorInput.value || creatorInput.value === '') && detail.Director && detail.Director !== 'N/A') {
              creatorInput.value = detail.Director;
            }
          }
        } catch (err) {
          console.warn('Unable to prefill metadata from suggestion', err);
        }
      }
      hideTitleSuggestions(form);
      titleInput.focus();
    });
    suggestionsEl.classList.add('visible');
  }, 260);

  titleInput.addEventListener('input', () => {
    const query = titleInput.value.trim();
    form.__selectedMetadata = null;
    delete form.dataset.selectedImdbId;
    delete form.dataset.selectedTmdbId;
    if (query.length < 3) {
      lastFetchToken++;
      hideTitleSuggestions(form);
      return;
    }
    performSearch(query);
  });

  titleInput.addEventListener('focus', () => {
    if (suggestionsEl.children.length > 0) {
      suggestionsEl.classList.add('visible');
    }
  });

  titleInput.addEventListener('blur', () => {
    setTimeout(() => hideTitleSuggestions(form), 150);
  });

  titleInput.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') {
      hideTitleSuggestions(form);
    }
  });
}

async function fetchTmdbMetadata(listType, { title, year, imdbId, tmdbId }) {
  if (!TMDB_API_KEY) return null;
  const mediaType = listType === 'movies' ? 'movie' : 'tv';
  let detail = null;
  if (tmdbId) {
    detail = await fetchTmdbDetail(mediaType, tmdbId);
  }
  if (!detail) {
    const pick = await findTmdbCandidate({ mediaType, title, year, imdbId });
    if (!pick) return null;
    detail = await fetchTmdbDetail(mediaType, pick.id);
  }
  if (!detail) return null;
  return mapTmdbDetailToMetadata(detail, mediaType);
}

async function findTmdbCandidate({ mediaType, title, year, imdbId }) {
  if (imdbId) {
    try {
      const findResp = await fetch(`https://api.themoviedb.org/3/find/${imdbId}?api_key=${TMDB_API_KEY}&external_source=imdb_id`);
      if (findResp.ok) {
        const payload = await findResp.json();
        const bucket = mediaType === 'movie' ? payload.movie_results : payload.tv_results;
        if (Array.isArray(bucket) && bucket.length) {
          return bucket[0];
        }
      }
    } catch (err) {
      console.warn('TMDb lookup by IMDb failed', err);
    }
  }

  if (!title) return null;
  try {
    const searchParams = new URLSearchParams({ api_key: TMDB_API_KEY, query: title, include_adult: 'false' });
    if (year) {
      const yearKey = mediaType === 'movie' ? 'year' : 'first_air_date_year';
      searchParams.set(yearKey, year);
    }
    const searchResp = await fetch(`https://api.themoviedb.org/3/search/${mediaType}?${searchParams.toString()}`);
    if (!searchResp.ok) return null;
    const searchJson = await searchResp.json();
    if (!searchJson || !Array.isArray(searchJson.results) || !searchJson.results.length) return null;

    const normalizedYear = year ? String(year) : '';
    const match = normalizedYear
      ? searchJson.results.find(entry => {
          const dateField = mediaType === 'movie' ? entry.release_date : entry.first_air_date;
          return dateField && dateField.startsWith(normalizedYear);
        }) || searchJson.results[0]
      : searchJson.results[0];
    return match || null;
  } catch (err) {
    console.warn('TMDb search failed', err);
    return null;
  }
}

async function fetchTmdbDetail(mediaType, id) {
  try {
    const detailResp = await fetch(`https://api.themoviedb.org/3/${mediaType}/${id}?api_key=${TMDB_API_KEY}&append_to_response=credits,external_ids`);
    if (!detailResp.ok) return null;
    return await detailResp.json();
  } catch (err) {
    console.warn('TMDb detail fetch failed', err);
    return null;
  }
}

function mapTmdbDetailToMetadata(detail, mediaType) {
  if (!detail) return null;
  const poster = detail.poster_path ? `https://image.tmdb.org/t/p/w500${detail.poster_path}` : '';
  const releaseDate = mediaType === 'movie' ? detail.release_date : detail.first_air_date;
  const runtimeMinutes = mediaType === 'movie'
    ? detail.runtime
    : (Array.isArray(detail.episode_run_time) && detail.episode_run_time.length ? detail.episode_run_time[0] : null);
  const crew = Array.isArray(detail.credits?.crew) ? detail.credits.crew : [];
  const directorCrew = crew.find(member => member && member.job === 'Director');
  const director = directorCrew?.name
    || (Array.isArray(detail.created_by) ? detail.created_by.map(c => c && c.name).filter(Boolean).join(', ') : '')
    || '';
  const cast = Array.isArray(detail.credits?.cast) ? detail.credits.cast.slice(0, 12).map(actor => actor && actor.name).filter(Boolean) : [];
  const imdbId = detail.imdb_id || detail.external_ids?.imdb_id || '';
  const rating = typeof detail.vote_average === 'number' && detail.vote_average > 0 ? detail.vote_average.toFixed(1) : '';
  const budget = formatCurrencyShort(detail.budget);
  const revenue = formatCurrencyShort(detail.revenue);
  const originalLanguage = resolveLanguageName(detail.original_language, detail.spoken_languages);
  const tmdbId = detail.id || '';

  return {
    Title: detail.title || detail.name || '',
    Year: releaseDate ? String(releaseDate).slice(0, 4) : '',
    Director: director,
    Runtime: runtimeMinutes ? `${runtimeMinutes} min` : '',
    Poster: poster || 'N/A',
    Plot: detail.overview || '',
    imdbID: imdbId,
    imdbRating: rating,
    Actors: cast.join(', '),
    Type: mediaType === 'movie' ? 'movie' : 'series',
    Budget: budget,
    Revenue: revenue,
    OriginalLanguage: originalLanguage,
    TmdbID: tmdbId,
  };
}

// --- Watch Providers (TMDb) ---
function getUserRegion() {
  try {
    const lang = navigator.language || navigator.userLanguage || 'en-US';
    const parts = String(lang).split('-');
    return parts[1] ? parts[1].toUpperCase() : 'US';
  } catch (_) {
    return 'US';
  }
}

async function ensureTmdbIdentity(listType, item) {
  if (!item) return null;
  const mediaType = listType === 'movies' ? 'movie' : 'tv';
  let tmdbId = item.tmdbId || item.tmdbID || '';
  if (!tmdbId) {
    const pick = await findTmdbCandidate({
      mediaType,
      title: item.title || '',
      year: item.year || '',
      imdbId: item.imdbId || item.imdbID || ''
    });
    if (pick && pick.id) tmdbId = pick.id;
  }
  if (!tmdbId) return null;
  return { mediaType, tmdbId };
}

async function fetchWatchProviders(mediaType, tmdbId) {
  const url = `https://api.themoviedb.org/3/${mediaType}/${tmdbId}/watch/providers?api_key=${TMDB_API_KEY}`;
  const resp = await fetch(url);
  if (!resp.ok) return null;
  return await resp.json();
}

function buildWatchNowSection(listType, item, inline = false) {
  if (!TMDB_API_KEY) return null;
  // Only applicable for screen media (movies/tv). We add it on movie cards.
  const region = getUserRegion();
  const block = inline ? createEl('span', 'watch-now-inline') : createEl('div', 'watch-now-block');

  // Control (inline next to links)
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
      // Choose region preference
      const preferred = data.results[region] || data.results.US || data.results.GB || null;
      const effectiveRegion = preferred ? (preferred.iso_3166_1 || region) : region;
      const payload = { link: preferred?.link || '',
        flatrate: preferred?.flatrate || [],
        free: preferred?.free || [],
        ads: preferred?.ads || [],
        rent: preferred?.rent || [],
        buy: preferred?.buy || [] };
      // Cache for 6 hours
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

    // Footer removed per request (no "All options" button)

    if (!any) {
      const empty = createEl('div', 'small', { text: 'No providers found for this region.' });
      empty.style.marginTop = '.25rem';
      dropdown.appendChild(empty);
    }
  }

  btn.addEventListener('click', (ev) => { ev.preventDefault?.(); ev.stopPropagation(); toggle(); });
  // Prevent clicks inside dropdown from toggling the parent card
  dropdown.addEventListener('click', (ev) => ev.stopPropagation());

  return block;
}

// Create a new item
function addItem(listType, item) {
  if (!currentUser) {
    throw new Error('Not signed in');
  }
  const listRef = ref(db, `users/${currentUser.uid}/${listType}`);
  const newRef = push(listRef);
  return set(newRef, item);
}

// Update an existing item
function updateItem(listType, itemId, changes) {
  if (!currentUser) {
    alert('Not signed in');
    return Promise.reject(new Error('Not signed in'));
  }
  const itemRef = ref(db, `users/${currentUser.uid}/${listType}/${itemId}`);
  return update(itemRef, changes);
}

// Delete an item
function deleteItem(listType, itemId) {
  if (!currentUser) {
    alert('Not signed in');
    return Promise.reject(new Error('Not signed in'));
  }
  if (!confirm('Delete this item?')) return;
  const itemRef = ref(db, `users/${currentUser.uid}/${listType}/${itemId}`);
  remove(itemRef).catch(err => console.error('Delete failed', err));
}

// Open a small modal to edit
function openEditModal(listType, itemId, item) {
  modalRoot.innerHTML = '';
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  const modal = document.createElement('div');
  modal.className = 'modal';

  const form = document.createElement('form');
  const titleInput = document.createElement('input');
  titleInput.name = 'title';
  titleInput.value = item.title || '';
  titleInput.placeholder = 'Title';
  const yearInput = document.createElement('input');
  yearInput.name = 'year';
  yearInput.placeholder = 'Year';
  yearInput.inputMode = 'numeric';
  yearInput.pattern = '[0-9]{4}';
  yearInput.maxLength = 4;
  yearInput.value = item.year || '';
  const creatorInput = document.createElement('input');
  const creatorFieldName = listType === 'books' ? 'author' : 'director';
  creatorInput.name = creatorFieldName;
  const creatorPlaceholderMap = {
    movies: 'Director',
    tvShows: 'Director / Showrunner',
    anime: 'Director / Studio',
    books: 'Author',
  };
  creatorInput.placeholder = creatorPlaceholderMap[listType] || 'Creator';
  creatorInput.value = listType === 'books' ? (item.author || '') : (item.director || '');
  let seriesNameInput = null;
  let seriesOrderInput = null;
  if (listType !== 'books') {
    seriesNameInput = document.createElement('input');
    seriesNameInput.name = 'seriesName';
    seriesNameInput.placeholder = 'Series name (optional)';
    seriesNameInput.value = item.seriesName || '';

    seriesOrderInput = document.createElement('input');
    seriesOrderInput.name = 'seriesOrder';
    seriesOrderInput.placeholder = 'Series order';
    seriesOrderInput.inputMode = 'numeric';
    seriesOrderInput.pattern = '[0-9]{1,3}';
    seriesOrderInput.value = item.seriesOrder !== undefined && item.seriesOrder !== null ? item.seriesOrder : '';
  }
  const notesInput = document.createElement('textarea');
  notesInput.name = 'notes';
  notesInput.value = item.notes || '';
  const saveBtn = document.createElement('button');
  saveBtn.className = 'btn primary';
  saveBtn.textContent = 'Save';
  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'btn secondary';
  cancelBtn.textContent = 'Cancel';

  form.appendChild(titleInput);
  form.appendChild(yearInput);
  form.appendChild(creatorInput);
  if (seriesNameInput) form.appendChild(seriesNameInput);
  if (seriesOrderInput) form.appendChild(seriesOrderInput);
  form.appendChild(notesInput);
  const controls = document.createElement('div');
  controls.style.display = 'flex'; controls.style.gap = '.5rem'; controls.style.justifyContent = 'flex-end';
  controls.appendChild(cancelBtn); controls.appendChild(saveBtn);
  form.appendChild(controls);

  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const newTitle = (titleInput.value || '').trim();
    if (!newTitle) return alert('Title is required');
    const updatedYear = sanitizeYear((yearInput.value || '').trim());
    const creatorVal = (creatorInput.value || '').trim();
    const payload = {
      title: newTitle,
      notes: (notesInput.value || '').trim() || null,
      year: updatedYear || null,
    };
    if (listType === 'books') {
      payload.author = creatorVal || null;
    } else {
      payload.director = creatorVal || null;
      const seriesNameVal = (seriesNameInput && seriesNameInput.value ? seriesNameInput.value.trim() : '') || '';
      const seriesOrderValRaw = seriesOrderInput && seriesOrderInput.value ? seriesOrderInput.value.trim() : '';
      const normalizedSeriesOrder = seriesOrderInput ? sanitizeSeriesOrder(seriesOrderValRaw) : null;
      payload.seriesName = seriesNameVal || null;
      payload.seriesOrder = normalizedSeriesOrder !== null ? normalizedSeriesOrder : null;
    }
    updateItem(listType, itemId, payload);
    closeModal();
  });

  cancelBtn.addEventListener('click', (ev) => { ev.preventDefault(); closeModal(); });

  modal.appendChild(form);
  backdrop.appendChild(modal);
  modalRoot.appendChild(backdrop);

  function closeModal() { modalRoot.innerHTML = ''; }
}

function clearWheelAnimation() {
  spinTimeouts.forEach(id => clearTimeout(id));
  spinTimeouts = [];
  wheelSpinnerEl.classList.remove('spinning');
  wheelSpinnerEl.innerHTML = '';
}

function renderWheelResult(item, listType) {
  if (!item) {
    wheelResultEl.textContent = '';
    return;
  }

  const actionVerb = listType === 'books' ? 'read' : 'watch';
  wheelResultEl.innerHTML = '';

  const heading = document.createElement('div');
  heading.className = 'wheel-result-heading';
  heading.textContent = `You should ${actionVerb} next:`;
  wheelResultEl.appendChild(heading);

  const card = document.createElement('div');
  card.className = 'wheel-result-card';

  const posterWrap = document.createElement('div');
  posterWrap.className = 'poster';
  if (item.poster) {
    const img = document.createElement('img');
    img.src = item.poster;
    img.alt = `${item.title || 'Item'} artwork`;
    img.loading = 'lazy';
    posterWrap.appendChild(img);
  } else {
    posterWrap.classList.add('placeholder');
    posterWrap.textContent = 'No artwork';
  }
  card.appendChild(posterWrap);

  const details = document.createElement('div');
  details.className = 'wheel-result-details';

  const header = document.createElement('div');
  header.className = 'card-header wheel-result-header';
  const title = document.createElement('div');
  title.className = 'wheel-result-title';
  title.textContent = item.title || '(no title)';
  header.appendChild(title);
  details.appendChild(header);

  const metaParts = [];
  if (item.year) metaParts.push(item.year);
  if (listType === 'books') {
    if (item.author) metaParts.push(item.author);
  } else {
    if (item.director) metaParts.push(item.director);
    if (item.imdbRating) metaParts.push(`IMDb ${item.imdbRating}`);
    if (item.runtime) metaParts.push(item.runtime);
  }
  const metaText = metaParts.filter(Boolean).join(' • ');
  if (metaText) {
    const meta = document.createElement('div');
    meta.className = 'wheel-result-meta';
    meta.textContent = metaText;
    details.appendChild(meta);
  }

  if (listType !== 'books' && item.seriesName) {
    const seriesLine = document.createElement('div');
    seriesLine.className = 'wheel-result-series';
    const parts = [`Series: ${item.seriesName}`];
    if (item.seriesOrder !== undefined && item.seriesOrder !== null && item.seriesOrder !== '') {
      parts.push(`Entry ${item.seriesOrder}`);
    }
    seriesLine.textContent = parts.join(' • ');
    details.appendChild(seriesLine);
  }

  if (listType !== 'books') {
    const castText = buildActorPreview(item.actors, 6);
    if (castText) {
      const cast = document.createElement('div');
      cast.className = 'wheel-result-cast';
      cast.textContent = `Cast: ${castText}`;
      details.appendChild(cast);
    }
  }

  if (item.plot) {
    const summary = document.createElement('div');
    summary.className = 'wheel-result-summary';
    const plot = item.plot.trim();
    summary.textContent = plot.length > 260 ? `${plot.slice(0, 257)}…` : plot;
    details.appendChild(summary);
  }

  if (item.notes) {
    const notes = document.createElement('div');
    notes.className = 'wheel-result-notes';
    notes.textContent = item.notes;
    details.appendChild(notes);
  }

  const links = document.createElement('div');
  links.className = 'wheel-result-links';
  if (item.imdbUrl) {
    const imdbLink = document.createElement('a');
    imdbLink.href = item.imdbUrl;
    imdbLink.target = '_blank';
    imdbLink.rel = 'noopener noreferrer';
    imdbLink.className = 'meta-link';
    imdbLink.textContent = 'View on IMDb';
    links.appendChild(imdbLink);
  }
  if (item.trailerUrl) {
    const trailerLink = document.createElement('a');
    trailerLink.href = item.trailerUrl;
    trailerLink.target = '_blank';
    trailerLink.rel = 'noopener noreferrer';
    trailerLink.className = 'meta-link';
    trailerLink.textContent = 'Watch Trailer';
    links.appendChild(trailerLink);
  }
  if (links.children.length) {
    details.appendChild(links);
  }

  // Sequel / Prequel lookup button
  if (listType === 'movies') {
    const relatedBtn = document.createElement('button');
    relatedBtn.type = 'button';
    relatedBtn.className = 'btn secondary';
    relatedBtn.textContent = 'Lookup Sequels/Prequels';
    relatedBtn.addEventListener('click', () => {
      lookupRelatedTitles(item);
    });
    details.appendChild(relatedBtn);
  }

  card.appendChild(details);
  wheelResultEl.appendChild(card);
}

// --- Sequel / Prequel Lookup Logic (TMDb only) ---

function buildRelatedModal(currentItem, related) {
  const modalRoot = document.getElementById('modal-root');
  modalRoot.innerHTML = '';
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  const modal = document.createElement('div');
  modal.className = 'modal';
  const h = document.createElement('h3');
  h.textContent = `Related titles for: ${currentItem.title}`;
  modal.appendChild(h);
  const list = document.createElement('div');
  list.style.display = 'flex';
  list.style.flexDirection = 'column';
  list.style.gap = '.5rem';
  if (!related.length) {
    const empty = document.createElement('div');
    empty.textContent = 'No potential sequels/prequels found.';
    list.appendChild(empty);
  } else {
    related.forEach(r => {
      const row = document.createElement('div');
      row.style.display = 'flex';
      row.style.alignItems = 'center';
      row.style.gap = '.5rem';
      row.style.background = 'var(--card-bg)';
      row.style.padding = '.5rem .75rem';
      row.style.borderRadius = '6px';
        const title = document.createElement('div');
        const displayTitle = r.Title || r.title || '(untitled)';
        const displayYear = r.Year || r.year || '';
        title.textContent = displayTitle + (displayYear ? ` (${displayYear})` : '');
      row.appendChild(title);
        if (r.imdbID || r.imdbId) {
          const imdbLink = document.createElement('a');
          imdbLink.href = `https://www.imdb.com/title/${(r.imdbID || r.imdbId)}/`;
          imdbLink.target = '_blank';
          imdbLink.rel = 'noopener noreferrer';
          imdbLink.textContent = 'IMDb';
          imdbLink.className = 'meta-link';
          row.appendChild(imdbLink);
        }
        if (r.id && r.tmdb) {
          const tmdbLink = document.createElement('a');
          tmdbLink.href = `https://www.themoviedb.org/movie/${r.id}`;
          tmdbLink.target = '_blank';
          tmdbLink.rel = 'noopener noreferrer';
          tmdbLink.textContent = 'TMDb';
          tmdbLink.className = 'meta-link';
          row.appendChild(tmdbLink);
        }
      list.appendChild(row);
    });
  }
  modal.appendChild(list);
  const closeBtn = document.createElement('button');
  closeBtn.className = 'btn secondary';
  closeBtn.textContent = 'Close';
  closeBtn.addEventListener('click', () => { modalRoot.innerHTML = ''; });
  modal.appendChild(closeBtn);
  backdrop.appendChild(modal);
  modalRoot.appendChild(backdrop);
}

// TMDb based related lookup
async function lookupRelatedViaTMDb(item) {
  if (!TMDB_API_KEY) return null;
  if (!item || !item.title) return null;
  const query = encodeURIComponent(item.title.trim());
  try {
    const searchResp = await fetch(`https://api.themoviedb.org/3/search/movie?api_key=${TMDB_API_KEY}&query=${query}`);
    const searchData = await searchResp.json();
    if (!searchData || !Array.isArray(searchData.results) || !searchData.results.length) return null;
    // Find best match by comparing release year and title similarity
    const normalizedTitle = item.title.trim().toLowerCase();
    const candidate = searchData.results.reduce((best, cur) => {
      const curTitle = (cur.title || cur.original_title || '').toLowerCase();
      const titleScore = curTitle === normalizedTitle ? 3 : curTitle.includes(normalizedTitle) ? 2 : 1;
      const yearScore = item.year && cur.release_date && cur.release_date.startsWith(item.year) ? 2 : 0;
      const total = titleScore + yearScore;
      return total > (best._score || 0) ? Object.assign(cur, {_score: total}) : best;
    }, {});
    if (!candidate || !candidate.id) return null;
    if (!candidate.belongs_to_collection || !candidate.belongs_to_collection.id) {
      // Fetch movie details to see if collection info exists
      const detailResp = await fetch(`https://api.themoviedb.org/3/movie/${candidate.id}?api_key=${TMDB_API_KEY}`);
      const detailData = await detailResp.json();
      if (!detailData || !detailData.belongs_to_collection) return null;
      candidate.belongs_to_collection = detailData.belongs_to_collection;
    }
    const collectionId = candidate.belongs_to_collection.id;
    const collResp = await fetch(`https://api.themoviedb.org/3/collection/${collectionId}?api_key=${TMDB_API_KEY}`);
    const collData = await collResp.json();
    if (!collData || !Array.isArray(collData.parts) || !collData.parts.length) return null;
    const mapped = collData.parts.map(p => ({
      tmdb: true,
      id: p.id,
      Title: p.title || p.original_title,
      Year: p.release_date ? p.release_date.slice(0,4) : '',
      imdbID: p.imdb_id || null
    })).filter(p => p.Title);
    // Sort by release date
    mapped.sort((a,b) => {
      const yA = parseInt(a.Year,10) || 9999;
      const yB = parseInt(b.Year,10) || 9999;
      if (yA !== yB) return yA - yB;
      const tA = a.Title.toLowerCase();
      const tB = b.Title.toLowerCase();
      if (tA < tB) return -1;
      if (tA > tB) return 1;
      return 0;
    });
    // Filter out current item if IMDB ID matches
    const currentImdb = item.imdbId || item.imdbID || '';
    return mapped.filter(m => !currentImdb || m.imdbID !== currentImdb);
  } catch (err) {
    console.warn('TMDb lookup failed', err);
    return null;
  }
}

async function lookupRelatedTitles(item) {
  if (!item || !item.title) return;
  // 1) Prefer TMDb collections when possible
  const tmdbList = await lookupRelatedViaTMDb(item);
  if (tmdbList && tmdbList.length) {
    buildRelatedModal(item, tmdbList);
    return;
  }
  alert('No related titles found on TMDb.');
}

function resolveSeriesRedirect(listType, item, rawData) {
  if (!item || !rawData) return item;
  if (!['movies', 'tvShows', 'anime'].includes(listType)) return item;
  const rawSeries = typeof item.seriesName === 'string' ? item.seriesName.trim() : '';
  if (!rawSeries) return item;
  const targetKey = rawSeries.toLowerCase();
  const siblings = Object.values(rawData || {}).filter(entry => {
    if (!entry) return false;
    const entrySeries = typeof entry.seriesName === 'string' ? entry.seriesName.trim() : '';
    return entrySeries && entrySeries.toLowerCase() === targetKey;
  });
  if (!siblings.length) return item;
  siblings.sort((a, b) => {
    const orderA = parseSeriesOrder(a.seriesOrder);
    const orderB = parseSeriesOrder(b.seriesOrder);
    if (orderA !== orderB) return orderA - orderB;
    const titleA = (a && a.title ? a.title : '').toLowerCase();
    const titleB = (b && b.title ? b.title : '').toLowerCase();
    if (titleA < titleB) return -1;
    if (titleA > titleB) return 1;
    return 0;
  });
  const earliestUnwatched = siblings.find(entry => entry && isSpinnerStatusEligible(entry) && !isItemWatched(entry));
  if (!earliestUnwatched) return item;
  // If the chosen item is further in the series than the earliest unwatched, redirect.
  const chosenOrder = parseSeriesOrder(item.seriesOrder);
  const earliestOrder = parseSeriesOrder(earliestUnwatched.seriesOrder);
  const needsRedirect = chosenOrder > earliestOrder || isItemWatched(item);
  try {
    console.log('[Wheel] resolveSeriesRedirect', {
      listType,
      series: rawSeries,
      chosen: { title: item.title, order: chosenOrder, status: item.status },
      earliest: { title: earliestUnwatched.title, order: earliestOrder, status: earliestUnwatched.status },
      needsRedirect
    });
  } catch (_) {}
  return needsRedirect ? earliestUnwatched : item;
}

function animateWheelSequence(candidates, chosenIndex, listType, finalItemOverride) {
  const len = candidates.length;
  if (len === 0) return;

  const chosenItem = candidates[chosenIndex];
  const finalDisplayItem = finalItemOverride || chosenItem;
  const iterations = Math.max(28, len * 5);
  let pointer = Math.floor(Math.random() * len);
  const sequence = [];
  for (let i = 0; i < iterations; i++) {
    sequence.push(candidates[pointer % len]);
    pointer++;
  }
  sequence.push(finalDisplayItem);

  const totalDuration = 7000; // keep spin length consistent regardless of candidate count
  const stepCount = sequence.length;
  const lastIndex = stepCount - 1;
  const schedule = [];
  for (let i = 0; i < stepCount; i++) {
    if (lastIndex === 0) {
      schedule.push(0);
    } else {
      const progress = i / lastIndex;
      const eased = 1 - Math.pow(1 - progress, 3); // ease-out curve keeps early steps snappy
      schedule.push(Math.round(eased * totalDuration));
    }
  }

  try {
    console.log('[Wheel] animate start', {
      listType,
      chosenIndex,
      chosenTitle: chosenItem?.title,
      finalTitle: finalDisplayItem?.title,
      candidates: candidates.map(c => c && c.title).filter(Boolean),
      steps: stepCount
    });
  } catch (_) {}

  sequence.forEach((item, idx) => {
    const timeout = setTimeout(() => {
      const isFinal = idx === sequence.length - 1;
      wheelSpinnerEl.innerHTML = '';
      const span = document.createElement('span');
      span.className = `spin-text${isFinal ? ' final' : ''}`;
      span.textContent = item.title || '(no title)';
      wheelSpinnerEl.appendChild(span);
      try { console.log(`[Wheel] step ${idx + 1}/${sequence.length}: ${item.title || '(no title)'}${isFinal ? ' [FINAL]' : ''}`); } catch (_) {}
      if (isFinal) {
        wheelSpinnerEl.classList.remove('spinning');
        renderWheelResult(item, listType);
        spinTimeouts = [];
      }
    }, schedule[idx]);
    spinTimeouts.push(timeout);
  });
}

// Wheel spinner logic
function spinWheel(listType) {
  if (!currentUser) {
    alert('Not signed in');
    return;
  }
  clearWheelAnimation();
  wheelResultEl.innerHTML = '';
  wheelSpinnerEl.classList.remove('hidden');
  wheelSpinnerEl.classList.add('spinning');
  const placeholder = document.createElement('span');
  placeholder.className = 'spin-text';
  placeholder.textContent = 'Spinning…';
  wheelSpinnerEl.appendChild(placeholder);

  const listRef = ref(db, `users/${currentUser.uid}/${listType}`);
  get(listRef).then(snap => {
    const data = snap.val() || {};
    const candidates = buildSpinnerCandidates(listType, data);
    try {
      console.log('[Wheel] spin start', {
        listType,
        candidateCount: candidates.length,
        titles: candidates.map(c => c && c.title).filter(Boolean)
      });
    } catch (_) {}
    if (candidates.length === 0) {
      clearWheelAnimation();
      const emptyState = document.createElement('span');
      emptyState.className = 'spin-text';
      emptyState.textContent = 'No eligible items to spin.';
      wheelSpinnerEl.appendChild(emptyState);
      wheelResultEl.textContent = 'No eligible items right now. Add something new or reset some items back to Planned/Watching.';
      return;
    }
    const chosenIndex = Math.floor(Math.random() * candidates.length);
    const chosenCandidate = candidates[chosenIndex];
    const resolvedCandidate = resolveSeriesRedirect(listType, chosenCandidate, data) || chosenCandidate;
    try { console.log('[Wheel] pick', { chosenIndex, chosen: chosenCandidate?.title, resolved: resolvedCandidate?.title }); } catch (_) {}
    animateWheelSequence(candidates, chosenIndex, listType, resolvedCandidate);
  }).catch(err => {
    console.error('Wheel load failed', err);
    clearWheelAnimation();
    const errorState = document.createElement('span');
    errorState.className = 'spin-text';
    errorState.textContent = 'Unable to load items.';
    wheelSpinnerEl.appendChild(errorState);
    wheelResultEl.textContent = 'Unable to load items.';
  });
}

// Boot
initFirebase();
if (auth) {
  handleAuthState();
  handleSignInRedirectResult();
} else {
  // If config was not added, attempt to still listen after a small delay
  try {
    handleAuthState();
    handleSignInRedirectResult();
  } catch(e) { /* silent */ }
}