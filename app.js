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

// -----------------------
// App state
let appInitialized = false;
let currentUser = null;
const listeners = {};
let omdbWarningShown = false;
let spinTimeouts = [];
const actorFilters = { movies: '', tvShows: '', anime: '' };
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
const tabs = document.querySelectorAll('.tab');
const sections = document.querySelectorAll('.section');
const modalRoot = document.getElementById('modal-root');
const wheelSpinnerEl = document.getElementById('wheel-spinner');
const wheelResultEl = document.getElementById('wheel-result');

// firebase instances
let db = null;
let auth = null;

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

  // Wheel
  document.getElementById('spin-wheel').addEventListener('click', () => {
    const src = document.getElementById('wheel-source').value;
    spinWheel(src);
  });
}

// Authentication
function signInWithGoogle() {
  const provider = new GoogleAuthProvider();
  signInWithPopup(auth, provider).catch(err => alert('Sign in failed: ' + err.message));
}

function signOut() {
  fbSignOut(auth).catch(err => console.error('Sign-out error', err));
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
}

function showAppForUser(user) {
  loginScreen.classList.add('hidden');
  appRoot.classList.remove('hidden');
  userNameEl.textContent = user.displayName || user.email || 'You';

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

  filtered.sort(([, a], [, b]) => {
    const ta = (a && a.title ? a.title : '').toLowerCase();
    const tb = (b && b.title ? b.title : '').toLowerCase();
    if (ta < tb) return -1;
    if (ta > tb) return 1;
    return 0;
  });

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

    if (listType === 'movies' && item.seriesName) {
      const seriesLine = document.createElement('div');
      seriesLine.className = 'series-line';
      const parts = [`Series: ${item.seriesName}`];
      if (item.seriesOrder !== undefined && item.seriesOrder !== null && item.seriesOrder !== '') {
        parts.push(`Entry ${item.seriesOrder}`);
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

    await addItem(listType, item);
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

  const shouldApplySeriesLogic = listType === 'movies';
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

function needsMetadataRefresh(listType, item) {
  if (!item || !item.title) return false;
  if (!['movies', 'tvShows', 'anime'].includes(listType)) return false;
  const criticalFields = ['imdbId', 'imdbUrl', 'poster', 'plot', 'actors'];
  return criticalFields.some(field => !hasMeaningfulValue(item[field]));
}

function refreshMetadataForItem(listType, itemId, item) {
  if (!OMDB_API_KEY) return;
  const key = `${listType}:${itemId}`;
  if (metadataRefreshInflight.has(key)) return;
  metadataRefreshInflight.add(key);

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
    refreshMetadataForItem(listType, id, item);
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
    if (value === undefined || value === null) return;
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
  Object.keys(listCaches).forEach(key => delete listCaches[key]);
  document.querySelectorAll('[data-role="actor-filter"]').forEach(input => {
    input.value = '';
  });
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

  if (listType === 'movies' && item.seriesName) {
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

  card.appendChild(details);
  wheelResultEl.appendChild(card);
}

function animateWheelSequence(candidates, chosenIndex, listType) {
  const len = candidates.length;
  if (len === 0) return;
  const chosenItem = candidates[chosenIndex];
  const iterations = Math.max(28, len * 5);
  let pointer = Math.floor(Math.random() * len);
  const sequence = [];
  for (let i = 0; i < iterations; i++) {
    sequence.push(candidates[pointer % len]);
    pointer++;
  }
  sequence.push(chosenItem);

  let delay = 90;
  let totalDelay = 0;

  sequence.forEach((item, idx) => {
    const timeout = setTimeout(() => {
      const isFinal = idx === sequence.length - 1;
      wheelSpinnerEl.innerHTML = '';
      const span = document.createElement('span');
      span.className = `spin-text${isFinal ? ' final' : ''}`;
      span.textContent = item.title || '(no title)';
      wheelSpinnerEl.appendChild(span);
      if (isFinal) {
        wheelSpinnerEl.classList.remove('spinning');
        renderWheelResult(item, listType);
        spinTimeouts = [];
      }
    }, totalDelay);
    spinTimeouts.push(timeout);
    totalDelay += delay;
    delay = Math.min(delay + 25, 280);
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
    animateWheelSequence(candidates, chosenIndex, listType);
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

/*
  README-style notes:

  How to set up Firebase
  1. Create a Firebase project at https://console.firebase.google.com
  2. Enable Authentication -> Sign-in method -> Google
  3. Create a Realtime Database and set its rules to the block at the top of this file.
  4. In Project Settings -> Your apps, register a new Web App and copy the config.
  5. Paste the config object into the `firebaseConfig` constant near the top of this file.

  Where to paste Database Rules
  - Copy the rules at the top of this file (inside the comment) into the Realtime Database Rules editor.

  How to run locally
  - This is a static site. You can open `index.html` directly, but some browsers block module imports when opened via file://.
  - Recommended: run a simple static server. Example using Python 3:

      python3 -m http.server 8000

    Then open http://localhost:8000 in your browser.

  Notes
  - The `firebaseConfig` object must include `databaseURL` (Realtime DB URL).
  - Security rules must be applied in the Firebase Console to enforce per-user access.
  - This app uses Firebase v9 modular SDK via CDN imports.
  - Set `OMDB_API_KEY` near the top of this file with your OMDb API key to enable automatic metadata lookups for movies, TV, and anime.

*/
