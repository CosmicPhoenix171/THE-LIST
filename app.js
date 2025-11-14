/**
 * THE LIST ™ - app.js
 *
 * Firebase Realtime Database rules (paste into Firebase Console -> Realtime Database -> Rules):
 *
 * {
 *   "rules": {
 *     "users": {
 *       "$uid": {
 *         ".read": "auth != null && auth.uid === $uid",
 *         ".write": "auth != null && auth.uid === $uid"
 *       }
 *     }
 *   }
 * }
 *
 * This ensures users can only read/write their own data.
 */

// Imports (modular Firebase v9)
import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
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

// ===== TODO: Paste your Firebase config here =====
// Replace the placeholder below with your Firebase project's config object.
// Example:
// const firebaseConfig = {
//   apiKey: "...",
//   authDomain: "...",
//   databaseURL: "https://<your-db>.firebaseio.com",
//   projectId: "...",
//   storageBucket: "...",
//   messagingSenderId: "...",
//   appId: "..."
// };
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

// Optional: OMDb API key for metadata lookups. Get one at https://www.omdbapi.com/apikey.aspx
const OMDB_API_KEY = '37fad759';
const OMDB_API_URL = 'https://www.omdbapi.com/';

// Optional: TMDb API for franchise/collection info (recommended for sequels/prequels)
// Create a key at https://www.themoviedb.org/settings/api
// Leave blank to disable TMDb features.
const TMDB_API_KEY = '46dcf1eaa2ce4284037a00fdefca9bb8';

// -----------------------
// App state
let appInitialized = false;
let currentUser = null;
const listeners = {};
let omdbWarningShown = false;
let spinTimeouts = [];
const actorFilters = { movies: '', tvShows: '', anime: '' };
const expandedCards = { movies: new Set() };
const sortModes = { movies: 'title', tvShows: 'title', anime: 'title', books: 'title' };
const listCaches = {};
const metadataRefreshInflight = new Set();
const AUTOCOMPLETE_LISTS = new Set(['movies', 'tvShows', 'anime']);
const OMDB_TYPE_MAP = {
  movies: 'movie',
  tvShows: 'series',
  anime: 'series',
};
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
      status: 'Planned'
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
    const grid = document.createElement('div');
    grid.className = 'movies-grid';
    const visibleIds = new Set();
    filtered.forEach(([id, item]) => {
      if (!item) return;
      visibleIds.add(id);
      grid.appendChild(buildCollapsibleMovieCard(id, item));
    });
    container.appendChild(grid);

    const expandedSet = ensureExpandedSet('movies');
    expandedSet.forEach(cardId => {
      if (!visibleIds.has(cardId)) {
        expandedSet.delete(cardId);
      }
    });

    updateCollapsibleCardStates('movies');
    return;
  }

  filtered.forEach(([id, item]) => {
    if (!item) return;

    const card = document.createElement('div');
    card.className = 'card';

    if (item.poster) {
      const artwork = document.createElement('div');
      artwork.className = 'artwork';
      const img = document.createElement('img');
      img.src = item.poster;
      img.alt = `${item.title || 'Poster'} artwork`;
      img.loading = 'lazy';
      artwork.appendChild(img);
      card.appendChild(artwork);
    }

    const left = document.createElement('div');
    left.className = 'card-body';

    const header = document.createElement('div');
    header.className = 'card-header';
    const title = document.createElement('div');
    title.className = 'title';
    title.textContent = item.title || '(no title)';
    header.appendChild(title);
    if (item.status) {
      header.appendChild(buildStatusChip(item.status));
    }

    left.appendChild(header);

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
      meta.className = 'meta';
      meta.textContent = metaText;
      left.appendChild(meta);
    }

    if (listType !== 'books' && item.seriesName) {
      const seriesLine = document.createElement('div');
      seriesLine.className = 'series-line';
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
      seriesLine.textContent = parts.join(' • ');
      left.appendChild(seriesLine);
    }

    if (listType !== 'books') {
      const actorPreview = buildActorPreview(item.actors, 5);
      if (actorPreview) {
        const actorLine = document.createElement('div');
        actorLine.className = 'actor-line';
        actorLine.textContent = `Cast: ${actorPreview}`;
        left.appendChild(actorLine);
      }
    }

    if (item.imdbUrl) {
      const imdbLink = document.createElement('a');
      imdbLink.href = item.imdbUrl;
      imdbLink.target = '_blank';
      imdbLink.rel = 'noopener noreferrer';
      imdbLink.className = 'meta-link';
      imdbLink.textContent = 'View on IMDb';
      left.appendChild(imdbLink);
    }
    if (item.trailerUrl) {
      const trailerLink = document.createElement('a');
      trailerLink.href = item.trailerUrl;
      trailerLink.target = '_blank';
      trailerLink.rel = 'noopener noreferrer';
      trailerLink.className = 'meta-link';
      trailerLink.textContent = 'Watch Trailer';
      left.appendChild(trailerLink);
    }

    if (item.plot) {
      const plot = document.createElement('div');
      plot.className = 'plot-summary';
      const cleanPlot = item.plot.trim();
      plot.textContent = cleanPlot.length > 220 ? `${cleanPlot.slice(0, 217)}…` : cleanPlot;
      left.appendChild(plot);
    }
    if (item.notes) {
      const notes = document.createElement('div');
      notes.className = 'notes';
      notes.textContent = item.notes;
      left.appendChild(notes);
    }

    const actions = document.createElement('div');
    actions.className = 'actions';
    const editBtn = document.createElement('button');
    editBtn.className = 'btn secondary';
    editBtn.textContent = 'Edit';
    editBtn.addEventListener('click', () => openEditModal(listType, id, item));

    const delBtn = document.createElement('button');
    delBtn.className = 'btn ghost';
    delBtn.textContent = 'Delete';
    delBtn.addEventListener('click', () => deleteItem(listType, id));

    actions.appendChild(editBtn);
    actions.appendChild(delBtn);

    if (['movies','tvShows','anime'].includes(listType)) {
      const markBtn = document.createElement('button');
      markBtn.className = 'btn primary';
      markBtn.textContent = 'Mark Completed';
      markBtn.addEventListener('click', () => updateItem(listType, id, { status: 'Completed' }));
      actions.appendChild(markBtn);
    }

    card.appendChild(left);
    card.appendChild(actions);
    container.appendChild(card);
  });

  if (listType in expandedCards) {
    updateCollapsibleCardStates(listType);
  }
}

function buildCollapsibleMovieCard(id, item) {
  const isExpanded = ensureExpandedSet('movies').has(id);
  const card = document.createElement('div');
  card.className = `card collapsible movie-card${isExpanded ? ' expanded' : ''}`;
  card.dataset.id = id;
  card.addEventListener('click', () => toggleCardExpansion('movies', id));

  const summary = document.createElement('div');
  summary.className = 'movie-card-summary';

  const artwork = document.createElement('div');
  artwork.className = 'artwork-wrapper';
  if (item.poster) {
    const poster = document.createElement('div');
    poster.className = 'artwork';
    const img = document.createElement('img');
    img.src = item.poster;
    img.alt = `${item.title || 'Poster'} artwork`;
    img.loading = 'lazy';
    poster.appendChild(img);
    artwork.appendChild(poster);
  } else {
    const placeholder = document.createElement('div');
    placeholder.className = 'artwork placeholder';
    placeholder.textContent = 'No Poster';
    artwork.appendChild(placeholder);
  }
  summary.appendChild(artwork);

  const info = document.createElement('div');
  info.className = 'movie-card-info';

  const header = document.createElement('div');
  header.className = 'movie-card-header';
  const title = document.createElement('div');
  title.className = 'title';
  title.textContent = item.title || '(no title)';
  header.appendChild(title);
  if (item.status) {
    header.appendChild(buildStatusChip(item.status));
  }
  info.appendChild(header);

  summary.appendChild(info);
  card.appendChild(summary);

  const details = document.createElement('div');
  details.className = 'collapsible-details movie-card-details';

  const metaParts = [];
  if (item.year) metaParts.push(item.year);
  if (item.director) metaParts.push(item.director);
  if (item.runtime) metaParts.push(item.runtime);
  if (item.imdbRating) metaParts.push(`IMDb ${item.imdbRating}`);
  if (metaParts.length) {
    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.textContent = metaParts.join(' • ');
    details.appendChild(meta);
  }

  if (item.seriesName) {
    const seriesLine = document.createElement('div');
    seriesLine.className = 'series-line';
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
    seriesLine.textContent = parts.join(' • ');
    details.appendChild(seriesLine);
  }

  const actorPreview = buildActorPreview(item.actors, 12);
  if (actorPreview) {
    const actorLine = document.createElement('div');
    actorLine.className = 'actor-line';
    actorLine.textContent = `Cast: ${actorPreview}`;
    details.appendChild(actorLine);
  }

  const links = document.createElement('div');
  links.className = 'collapsible-links';
  if (item.imdbUrl) {
    const imdb = document.createElement('a');
    imdb.className = 'meta-link';
    imdb.href = item.imdbUrl;
    imdb.target = '_blank';
    imdb.rel = 'noopener noreferrer';
    imdb.textContent = 'View on IMDb';
    links.appendChild(imdb);
  }
  if (item.trailerUrl) {
    const trailer = document.createElement('a');
    trailer.className = 'meta-link';
    trailer.href = item.trailerUrl;
    trailer.target = '_blank';
    trailer.rel = 'noopener noreferrer';
    trailer.textContent = 'Watch Trailer';
    links.appendChild(trailer);
  }
  if (links.children.length) {
    details.appendChild(links);
  }

  if (item.plot) {
    const plot = document.createElement('div');
    plot.className = 'plot-summary';
    plot.textContent = item.plot.trim();
    details.appendChild(plot);
  }

  if (item.notes) {
    const notes = document.createElement('div');
    notes.className = 'notes';
    notes.textContent = item.notes;
    details.appendChild(notes);
  }

  const actions = document.createElement('div');
  actions.className = 'actions collapsible-actions';
  const editBtn = document.createElement('button');
  editBtn.className = 'btn secondary';
  editBtn.textContent = 'Edit';
  editBtn.addEventListener('click', (ev) => { ev.stopPropagation(); openEditModal('movies', id, item); });
  const delBtn = document.createElement('button');
  delBtn.className = 'btn ghost';
  delBtn.textContent = 'Delete';
  delBtn.addEventListener('click', (ev) => { ev.stopPropagation(); deleteItem('movies', id); });
  const markBtn = document.createElement('button');
  markBtn.className = 'btn primary';
  markBtn.textContent = 'Mark Completed';
  markBtn.addEventListener('click', (ev) => { ev.stopPropagation(); updateItem('movies', id, { status: 'Completed' }); });
  actions.appendChild(editBtn);
  actions.appendChild(delBtn);
  actions.appendChild(markBtn);
  details.appendChild(actions);

  card.appendChild(details);
  return card;
}

function toggleCardExpansion(listType, cardId) {
  if (!(listType in expandedCards)) return;
  const expandedSet = ensureExpandedSet(listType);
  if (expandedSet.has(cardId)) {
    expandedSet.delete(cardId);
  } else {
    expandedSet.add(cardId);
  }
  updateCollapsibleCardStates(listType);
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
  const status = form.status.value;
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
    if (!metadata && OMDB_API_KEY && ['movies', 'tvShows', 'anime'].includes(listType)) {
      metadata = await fetchOmdbMetadata(listType, { title, year, imdbId: selectedImdbId });
    } else if (!metadata && !OMDB_API_KEY && ['movies', 'tvShows', 'anime'].includes(listType)) {
      maybeWarnAboutOmdbKey();
    }

    const item = {
      title,
      status,
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
  const forceKeys = new Set(Array.isArray(alwaysAssign) ? alwaysAssign : []);

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

  const effectiveTitle = (metadata.Title && metadata.Title !== 'N/A') ? metadata.Title : fallbackTitle;
  const effectiveYear = apiYear || fallbackYear;
  if (effectiveTitle) {
    const trailerUrl = buildTrailerUrl(effectiveTitle, effectiveYear);
    setField('trailerUrl', trailerUrl);
  }

  return updates;
}

function normalizeStatusValue(status) {
  return String(status || '').trim().toLowerCase();
}

function isSpinnerStatusEligible(status) {
  const normalized = normalizeStatusValue(status);
  if (!normalized) return true;
  if (normalized.startsWith('plan')) return true;
  if (normalized.startsWith('watch') && !normalized.startsWith('watched')) return true;
  if (normalized.startsWith('read')) return true;
  return false;
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

  const eligibleItems = items.filter((item) => item && isSpinnerStatusEligible(item.status));
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
  return getMissingMetadataFields(item).length > 0;
}

function refreshMetadataForItem(listType, itemId, item, missingFields = []) {
  if (!OMDB_API_KEY) return;
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
  };

  fetchOmdbMetadata(listType, lookup).then(metadata => {
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
  if (!OMDB_API_KEY) return;
  if (!currentUser) return;
  if (!['movies', 'tvShows', 'anime'].includes(listType)) return;

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

function buildStatusChip(status) {
  const chip = document.createElement('span');
  chip.className = 'status-chip';
  const trimmed = String(status || '').trim();
  const normalized = trimmed.toLowerCase();
  let label = trimmed || 'Planned';
  let modifier = 'status-planned';
  if (normalized.startsWith('watch') || normalized.startsWith('read')) {
    label = 'Watching/Reading';
    modifier = 'status-watching';
  } else if (normalized.startsWith('complete')) {
    modifier = 'status-completed';
  } else if (normalized.startsWith('drop')) {
    label = 'Dropped';
    modifier = 'status-dropped';
  }
  chip.classList.add(modifier);
  chip.textContent = label;
  return chip;
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

function maybeWarnAboutOmdbKey() {
  if (omdbWarningShown) return;
  omdbWarningShown = true;
  const message = 'OMDb API key missing. Metadata lookups are disabled. Set OMDB_API_KEY in app.js to enable them.';
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

async function fetchOmdbSuggestions(listType, query) {
  if (!OMDB_API_KEY) return [];
  const type = OMDB_TYPE_MAP[listType];
  const params = new URLSearchParams({ apikey: OMDB_API_KEY, s: query });
  if (type) params.set('type', type);
  try {
    const resp = await fetch(`${OMDB_API_URL}?${params.toString()}`);
    if (!resp.ok) return [];
    const json = await resp.json();
    if (!json || json.Response !== 'True' || !Array.isArray(json.Search)) return [];
    return json.Search.slice(0, 8).map(entry => ({
      title: entry.Title,
      year: entry.Year,
      imdbID: entry.imdbID,
      type: entry.Type,
    }));
  } catch (err) {
    console.warn('OMDb suggestion lookup failed', err);
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

  if (!OMDB_API_KEY) {
    maybeWarnAboutOmdbKey();
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
    const results = await fetchOmdbSuggestions(listType, query);
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
        try {
          const detail = await fetchOmdbMetadata(listType, { title: suggestion.title, year: suggestionYear, imdbId: suggestion.imdbID });
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
      } else {
        delete form.dataset.selectedImdbId;
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

async function fetchOmdbMetadata(listType, { title, year, imdbId }) {
  if (!OMDB_API_KEY) return null;
  const type = OMDB_TYPE_MAP[listType];

  if (imdbId) {
    try {
      const detailParams = new URLSearchParams({ apikey: OMDB_API_KEY, i: imdbId, plot: 'short' });
      const detailResp = await fetch(`${OMDB_API_URL}?${detailParams.toString()}`);
      if (detailResp.ok) {
        const detailJson = await detailResp.json();
        if (detailJson && detailJson.Response === 'True') {
          return detailJson;
        }
      }
    } catch (err) {
      console.warn('OMDb lookup by ID failed', err);
    }
  }

  if (!title) return null;
  const params = new URLSearchParams({ apikey: OMDB_API_KEY, t: title });
  if (type) params.set('type', type);
  if (year) params.set('y', year);

  try {
    const directResp = await fetch(`${OMDB_API_URL}?${params.toString()}`);
    if (directResp.ok) {
      const directJson = await directResp.json();
      if (directJson && directJson.Response === 'True') {
        return directJson;
      }
    }
  } catch (err) {
    console.warn('OMDb direct lookup failed', err);
  }

  // Fallback to search endpoint
  try {
    const searchParams = new URLSearchParams({ apikey: OMDB_API_KEY, s: title });
    if (type) searchParams.set('type', type);
    const searchResp = await fetch(`${OMDB_API_URL}?${searchParams.toString()}`);
    if (!searchResp.ok) return null;
    const searchJson = await searchResp.json();
    if (!searchJson || searchJson.Response !== 'True' || !Array.isArray(searchJson.Search)) return null;

    const normalizedYear = year;
    const match = searchJson.Search.find(entry => {
      if (!normalizedYear) return true;
      return entry.Year && entry.Year.includes(normalizedYear);
    }) || searchJson.Search[0];
    if (!match || !match.imdbID) return null;

    const detailParams = new URLSearchParams({ apikey: OMDB_API_KEY, i: match.imdbID, plot: 'short' });
    const detailResp = await fetch(`${OMDB_API_URL}?${detailParams.toString()}`);
    if (!detailResp.ok) return null;
    const detailJson = await detailResp.json();
    if (detailJson && detailJson.Response === 'True') {
      return detailJson;
    }
  } catch (err) {
    console.warn('OMDb search lookup failed', err);
  }

  return null;
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
  const statusSelect = document.createElement('select');
  ['Planned','Watching/Reading','Completed','Dropped'].forEach(s => {
    const o = document.createElement('option'); o.value = s; o.text = s; if (s === item.status) o.selected = true; statusSelect.appendChild(o);
  });
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
  form.appendChild(statusSelect);
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
      status: statusSelect.value,
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
  if (item.status) {
    header.appendChild(buildStatusChip(item.status));
  }
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

// --- Sequel / Prequel Lookup Logic ---
function deriveFranchiseBase(title) {
  if (!title) return '';
  let base = String(title).trim();
  // Remove common sequel indicators at end
  base = base.replace(/\b(part\s+[ivx0-9]+)$/i, '').trim();
  base = base.replace(/\bchapter\s+[0-9]+$/i, '').trim();
  base = base.replace(/\bvolume\s+[0-9]+$/i, '').trim();
  // Remove trailing Roman numerals or digits standing alone
  base = base.replace(/\b([ivx]+|\d+)$/i, '').trim();
  // Remove trailing colon subtitle for initial broad search attempt
  base = base.replace(/:\s*[^:]+$/,'').trim();
  return base;
}

function extractOrderToken(title) {
  if (!title) return null;
  const partMatch = title.match(/part\s+([ivx0-9]+)/i);
  if (partMatch) return partMatch[1];
  const romanMatch = title.match(/\b(ii|iii|iv|vi|vii|viii|ix|x)\b/i);
  if (romanMatch) return romanMatch[1];
  const digitMatch = title.match(/\b(\d{1,2})\b/);
  if (digitMatch) return digitMatch[1];
  return null;
}

async function omdbSearchFranchise(base) {
  if (!OMDB_API_KEY) {
    alert('OMDb API key missing; cannot lookup related titles.');
    return [];
  }
  const results = [];
  const encoded = encodeURIComponent(base);
  for (let page = 1; page <= 3; page++) {
    const url = `https://www.omdbapi.com/?apikey=${OMDB_API_KEY}&type=movie&s=${encoded}&page=${page}`;
    try {
      const resp = await fetch(url);
      const data = await resp.json();
      if (data && Array.isArray(data.Search)) {
        results.push(...data.Search);
        if (data.Search.length < 10) break; // last page
      } else {
        break;
      }
    } catch (e) {
      console.warn('OMDb search failed', e);
      break;
    }
  }
  return results;
}

function scoreFranchiseMatch(base, candidateTitle) {
  const ct = candidateTitle.toLowerCase();
  const b = base.toLowerCase();
  if (ct === b) return 100;
  if (ct.startsWith(b)) return 90;
  if (ct.includes(b)) return 70;
  return 0;
}

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
  // 2) Fallback: OMDb heuristic search
  const base = deriveFranchiseBase(item.title);
  try { console.log('[Franchise] base derived', { original: item.title, base }); } catch(_) {}
  if (!base || base.length < 3) {
    alert('Not enough info to search for related titles.');
    return;
  }
  const raw = await omdbSearchFranchise(base);
  const filtered = raw.filter(r => scoreFranchiseMatch(base, r.Title) >= 70);
  // Remove exact duplicate of current item (match by imdbID or sanitized title+year)
  const currentKey = (item.imdbId || item.imdbID || '') + '|' + (item.year || '') + '|' + (item.title || '').toLowerCase();
  const unique = [];
  const seen = new Set();
  filtered.forEach(r => {
    const key = (r.imdbID || '') + '|' + (r.Year || '') + '|' + (r.Title || '').toLowerCase();
    if (key === currentKey) return;
    if (seen.has(key)) return;
    seen.add(key);
    unique.push(r);
  });
  // Basic ordering: detect order tokens, then by year
  unique.sort((a, b) => {
    const tokA = extractOrderToken(a.Title);
    const tokB = extractOrderToken(b.Title);
    if (tokA && tokB && tokA !== tokB) {
      // attempt numeric comparison if possible
      const numA = parseInt(tokA, 10);
      const numB = parseInt(tokB, 10);
      if (!isNaN(numA) && !isNaN(numB) && numA !== numB) return numA - numB;
    }
    const yearA = parseInt(a.Year, 10) || 9999;
    const yearB = parseInt(b.Year, 10) || 9999;
    if (yearA !== yearB) return yearA - yearB;
    const tA = a.Title.toLowerCase();
    const tB = b.Title.toLowerCase();
    if (tA < tB) return -1;
    if (tA > tB) return 1;
    return 0;
  });
  buildRelatedModal(item, unique);
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
  const earliestUnwatched = siblings.find(entry => entry && isSpinnerStatusEligible(entry.status) && !isItemWatched(entry));
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
} else {
  // If config was not added, attempt to still listen after a small delay
  try { handleAuthState(); } catch(e) { /* silent */ }
}