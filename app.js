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
  onValue,
  remove,
  update,
  off,
  query,
  orderByChild
} from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-database.js';
import { initWheelModal, closeWheelModal } from './wheel-modal.js';
import { showAlert } from './alerts.js';

const APP_VERSION = '1.0.0';
const TMDB_API_KEY = '46dcf1eaa2ce4284037a00fdefca9bb8';
const GOOGLE_BOOKS_API_KEY = ''; // TODO: Add your Google Books API Key
const JIKAN_API_BASE_URL = 'https://api.jikan.moe/v4';
const TMDB_API_BASE_URL = 'https://api.themoviedb.org/3';
const TMDB_IMAGE_BASE_URL = 'https://image.tmdb.org/t/p/w500';
const GOOGLE_BOOKS_API_URL = 'https://www.googleapis.com/books/v1';
const MYANIMELIST_ANIME_URL = 'https://myanimelist.net/anime';

const firebaseConfig = {
  apiKey: "AIzaSyCWJpMYjSdV9awGRwJ3zyZ_9sDjUrnTu2I",
  authDomain: "the-list-a700d.firebaseapp.com",
  databaseURL: "https://the-list-a700d-default-rtdb.firebaseio.com",
  projectId: "the-list-a700d",
  storageBucket: "the-list-a700d.firebasestorage.app",
  messagingSenderId: "24313817411",
  appId: "1:24313817411:web:0aba69eaadade9843a27f6",
  measurementId: "G-YXJ2E2XG42"
};

const PRIMARY_LIST_TYPES = ['movies', 'tvShows', 'anime', 'books'];
const MEDIA_TYPE_LABELS = {
  movies: 'Movies',
  tvShows: 'TV Shows',
  anime: 'Anime',
  books: 'Books',
};
const WATCH_PROVIDER_LISTS = new Set(['movies', 'tvShows']);
const COLLAPSIBLE_LISTS = new Set(['movies', 'tvShows', 'anime']);
const AUTOCOMPLETE_LISTS = new Set(['movies', 'tvShows', 'anime', 'books']);
const SERIES_BULK_DELETE_LISTS = new Set(['movies', 'tvShows', 'anime']);
const TMDB_KEYWORD_DISCOVER_PAGE_LIMIT = 5;
const JIKAN_MAX_RETRIES = 3;
const JIKAN_RATE_LIMIT_BACKOFF_MS = 1500;
const JIKAN_MAX_REQUESTS_PER_SECOND = 1;
const JIKAN_MAX_REQUESTS_PER_MINUTE = 25;
const JIKAN_SECOND_WINDOW_MS = 1000;
const JIKAN_MINUTE_WINDOW_MS = 1000 * 60;
const JIKAN_RATE_LIMIT_MIN_INTERVAL_MS = Math.ceil(JIKAN_SECOND_WINDOW_MS / JIKAN_MAX_REQUESTS_PER_SECOND);
const JIKAN_DEFAULT_RETRY_AFTER_MS = 8000;
const ANIME_STATUS_PRIORITY = {
  RELEASING: 4,
  AIRING: 4,
  CURRENTLY_AIRING: 4,
  FINISHED: 3,
  COMPLETED: 3,
  NOT_YET_RELEASED: 2,
  PLANNED: 2,
  CANCELLED: 1,
  HIATUS: 1,
};
const METADATA_SCHEMA_VERSION = 1;
const METADATA_REFRESH_COOLDOWN_MS = 1000 * 60 * 5; // avoid hitting metadata APIs repeatedly
const ANIME_FRANCHISE_IGNORE_KEY = 'animeFranchiseIgnoredIds';
const LAST_ADD_LIST_TYPE_KEY = 'lastAddListType';
const ANIME_FRANCHISE_LAST_SCAN_KEY = 'animeFranchiseLastScan';
const INTRO_SESSION_KEY = 'introPlayed';
const ANIME_FRANCHISE_RELATION_TYPES = new Set([
  'SEQUEL',
  'PREQUEL',
  'ALTERNATE',
  'ALTERNATE_VERSION',
  'SIDE_STORY',
  'SUMMARY',
  'OTHER',
  'ADAPTATION',
  'PARENT',
  'CHILD',
  'SPIN_OFF',
]);
const ANIME_FRANCHISE_ALLOWED_FORMATS = new Set([
  'TV',
  'TV_SHORT',
  'ONA',
  'OVA',
  'MOVIE',
  'SPECIAL',
  'MUSIC',
]);
const ANIME_FRANCHISE_MAX_ENTRIES = 64;
const ANIME_FRANCHISE_MAX_DEPTH = 3;
const ANIME_FRANCHISE_RESCAN_INTERVAL_MS = 1000 * 60 * 60 * 24;
const ANIME_FRANCHISE_SCAN_SERIES_LIMIT = 4;

const listCaches = {};
const actorFilters = {};
const sortModes = {};
const listeners = {};
const animeFranchiseIgnoredIds = new Set();
const suggestionForms = new Set();
const seriesGroups = {};
const expandedCards = {};
const metadataRefreshInflight = new Set();
const seriesCarouselState = {};
const jikanNotFoundAnimeIds = new Set();
const animeFranchiseMissingHashes = new Map();
const metadataRefreshHistory = new Map();
const jikanSecondWindow = [];
const jikanMinuteWindow = [];
const unifiedFilters = {
  search: '',
  types: new Set(PRIMARY_LIST_TYPES)
};

let pendingAnimeScanData = null;
let animeFranchiseScanTimer = null;
let animeFranchiseScanInflight = false;
let animeFranchiseLastScanTime = Number(safeLocalStorageGet(ANIME_FRANCHISE_LAST_SCAN_KEY)) || 0;
let lastJikanRequestTimestamp = 0;
let lastJikanRateLimitNotice = 0;
let lastJikanNetworkIssueNotice = 0;
let jikanRateLimiterTail = Promise.resolve();
let jikanForcedCooldownUntil = 0;

let currentUser = null;
let appInitialized = false;
let introPlayed = false;
let tmdbWarningShown = false;
let globalSuggestionClickBound = false;

const googleSigninBtn = document.getElementById('google-signin');
const signOutBtn = document.getElementById('sign-out');
const modalRoot = document.getElementById('modal-root');
const backToTopBtn = document.getElementById('back-to-top');
const appRoot = document.getElementById('app');
const loginScreen = document.getElementById('login-screen');
const unifiedSearchInput = document.getElementById('library-search');
let typeFilterButtons = [];
let typeFilterDelegationBound = false;
const userNameEl = document.getElementById('user-name');

const tmEasterEgg = {
  bindTriggers: () => {},
  getSeasonalTheme: () => 'default',
  getCurrentTmTheme: () => 'default'
};

function closeAddModal() {
  if (!modalRoot) return;
  cleanupAddModalForms();
  modalRoot.innerHTML = '';
}

function setupAddModal() {
  const btn = document.getElementById('open-add-modal');
  if (btn) {
    btn.addEventListener('click', () => openAddModal());
  }
}

function openAddModal(initialListType = null) {
  if (!modalRoot) return;
  if (!currentUser) {
    showAlert('Please sign in to add items.');
    return;
  }
  const templateRoot = document.getElementById('add-form-templates');
  if (!templateRoot) {
    showAlert('Add form templates are missing from the page.');
    return;
  }
  closeWheelModal();
  cleanupAddModalForms();
  modalRoot.innerHTML = '';

  const storedType = safeLocalStorageGet(LAST_ADD_LIST_TYPE_KEY);
  const fallbackType = PRIMARY_LIST_TYPES[0];
  let activeType = PRIMARY_LIST_TYPES.includes(initialListType) ? initialListType
    : (PRIMARY_LIST_TYPES.includes(storedType) ? storedType : fallbackType);
  let activeForm = null;

  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop add-modal-backdrop';
  const modal = document.createElement('div');
  modal.className = 'modal add-modal';

  const header = document.createElement('div');
  header.className = 'modal-header';
  const title = document.createElement('h3');
  title.textContent = 'Add Items';
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'btn ghost';
  closeBtn.textContent = 'Close';
  closeBtn.addEventListener('click', () => closeAddModal());
  header.appendChild(title);
  header.appendChild(closeBtn);

  const typeSelectLabel = document.createElement('label');
  typeSelectLabel.className = 'small';
  typeSelectLabel.textContent = 'Choose list';
  const typeSelect = document.createElement('select');
  typeSelect.className = 'add-modal-type-select';
  PRIMARY_LIST_TYPES.forEach(type => {
    const option = document.createElement('option');
    option.value = type;
    option.textContent = MEDIA_TYPE_LABELS[type] || type;
    if (type === activeType) option.selected = true;
    typeSelect.appendChild(option);
  });
  typeSelect.addEventListener('change', () => {
    const selected = typeSelect.value;
    if (!PRIMARY_LIST_TYPES.includes(selected)) return;
    activeType = selected;
    safeLocalStorageSet(LAST_ADD_LIST_TYPE_KEY, selected);
    renderForm(selected);
  });

  const intro = document.createElement('p');
  intro.className = 'small';
  intro.textContent = 'Search for a title to auto-fill metadata, then tweak any fields before saving.';

  const selectRow = document.createElement('div');
  selectRow.className = 'add-modal-select-row';
  selectRow.appendChild(typeSelectLabel);
  selectRow.appendChild(typeSelect);

  const formHost = document.createElement('div');
  formHost.className = 'add-modal-form-host';

  function renderForm(targetType) {
    if (activeForm) {
      teardownFormAutocomplete(activeForm);
    }
    formHost.innerHTML = '';
    const template = templateRoot.querySelector(`template[data-list="${targetType}"]`);
    if (!template) {
      const missing = document.createElement('p');
      missing.className = 'small';
      missing.textContent = 'Unable to load form template for this list.';
      formHost.appendChild(missing);
      activeForm = null;
      return;
    }
    const fragment = template.content.cloneNode(true);
    const panel = fragment.querySelector('.add-panel');
    if (panel) {
      panel.classList.remove('sr-only');
    }
    const form = fragment.querySelector('form');
    if (!form) {
      formHost.appendChild(fragment);
      activeForm = null;
      return;
    }
    form.dataset.addForm = 'true';
    form.addEventListener('submit', (ev) => {
      ev.preventDefault();
      addItemFromForm(targetType, form);
    });
    setupFormAutocomplete(form, targetType);
    formHost.appendChild(fragment);
    activeForm = form;
  }

  renderForm(activeType);

  const body = document.createElement('div');
  body.className = 'modal-body add-modal-body';
  body.appendChild(intro);
  body.appendChild(selectRow);
  body.appendChild(formHost);

  modal.appendChild(header);
  modal.appendChild(body);
  backdrop.appendChild(modal);
  backdrop.addEventListener('click', (ev) => {
    if (ev.target === backdrop) {
      closeAddModal();
    }
  });
  modalRoot.appendChild(backdrop);
}

function cleanupAddModalForms() {
  if (!modalRoot) return;
  modalRoot.querySelectorAll('form[data-add-form="true"]').forEach(form => {
    teardownFormAutocomplete(form);
  });
}

function logAppVersionOnce() {
  const flagKey = '__THE_LIST_VERSION_LOGGED__';
  if (globalThis[flagKey]) return;
  globalThis[flagKey] = true;
  const brandStyle = 'color:#7df2c9;font-weight:700;font-size:1rem';
  const infoStyle = 'color:#e7eef6;font-weight:400;font-size:1rem';
  console.info(`%cTHE LIST™%c version ${APP_VERSION}`, brandStyle, infoStyle);
}

logAppVersionOnce();

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

  setupAddModal();
  initWheelModal({
    modalRoot,
    closeAddModal,
    listCaches,
    getCurrentUser: () => currentUser,
    getDb: () => db,
    primaryListTypes: PRIMARY_LIST_TYPES,
    listSupportsActorFilter,
    getActorFilterValue,
    matchesActorFilter,
    isCollapsibleList,
    buildCollapsibleMovieCard,
    buildStandardCard,
    parseSeriesOrder,
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

  if (backToTopBtn) {
    backToTopBtn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
    window.addEventListener('scroll', updateBackToTopVisibility, { passive: true });
    updateBackToTopVisibility();
  }
}


// Prompt user to add missing collection parts
function promptAddMissingCollectionParts(listType, collInfo, currentItem, keywordContext = null) {
  const hasCollectionParts = collInfo && Array.isArray(collInfo.parts) && collInfo.parts.length;
  const keywordEntries = Array.isArray(keywordContext?.entries) ? keywordContext.entries : [];
  const keywordInfo = keywordContext?.keywordInfo || null;
  const resolvedSeriesName = keywordContext?.seriesName || '';
  const franchiseLabel = resolvedSeriesName || keywordContext?.franchiseLabel || keywordInfo?.name || '';

  let missing = [];
  let existingKeys = null;
  if (hasCollectionParts) {
    const existing = listCaches[listType] ? Object.values(listCaches[listType]) : [];
    existingKeys = new Set(existing.map(e => normalizeTitleKey(e.title)));
    existingKeys.add(normalizeTitleKey(currentItem.title));
    missing = collInfo.parts.filter(p => !existingKeys.has(normalizeTitleKey(p.title)));
  }

  if (!missing.length && !keywordEntries.length) {
    return Promise.resolve();
  }
  if (!modalRoot) return Promise.resolve();
  closeAddModal();
  closeWheelModal();
  modalRoot.innerHTML = '';

  return new Promise(resolve => {
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    const modal = document.createElement('div');
    modal.className = 'modal';
    const headingLabel = collInfo?.collectionName || franchiseLabel || 'this franchise';
    const h = document.createElement('h3');
    h.textContent = `Add entries from "${headingLabel}"?`;
    modal.appendChild(h);
    const sub = document.createElement('p');
    if (missing.length && keywordEntries.length) {
      sub.textContent = `Detected ${missing.length} collection parts and ${keywordEntries.length} franchise picks not yet in your lists.`;
    } else if (missing.length) {
      sub.textContent = `Detected ${missing.length} collection entries not yet in your list.`;
    } else {
      sub.textContent = `Detected ${keywordEntries.length} franchise picks not yet in your lists.`;
    }
    modal.appendChild(sub);

    const checkboxes = [];
    const listContainer = document.createElement('div');
    listContainer.style.display = 'flex';
    listContainer.style.flexDirection = 'column';
    listContainer.style.gap = '.75rem';

    if (missing.length) {
      const collectionSection = document.createElement('div');
      const sectionHeading = document.createElement('p');
      sectionHeading.className = 'small';
      sectionHeading.style.fontWeight = '600';
      sectionHeading.textContent = `${collInfo.collectionName || 'Collection'} parts`;
      collectionSection.appendChild(sectionHeading);
      missing.forEach(m => {
        const row = document.createElement('label');
        row.style.display = 'flex';
        row.style.alignItems = 'center';
        row.style.gap = '.5rem';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = true;
        cb.dataset.source = 'collection';
        cb.dataset.title = m.title;
        cb.dataset.year = m.year || '';
        cb.dataset.order = m.order || '';
        cb.dataset.tmdbId = m.tmdbId || m.id || '';
        cb.dataset.imdbId = m.imdbId || '';
        row.appendChild(cb);
        const text = document.createElement('span');
        const orderLabel = m.order ? `${m.order}. ` : '';
        text.textContent = `${orderLabel}${m.title}${m.year ? ` (${m.year})` : ''}`;
        row.appendChild(text);
        collectionSection.appendChild(row);
        checkboxes.push(cb);
      });
      listContainer.appendChild(collectionSection);
    }

    if (keywordEntries.length) {
      const keywordSection = document.createElement('div');
      const keywordHeading = document.createElement('p');
      keywordHeading.className = 'small';
      keywordHeading.style.fontWeight = '600';
      keywordHeading.textContent = `Franchise picks${franchiseLabel ? ` (${franchiseLabel})` : ''}`;
      keywordSection.appendChild(keywordHeading);
      keywordEntries.forEach(entry => {
        const row = document.createElement('label');
        row.style.display = 'flex';
        row.style.alignItems = 'flex-start';
        row.style.gap = '.5rem';
        row.style.border = '1px solid var(--border, #333)';
        row.style.borderRadius = '10px';
        row.style.padding = '.5rem .65rem';
        row.style.background = 'rgba(255,255,255,0.03)';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = true;
        cb.dataset.source = 'keyword';
        cb.dataset.mediaType = entry.mediaType === 'tv' ? 'tv' : 'movie';
        cb.dataset.title = entry.title || '';
        cb.dataset.year = entry.year || '';
        cb.dataset.tmdbId = entry.id || '';
        row.appendChild(cb);
        const info = document.createElement('div');
        info.style.display = 'flex';
        info.style.flexDirection = 'column';
        info.style.gap = '.15rem';
        const titleEl = document.createElement('strong');
        titleEl.textContent = `${entry.title}${entry.year ? ` (${entry.year})` : ''}`;
        info.appendChild(titleEl);
        const meta = document.createElement('span');
        meta.className = 'small';
        const summaryBits = [entry.mediaType === 'tv' ? 'TV' : 'Movie'];
        if (entry.relation) summaryBits.push(entry.relation === 'similar' ? 'Similar' : 'Recommended');
        meta.textContent = summaryBits.join(' • ');
        info.appendChild(meta);
        if (entry.overview) {
          const overview = document.createElement('span');
          overview.className = 'small';
          overview.style.opacity = '0.85';
          overview.textContent = entry.overview.length > 220
            ? `${entry.overview.slice(0, 217)}…`
            : entry.overview;
          info.appendChild(overview);
        }
        row.appendChild(info);
        keywordSection.appendChild(row);
        checkboxes.push(cb);
      });
      listContainer.appendChild(keywordSection);
    }

    modal.appendChild(listContainer);

    const actions = document.createElement('div');
    actions.style.display = 'flex';
    actions.style.gap = '.5rem';
    actions.style.marginTop = '1rem';
    const addBtn = document.createElement('button');
    addBtn.className = 'btn primary';
    addBtn.textContent = 'Add Selected';

    const cleanup = () => {
      modalRoot.innerHTML = '';
      resolve();
    };

    addBtn.addEventListener('click', async () => {
      const selections = checkboxes.filter(cb => cb.checked);
      if (!selections.length) {
        cleanup();
        return;
      }
      addBtn.disabled = true;
      addBtn.textContent = 'Adding...';
      const totalParts = collInfo?.parts?.length || null;
      const keywordSelections = [];

      for (const cb of selections) {
        if (cb.dataset.source === 'keyword') {
          keywordSelections.push({
            mediaType: cb.dataset.mediaType === 'tv' ? 'tv' : 'movie',
            title: cb.dataset.title,
            year: sanitizeYear(cb.dataset.year),
            id: Number(cb.dataset.tmdbId) || null,
          });
          continue;
        }
        const part = {
          title: cb.dataset.title,
          year: sanitizeYear(cb.dataset.year),
          seriesOrder: cb.dataset.order ? Number(cb.dataset.order) : null,
          tmdbId: Number(cb.dataset.tmdbId) || null,
          imdbId: cb.dataset.imdbId || '',
        };
        try {
          const payload = {
            title: part.title,
            year: part.year || '',
            seriesName: collInfo?.collectionName || '',
            seriesOrder: part.seriesOrder,
            seriesSize: totalParts,
          };
          if (isDuplicateCandidate(listType, payload)) continue;
          const baseTrailerUrl = buildTrailerUrl(part.title, part.year);
          if (baseTrailerUrl) payload.trailerUrl = baseTrailerUrl;
          let metadata = null;
          if (TMDB_API_KEY) {
            metadata = await fetchTmdbMetadata('movies', {
              title: part.title,
              year: part.year,
              tmdbId: part.tmdbId,
              imdbId: part.imdbId,
            });
          }
          if (metadata) {
            const updates = deriveMetadataAssignments(metadata, payload, {
              overwrite: true,
              fallbackTitle: part.title,
              fallbackYear: part.year,
            });
            Object.assign(payload, updates);
          }
          await addItem(listType, payload);
          if (existingKeys) {
            existingKeys.add(normalizeTitleKey(part.title));
          }
        } catch (e) {
          console.warn('Failed to auto-add part', part.title, e);
        }
      }

      if (keywordSelections.length && keywordInfo) {
        await autoAddTmdbKeywordEntries(franchiseLabel || keywordInfo.name || '', keywordInfo, keywordSelections, {
          sourceItem: currentItem,
          sourceListType: listType,
        });
      }

      cleanup();
    });

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn secondary';
    cancelBtn.textContent = 'Skip';
    cancelBtn.addEventListener('click', () => {
      cleanup();
    });

    actions.appendChild(addBtn);
    actions.appendChild(cancelBtn);
    modal.appendChild(actions);
    backdrop.appendChild(modal);
    modalRoot.appendChild(backdrop);
  });
}

function formatAnimeFranchiseEntryLabel(entry) {
  if (!entry) return 'Untitled entry';
  const labelParts = [];
  if (entry.seriesOrder !== undefined && entry.seriesOrder !== null) {
    labelParts.push(`#${entry.seriesOrder}`);
  }
  labelParts.push(entry.title || 'Untitled');
  const meta = [];
  if (entry.format) meta.push(entry.format);
  if (entry.year) meta.push(entry.year);
  if (entry.relationType && entry.relationType !== 'ROOT') {
    const pretty = entry.relationType.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, ch => ch.toUpperCase());
    meta.push(pretty);
  }
  const metaText = meta.length ? ` (${meta.join(' • ')})` : '';
  return `${labelParts.filter(Boolean).join(' ')}${metaText}`;
}

function promptAnimeFranchiseSelection(plan, { rootAniListId, title } = {}) {
  if (!plan || !Array.isArray(plan.entries)) return Promise.resolve([]);
  const rootIdStr = rootAniListId ? String(rootAniListId) : '';
  const selectable = plan.entries.filter(entry => {
    if (!entry || entry.aniListId === undefined || entry.aniListId === null) return false;
    if (rootIdStr && String(entry.aniListId) === rootIdStr) return false;
    return true;
  });
  if (!selectable.length) return Promise.resolve([]);
  if (!modalRoot) {
    return Promise.resolve(selectable.map(entry => entry.aniListId));
  }
  closeAddModal();
  closeWheelModal();
  return new Promise(resolve => {
    modalRoot.innerHTML = '';
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    const modal = document.createElement('div');
    modal.className = 'modal';
    const displayName = plan.seriesName || title || 'this franchise';
    const heading = document.createElement('h3');
    heading.textContent = `Add related anime for "${displayName}"?`;
    modal.appendChild(heading);
    const sub = document.createElement('p');
    sub.textContent = 'Choose which sequels, movies, and specials to add alongside this entry.';
    modal.appendChild(sub);
    const list = document.createElement('div');
    list.style.maxHeight = '260px';
    list.style.overflowY = 'auto';
    list.style.marginTop = '.5rem';
    list.style.display = 'flex';
    list.style.flexDirection = 'column';
    list.style.gap = '.35rem';
    const checkboxes = [];
    selectable.forEach(entry => {
      const row = document.createElement('label');
      row.style.display = 'flex';
      row.style.alignItems = 'center';
      row.style.gap = '.5rem';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = true;
      cb.value = String(entry.aniListId);
      row.appendChild(cb);
      const text = document.createElement('span');
      text.textContent = formatAnimeFranchiseEntryLabel(entry);
      row.appendChild(text);
      list.appendChild(row);
      checkboxes.push(cb);
    });
    modal.appendChild(list);
    const actions = document.createElement('div');
    actions.style.display = 'flex';
    actions.style.gap = '.5rem';
    actions.style.marginTop = '1rem';
    const close = (result) => {
      modalRoot.innerHTML = '';
      resolve(result);
    };
    const addBtn = document.createElement('button');
    addBtn.className = 'btn primary';
    addBtn.textContent = 'Add Selected';
    addBtn.addEventListener('click', () => {
      const selected = checkboxes.filter(cb => cb.checked).map(cb => cb.value);
      close(selected);
    });
    const skipBtn = document.createElement('button');
    skipBtn.className = 'btn secondary';
    skipBtn.textContent = 'Skip';
    skipBtn.addEventListener('click', () => close([]));
    actions.appendChild(addBtn);
    actions.appendChild(skipBtn);
    modal.appendChild(actions);
    backdrop.appendChild(modal);
    modalRoot.appendChild(backdrop);
    backdrop.addEventListener('click', (event) => {
      if (event.target === backdrop) close([]);
    });
  });
}

function sanitizeFranchiseEntryForNotification(entry, fallbackSeriesName, totalEntries) {
  if (!entry || !entry.title) return null;
  return {
    aniListId: entry.aniListId || null,
    title: entry.title,
    year: Number.isFinite(entry.year) ? entry.year : null,
    format: entry.format || '',
    episodes: entry.episodes ?? null,
    duration: entry.duration ?? null,
    status: entry.status || '',
    siteUrl: entry.siteUrl || '',
    cover: entry.cover || '',
    relationType: entry.relationType || '',
    depth: Number.isFinite(entry.depth) ? entry.depth : 0,
    seriesName: entry.seriesName || fallbackSeriesName || '',
    seriesOrder: entry.seriesOrder ?? null,
    seriesSize: Number.isFinite(entry.seriesSize) ? entry.seriesSize : (Number.isFinite(totalEntries) ? totalEntries : null),
  };
}

function buildAnimeNotificationActionPayload(seriesName, missingEntries, context = {}) {
  if (!Array.isArray(missingEntries) || missingEntries.length === 0) return null;
  const derivedSeriesName = seriesName || context?.plan?.seriesName || '';
  const planEntries = Array.isArray(context?.plan?.entries) ? context.plan.entries : null;
  const totalEntries = Number.isFinite(context?.plan?.totalEntries)
    ? context.plan.totalEntries
    : (planEntries ? planEntries.length : missingEntries.length);
  const entries = missingEntries
    .map(entry => sanitizeFranchiseEntryForNotification(entry, derivedSeriesName, totalEntries))
    .filter(Boolean);
  if (!entries.length) return null;
  return {
    rootAniListId: context.rootAniListId || null,
    totalEntries,
    seriesName: derivedSeriesName,
    entries,
  };
}

function showAnimeFranchiseNotification(seriesName, missingEntries, context = {}) {
  if (!Array.isArray(missingEntries) || missingEntries.length === 0) return;
  const sampleTitles = missingEntries
    .map(entry => entry && entry.title)
    .filter(Boolean)
    .slice(0, 3);
  const extra = missingEntries.length - sampleTitles.length;
  const segments = [];
  if (sampleTitles.length) {
    segments.push(sampleTitles.join(', '));
  }
  if (extra > 0) {
    segments.push(`+${extra} more`);
  }
  const summary = segments.join(' | ');
  const body = summary
    ? `${summary} ready to add from MyAnimeList. Use the button below to drop them straight into your anime list.`
    : 'New related entries are available on MyAnimeList. Use the button below to add them directly.';
  const heading = seriesName ? `New entries for ${seriesName}` : 'New anime entries found';
  const actionPayload = buildAnimeNotificationActionPayload(seriesName, missingEntries, context);
  pushNotification({
    title: heading,
    message: body,
    actionLabel: actionPayload ? 'Add to anime list' : '',
    actionType: actionPayload ? 'anime-franchise-add' : '',
    actionPayload,
  });
}

function handleNotificationActionEvent(event) {
  const detail = event && event.detail ? event.detail : null;
  if (!detail || !detail.actionType) return;
  if (!currentUser) {
    showAlert('Sign in to manage notifications first.');
    return;
  }
  if (detail.actionType === 'anime-franchise-add') {
    handleAnimeNotificationAction(detail);
  }
}

async function handleAnimeNotificationAction(detail) {
  const payload = detail && detail.payload ? detail.payload : null;
  if (!payload || !Array.isArray(payload.entries) || !payload.entries.length) {
    showAlert('Nothing left to add from that notification.');
    return;
  }
  const notificationId = detail.id || null;
  if (notificationId && notificationActionsInflight.has(notificationId)) {
    return;
  }
  if (notificationId) {
    notificationActionsInflight.add(notificationId);
  }
  const sanitizedEntries = payload.entries
    .map(entry => sanitizeFranchiseEntryForNotification(entry, payload.seriesName, payload.totalEntries))
    .filter(Boolean);
  if (!sanitizedEntries.length) {
    showAlert('Those entries can no longer be imported.');
    if (notificationId) notificationActionsInflight.delete(notificationId);
    return;
  }
  const selectionIds = sanitizedEntries
    .map(entry => entry && entry.aniListId)
    .filter(Boolean)
    .map(id => String(id));
  if (!selectionIds.length) {
    showAlert('Missing AniList IDs for those entries, so they cannot be auto-added yet.');
    if (notificationId) notificationActionsInflight.delete(notificationId);
    return;
  }
  const plan = {
    seriesName: payload.seriesName || '',
    entries: sanitizedEntries,
    totalEntries: payload.totalEntries ?? (sanitizedEntries[0] && sanitizedEntries[0].seriesSize) ?? sanitizedEntries.length,
  };
  try {
    const addedCount = await autoAddAnimeFranchiseEntries(plan, payload.rootAniListId, selectionIds);
    if (notificationId) {
      document.dispatchEvent(new CustomEvent(NOTIFICATION_ACTION_SUCCESS_EVENT, { detail: { id: notificationId } }));
    }
    const title = plan.seriesName || 'Anime list updated';
    if (typeof addedCount === 'number' && addedCount > 0) {
      pushNotification({
        title,
        message: `Added ${addedCount} ${addedCount === 1 ? 'entry' : 'entries'} from that notification.`,
        duration: 6500,
        persist: false,
      });
    } else {
      pushNotification({
        title,
        message: 'Those entries were already on your list.',
        duration: 5500,
        persist: false,
      });
    }
  } catch (err) {
    console.error('Unable to auto-add franchise entries from notification', err);
    showAlert('Unable to add those entries right now. Please try again.');
  } finally {
    if (notificationId) {
      notificationActionsInflight.delete(notificationId);
    }
  }
}

function loadAnimeFranchiseIgnoredIds() {
  const raw = safeLocalStorageGet(ANIME_FRANCHISE_IGNORE_KEY);
  if (!raw) return new Set();
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return new Set(parsed.map(value => String(value)));
    }
  } catch (_) {}
  return new Set();
}

function persistAnimeFranchiseIgnoredIds() {
  try {
    const payload = JSON.stringify(Array.from(animeFranchiseIgnoredIds));
    safeLocalStorageSet(ANIME_FRANCHISE_IGNORE_KEY, payload);
  } catch (_) {}
}

function rememberIgnoredAniListId(id) {
  if (!id) return;
  const normalized = String(id);
  if (animeFranchiseIgnoredIds.has(normalized)) return;
  animeFranchiseIgnoredIds.add(normalized);
  persistAnimeFranchiseIgnoredIds();
}

function clearIgnoredAniListId(id) {
  if (!id) return;
  const normalized = String(id);
  if (!animeFranchiseIgnoredIds.has(normalized)) return;
  animeFranchiseIgnoredIds.delete(normalized);
  persistAnimeFranchiseIgnoredIds();
}

function signOut() {
  safeStorageRemove(INTRO_SESSION_KEY);
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
    showAlert('App is still loading. Please try again.');
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
        showAlert('Google sign-in redirect failed. Please try again.');
        return;
      }
    }
    console.error('Google sign-in failed', err);
    showAlert('Google sign-in failed. Please try again.');
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
    showAlert('Google sign-in failed after redirect. Please try again.');
  }
}

// UI helpers
function showLogin() {
  loginScreen.classList.remove('hidden');
  appRoot.classList.add('hidden');
  introPlayed = false;
  safeStorageRemove(INTRO_SESSION_KEY);
  resetFilterState();
  updateBackToTopVisibility();
}

function showAppForUser(user) {
  loginScreen.classList.add('hidden');
  appRoot.classList.remove('hidden');
  userNameEl.textContent = user.displayName || user.email || 'You';
  updateBackToTopVisibility();
  playTheListIntro();
  loadPrimaryLists();
}

function loadPrimaryLists() {
  PRIMARY_LIST_TYPES.forEach(listType => loadList(listType));
}

function initUnifiedLibraryControls() {
  refreshTypeFilterButtons();
  if (unifiedSearchInput) {
    unifiedSearchInput.addEventListener('input', debounce((ev) => {
      unifiedFilters.search = (ev.target.value || '').trim().toLowerCase();
      renderUnifiedLibrary();
    }, 180));
  }
  bindTypeFilterDelegation();
  updateUnifiedTypeControls();
}

function refreshTypeFilterButtons() {
  typeFilterButtons = Array.from(document.querySelectorAll('[data-type-toggle]'));
  return typeFilterButtons;
}

function bindTypeFilterDelegation() {
  if (typeFilterDelegationBound) return;
  document.addEventListener('click', handleTypeFilterTrigger);
  typeFilterDelegationBound = true;
}

function handleTypeFilterTrigger(event) {
  const btn = event.target.closest('[data-type-toggle]');
  if (!btn || btn.disabled) return;
  const type = btn.dataset.typeToggle;
  if (!type) return;
  if (!typeFilterButtons.includes(btn)) {
    refreshTypeFilterButtons();
  }
  toggleUnifiedTypeFilter(type, event);
}

function toggleUnifiedTypeFilter(listType, event = null) {
  if (!listType) return;
  const wantsExclusive = !!(event && (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey));
  if (wantsExclusive) {
    const isAlreadySolo = unifiedFilters.types.size === 1 && unifiedFilters.types.has(listType);
    unifiedFilters.types = isAlreadySolo
      ? new Set(PRIMARY_LIST_TYPES)
      : new Set([listType]);
  } else {
    const next = new Set(unifiedFilters.types);
    if (next.has(listType)) {
      if (next.size === 1) return;
      next.delete(listType);
    } else {
      next.add(listType);
    }
    unifiedFilters.types = next;
  }
  updateUnifiedTypeControls();
  renderUnifiedLibrary();
}

function updateUnifiedTypeControls() {
  if (!typeFilterButtons || !typeFilterButtons.length) {
    refreshTypeFilterButtons();
  }
  if (!typeFilterButtons.length) return;
  typeFilterButtons.forEach(btn => {
    const type = btn.dataset.typeToggle;
    const isActive = !!(type && unifiedFilters.types.has(type));
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  });
}

function resetUnifiedFilters() {
  unifiedFilters.search = '';
  unifiedFilters.types = new Set(PRIMARY_LIST_TYPES);
  if (unifiedSearchInput) unifiedSearchInput.value = '';
  updateUnifiedTypeControls();
}

function playTheListIntro() {
  if (introPlayed || safeStorageGet(INTRO_SESSION_KEY) === '1') {
    introPlayed = true;
    return;
  }
  const intro = document.getElementById('the-list-intro');
  if (!intro) return;
  introPlayed = true;
  safeStorageSet(INTRO_SESSION_KEY, '1');
  intro.classList.remove('hidden');
  intro.classList.add('active');
  setTimeout(() => {
    intro.classList.add('hidden');
    intro.classList.remove('active');
  }, 3600);
}

function safeStorageGet(key) {
  try {
    return window.sessionStorage ? window.sessionStorage.getItem(key) : null;
  } catch (_) {
    return null;
  }
}

function safeStorageSet(key, value) {
  try {
    if (!window.sessionStorage) return;
    window.sessionStorage.setItem(key, value);
  } catch (_) {}
}

function safeStorageRemove(key) {
  try {
    if (!window.sessionStorage) return;
    window.sessionStorage.removeItem(key);
  } catch (_) {}
}

function safeLocalStorageGet(key) {
  try {
    return window.localStorage ? window.localStorage.getItem(key) : null;
  } catch (_) {
    return null;
  }
}

function safeLocalStorageSet(key, value) {
  try {
    if (!window.localStorage) return;
    window.localStorage.setItem(key, value);
  } catch (_) {}
}

function safeLocalStorageRemove(key) {
  try {
    if (!window.localStorage) return;
    window.localStorage.removeItem(key);
  } catch (_) {}
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

function renderList(listType, data) {
  listCaches[listType] = data || {};
  renderUnifiedLibrary();
}

function renderUnifiedLibrary() {
  const container = document.getElementById('combined-list');
  if (!container) return;
  container.innerHTML = '';

  const cards = collectUnifiedCards();
  if (!cards.length) {
    container.innerHTML = '<div class="empty-state">No items found.</div>';
    return;
  }

  cards.sort((a, b) => a.sortKey.localeCompare(b.sortKey));

  const combinedGrid = document.createElement('div');
  combinedGrid.className = 'movies-grid unified-grid';
  cards.forEach(({ node }) => combinedGrid.appendChild(node));
  container.appendChild(combinedGrid);
}

function collectUnifiedCards() {
  const cards = [];
  PRIMARY_LIST_TYPES.forEach(listType => {
    const data = listCaches[listType] || {};
    const entries = Object.entries(data).filter(([_, item]) => {
      if (!item) return false;
      if (unifiedFilters.search) {
        const title = (item.title || '').toLowerCase();
        if (!title.includes(unifiedFilters.search)) return false;
      }
      return true;
    });
    if (!entries.length) return;
    entries.sort((a, b) => (a[1].title || '').localeCompare(b[1].title || ''));

    const tempSection = document.createElement('section');
    tempSection.className = 'library-section unified-temp';
    tempSection.style.display = 'none';
    if (document.body) {
      document.body.appendChild(tempSection);
    }
    if (isCollapsibleList(listType)) {
      renderCollapsibleMediaGrid(listType, tempSection, entries);
    } else {
      const grid = document.createElement('div');
      grid.className = 'movies-grid';
      renderStandardList(grid, listType, entries);
      tempSection.appendChild(grid);
    }

    const cardNodes = Array.from(tempSection.querySelectorAll('.card'));
    cardNodes.forEach(card => {
      const badgeKeywords = annotateCardBadgeKeywords(card, listType);
      if (!cardMatchesBadgeFilters(listType, badgeKeywords)) return;
      const titleEl = card.querySelector('.title');
      const title = (titleEl ? titleEl.textContent : card.dataset.title || '').trim();
      const sortKey = title.toLowerCase();
      cards.push({ node: card, sortKey: sortKey || title, listType });
    });
    if (tempSection.parentNode) {
      tempSection.parentNode.removeChild(tempSection);
    }
  });
  return cards;
}

function annotateCardBadgeKeywords(card, listType) {
  const keywords = new Set();
  const chipNodes = card.querySelectorAll('.anime-summary-badges .anime-chip, .watch-time-chip');
  chipNodes.forEach(chip => collectBadgeKeywordsFromText(chip?.textContent || '', keywords));
  collectFallbackKeywordsForList(listType, keywords);
  card.dataset.badgeKeywords = Array.from(keywords).join(',');
  return keywords;
}

function collectFallbackKeywordsForList(listType, bucket) {
  switch (listType) {
    case 'movies':
      bucket.add('movie');
      break;
    case 'tvShows':
      bucket.add('tv');
      bucket.add('series');
      break;
    case 'anime':
      bucket.add('anime');
      break;
    case 'books':
      bucket.add('book');
      break;
    default:
      break;
  }
}

function collectBadgeKeywordsFromText(text, bucket) {
  const normalized = String(text || '').trim().toLowerCase();
  if (!normalized) return;
  if (/\bmovie(s)?\b/.test(normalized)) bucket.add('movie');
  if (/\btv\b/.test(normalized) || /\bseries\b/.test(normalized) || /\bshow\b/.test(normalized)) bucket.add('tv');
  if (/\banime\b/.test(normalized)) bucket.add('anime');
  if (/\bbook(s)?\b/.test(normalized) || /\bread\b/.test(normalized)) bucket.add('book');
  if (/\bova\b/.test(normalized) || /\bona\b/.test(normalized) || /\bspecial\b/.test(normalized) || /\bmusic\b/.test(normalized)) bucket.add('anime');
}

function cardMatchesBadgeFilters(listType, badgeKeywords) {
  const activeFilters = unifiedFilters.types;
  if (!activeFilters || !activeFilters.size || activeFilters.size === PRIMARY_LIST_TYPES.length) {
    return true;
  }
  const hasKeyword = (token) => badgeKeywords && badgeKeywords.has(token);
  return Array.from(activeFilters).some(type => {
    switch (type) {
      case 'movies':
        return listType === 'movies' || hasKeyword('movie');
      case 'tvShows':
        return listType === 'tvShows' || hasKeyword('tv');
      case 'anime':
        return listType === 'anime' || hasKeyword('anime');
      case 'books':
        return listType === 'books' || hasKeyword('book');
      default:
        return true;
    }
  });
}

function getListLabel(type) {
  switch (type) {
    case 'movies': return 'Movies';
    case 'tvShows': return 'TV Shows';
    case 'anime': return 'Anime';
    case 'books': return 'Books';
    default: return type;
  }
}

// Load list items in real-time
// listType: movies | tvShows | anime | books
function loadList(listType) {
  if (!currentUser) return;
  const listContainer = document.getElementById(`${listType}-list`);
  if (listContainer) {
    listContainer.innerHTML = 'Loading...';
  }

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
    if (listType === 'anime') {
      scheduleAnimeFranchiseScan(data);
    }
  }, (err) => {
    console.error('DB read error', err);
    if (listContainer) {
      listContainer.innerHTML = '<div class="small">Unable to load items.</div>';
    }
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


function isCollapsibleList(listType) {
  return COLLAPSIBLE_LISTS.has(listType);
}

function supportsWatchProviders(listType) {
  return WATCH_PROVIDER_LISTS.has(listType);
}

function listSupportsActorFilter(listType) {
  return Object.prototype.hasOwnProperty.call(actorFilters, listType);
}

function getActorFilterValue(listType) {
  if (!listSupportsActorFilter(listType)) return '';
  return (actorFilters[listType] || '').trim().toLowerCase();
}

function matchesActorFilter(listType, item, filterValue = null) {
  if (!listSupportsActorFilter(listType)) return true;
  const activeFilter = typeof filterValue === 'string' ? filterValue : getActorFilterValue(listType);
  if (!activeFilter) return true;
  if (!item) return false;
  const tokens = Array.isArray(item.actors) ? item.actors : parseActorsList(item.actors);
  if (tokens && tokens.length) {
    return tokens.some(name => String(name).toLowerCase().includes(activeFilter));
  }
  const fallback = String(item.actors || '').toLowerCase();
  return fallback.includes(activeFilter);
}

function prepareCollapsibleRecords(listType, entries) {
  const seriesBuckets = new Map();
  const records = [];

  entries.forEach(([id, item], index) => {
    if (!item) return;
    const seriesKey = item.seriesName ? normalizeTitleKey(item.seriesName) : '';
    const order = numericSeriesOrder(item.seriesOrder);
    const record = { id, item, index, seriesKey, order };
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
      }));
      leaderMembersByCardId.set(leader.id, compactEntries);
    }
  });

  const visibleIds = new Set();
  const displayRecords = [];
  records.forEach(record => {
    const { id, item, index, seriesKey } = record;
    const bucket = seriesKey ? seriesBuckets.get(seriesKey) : null;
    const hideCard = Boolean(bucket && bucket.leaderId && bucket.leaderId !== id);
    let displayItem = item;
    let displayEntryId = id;
    if (!hideCard && bucket && bucket.leaderId === id) {
      const entries = leaderMembersByCardId.get(id) || [];
      const active = resolveSeriesDisplayEntry(listType, id, entries);
      if (active && active.item) {
        displayItem = active.item;
        displayEntryId = active.id;
      }
    }
    if (!hideCard) {
      visibleIds.add(id);
      displayRecords.push({
        id,
        item,
        displayItem,
        displayEntryId,
        index,
      });
    }
  });

  return { displayRecords, leaderMembersByCardId, visibleIds };
}

function renderCollapsibleMediaGrid(listType, container, entries, options = {}) {
  const inline = Boolean(options.inline);
  const grid = inline ? container : createEl('div', 'movies-grid');
  const { displayRecords, leaderMembersByCardId, visibleIds } = prepareCollapsibleRecords(listType, entries);
  seriesGroups[listType] = leaderMembersByCardId;

  displayRecords.forEach(record => {
    const { id, displayItem, displayEntryId, index } = record;
    grid.appendChild(buildCollapsibleMovieCard(listType, id, displayItem, index, {
      displayEntryId,
    }));
  });

  if (!inline) {
    container.appendChild(grid);
  }

  const expandedSet = ensureExpandedSet(listType);
  expandedSet.forEach(cardId => {
    if (!visibleIds.has(cardId)) {
      expandedSet.delete(cardId);
    }
  });

  const carouselStore = ensureSeriesCarouselStore(listType);
  const leaderIds = new Set(leaderMembersByCardId.keys());
  carouselStore.forEach((_, key) => {
    if (!leaderIds.has(key)) {
      carouselStore.delete(key);
    }
  });

  updateCollapsibleCardStates(listType);
}

function renderStandardList(container, listType, entries) {
  entries.forEach(([id, item]) => {
    if (!item) return;
    container.appendChild(buildStandardCard(listType, id, item));
  });
}

function buildCollapsibleMovieCard(listType, id, item, positionIndex = 0, options = {}) {
  const { hideCard = false, displayEntryId = id, interactive = true } = options;
  const card = createEl('div', 'card collapsible movie-card');
  card.dataset.id = id;
  card.dataset.index = String(positionIndex);
  card.dataset.entryId = displayEntryId;
  card.dataset.listType = listType;
  if (hideCard) {
    card.classList.add('series-hidden');
  }
  if (ensureExpandedSet(listType).has(id)) {
    card.classList.add('expanded');
  }
  if (interactive) {
    card.addEventListener('click', () => toggleCardExpansion(listType, id));
  }
  renderMovieCardContent(card, listType, id, item, displayEntryId);
  return card;
}

function renderMovieCardContent(card, listType, cardId, item, entryId = cardId) {
  if (!card) return;
  card.dataset.entryId = entryId;
  card.querySelectorAll('.movie-card-summary, .movie-card-details').forEach(el => el.remove());
  const summary = buildMovieCardSummary(listType, item, { cardId, entryId });
  const details = buildMovieCardDetails(listType, cardId, entryId, item);
  card.insertBefore(summary, card.firstChild || null);
  card.appendChild(details);
}

function buildMovieCardSummary(listType, item, context = {}) {
  const summary = createEl('div', 'movie-card-summary');
  summary.appendChild(buildMovieArtwork(item));
  summary.appendChild(buildMovieCardInfo(listType, item, context));
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

function buildMovieCardInfo(listType, item, context = {}) {
  const info = createEl('div', 'movie-card-info');
  const header = createEl('div', 'movie-card-header');
  const title = createEl('div', 'title', { text: item.title || '(no title)' });
  header.appendChild(title);
  info.appendChild(header);

  if (isCollapsibleList(listType)) {
    const badges = buildAnimeSummaryBadges(item, { ...context, listType });
    if (badges) info.appendChild(badges);
  }

  const watchTime = buildWatchTimeChip(listType, context.cardId, item);
  if (watchTime) {
    info.appendChild(watchTime);
  }

  return info;
}

function buildAnimeSummaryBadges(item, context = {}) {
  if (!item) return null;
  const listType = context.listType || 'anime';
  const metrics = deriveAnimeSeriesMetrics(listType, context.cardId, item);
  if (!metrics) return null;
  const chips = [];
  if (metrics.formatLabels.length) {
    chips.push(metrics.formatLabels.join(' / '));
  }
  if (metrics.movieCount > 0) {
    chips.push(`${metrics.movieCount} movie${metrics.movieCount === 1 ? '' : 's'}`);
  }
  if (metrics.totalEpisodes > 0) {
    chips.push(`${metrics.totalEpisodes} ep total`);
  }
  if (metrics.statusLabel) {
    chips.push(formatAnimeStatusLabel(metrics.statusLabel));
  }
  if (!chips.length) return null;
  const row = createEl('div', 'anime-summary-badges');
  chips.forEach(text => row.appendChild(createEl('span', 'anime-chip', { text })));
  return row;
}

function formatAnimeFormatLabel(value) {
  if (!value) return '';
  return String(value).replace(/_/g, ' ').replace(/\b\w/g, ch => ch.toUpperCase());
}

function deriveAnimeSeriesMetrics(listType, cardId, fallbackItem) {
  const normalizedListType = listType || 'anime';
  let entries = [];
  if (cardId && isCollapsibleList(normalizedListType)) {
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
      if (normalized === 'MOVIE') {
        movieCount++;
      }
    }
    const epValue = Number(entry.animeEpisodes || entry.episodes);
    if (Number.isFinite(epValue) && epValue > 0) {
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

function buildMovieCardDetails(listType, cardId, entryId, item) {
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

  if (supportsWatchProviders(listType)) {
    const watchBlock = buildWatchNowSection(listType, item);
    if (watchBlock) {
      details.appendChild(watchBlock);
    }
  }

  if (item.plot) {
    details.appendChild(createEl('div', 'plot-summary detail-block', { text: item.plot.trim() }));
  }

  if (item.notes) {
    details.appendChild(createEl('div', 'notes detail-block', { text: item.notes }));
  }

  if (listType === 'anime') {
    const animeBlock = buildAnimeDetailBlock(item);
    if (animeBlock) {
      details.appendChild(animeBlock);
    }
  }

  if (isCollapsibleList(listType)) {
    const seriesBlock = buildSeriesCarouselBlock(listType, cardId);
    if (seriesBlock) {
      details.appendChild(seriesBlock);
    }
  }

  details.appendChild(buildMovieCardActions(listType, entryId, item));
  return details;
}

function buildAnimeDetailBlock(item) {
  if (!item) return null;
  const block = createEl('div', 'detail-block anime-detail-block');
  const chips = [];
  if (item.animeEpisodes) chips.push(formatAnimeEpisodesLabel(item.animeEpisodes));
  if (item.animeDuration) chips.push(`${item.animeDuration} min/ep`);
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

function formatAnimeEpisodesLabel(value) {
  const count = Number(value);
  if (Number.isFinite(count) && count > 0) {
    return `${count} episode${count === 1 ? '' : 's'}`;
  }
  return `${value} episodes`;
}

function buildSeriesCarouselBlock(listType, cardId) {
  const entries = getSeriesGroupEntries(listType, cardId);
  if (!entries || entries.length <= 1) return null;
  const state = getSeriesCarouselState(listType, cardId, entries.length);
  const block = createEl('div', 'series-carousel detail-block');

  const nav = createEl('div', 'series-carousel-nav');
  const prevBtn = createEl('button', 'series-carousel-btn', { text: '‹ Prev' });
  prevBtn.type = 'button';
  prevBtn.setAttribute('aria-label', 'Previous series entry');
  const counterEl = createEl('div', 'series-carousel-counter', { text: `${state.index + 1} / ${entries.length}` });
  const nextBtn = createEl('button', 'series-carousel-btn', { text: 'Next ›' });
  nextBtn.type = 'button';
  nextBtn.setAttribute('aria-label', 'Next series entry');
  nav.appendChild(prevBtn);
  nav.appendChild(counterEl);
  nav.appendChild(nextBtn);
  block.appendChild(nav);

  prevBtn.addEventListener('click', (ev) => {
    ev.stopPropagation();
    cycleSeriesCard(listType, cardId, -1);
  });
  nextBtn.addEventListener('click', (ev) => {
    ev.stopPropagation();
    cycleSeriesCard(listType, cardId, 1);
  });
  return block;
}

function getSeriesGroupEntries(listType, cardId) {
  const store = seriesGroups[listType];
  if (!store) return null;
  const entries = store.get(cardId);
  if (!entries || !entries.length) return null;
  return entries.slice();
}

function formatSeriesEntryLabel(entry) {
  const { item } = entry;
  if (!item) return '(unknown entry)';
  const parts = [];
  const order = numericSeriesOrder(entry.order ?? item.seriesOrder);
  if (order !== null) {
    parts.push(`Entry ${order}`);
  }
  parts.push(item.title || '(no title)');
  if (item.year) {
    parts.push(`(${item.year})`);
  }
  return parts.join(' ');
}

function cycleSeriesCard(listType, cardId, delta) {
  const entries = getSeriesGroupEntries(listType, cardId);
  if (!entries || entries.length <= 1) return;
  const state = getSeriesCarouselState(listType, cardId, entries.length);
  const total = entries.length;
  state.index = (state.index + delta + total) % total;
  const entry = entries[state.index];
  if (!entry) return;
  state.entryId = entry.id;
  const cards = document.querySelectorAll(`.card.collapsible.movie-card[data-list-type="${listType}"][data-id="${cardId}"]`);
  if (!cards.length) return;
  cards.forEach(card => {
    renderMovieCardContent(card, listType, cardId, entry.item, entry.id);
    card.classList.add('expanded');
  });
  const expandedSet = ensureExpandedSet(listType);
  expandedSet.add(cardId);
  updateCollapsibleCardStates(listType);
}

function resetSeriesCardToFirstEntry(listType, cardId) {
  const entries = getSeriesGroupEntries(listType, cardId);
  if (!entries || !entries.length) return;
  const first = entries[0];
  if (!first || !first.item) return;
  const state = getSeriesCarouselState(listType, cardId, entries.length);
  state.index = 0;
  state.entryId = first.id;
  const cards = document.querySelectorAll(`.card.collapsible.movie-card[data-list-type="${listType}"][data-id="${cardId}"]`);
  cards.forEach(card => renderMovieCardContent(card, listType, cardId, first.item, first.id));
}

function buildMovieMetaText(item) {
  const metaParts = [];
  if (item.year) metaParts.push(item.year);
  if (item.director) metaParts.push(item.director);
  if (item.runtime) metaParts.push(item.runtime);
  else if (item.animeDuration) metaParts.push(`${item.animeDuration} min/ep`);
  if (item.imdbRating) metaParts.push(`IMDb ${item.imdbRating}`);
  return metaParts.join(' • ');
}

function buildMovieExtendedMeta(item) {
  const parts = [];
  if (item.originalLanguage) {
    let label = `Original Language: ${item.originalLanguage}`;
    if (!itemIsOriginallyEnglish(item)) {
      label += ` (Dub: ${hasEnglishDubFlag(item) ? 'Yes' : 'No'})`;
    }
    parts.push(label);
  }
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
  if (listType === 'anime' && item.aniListUrl) {
    const aniList = createEl('a', 'meta-link', { text: 'View on MyAnimeList' });
    aniList.href = item.aniListUrl;
    aniList.target = '_blank';
    aniList.rel = 'noopener noreferrer';
    links.appendChild(aniList);
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
    ...(SERIES_BULK_DELETE_LISTS.has(listType) && item?.seriesName ? [{
      className: 'btn danger',
      label: 'Delete Series',
      handler: () => deleteSeriesEntries(listType, item.seriesName)
    }] : []),
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
    if (item.pageCount) metaParts.push(`${item.pageCount} pages`);
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

function buildStandardCardActions(listType, id, item) {
  const actions = createEl('div', 'actions');

  const editBtn = createEl('button', 'btn secondary', { text: 'Edit' });
  editBtn.addEventListener('click', () => openEditModal(listType, id, item));
  actions.appendChild(editBtn);

  if (SERIES_BULK_DELETE_LISTS.has(listType) && item?.seriesName) {
    const deleteSeriesBtn = createEl('button', 'btn danger', { text: 'Delete Series' });
    deleteSeriesBtn.addEventListener('click', () => deleteSeriesEntries(listType, item.seriesName));
    actions.appendChild(deleteSeriesBtn);
  }

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
    if (isCollapsibleList(listType)) {
      resetSeriesCardToFirstEntry(listType, cardId);
    }
  } else {
    expandedSet.add(cardId);
  }
  updateCollapsibleCardStates(listType);
}


function updateCollapsibleCardStates(listType) {
  const expandedSet = expandedCards[listType];
  document.querySelectorAll(`.card.collapsible.movie-card[data-list-type="${listType}"]`).forEach(card => {
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

function ensureSeriesCarouselStore(listType) {
  let store = seriesCarouselState[listType];
  if (!(store instanceof Map)) {
    store = new Map();
    seriesCarouselState[listType] = store;
  }
  return store;
}

function getSeriesCarouselState(listType, cardId, entryCount = 0) {
  const store = ensureSeriesCarouselStore(listType);
  let state = store.get(cardId);
  if (!state) {
    state = { index: 0 };
    store.set(cardId, state);
  }
  if (entryCount && state.index >= entryCount) {
    state.index = 0;
  }
  return state;
}

function sortSeriesRecords(records) {
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

function resolveSeriesDisplayEntry(listType, leaderId, entries) {
  if (!entries || !entries.length) return null;
  const state = getSeriesCarouselState(listType, leaderId, entries.length);
  let idx = typeof state.index === 'number' ? state.index : 0;
  if (idx >= entries.length || idx < 0) idx = 0;
  if (state.entryId) {
    const matchIdx = entries.findIndex(entry => entry.id === state.entryId);
    if (matchIdx >= 0) idx = matchIdx;
  }
  const entry = entries[idx] || entries[0];
  if (entry) {
    state.index = entries.indexOf(entry);
    state.entryId = entry.id;
    return entry;
  }
  state.index = 0;
  state.entryId = entries[0].id;
  return entries[0];
}

function pickSeriesLeader(entries) {
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
    showAlert('Title is required');
    return;
  }

  const submitBtn = form.querySelector('button[type="submit"]');
  setButtonBusy(submitBtn, true);

  try {
    let metadata = form.__selectedMetadata || null;
    const selectedImdbId = form.dataset.selectedImdbId || '';
    const selectedTmdbId = form.dataset.selectedTmdbId || '';
    const selectedAniListId = form.dataset.selectedAnilistId || '';
    const selectedGoogleBookId = form.dataset.selectedGoogleBookId || '';
    const selectedGoogleIsbn = form.dataset.selectedGoogleIsbn || '';
    const supportsMetadata = ['movies', 'tvShows', 'anime', 'books'].includes(listType);
    const useAniList = listType === 'anime';
    const useGoogleBooks = listType === 'books';
    const hasMetadataProvider = useAniList || useGoogleBooks || Boolean(TMDB_API_KEY);
    let animeFranchisePlan = null;
    let animeFranchiseSelectionIds = null;
    let aniListTargetId = useAniList ? (selectedAniListId || '') : '';
    let movieCollectionInfo = null;
    if (!metadata && supportsMetadata) {
      if (useAniList) {
        metadata = await fetchAniListMetadata({ aniListId: selectedAniListId, title, year });
      } else if (useGoogleBooks) {
        metadata = await fetchGoogleBooksMetadata({ volumeId: selectedGoogleBookId, title, author: creatorValue, isbn: selectedGoogleIsbn });
      } else if (!hasMetadataProvider) {
        maybeWarnAboutTmdbKey();
      } else {
        metadata = await fetchTmdbMetadata(listType, { title, year, imdbId: selectedImdbId, tmdbId: selectedTmdbId });
      }
    }
    if (useAniList) {
      if (!aniListTargetId && metadata && metadata.AniListId) {
        aniListTargetId = metadata.AniListId;
      }
      if (aniListTargetId) {
        try {
          animeFranchisePlan = await fetchAniListFranchisePlan({
            aniListId: aniListTargetId,
            preferredSeriesName: seriesNameValue || (metadata && metadata.Title) || title,
          });
        } catch (err) {
          console.warn('Unable to build MyAnimeList franchise plan', err);
        }
      }
    }
    if (useAniList && animeFranchisePlan && Array.isArray(animeFranchisePlan.entries)) {
      try {
        animeFranchiseSelectionIds = await promptAnimeFranchiseSelection(animeFranchisePlan, {
          rootAniListId: aniListTargetId || (metadata && metadata.AniListId) || '',
          title,
        });
      } catch (err) {
        console.warn('Franchise selection prompt failed', err);
        animeFranchiseSelectionIds = null;
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

    const userFranchiseInput = seriesNameValue;
    const shouldLookupKeyword = TMDB_API_KEY && userFranchiseInput && userFranchiseInput.length >= 3 && (listType === 'movies' || listType === 'tvShows');
    let franchiseKeywordInfo = null;
    let franchiseKeywordEntryCandidates = null;
    if (shouldLookupKeyword) {
      try {
        franchiseKeywordInfo = await searchTmdbKeyword(userFranchiseInput);
        if (franchiseKeywordInfo) {
          item.franchiseKeywordId = franchiseKeywordInfo.id;
          item.franchiseKeywordName = franchiseKeywordInfo.name;
          try {
            franchiseKeywordEntryCandidates = await fetchTmdbKeywordFranchiseEntries(franchiseKeywordInfo.id);
          } catch (err) {
            console.warn('Keyword franchise entries fetch failed', err);
            franchiseKeywordEntryCandidates = null;
          }
        }
      } catch (err) {
        console.warn('Franchise keyword lookup failed', err);
      }
    }

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
      if (useAniList) {
        if (!item.seriesName) {
          const derivedSeriesName = (animeFranchisePlan && animeFranchisePlan.seriesName) || (metadata && metadata.Title) || title;
          if (derivedSeriesName) item.seriesName = derivedSeriesName;
        }
        if (animeFranchisePlan && Array.isArray(animeFranchisePlan.entries) && animeFranchisePlan.entries.length) {
          const rootEntry = aniListTargetId
            ? animeFranchisePlan.entries.find(entry => entry && entry.aniListId && String(entry.aniListId) === String(aniListTargetId))
            : null;
          if (rootEntry && rootEntry.seriesOrder !== undefined && rootEntry.seriesOrder !== null) {
            const hasExistingOrder = item.seriesOrder !== undefined && item.seriesOrder !== null;
            if (!hasExistingOrder) {
              item.seriesOrder = rootEntry.seriesOrder;
            }
          }
          item.seriesSize = animeFranchisePlan.entries.length;
        }
      }
    }

    if (isDuplicateCandidate(listType, item)) {
      showAlert("Hey dumbass! It's already in the damn list!");
      return;
    }

    // Auto franchise enrichment (TMDb) for movies if user didn't supply seriesName
    if (listType === 'movies' && TMDB_API_KEY && item.title) {
      try {
        const collInfo = await getTmdbCollectionInfo(item.title, item.year, item.imdbId);
        if (collInfo && collInfo.collectionName && Array.isArray(collInfo.parts) && collInfo.parts.length > 1) {
          movieCollectionInfo = collInfo;
          const idx = collInfo.parts.findIndex(p => p.matchesCurrent);
          if (idx >= 0 && !item.seriesName) {
            item.seriesName = collInfo.collectionName;
            item.seriesOrder = idx + 1; // 1-based order
            item.seriesSize = collInfo.parts.length;
            if (idx + 1 < collInfo.parts.length) {
              item.nextSequel = collInfo.parts[idx + 1].title;
            }
            if (idx > 0) {
              item.previousPrequel = collInfo.parts[idx - 1].title;
            }
          }
          item._tmdbCollectionInfo = collInfo; // stash for follow-up prompts
        }
      } catch (e) {
        console.warn('TMDb enrichment failed', e);
      }
    }

    await addItem(listType, item);

    if (listType === 'anime' && animeFranchisePlan) {
      const allowAutoAdd = animeFranchiseSelectionIds === null || (Array.isArray(animeFranchiseSelectionIds) && animeFranchiseSelectionIds.length > 0);
      try {
        if (allowAutoAdd) {
          await autoAddAnimeFranchiseEntries(
            animeFranchisePlan,
            aniListTargetId || (metadata && metadata.AniListId),
            Array.isArray(animeFranchiseSelectionIds) ? animeFranchiseSelectionIds : undefined,
          );
        }
      } catch (err) {
        console.warn('Unable to auto-add related anime entries', err);
      }
    }

    let keywordPromptContext = null;
    if (franchiseKeywordInfo && Array.isArray(franchiseKeywordEntryCandidates) && franchiseKeywordEntryCandidates.length) {
      const filtered = filterKeywordEntriesAgainstLibrary(franchiseKeywordEntryCandidates, item, listType);
      if (filtered.length) {
        keywordPromptContext = {
          entries: filtered.slice(0, TMDB_KEYWORD_DISCOVER_MAX_RESULTS),
          keywordInfo: franchiseKeywordInfo,
          franchiseLabel: userFranchiseInput,
          seriesName: item.seriesName || userFranchiseInput || franchiseKeywordInfo.name || '',
        };
      }
    }

    const shouldPromptCollection = listType === 'movies' && movieCollectionInfo;
    const shouldPromptKeywords = keywordPromptContext && keywordPromptContext.entries && keywordPromptContext.entries.length;
    if (shouldPromptCollection || shouldPromptKeywords) {
      await promptAddMissingCollectionParts(listType, shouldPromptCollection ? movieCollectionInfo : null, item, keywordPromptContext);
    }
    form.reset();
    form.__selectedMetadata = null;
    delete form.dataset.selectedImdbId;
    delete form.dataset.selectedTmdbId;
    delete form.dataset.selectedAnilistId;
    delete form.dataset.selectedGoogleBookId;
    delete form.dataset.selectedGoogleIsbn;
    hideTitleSuggestions(form);
  } catch (err) {
    console.error('Unable to add item', err);
    const message = err && err.message === 'Not signed in'
      ? 'Please sign in to add items.'
      : 'Unable to add item right now. Please try again.';
    showAlert(message);
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
    tmdbId: p.id,
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

function numericSeriesOrder(value) {
  const parsed = parseSeriesOrder(value);
  return (typeof parsed === 'number' && Number.isFinite(parsed)) ? parsed : null;
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
  const googleBooksId = item.googleBooksId || item.GoogleBooksId || '';
  const title = normalizeTitleKey(item.title || item.Title || '');
  const year = sanitizeYear(item.year || item.Year || '');
  const series = normalizeTitleKey(item.seriesName || '');
  const order = item.seriesOrder !== undefined && item.seriesOrder !== null ? item.seriesOrder : null;
  return { imdbId, googleBooksId, title, year, series, order };
}

function signaturesMatch(candidate, existing) {
  if (!candidate || !existing) return false;
  if (candidate.imdbId && existing.imdbId && candidate.imdbId === existing.imdbId) {
    return true;
  }
  if (candidate.googleBooksId && existing.googleBooksId && candidate.googleBooksId === existing.googleBooksId) {
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

function parseRuntimeMinutes(value) {
  if (!value) return 0;
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, value);
  const text = String(value).toLowerCase();
  let minutes = 0;
  const hourMatch = text.match(/(\d+(?:\.\d+)?)\s*h/);
  if (hourMatch) {
    minutes += Math.round(parseFloat(hourMatch[1]) * 60);
  }
  const minuteMatch = text.match(/(\d+)\s*m/);
  if (minuteMatch) {
    minutes += parseInt(minuteMatch[1], 10);
  }
  if (!hourMatch && !minuteMatch) {
    const fallbackMatch = text.match(/(\d{2,3})/);
    if (fallbackMatch) {
      minutes += parseInt(fallbackMatch[1], 10);
    }
  }
  return Number.isFinite(minutes) && minutes > 0 ? minutes : 0;
}

function formatRuntimeDuration(totalMinutes) {
  if (!totalMinutes || totalMinutes <= 0) return '';
  const minutesPerHour = 60;
  const minutesPerDay = minutesPerHour * 24;
  const minutesPerMonth = minutesPerDay * 30;
  const minutesPerYear = minutesPerDay * 365;

  let remaining = totalMinutes;
  const years = Math.floor(remaining / minutesPerYear);
  remaining -= years * minutesPerYear;
  const months = Math.floor(remaining / minutesPerMonth);
  remaining -= months * minutesPerMonth;
  const days = Math.floor(remaining / minutesPerDay);
  remaining -= days * minutesPerDay;
  const hours = Math.floor(remaining / minutesPerHour);
  remaining -= hours * minutesPerHour;
  const minutes = remaining;

  const parts = [];
  if (years) parts.push(`${years}y`);
  if (months) parts.push(`${months}mth`);
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (minutes) parts.push(`${minutes}m`);
  return parts.join(' ');
}

function resolvePositiveNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') {
    return Number.isFinite(value) && value > 0 ? value : null;
  }
  if (typeof value === 'string') {
    const match = value.match(/(\d+(?:\.\d+)?)/);
    if (match) {
      const parsed = Number(match[1]);
      if (Number.isFinite(parsed) && parsed > 0) {
        return parsed;
      }
    }
  }
  return null;
}

function extractEpisodeCount(item) {
  if (!item) return 0;
  const candidates = [
    item.episodeCount,
    item.tvEpisodes,
    item.animeEpisodes,
    item.episodes,
  ];
  for (const candidate of candidates) {
    const value = resolvePositiveNumber(candidate);
    if (value) {
      return Math.round(value);
    }
  }
  return 0;
}

function extractEpisodeRuntimeMinutes(item, listType) {
  if (!item) return 0;
  const candidates = [
    item.episodeRuntime,
    item.tvEpisodeRuntime,
    item.animeDuration,
  ];
  for (const candidate of candidates) {
    const value = resolvePositiveNumber(candidate);
    if (value) {
      return Math.round(value);
    }
  }
  if (listType && listType !== 'movies') {
    const fallback = parseRuntimeMinutes(item.runtime);
    if (fallback > 0) {
      return fallback;
    }
  }
  return 0;
}

function estimateItemWatchMinutes(listType, item) {
  if (!item) return 0;
  if (listType === 'movies') {
    return parseRuntimeMinutes(item.runtime);
  }
  const totalEpisodes = extractEpisodeCount(item);
  const perEpisodeMinutes = extractEpisodeRuntimeMinutes(item, listType);
  if (totalEpisodes > 0 && perEpisodeMinutes > 0) {
    return totalEpisodes * perEpisodeMinutes;
  }
  const fallback = parseRuntimeMinutes(item.runtime);
  return fallback > 0 ? fallback : 0;
}

function collectWatchTimeEntries(listType, cardId, fallbackItem) {
  if (cardId && isCollapsibleList(listType)) {
    const entries = getSeriesGroupEntries(listType, cardId);
    if (entries && entries.length) {
      return entries.map(entry => entry && entry.item).filter(Boolean);
    }
  }
  return fallbackItem ? [fallbackItem] : [];
}

function buildWatchTimeChip(listType, cardId, fallbackItem) {
  const entries = collectWatchTimeEntries(listType, cardId, fallbackItem);
  if (!entries.length) return null;
  let totalMinutes = 0;
  let totalEpisodes = 0;
  entries.forEach(entry => {
    totalMinutes += estimateItemWatchMinutes(listType, entry);
    totalEpisodes += extractEpisodeCount(entry);
  });
  totalMinutes = Math.round(totalMinutes);
  if (!totalMinutes) return null;
  const chip = createEl('div', 'watch-time-chip');
  chip.appendChild(createEl('span', 'watch-time-label', { text: 'Watch time' }));
  chip.appendChild(createEl('span', 'watch-time-value', { text: formatRuntimeDuration(totalMinutes) }));
  const metaParts = [];
  if (listType !== 'movies' && totalEpisodes > 0) {
    metaParts.push(`${totalEpisodes} episode${totalEpisodes === 1 ? '' : 's'}`);
  }
  if (entries.length > 1) {
    metaParts.push(`${entries.length} entries`);
  }
  if (metaParts.length) {
    chip.appendChild(createEl('span', 'watch-time-meta', { text: `• ${metaParts.join(' • ')}` }));
  }
  return chip;
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

function hasEnglishSpokenLanguage(spokenLanguages) {
  return (Array.isArray(spokenLanguages) ? spokenLanguages : []).some(lang => {
    const iso = (lang?.iso_639_1 || '').toLowerCase();
    if (iso === 'en') return true;
    const name = (lang?.english_name || lang?.name || '').toLowerCase();
    return name.includes('english');
  });
}

function isEnglishLanguageValue(labelOrIso) {
  if (!labelOrIso) return false;
  const value = String(labelOrIso).trim().toLowerCase();
  return value === 'en' || value.startsWith('english');
}

function itemIsOriginallyEnglish(item) {
  if (!item) return false;
  if (item.originalLanguageIso && isEnglishLanguageValue(item.originalLanguageIso)) return true;
  if (item.originalLanguage && isEnglishLanguageValue(item.originalLanguage)) return true;
  return false;
}

function hasEnglishDubFlag(item) {
  if (!item) return false;
  const value = item.englishDubAvailable;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return normalized === 'yes' || normalized === 'true';
  }
  return false;
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

  const authorFromApi = metadata.Author && metadata.Author !== 'N/A' ? metadata.Author : '';
  setField('author', authorFromApi);

  const imdbIdValue = metadata.imdbID && metadata.imdbID !== 'N/A' ? metadata.imdbID : '';
  setField('imdbId', imdbIdValue);
  if (imdbIdValue) {
    setField('imdbUrl', `https://www.imdb.com/title/${imdbIdValue}/`);
  }

  const rating = metadata.imdbRating && metadata.imdbRating !== 'N/A' ? metadata.imdbRating : '';
  setField('imdbRating', rating);

  const runtime = metadata.Runtime && metadata.Runtime !== 'N/A' ? metadata.Runtime : '';
  setField('runtime', runtime);

  const episodeCountValue = metadata.Episodes !== undefined ? metadata.Episodes : (metadata.TotalEpisodes !== undefined ? metadata.TotalEpisodes : undefined);
  if (episodeCountValue !== undefined && episodeCountValue !== null && episodeCountValue !== '') {
    const normalizedEpisodes = Number(episodeCountValue);
    setField('episodeCount', Number.isFinite(normalizedEpisodes) && normalizedEpisodes > 0 ? normalizedEpisodes : episodeCountValue);
  }

  const seasonCountValue = metadata.Seasons !== undefined ? metadata.Seasons : (metadata.TotalSeasons !== undefined ? metadata.TotalSeasons : undefined);
  if (seasonCountValue !== undefined && seasonCountValue !== null && seasonCountValue !== '') {
    const normalizedSeasons = Number(seasonCountValue);
    setField('seasonCount', Number.isFinite(normalizedSeasons) && normalizedSeasons > 0 ? normalizedSeasons : seasonCountValue);
  }

  const episodeRuntimeValue = metadata.EpisodeRuntime !== undefined ? metadata.EpisodeRuntime : (metadata.RuntimePerEpisode !== undefined ? metadata.RuntimePerEpisode : undefined);
  if (episodeRuntimeValue !== undefined && episodeRuntimeValue !== null && episodeRuntimeValue !== '') {
    const runtimeMinutes = parseRuntimeMinutes(episodeRuntimeValue);
    if (runtimeMinutes > 0) {
      setField('episodeRuntime', runtimeMinutes);
    } else if (typeof episodeRuntimeValue === 'number' && Number.isFinite(episodeRuntimeValue) && episodeRuntimeValue > 0) {
      setField('episodeRuntime', episodeRuntimeValue);
    }
  }

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

  const originalLanguageIso = metadata.OriginalLanguageIso && metadata.OriginalLanguageIso !== 'N/A'
    ? metadata.OriginalLanguageIso
    : '';
  setField('originalLanguageIso', originalLanguageIso);

  if (metadata.EnglishDubAvailable !== undefined && metadata.EnglishDubAvailable !== null) {
    if (typeof metadata.EnglishDubAvailable === 'boolean') {
      setField('englishDubAvailable', metadata.EnglishDubAvailable);
    } else {
      const normalized = String(metadata.EnglishDubAvailable).trim().toLowerCase();
      setField('englishDubAvailable', normalized === 'yes' || normalized === 'true');
    }
  }

  const budgetValue = metadata.Budget && metadata.Budget !== 'N/A' ? metadata.Budget : '';
  setField('budget', budgetValue);

  const revenueValue = metadata.Revenue && metadata.Revenue !== 'N/A' ? metadata.Revenue : '';
  setField('revenue', revenueValue);

  if (metadata.AnimeEpisodes !== undefined && metadata.AnimeEpisodes !== null) {
    setField('animeEpisodes', metadata.AnimeEpisodes);
  }
  if (metadata.AnimeDuration !== undefined && metadata.AnimeDuration !== null) {
    setField('animeDuration', metadata.AnimeDuration);
  }
  if (metadata.AnimeFormat) {
    setField('animeFormat', metadata.AnimeFormat);
  }
  if (metadata.AnimeStatus) {
    setField('animeStatus', metadata.AnimeStatus);
  }
  if (Array.isArray(metadata.AnimeGenres) && metadata.AnimeGenres.length) {
    setField('animeGenres', metadata.AnimeGenres);
  }
  if (metadata.AniListUrl) {
    setField('aniListUrl', metadata.AniListUrl);
  }
  if (metadata.AniListId) {
    setField('aniListId', metadata.AniListId);
  }

  const tmdbIdValue = metadata.TmdbID && metadata.TmdbID !== 'N/A' ? metadata.TmdbID : (metadata.TmdbId || '');
  setField('tmdbId', tmdbIdValue);

  if (metadata.PageCount !== undefined && metadata.PageCount !== null && metadata.PageCount !== '') {
    setField('pageCount', metadata.PageCount);
  }
  if (Array.isArray(metadata.Categories) && metadata.Categories.length) {
    setField('bookCategories', metadata.Categories);
  }
  if (metadata.Publisher) {
    setField('publisher', metadata.Publisher);
  }
  if (metadata.PreviewLink) {
    setField('previewLink', metadata.PreviewLink);
  }
  if (metadata.GoogleBooksId) {
    setField('googleBooksId', metadata.GoogleBooksId);
  }
  if (metadata.GoogleBooksUrl) {
    setField('googleBooksUrl', metadata.GoogleBooksUrl);
  }
  if (metadata.AverageRating) {
    setField('averageRating', metadata.AverageRating);
  }
  if (metadata.isbn) {
    setField('isbn', metadata.isbn);
  }

  const effectiveTitle = (metadata.Title && metadata.Title !== 'N/A') ? metadata.Title : fallbackTitle;
  const effectiveYear = apiYear || fallbackYear;
  if (effectiveTitle) {
    const trailerUrl = buildTrailerUrl(effectiveTitle, effectiveYear);
    setField('trailerUrl', trailerUrl);
  }

  setField('metadataVersion', METADATA_SCHEMA_VERSION);

  return updates;
}

function getMissingMetadataFields(item, listType) {
  if (!item) return [];
  let criticalFields = ['poster', 'plot'];
  if (listType === 'anime') {
    criticalFields = ['poster', 'plot', 'animeEpisodes', 'animeFormat'];
  } else {
    criticalFields = ['imdbId', 'imdbUrl', 'poster', 'plot', 'actors'];
  }
  return criticalFields.filter(field => !hasMeaningfulValue(item[field]));
}

function needsMetadataRefresh(listType, item) {
  if (!item || !item.title) return false;
  if (!['movies', 'tvShows', 'anime'].includes(listType)) return false;
  if (item.metadataVersion !== METADATA_SCHEMA_VERSION) return true;
  return getMissingMetadataFields(item, listType).length > 0;
}

function shouldSkipMetadataRefresh(key) {
  if (!key) return false;
  const lastAttempt = metadataRefreshHistory.get(key);
  if (!lastAttempt) return false;
  return (Date.now() - lastAttempt) < METADATA_REFRESH_COOLDOWN_MS;
}

function refreshTmdbMetadataForItem(listType, itemId, item, missingFields = []) {
  if (!TMDB_API_KEY) {
    maybeWarnAboutTmdbKey();
    return;
  }
  const key = `${listType}:${itemId}`;
  if (metadataRefreshInflight.has(key) || shouldSkipMetadataRefresh(key)) return;
  metadataRefreshInflight.add(key);
  metadataRefreshHistory.set(key, Date.now());

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

function refreshAniListMetadataForItem(itemId, item) {
  const listType = 'anime';
  const key = `${listType}:${itemId}`;
  if (metadataRefreshInflight.has(key) || shouldSkipMetadataRefresh(key)) return;
  metadataRefreshInflight.add(key);
  metadataRefreshHistory.set(key, Date.now());
  const lookup = {
    aniListId: item.aniListId || item.anilistId || item.AniListId || '',
    title: item.title || '',
    year: item.year || '',
  };
  fetchAniListMetadata(lookup).then(metadata => {
    if (!metadata) return;
    const updates = deriveMetadataAssignments(metadata, item, {
      overwrite: false,
      fallbackTitle: item.title || '',
      fallbackYear: item.year || '',
    });
    if (Object.keys(updates).length === 0) return;
    console.debug('[MyAnimeList] Applying updates for', `${listType}:${itemId}`, updates);
    return updateItem(listType, itemId, updates);
  }).catch(err => {
    console.warn('MyAnimeList metadata refresh failed', err);
  }).finally(() => {
    metadataRefreshInflight.delete(key);
  });
}

function maybeRefreshMetadata(listType, data) {
  if (!currentUser) return;
  if (!['movies', 'tvShows', 'anime'].includes(listType)) return;
  if (listType === 'anime') {
    Object.entries(data || {}).forEach(([id, item]) => {
      if (!needsMetadataRefresh(listType, item)) return;
      refreshAniListMetadataForItem(id, item);
    });
    return;
  }

  if (!TMDB_API_KEY) {
    return;
  }

  Object.entries(data || {}).forEach(([id, item]) => {
    if (!needsMetadataRefresh(listType, item)) return;
    const missingFields = getMissingMetadataFields(item, listType);
    refreshTmdbMetadataForItem(listType, id, item, missingFields);
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
  showAlert(message);
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
  COLLAPSIBLE_LISTS.forEach(listType => updateCollapsibleCardStates(listType));
  resetUnifiedFilters();
  renderUnifiedLibrary();
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
  } else if (provider === 'anilist' || provider === 'jikan') {
    const note = document.createElement('div');
    note.className = 'suggestions-note';
    note.textContent = 'Suggestions powered by MyAnimeList via Jikan.';
    container.appendChild(note);
  } else if (provider === 'googleBooks') {
    const note = document.createElement('div');
    note.className = 'suggestions-note';
    note.textContent = 'Suggestions powered by Google Books.';
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

  const useAniList = listType === 'anime';
  const useGoogleBooks = listType === 'books';
  const hasSuggestionProvider = useAniList || useGoogleBooks || Boolean(TMDB_API_KEY);
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
    const results = useAniList
      ? await fetchAniListSuggestions(query)
      : useGoogleBooks
        ? await fetchGoogleBooksSuggestions(query)
        : await fetchTmdbSuggestions(listType, query);
    if (currentToken !== lastFetchToken) return;
    renderTitleSuggestions(suggestionsEl, results, async (suggestion) => {
      titleInput.value = suggestion.title || '';
      const suggestionYear = extractPrimaryYear(suggestion.year);
      if (yearInput && suggestionYear) {
        yearInput.value = suggestionYear;
      }
      form.__selectedMetadata = null;
      if (!useAniList && !useGoogleBooks && suggestion.imdbID) {
        form.dataset.selectedImdbId = suggestion.imdbID;
      } else if (!useAniList && !useGoogleBooks) {
        delete form.dataset.selectedImdbId;
      }
      if (!useAniList && !useGoogleBooks && suggestion.tmdbId) {
        form.dataset.selectedTmdbId = suggestion.tmdbId;
      } else if (!useAniList && !useGoogleBooks) {
        delete form.dataset.selectedTmdbId;
      }
      if (useAniList) {
        delete form.dataset.selectedImdbId;
        delete form.dataset.selectedTmdbId;
        if (suggestion.anilistId) {
          form.dataset.selectedAnilistId = suggestion.anilistId;
        } else {
          delete form.dataset.selectedAnilistId;
        }
        try {
          const detail = await fetchAniListMetadata({ aniListId: suggestion.anilistId, title: suggestion.title, year: suggestionYear });
          if (detail) {
            form.__selectedMetadata = detail;
            if (yearInput && detail.Year) {
              const detailYear = extractPrimaryYear(detail.Year);
              if (detailYear) yearInput.value = detailYear;
            }
            if (creatorInput && (!creatorInput.value || creatorInput.value === '') && detail.Director) {
              creatorInput.value = detail.Director;
            }
          }
        } catch (err) {
          console.warn('Unable to prefill MyAnimeList metadata', err);
        }
      } else if (useGoogleBooks) {
        delete form.dataset.selectedImdbId;
        delete form.dataset.selectedTmdbId;
        delete form.dataset.selectedAnilistId;
        if (suggestion.googleBooksId) {
          form.dataset.selectedGoogleBookId = suggestion.googleBooksId;
        } else {
          delete form.dataset.selectedGoogleBookId;
        }
        if (suggestion.isbn) {
          form.dataset.selectedGoogleIsbn = suggestion.isbn;
        } else {
          delete form.dataset.selectedGoogleIsbn;
        }
        try {
          const detail = await fetchGoogleBooksMetadata({
            volumeId: suggestion.googleBooksId,
            title: suggestion.title,
            author: suggestion.author,
            isbn: suggestion.isbn,
          });
          if (detail) {
            form.__selectedMetadata = detail;
            if (yearInput && detail.Year) {
              const detailYear = extractPrimaryYear(detail.Year);
              if (detailYear) yearInput.value = detailYear;
            }
            if (creatorInput && (!creatorInput.value || creatorInput.value === '') && detail.Author) {
              creatorInput.value = detail.Author;
            }
          }
        } catch (err) {
          console.warn('Unable to prefill Google Books metadata', err);
        }
      } else if (TMDB_API_KEY && suggestion.tmdbId) {
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
    delete form.dataset.selectedAnilistId;
    delete form.dataset.selectedGoogleBookId;
    delete form.dataset.selectedGoogleIsbn;
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

function teardownFormAutocomplete(form) {
  if (!form) return;
  hideTitleSuggestions(form);
  suggestionForms.delete(form);
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
  const totalEpisodes = mediaType === 'tv' ? Number(detail.number_of_episodes) || null : null;
  const totalSeasons = mediaType === 'tv' ? Number(detail.number_of_seasons) || null : null;
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
  const englishDubAvailable = hasEnglishSpokenLanguage(detail.spoken_languages);

  return {
    Title: detail.title || detail.name || '',
    Year: releaseDate ? String(releaseDate).slice(0, 4) : '',
    Director: director,
    Runtime: runtimeMinutes
      ? mediaType === 'movie'
        ? `${runtimeMinutes} min`
        : `${runtimeMinutes} min/ep`
      : '',
    Poster: poster || 'N/A',
    Plot: detail.overview || '',
    imdbID: imdbId,
    imdbRating: rating,
    Actors: cast.join(', '),
    Type: mediaType === 'movie' ? 'movie' : 'series',
    Budget: budget,
    Revenue: revenue,
    OriginalLanguage: originalLanguage,
    OriginalLanguageIso: detail.original_language || '',
    EnglishDubAvailable: englishDubAvailable,
    TmdbID: tmdbId,
    Episodes: totalEpisodes,
    Seasons: totalSeasons,
    EpisodeRuntime: runtimeMinutes || null,
  };
}

async function tmdbFetch(path, params = {}) {
  if (!TMDB_API_KEY) {
    maybeWarnAboutTmdbKey();
    throw new Error('TMDb API key missing');
  }
  const url = new URL(`${TMDB_API_BASE_URL}${path}`);
  url.searchParams.set('api_key', TMDB_API_KEY);
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    url.searchParams.set(key, value);
  });
  const resp = await fetch(url.toString());
  if (!resp.ok) {
    const err = new Error(`TMDb request failed (${resp.status})`);
    err.status = resp.status;
    try {
      err.payload = await resp.json();
    } catch (_) {
      err.body = await resp.text();
    }
    throw err;
  }
  return await resp.json();
}

function formatTmdbFranchiseEntry(item, mediaType, extras = {}) {
  if (!item) return null;
  const title = mediaType === 'tv'
    ? (item.name || item.original_name || item.title || item.original_title)
    : (item.title || item.original_title || item.name || item.original_name);
  if (!title) return null;
  const year = extractPrimaryYear(item.release_date || item.first_air_date || '');
  const poster = item.poster_path ? `${TMDB_IMAGE_BASE_URL}${item.poster_path}` : '';
  return {
    id: item.id,
    mediaType,
    title,
    year,
    poster,
    releaseDate: item.release_date || item.first_air_date || '',
    overview: item.overview || '',
    popularity: Number(item.popularity) || 0,
    voteAverage: Number(item.vote_average) || 0,
    ...extras,
  };
}

function pickBestTmdbSearchResult(results, query, mediaType) {
  if (!Array.isArray(results) || !results.length) return null;
  const normalizedQuery = normalizeTitleKey(query);
  return results.reduce((best, entry) => {
    if (!entry) return best;
    const title = mediaType === 'tv'
      ? (entry.name || entry.original_name || '')
      : (entry.title || entry.original_title || '');
    if (!title) return best;
    const normalizedTitle = normalizeTitleKey(title);
    const popularity = Number(entry.popularity) || 0;
    const voteAverage = Number(entry.vote_average) || 0;
    const exactMatch = normalizedTitle === normalizedQuery;
    const score = (exactMatch ? 1000 : 0) + popularity * 3 + voteAverage;
    if (!best || score > best.__score) {
      best = { ...entry, __score: score };
    }
    return best;
  }, null);
}

function mergeFranchiseEntrySets(targetMap, entries) {
  if (!Array.isArray(entries)) return;
  entries.forEach(entry => {
    if (!entry || !entry.id) return;
    const key = `${entry.mediaType || 'unknown'}:${entry.id}`;
    if (targetMap.has(key)) return;
    targetMap.set(key, entry);
  });
}

function buildFranchiseSeasonEntries(tvDetails) {
  if (!tvDetails || !Array.isArray(tvDetails.seasons)) return [];
  return tvDetails.seasons
    .filter(season => season && season.season_number !== undefined)
    .map(season => ({
      id: `${tvDetails.id}-season-${season.season_number}`,
      tmdbId: season.id || null,
      mediaType: 'tvSeason',
      seriesId: tvDetails.id,
      title: season.name || `Season ${season.season_number}`,
      seasonNumber: season.season_number,
      episodes: season.episode_count || null,
      year: extractPrimaryYear(season.air_date || ''),
      releaseDate: season.air_date || '',
      poster: season.poster_path ? `${TMDB_IMAGE_BASE_URL}${season.poster_path}` : '',
      overview: season.overview || '',
    }));
}

function collectRecommendationEntries(details, mediaType) {
  if (!details) return [];
  const buckets = [];
  const pushEntries = (source, relation) => {
    if (!source || !Array.isArray(source.results)) return;
    source.results.forEach(item => {
      const entry = formatTmdbFranchiseEntry(item, mediaType, {
        relation,
        relationSourceId: details.id,
      });
      if (entry) buckets.push(entry);
    });
  };
  pushEntries(details.recommendations, 'recommendation');
  pushEntries(details.similar, 'similar');
  return buckets;
}

async function searchTmdbAcrossMedia(query) {
  if (!query || !query.trim()) return { movieMatches: [], tvMatches: [] };
  const params = {
    query: query.trim(),
    include_adult: 'false',
    language: 'en-US',
  };
  const [movieResp, tvResp] = await Promise.allSettled([
    tmdbFetch('/search/movie', params),
    tmdbFetch('/search/tv', params),
  ]);
  const movieMatches = movieResp.status === 'fulfilled' && Array.isArray(movieResp.value?.results)
    ? movieResp.value.results
    : [];
  const tvMatches = tvResp.status === 'fulfilled' && Array.isArray(tvResp.value?.results)
    ? tvResp.value.results
    : [];
  return { movieMatches, tvMatches };
}

async function fetchTmdbFranchiseDetails(mediaType, id) {
  if (!id) return null;
  const append = 'credits,external_ids,recommendations,similar';
  try {
    const payload = await tmdbFetch(`/${mediaType}/${id}`, { append_to_response: append });
    return payload || null;
  } catch (err) {
    console.warn('Unable to fetch TMDb franchise details', mediaType, id, err);
    return null;
  }
}

async function fetchTmdbCollectionMovies(collectionId) {
  if (!collectionId) return [];
  try {
    const payload = await tmdbFetch(`/collection/${collectionId}`);
    if (!payload || !Array.isArray(payload.parts)) return [];
    return payload.parts
      .map((part, index) => formatTmdbFranchiseEntry(part, 'movie', {
        collectionId: payload.id,
        collectionName: payload.name || '',
        collectionOrder: typeof part.order === 'number' ? part.order : index + 1,
      }))
      .filter(Boolean);
  } catch (err) {
    console.warn('Unable to fetch TMDb collection entries', collectionId, err);
    return [];
  }
}

async function fetchTmdbFranchise(query) {
  const sanitizedQuery = (query || '').trim();
  if (!sanitizedQuery) return null;
  if (!TMDB_API_KEY) {
    maybeWarnAboutTmdbKey();
    throw new Error('TMDb API key missing');
  }

  const franchise = {
    query: sanitizedQuery,
    mainMovie: null,
    mainTV: null,
    collectionMovies: [],
    tvSeasons: [],
    connectedUniverse: [],
    allEntriesFlat: [],
  };

  const allEntryMap = new Map();

  try {
    const { movieMatches, tvMatches } = await searchTmdbAcrossMedia(sanitizedQuery);
    const bestMovie = pickBestTmdbSearchResult(movieMatches, sanitizedQuery, 'movie');
    const bestTv = pickBestTmdbSearchResult(tvMatches, sanitizedQuery, 'tv');

    if (bestMovie && bestMovie.id) {
      const movieDetails = await fetchTmdbFranchiseDetails('movie', bestMovie.id);
      if (movieDetails) {
        franchise.mainMovie = formatTmdbFranchiseEntry(movieDetails, 'movie', {
          runtime: movieDetails.runtime || null,
          releaseDate: movieDetails.release_date || '',
          imdbId: movieDetails.imdb_id || '',
          collectionId: movieDetails.belongs_to_collection?.id || null,
          collectionName: movieDetails.belongs_to_collection?.name || '',
        });
        if (franchise.mainMovie) mergeFranchiseEntrySets(allEntryMap, [franchise.mainMovie]);

        if (movieDetails.belongs_to_collection?.id) {
          const collectionEntries = await fetchTmdbCollectionMovies(movieDetails.belongs_to_collection.id);
          franchise.collectionMovies = collectionEntries;
          mergeFranchiseEntrySets(allEntryMap, collectionEntries);
        }

        const movieRelated = collectRecommendationEntries(movieDetails, 'movie');
        franchise.connectedUniverse.push(...movieRelated);
        mergeFranchiseEntrySets(allEntryMap, movieRelated);
      }
    }

    if (bestTv && bestTv.id) {
      const tvDetails = await fetchTmdbFranchiseDetails('tv', bestTv.id);
      if (tvDetails) {
        franchise.mainTV = formatTmdbFranchiseEntry(tvDetails, 'tv', {
          seasonsCount: Array.isArray(tvDetails.seasons) ? tvDetails.seasons.length : 0,
          firstAirDate: tvDetails.first_air_date || '',
          lastAirDate: tvDetails.last_air_date || '',
          episodeRunTime: Array.isArray(tvDetails.episode_run_time) ? tvDetails.episode_run_time[0] : null,
        });
        if (franchise.mainTV) mergeFranchiseEntrySets(allEntryMap, [franchise.mainTV]);

        const seasons = buildFranchiseSeasonEntries(tvDetails);
        franchise.tvSeasons = seasons;
        seasons.forEach(season => {
          const key = `tvSeason:${season.id}`;
          if (!allEntryMap.has(key)) {
            allEntryMap.set(key, season);
          }
        });

        const tvRelated = collectRecommendationEntries(tvDetails, 'tv');
        franchise.connectedUniverse.push(...tvRelated);
        mergeFranchiseEntrySets(allEntryMap, tvRelated);
      }
    }

    const uniqueUniverse = new Map();
    franchise.connectedUniverse.forEach(entry => {
      if (!entry || !entry.id) return;
      if (franchise.mainMovie && entry.mediaType === 'movie' && entry.id === franchise.mainMovie.id) return;
      if (franchise.mainTV && entry.mediaType === 'tv' && entry.id === franchise.mainTV.id) return;
      if (franchise.collectionMovies.some(movie => movie.id === entry.id && entry.mediaType === 'movie')) return;
      const key = `${entry.mediaType}:${entry.id}`;
      if (!uniqueUniverse.has(key)) uniqueUniverse.set(key, entry);
    });
    franchise.connectedUniverse = Array.from(uniqueUniverse.values());

    franchise.allEntriesFlat = Array.from(allEntryMap.values());
    return franchise;
  } catch (err) {
    console.warn('Unable to build TMDb franchise payload', err);
    throw err;
  }
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
  const btnClass = 'meta-link watch-now-trigger';
  const btn = createEl('button', btnClass, { text: 'Watch Now' });
  btn.type = 'button';
  block.appendChild(btn);

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
    showAlert('Not signed in');
    return Promise.reject(new Error('Not signed in'));
  }
  const itemRef = ref(db, `users/${currentUser.uid}/${listType}/${itemId}`);
  return update(itemRef, changes);
}

async function moveItemBetweenLists(sourceListType, targetListType, itemId, itemData) {
  if (!currentUser) {
    showAlert('Not signed in');
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
  const targetRef = ref(db, `users/${currentUser.uid}/${targetListType}/${itemId}`);
  await set(targetRef, cleaned);
  const sourceRef = ref(db, `users/${currentUser.uid}/${sourceListType}/${itemId}`);
  await remove(sourceRef);
}

// Delete an item
function deleteItem(listType, itemId) {
  if (!currentUser) {
    showAlert('Not signed in');
    return Promise.reject(new Error('Not signed in'));
  }
  if (!confirm('Delete this item?')) return;
  if (listType === 'anime' && listCaches[listType] && listCaches[listType][itemId]) {
    const target = listCaches[listType][itemId];
    const aniListId = getAniListIdFromItem(target);
    if (aniListId) {
      rememberIgnoredAniListId(aniListId);
    }
  }
  const itemRef = ref(db, `users/${currentUser.uid}/${listType}/${itemId}`);
  remove(itemRef).catch(err => console.error('Delete failed', err));
}

async function deleteSeriesEntries(listType, seriesName) {
  if (!SERIES_BULK_DELETE_LISTS.has(listType)) return;
  if (!currentUser) {
    showAlert('Not signed in');
    return;
  }
  if (!seriesName) {
    showAlert('Series name missing for bulk delete.');
    return;
  }
  const normalized = normalizeTitleKey(seriesName);
  if (!normalized) {
    showAlert('Unable to determine which series to delete.');
    return;
  }
  const entries = Object.entries(listCaches[listType] || {}).filter(([, item]) => normalizeTitleKey(item?.seriesName || '') === normalized);
  if (!entries.length) {
    showAlert(`No entries found for "${seriesName}".`);
    return;
  }
  const confirmed = confirm(`Delete all ${entries.length} entries in the "${seriesName}" series? This cannot be undone.`);
  if (!confirmed) return;
  const removals = entries.map(([id]) => {
    const itemRef = ref(db, `users/${currentUser.uid}/${listType}/${id}`);
    return remove(itemRef).catch(err => {
      console.error('Series delete failed', listType, id, err);
      throw err;
    });
  });
  try {
    await Promise.all(removals);
    showAlert(`Deleted ${entries.length} entr${entries.length === 1 ? 'y' : 'ies'} from "${seriesName}".`);
  } catch (err) {
    showAlert('Some entries could not be deleted. Please try again.');
  }
}

// Open a small modal to edit
function openEditModal(listType, itemId, item) {
  if (!modalRoot) return;
  closeAddModal();
  closeWheelModal();
  modalRoot.innerHTML = '';
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  const modal = document.createElement('div');
  modal.className = 'modal';

  const form = document.createElement('form');
  const typeSelect = document.createElement('select');
  typeSelect.name = 'listType';
  PRIMARY_LIST_TYPES.forEach(type => {
    const option = document.createElement('option');
    option.value = type;
    option.textContent = MEDIA_TYPE_LABELS[type] || type;
    if (type === listType) option.selected = true;
    typeSelect.appendChild(option);
  });
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
  creatorInput.name = 'creator';
  const creatorPlaceholderMap = {
    movies: 'Director',
    tvShows: 'Director / Showrunner',
    anime: 'Director / Studio',
    books: 'Author',
  };
  creatorInput.placeholder = creatorPlaceholderMap[listType] || 'Creator';
  creatorInput.value = listType === 'books' ? (item.author || '') : (item.director || '');
  const seriesNameInput = document.createElement('input');
  seriesNameInput.name = 'seriesName';
  seriesNameInput.placeholder = 'Series name (optional)';
  seriesNameInput.value = item.seriesName || '';
  const seriesOrderInput = document.createElement('input');
  seriesOrderInput.name = 'seriesOrder';
  seriesOrderInput.placeholder = 'Series order';
  seriesOrderInput.inputMode = 'numeric';
  seriesOrderInput.pattern = '[0-9]{1,3}';
  seriesOrderInput.value = item.seriesOrder !== undefined && item.seriesOrder !== null ? item.seriesOrder : '';
  const notesInput = document.createElement('textarea');
  notesInput.name = 'notes';
  notesInput.value = item.notes || '';
  const saveBtn = document.createElement('button');
  saveBtn.className = 'btn primary';
  saveBtn.textContent = 'Save';
  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'btn secondary';
  cancelBtn.textContent = 'Cancel';
  const refreshBtn = document.createElement('button');
  refreshBtn.className = 'btn ghost';
  refreshBtn.type = 'button';
  refreshBtn.textContent = 'Refresh Metadata';

  form.appendChild(typeSelect);
  form.appendChild(titleInput);
  form.appendChild(yearInput);
  form.appendChild(creatorInput);
  form.appendChild(seriesNameInput);
  form.appendChild(seriesOrderInput);
  form.appendChild(notesInput);
  const controls = document.createElement('div');
  controls.style.display = 'flex'; controls.style.gap = '.5rem'; controls.style.justifyContent = 'flex-end';
  controls.appendChild(refreshBtn);
  controls.appendChild(cancelBtn);
  controls.appendChild(saveBtn);
  form.appendChild(controls);

  function applyTypeUiState(selectedType) {
    const placeholder = creatorPlaceholderMap[selectedType] || 'Creator';
    creatorInput.placeholder = placeholder;
    const isBook = selectedType === 'books';
    seriesNameInput.hidden = isBook;
    seriesOrderInput.hidden = isBook;
  }

  applyTypeUiState(listType);
  typeSelect.addEventListener('change', () => {
    applyTypeUiState(typeSelect.value);
  });

  refreshBtn.addEventListener('click', () => {
    const lookupTitle = (titleInput.value || '').trim();
    const lookupYear = sanitizeYear((yearInput.value || '').trim());
    refreshItemMetadata(listType, itemId, item, {
      title: lookupTitle,
      year: lookupYear,
      button: refreshBtn,
    });
  });

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const newTitle = (titleInput.value || '').trim();
    if (!newTitle) {
      showAlert('Title is required');
      return;
    }
    const updatedYear = sanitizeYear((yearInput.value || '').trim());
    const creatorVal = (creatorInput.value || '').trim();
    const targetListType = typeSelect.value;
    const isBooksTarget = targetListType === 'books';
    const payload = {
      title: newTitle,
      notes: (notesInput.value || '').trim() || null,
      year: updatedYear || null,
    };
    if (isBooksTarget) {
      payload.author = creatorVal || null;
      payload.director = null;
      payload.seriesName = null;
      payload.seriesOrder = null;
    } else {
      payload.director = creatorVal || null;
      payload.author = null;
      const seriesNameVal = seriesNameInput.value ? seriesNameInput.value.trim() : '';
      const seriesOrderValRaw = seriesOrderInput.value ? seriesOrderInput.value.trim() : '';
      const normalizedSeriesOrder = sanitizeSeriesOrder(seriesOrderValRaw);
      payload.seriesName = seriesNameVal || null;
      payload.seriesOrder = normalizedSeriesOrder !== null ? normalizedSeriesOrder : null;
    }

    setButtonBusy(saveBtn, true);
    saveBtn.textContent = 'Saving...';
    try {
      if (targetListType === listType) {
        await updateItem(listType, itemId, payload);
      } else {
        const transferData = { ...item, ...payload };
        transferData.createdAt = transferData.createdAt || Date.now();
        await moveItemBetweenLists(listType, targetListType, itemId, transferData);
      }
      closeModal();
    } catch (err) {
      console.error('Edit save failed', err);
      showAlert('Unable to save changes right now. Please try again.');
    } finally {
      setButtonBusy(saveBtn, false);
    }
  });

  cancelBtn.addEventListener('click', (ev) => { ev.preventDefault(); closeModal(); });

  modal.appendChild(form);
  backdrop.appendChild(modal);
  modalRoot.appendChild(backdrop);

  function closeModal() { modalRoot.innerHTML = ''; }
}

async function refreshItemMetadata(listType, itemId, item, options = {}) {
  const supported = new Set(['movies', 'tvShows', 'anime', 'books']);
  if (!supported.has(listType)) {
    showAlert('Metadata refresh is only available for movies, TV, anime, or books.');
    return;
  }
  const { title = '', year = '', button = null } = options;
  const lookupTitle = title || item.title || '';
  const lookupYear = year || item.year || '';

  const setButtonState = (isBusy) => {
    if (!button) return;
    if (isBusy) {
      if (!button.dataset.originalText) {
        button.dataset.originalText = button.textContent || '';
      }
      button.disabled = true;
      button.textContent = 'Refreshing...';
    } else {
      button.disabled = false;
      if (button.dataset.originalText) {
        button.textContent = button.dataset.originalText;
        delete button.dataset.originalText;
      }
    }
  };

  setButtonState(true);
  try {
    let metadata = null;
    if (listType === 'anime') {
      metadata = await fetchAniListMetadata({
        aniListId: getAniListIdFromItem(item),
        title: lookupTitle,
        year: lookupYear,
      });
    } else if (listType === 'books') {
      metadata = await fetchGoogleBooksMetadata({
        volumeId: item.googleBooksId || '',
        title: lookupTitle,
        author: item.author || '',
        isbn: item.isbn || '',
      });
    } else {
      if (!TMDB_API_KEY) {
        maybeWarnAboutTmdbKey();
        showAlert('TMDb metadata refresh requires an API key.');
        return;
      }
      metadata = await fetchTmdbMetadata(listType, {
        title: lookupTitle,
        year: lookupYear,
        imdbId: item.imdbId || item.imdbID || '',
        tmdbId: item.tmdbId || item.tmdbID || '',
      });
    }

    if (!metadata) {
      showAlert('No metadata found for this title.');
      return;
    }

    const updates = deriveMetadataAssignments(metadata, item, {
      overwrite: true,
      fallbackTitle: lookupTitle,
      fallbackYear: lookupYear,
    });

    if (!updates || Object.keys(updates).length === 0) {
      showAlert('Metadata already looks up to date.');
      return;
    }

    await updateItem(listType, itemId, updates);
    Object.assign(item, updates);
    showAlert('Metadata refreshed!');
  } catch (err) {
    console.error('Manual metadata refresh failed', err);
    showAlert('Unable to refresh metadata right now. Please try again.');
  } finally {
    setButtonState(false);
  }
}

// --- Sequel / Prequel Lookup Logic (TMDb only) ---

function buildRelatedModal(currentItem, related) {
  if (!modalRoot) return;
  closeAddModal();
  closeWheelModal();
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
  showAlert('No related titles found on TMDb.');
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

// tmEasterEgg.bindTriggers();
function bootstrapUnifiedLibraryUi() {
  initUnifiedLibraryControls();
  renderUnifiedLibrary();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrapUnifiedLibraryUi, { once: true });
} else {
  bootstrapUnifiedLibraryUi();
}

function updateListStats(listType, entries) {
  const statsEl = document.getElementById(`${listType}-stats`);
  if (!statsEl) return;
  const count = Array.isArray(entries) ? entries.length : 0;
  const nounMap = {
    movies: 'movie',
    tvShows: 'show',
    anime: 'anime',
    books: 'item',
  };
  const noun = nounMap[listType] || 'item';
  const label = `${count} ${noun}${count === 1 ? '' : 's'}`;
  const watchTimeEligible = ['movies', 'tvShows', 'anime'].includes(listType);
  if (watchTimeEligible) {
    const totalMinutes = (Array.isArray(entries) ? entries : []).reduce((sum, [, item]) => {
      return sum + estimateItemWatchMinutes(listType, item);
    }, 0);
    const runtimeLabel = totalMinutes > 0
      ? `${formatRuntimeDuration(totalMinutes)} total watch time`
      : 'Watch time unavailable';
    statsEl.textContent = `${label} • ${runtimeLabel}`;
    return;
  }
  statsEl.textContent = label;
}

function sanitizeAniListDescription(text) {
  if (!text) return '';
  const normalized = text.replace(/<br\s*\/?>(\s|$)/gi, '\n');
  const container = document.createElement('div');
  container.innerHTML = normalized;
  const stripped = container.textContent || container.innerText || '';
  return stripped.replace(/\s+\n/g, '\n').replace(/\n{2,}/g, '\n\n').trim();
}

function pickAnimeTitle(source = {}) {
  if (!source) return '';
  if (typeof source === 'string') return source;
  const seen = new Set();
  const candidates = [];
  const pushCandidate = (value) => {
    const trimmed = typeof value === 'string' ? value.trim() : '';
    if (!trimmed || seen.has(trimmed)) return;
    seen.add(trimmed);
    candidates.push(trimmed);
  };
  if (typeof source.title === 'string') pushCandidate(source.title);
  if (source.titleEnglish) pushCandidate(source.titleEnglish);
  if (source.title_english) pushCandidate(source.title_english);
  if (source.title_japanese) pushCandidate(source.title_japanese);
  if (typeof source.name === 'string') pushCandidate(source.name);
  if (Array.isArray(source.titles)) {
    source.titles.forEach(entry => {
      if (entry && entry.title) pushCandidate(entry.title);
    });
  }
  if (source.english) pushCandidate(source.english);
  if (source.romaji) pushCandidate(source.romaji);
  if (source.native) pushCandidate(source.native);
  if (typeof source === 'object' && source.title && typeof source.title === 'object') {
    pushCandidate(source.title.english);
    pushCandidate(source.title.romaji);
    pushCandidate(source.title.native);
  }
  return candidates[0] || '';
}

function formatAnimeStatusLabel(value) {
  if (!value) return '';
  const normalized = String(value).toUpperCase();
  const lookup = {
    FINISHED: 'Finished',
    RELEASING: 'Releasing',
    NOT_YET_RELEASED: 'Coming Soon',
    CANCELLED: 'Cancelled',
    HIATUS: 'Hiatus'
  };
  return lookup[normalized] || value.toString().replace(/_/g, ' ').replace(/\b\w/g, ch => ch.toUpperCase());
}

function normalizeAnimeStatus(value) {
  if (!value) return '';
  const raw = String(value).trim().toUpperCase().replace(/\s+/g, '_');
  const mapping = {
    FINISHED_AIRING: 'FINISHED',
    CURRENTLY_AIRING: 'RELEASING',
    NOT_YET_AIRED: 'NOT_YET_RELEASED',
  };
  return mapping[raw] || raw || '';
}

function extractAnimeYear(media) {
  if (!media) return '';
  if (media.year) return String(media.year);
  if (media.seasonYear) return String(media.seasonYear);
  if (media.startDate && media.startDate.year) return String(media.startDate.year);
  if (media.aired && media.aired.from) return extractPrimaryYear(media.aired.from);
  if (media.releaseDate) return extractPrimaryYear(media.releaseDate);
  return '';
}

function extractAnimeDurationMinutes(media) {
  if (!media) return '';
  if (typeof media.duration === 'number' && Number.isFinite(media.duration)) {
    return media.duration;
  }
  if (typeof media.averageEpisodeDuration === 'number' && Number.isFinite(media.averageEpisodeDuration)) {
    return media.averageEpisodeDuration;
  }
  if (typeof media.duration === 'string') {
    const match = media.duration.match(/(\d+)/);
    if (match) {
      const value = Number(match[1]);
      if (Number.isFinite(value)) return value;
    }
  }
  if (typeof media.durationMinutes === 'number' && Number.isFinite(media.durationMinutes)) {
    return media.durationMinutes;
  }
  return '';
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function scheduleJikanForcedCooldown(durationMs) {
  if (!Number.isFinite(durationMs) || durationMs <= 0) return;
  const target = Date.now() + durationMs;
  if (target > jikanForcedCooldownUntil) {
    jikanForcedCooldownUntil = target;
  }
}

function parseRetryAfterMs(value) {
  if (!value) return 0;
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) {
    return numeric * 1000;
  }
  const timestamp = Date.parse(value);
  if (!Number.isNaN(timestamp)) {
    const diff = timestamp - Date.now();
    if (diff > 0) {
      return diff;
    }
  }
  return 0;
}

function pruneJikanRateWindows(now) {
  while (jikanSecondWindow.length && (now - jikanSecondWindow[0]) >= JIKAN_SECOND_WINDOW_MS) {
    jikanSecondWindow.shift();
  }
  while (jikanMinuteWindow.length && (now - jikanMinuteWindow[0]) >= JIKAN_MINUTE_WINDOW_MS) {
    jikanMinuteWindow.shift();
  }
}

function millisecondsUntilNextJikanSlot(now) {
  let wait = JIKAN_RATE_LIMIT_MIN_INTERVAL_MS;
  if (jikanSecondWindow.length >= JIKAN_MAX_REQUESTS_PER_SECOND) {
    const oldest = jikanSecondWindow[0];
    wait = Math.max(wait, Math.max(0, JIKAN_SECOND_WINDOW_MS - (now - oldest)));
  }
  if (jikanMinuteWindow.length >= JIKAN_MAX_REQUESTS_PER_MINUTE) {
    const oldestMinute = jikanMinuteWindow[0];
    wait = Math.max(wait, Math.max(0, JIKAN_MINUTE_WINDOW_MS - (now - oldestMinute)));
  }
  return Math.max(wait, 50);
}

async function acquireJikanRateLimitSlot() {
  while (true) {
    const now = Date.now();
    if (jikanForcedCooldownUntil > now) {
      await delay(jikanForcedCooldownUntil - now);
      continue;
    }
    pruneJikanRateWindows(now);
    const underSecond = jikanSecondWindow.length < JIKAN_MAX_REQUESTS_PER_SECOND;
    const underMinute = jikanMinuteWindow.length < JIKAN_MAX_REQUESTS_PER_MINUTE;
    if (underSecond && underMinute) {
      jikanSecondWindow.push(now);
      jikanMinuteWindow.push(now);
      return;
    }
    const waitMs = millisecondsUntilNextJikanSlot(now);
    await delay(waitMs);
  }
}

async function withJikanRateLimit(fn) {
  if (typeof fn !== 'function') return null;
  const task = jikanRateLimiterTail.then(async () => {
    await acquireJikanRateLimitSlot();
    try {
      return await fn();
    } finally {
      lastJikanRequestTimestamp = Date.now();
    }
  });
  jikanRateLimiterTail = task.catch(() => {});
  return task;
}

function notifyJikanRateLimit() {
  const now = Date.now();
  if (now - lastJikanRateLimitNotice < 30000) return;
  lastJikanRateLimitNotice = now;
  console.warn('Jikan rate limit encountered, backing off');
}

function notifyJikanNetworkIssue(message) {
  const now = Date.now();
  if (now - lastJikanNetworkIssueNotice < 30000) return;
  lastJikanNetworkIssueNotice = now;
  console.warn('Jikan network issue', message || '');
}

async function fetchJikanJson(path, params = {}) {
  let attempt = 0;
  while (attempt <= JIKAN_MAX_RETRIES) {
    const result = await withJikanRateLimit(() => performJikanFetch(path, params));
    if (result && result.ok) {
      return result;
    }
    if (result && result.status === 429) {
      notifyJikanRateLimit();
      const retryAfterMs = Math.max(
        result.retryAfterMs || 0,
        JIKAN_DEFAULT_RETRY_AFTER_MS,
        JIKAN_RATE_LIMIT_BACKOFF_MS * (attempt + 1)
      );
      scheduleJikanForcedCooldown(retryAfterMs);
      if (attempt < JIKAN_MAX_RETRIES) {
        await delay(retryAfterMs);
        attempt++;
        continue;
      }
    }
    if ((!result || result.status === 0) && attempt < JIKAN_MAX_RETRIES) {
      notifyJikanNetworkIssue(result?.message);
      await delay(400 * (attempt + 1));
      attempt++;
      continue;
    }
    return result;
  }
  return { ok: false, status: 0, data: null, message: 'Max retries reached' };
}

async function performJikanFetch(path, params = {}) {
  try {
    const url = new URL(`${JIKAN_API_BASE_URL}${path}`);
    Object.entries(params || {}).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '') return;
      url.searchParams.set(key, value);
    });
    const resp = await fetch(url.toString(), {
      headers: { 'Accept': 'application/json' },
    });
    const contentType = resp.headers.get('content-type') || '';
    const isJson = contentType.includes('application/json');
    const retryAfterMs = parseRetryAfterMs(resp.headers.get('retry-after'));
    let payload = null;
    try {
      payload = isJson ? await resp.json() : await resp.text();
    } catch (_) {
      payload = null;
    }
    if (!resp.ok) {
      if (resp.status === 404) {
        console.info('Jikan request not found', path);
      } else {
        console.warn('Jikan request failed', resp.status, path, payload);
      }
      return {
        ok: false,
        status: resp.status,
        data: payload,
        message: extractJikanErrorMessage(payload),
        retryAfterMs,
      };
    }
    return {
      ok: true,
      status: resp.status,
      data: payload,
      retryAfterMs,
    };
  } catch (err) {
    console.warn('Jikan request error', err);
    return {
      ok: false,
      status: 0,
      data: null,
      message: err?.message || 'Network error',
    };
  }
}

function extractJikanErrorMessage(payload) {
  if (!payload) return '';
  if (typeof payload === 'string') return payload;
  if (typeof payload.message === 'string') return payload.message;
  if (typeof payload.error === 'string') return payload.error;
  return '';
}

async function fetchJikanAnimeDetails(id) {
  const numericId = Number(id);
  if (!Number.isFinite(numericId) || numericId <= 0) return null;
  if (jikanNotFoundAnimeIds.has(numericId)) {
    return null;
  }
  const response = await fetchJikanJson(`/anime/${numericId}/full`);
  if (!response || !response.ok || !response.data) {
    if (response && response.status === 404) {
      jikanNotFoundAnimeIds.add(numericId);
    }
    return null;
  }
  const payload = response.data;
  return payload && payload.data ? payload.data : null;
}

async function fetchJikanAnimeSearch(query, limit = 10) {
  if (!query || query.length < 2) return [];
  const response = await fetchJikanJson('/anime', {
    q: query,
    limit: String(limit),
    order_by: 'score',
    sort: 'desc',
    sfw: 'true',
  });
  const data = response && response.ok ? response.data : null;
  if (!data || !Array.isArray(data.data)) return [];
  return data.data;
}

async function fetchAniListSuggestions(query) {
  const entries = await fetchJikanAnimeSearch(query, 10);
  if (!entries.length) return [];
  return entries.map(anime => ({
    source: 'jikan',
    title: pickAnimeTitle(anime),
    year: anime.year || extractPrimaryYear(anime.aired?.from || ''),
    anilistId: anime.mal_id,
    format: anime.type || '',
    episodes: anime.episodes || null,
    poster: anime.images?.jpg?.image_url || anime.images?.webp?.image_url || '',
  })).filter(entry => entry.title);
}

async function fetchAniListMetadata(lookup = {}) {
  if (!lookup) return null;
  let anime = null;
  if (lookup.aniListId) {
    anime = await fetchJikanAnimeDetails(lookup.aniListId);
  }
  if (!anime && lookup.title) {
    const params = {
      q: lookup.title,
      limit: '5',
      order_by: 'score',
      sort: 'desc',
      sfw: 'true',
    };
    if (lookup.year) {
      const year = sanitizeYear(lookup.year);
      if (year) {
        params.start_date = `${year}-01-01`;
        params.end_date = `${year}-12-31`;
      }
    }
    const response = await fetchJikanJson('/anime', params);
    const payload = response && response.ok ? response.data : null;
    if (payload && Array.isArray(payload.data) && payload.data.length) {
      anime = await fetchJikanAnimeDetails(payload.data[0].mal_id);
    }
  }
  if (!anime) return null;
  return mapAniListMediaToMetadata(anime);
}

function mapAniListMediaToMetadata(media) {
  if (!media) return null;
  const studioNodes = Array.isArray(media.studios?.nodes)
    ? media.studios.nodes
    : Array.isArray(media.studios)
      ? media.studios
      : [];
  const studioNames = studioNodes
    .map(node => {
      if (!node) return '';
      if (typeof node === 'string') return node;
      return node.name || '';
    })
    .filter(Boolean);
  const description = sanitizeAniListDescription(media.description || media.synopsis || '');
  const cover = media.coverImage?.extraLarge
    || media.coverImage?.large
    || media.images?.jpg?.large_image_url
    || media.images?.jpg?.image_url
    || media.images?.webp?.large_image_url
    || media.images?.webp?.image_url
    || '';
  const durationMinutes = extractAnimeDurationMinutes(media);
  const runtime = durationMinutes ? `${durationMinutes} min/ep` : '';
  const genreBuckets = [];
  ['genres', 'themes', 'demographics'].forEach(key => {
    const list = Array.isArray(media[key]) ? media[key] : [];
    list.forEach(entry => {
      if (entry && entry.name) genreBuckets.push(entry.name);
    });
  });
  const englishDubAvailable = Array.isArray(media.licensors) && media.licensors.length > 0;
  const normalizedStatus = normalizeAnimeStatus(media.status);
  const year = extractAnimeYear(media);
  const malId = media.mal_id || media.id || '';
  const malUrl = media.url || (malId ? `${MYANIMELIST_ANIME_URL}/${malId}` : '');
  const imdbRating = media.score ? parseFloat(media.score).toFixed(1) : (media.averageScore ? (media.averageScore / 10).toFixed(1) : '');

  return {
    Title: pickAnimeTitle(media.title || media),
    Year: year,
    Director: studioNames.join(', '),
    Runtime: runtime,
    Poster: cover || 'N/A',
    Plot: description,
    imdbID: '',
    imdbRating,
    Actors: '',
    Type: 'anime',
    OriginalLanguage: 'Japanese',
    OriginalLanguageIso: 'ja',
    EnglishDubAvailable: englishDubAvailable,
    AnimeEpisodes: media.episodes || '',
    AnimeDuration: durationMinutes || '',
    AnimeFormat: media.format || media.type || '',
    AnimeStatus: normalizedStatus,
    AnimeGenres: genreBuckets,
    AniListUrl: malUrl,
    AniListId: malId,
  };
}

function isSupportedAnimeRelationType(value) {
  if (!value) return false;
  return ANIME_FRANCHISE_RELATION_TYPES.has(normalizeAnimeRelationType(value));
}

function normalizeAnimeRelationType(value) {
  if (!value) return '';
  return String(value).trim().toUpperCase().replace(/\s+/g, '_');
}

function isSupportedAnimeFormat(format) {
  if (!format) return false;
  return ANIME_FRANCHISE_ALLOWED_FORMATS.has(String(format).toUpperCase());
}

function getAnimeFormatPriority(format) {
  const normalized = String(format || '').toUpperCase();
  switch (normalized) {
    case 'TV': return 1;
    case 'TV_SHORT': return 2;
    case 'ONA': return 3;
    case 'OVA': return 4;
    case 'MOVIE': return 5;
    case 'SPECIAL': return 6;
    default: return 9;
  }
}

function compareAnimeFranchiseEntries(a, b) {
  const yearA = Number.isFinite(a?.year) ? a.year : 9999;
  const yearB = Number.isFinite(b?.year) ? b.year : 9999;
  if (yearA !== yearB) return yearA - yearB;
  const depthA = Number.isFinite(a?.depth) ? a.depth : 99;
  const depthB = Number.isFinite(b?.depth) ? b.depth : 99;
  if (depthA !== depthB) return depthA - depthB;
  const formatDiff = getAnimeFormatPriority(a?.format) - getAnimeFormatPriority(b?.format);
  if (formatDiff !== 0) return formatDiff;
  const titleA = (a?.title || '').toLowerCase();
  const titleB = (b?.title || '').toLowerCase();
  if (titleA < titleB) return -1;
  if (titleA > titleB) return 1;
  return 0;
}

function stripAnimeSeasonSuffix(title) {
  if (!title) return '';
  return title
    .replace(/\s+(Season|Cour|Part)\s+\d+$/i, '')
    .replace(/\s+(I{2,4}|V|VI{0,3})$/i, '')
    .trim();
}

function deriveAnimeSeriesName(entries, preferred) {
  const manual = (preferred || '').trim();
  if (manual) return manual;
  const root = entries.find(entry => entry.depth === 0 && entry.title);
  if (root) {
    const trimmed = stripAnimeSeasonSuffix(root.title);
    return trimmed || root.title;
  }
  const fallback = entries[0]?.title || '';
  const trimmedFallback = stripAnimeSeasonSuffix(fallback);
  return trimmedFallback || fallback || 'Franchise';
}

async function fetchAniListMediaWithRelations(aniListId) {
  return fetchJikanAnimeDetails(aniListId);
}

function mapAniListMediaToFranchiseEntry(media, relationType, depth) {
  if (!media) return null;
  const title = pickAnimeTitle(media.title || media);
  if (!title) return null;
  const yearString = extractAnimeYear(media);
  const yearValue = yearString ? Number(yearString) : null;
  const malId = media.mal_id || media.id || null;
  const cover = media.coverImage?.extraLarge
    || media.coverImage?.large
    || media.images?.jpg?.large_image_url
    || media.images?.jpg?.image_url
    || media.images?.webp?.large_image_url
    || media.images?.webp?.image_url
    || '';
  return {
    aniListId: malId,
    title,
    year: Number.isFinite(yearValue) ? yearValue : null,
    format: media.format || media.type || '',
    episodes: media.episodes || null,
    duration: extractAnimeDurationMinutes(media) || null,
    status: normalizeAnimeStatus(media.status),
    siteUrl: media.url || (malId ? `${MYANIMELIST_ANIME_URL}/${malId}` : ''),
    cover,
    relationType: relationType || '',
    depth: depth || 0,
  };
}

async function fetchAniListFranchisePlan({ aniListId, preferredSeriesName } = {}) {
  if (!aniListId) return null;
  const rootId = Number(aniListId);
  if (!Number.isFinite(rootId) || rootId <= 0) return null;
  const queue = [{ id: rootId, depth: 0, relationType: 'ROOT' }];
  const seen = new Set();
  const mediaCache = new Map();
  const entries = [];

  while (queue.length && entries.length < ANIME_FRANCHISE_MAX_ENTRIES) {
    const current = queue.shift();
    if (!current || seen.has(current.id)) continue;
    let media = mediaCache.get(current.id);
    if (!media) {
      media = await fetchAniListMediaWithRelations(current.id);
      if (!media) continue;
      mediaCache.set(current.id, media);
    }
    seen.add(current.id);
    const entry = mapAniListMediaToFranchiseEntry(media, current.relationType, current.depth);
    if (entry) entries.push(entry);
    if (current.depth >= ANIME_FRANCHISE_MAX_DEPTH) continue;
    const relationGroups = Array.isArray(media.relations) ? media.relations : [];
    relationGroups.forEach(group => {
      const normalizedRelation = normalizeAnimeRelationType(group?.relation || group?.relationType || '');
      if (!isSupportedAnimeRelationType(normalizedRelation)) return;
      const nodes = Array.isArray(group.entry) ? group.entry : Array.isArray(group.edges) ? group.edges.map(edge => edge?.node) : [];
      nodes.forEach(node => {
        const childId = node?.mal_id || node?.id;
        if (!childId || seen.has(childId)) return;
        queue.push({ id: childId, depth: current.depth + 1, relationType: normalizedRelation });
      });
    });
  }

  const filtered = entries.filter(entry => entry.depth === 0 || isSupportedAnimeFormat(entry.format));
  if (filtered.length <= 1) return null;

  filtered.sort(compareAnimeFranchiseEntries);
  const totalEntries = filtered.length;
  filtered.forEach((entry, idx) => {
    entry.seriesOrder = idx + 1;
    entry.seriesSize = totalEntries;
  });
  const seriesName = deriveAnimeSeriesName(filtered, preferredSeriesName);
  filtered.forEach(entry => {
    entry.seriesName = seriesName;
  });
  return {
    seriesName,
    entries: filtered,
    totalEntries,
  };
}

async function autoAddAnimeFranchiseEntries(plan, rootAniListId, selectedIds) {
  if (!plan || !Array.isArray(plan.entries) || !plan.entries.length) return 0;
  const rootId = rootAniListId ? Number(rootAniListId) : null;
  const selectionSet = Array.isArray(selectedIds) && selectedIds.length
    ? new Set(selectedIds.map(id => String(id)))
    : null;
  const totalSeriesEntries = Number.isFinite(plan.totalEntries) ? plan.totalEntries : plan.entries.length;
  let addedCount = 0;
  for (const entry of plan.entries) {
    if (!entry || !entry.title) continue;
    if (rootId && Number(entry.aniListId) === rootId) continue;
    if (selectionSet && !selectionSet.has(String(entry.aniListId))) continue;
    const payload = {
      title: entry.title,
      createdAt: Date.now(),
      year: entry.year ? String(entry.year) : '',
      seriesName: entry.seriesName || plan.seriesName || '',
      seriesOrder: entry.seriesOrder ?? null,
      seriesSize: Number.isFinite(entry.seriesSize) ? entry.seriesSize : totalSeriesEntries,
      aniListId: entry.aniListId || null,
      aniListUrl: entry.siteUrl || '',
      animeFormat: entry.format || '',
      animeEpisodes: entry.episodes ?? '',
      animeDuration: entry.duration ?? '',
      animeStatus: entry.status || '',
      poster: entry.cover || '',
      originalLanguage: 'Japanese',
      originalLanguageIso: 'ja',
    };
    if (isDuplicateCandidate('anime', payload)) continue;
    try {
      await addItem('anime', payload);
      addedCount++;
    } catch (err) {
      console.warn('Auto-add anime entry failed', entry.title, err);
    }
  }
  if (addedCount > 0) {
    try {
      console.info(`[MyAnimeList] Auto-added ${addedCount} related anime entries for "${plan.seriesName}"`);
    } catch (_) {}
  }
  return addedCount;
}

function getAniListIdFromItem(item) {
  if (!item) return '';
  const value = item.aniListId || item.anilistId || item.AniListId || (item.metadata && (item.metadata.AniListId || item.metadata.anilistId));
  return value ? String(value) : '';
}

function buildAnimeFranchiseSeriesMap(data) {
  const map = new Map();
  Object.values(data || {}).forEach(item => {
    const aniListId = getAniListIdFromItem(item);
    if (!aniListId) return;
    const rawSeries = typeof item.seriesName === 'string' ? item.seriesName.trim() : '';
    const seriesKey = rawSeries ? normalizeTitleKey(rawSeries) : `__solo_${aniListId}`;
    if (!map.has(seriesKey)) {
      map.set(seriesKey, {
        seriesName: rawSeries || item.title || '',
        representativeId: aniListId,
        items: [],
      });
    }
    const bucket = map.get(seriesKey);
    bucket.items.push(item);
    if (!bucket.representativeId && aniListId) {
      bucket.representativeId = aniListId;
    }
    if (aniListId) {
      clearIgnoredAniListId(aniListId);
    }
  });
  return map;
}

function scheduleAnimeFranchiseScan(data) {
  pendingAnimeScanData = data;
  const now = Date.now();
  const elapsed = now - animeFranchiseLastScanTime;
  const shouldRun = !animeFranchiseLastScanTime || elapsed >= ANIME_FRANCHISE_RESCAN_INTERVAL_MS;
  if (!shouldRun) return;
  if (animeFranchiseScanTimer) {
    clearTimeout(animeFranchiseScanTimer);
  }
  animeFranchiseScanTimer = setTimeout(() => {
    animeFranchiseScanTimer = null;
    animeFranchiseLastScanTime = Date.now();
    safeLocalStorageSet(ANIME_FRANCHISE_LAST_SCAN_KEY, animeFranchiseLastScanTime);
    runAnimeFranchiseScan(pendingAnimeScanData);
  }, 1000);
}

async function runAnimeFranchiseScan(data) {
  if (animeFranchiseScanInflight) return;
  animeFranchiseScanInflight = true;
  try {
    if (!data || typeof data !== 'object') return;
    const seriesMap = buildAnimeFranchiseSeriesMap(data);
    if (!seriesMap.size) return;
    let scanned = 0;
    for (const [seriesKey, info] of seriesMap.entries()) {
      if (scanned >= ANIME_FRANCHISE_SCAN_SERIES_LIMIT) break;
      const aniListId = info.representativeId;
      if (!aniListId) continue;
      scanned++;
      let plan;
      try {
        plan = await fetchAniListFranchisePlan({
          aniListId,
          preferredSeriesName: info.seriesName,
        });
      } catch (err) {
        console.warn('MyAnimeList franchise scan failed', err);
        continue;
      }
      if (!plan || !Array.isArray(plan.entries) || !plan.entries.length) continue;
      const existingIds = new Set(info.items.map(getAniListIdFromItem).filter(Boolean).map(String));
      const missingEntries = plan.entries.filter(entry => {
        if (!entry || !entry.aniListId) return false;
        const idStr = String(entry.aniListId);
        if (existingIds.has(idStr)) return false;
        if (animeFranchiseIgnoredIds.has(idStr)) return false;
        return true;
      });
      if (!missingEntries.length) {
        animeFranchiseMissingHashes.delete(seriesKey);
        continue;
      }
      const missingHash = missingEntries
        .map(entry => String(entry.aniListId))
        .sort()
        .join(',');
      const previousHash = animeFranchiseMissingHashes.get(seriesKey);
      if (previousHash === missingHash) continue;
      animeFranchiseMissingHashes.set(seriesKey, missingHash);
      showAnimeFranchiseNotification(plan.seriesName || info.seriesName, missingEntries, {
        plan,
        rootAniListId: aniListId,
      });
    }
  } finally {
    animeFranchiseScanInflight = false;
  }
}

function buildGoogleBooksQuery(search) {
  if (!search) return '';
  const trimmed = search.trim();
  return trimmed || '';
}

function pickGoogleBooksThumbnail(images = {}) {
  return images.extraLarge || images.large || images.medium || images.thumbnail || images.smallThumbnail || images.small || images.tiny || '';
}

function normalizeGoogleBooksAuthors(authors) {
  if (!Array.isArray(authors)) return '';
  return authors.filter(Boolean).join(', ');
}

function extractGoogleBooksIsbn(volumeInfo) {
  const identifiers = Array.isArray(volumeInfo?.industryIdentifiers) ? volumeInfo.industryIdentifiers : [];
  const isbn13 = identifiers.find(id => id && id.type === 'ISBN_13');
  if (isbn13 && isbn13.identifier) return isbn13.identifier;
  const isbn10 = identifiers.find(id => id && id.type === 'ISBN_10');
  if (isbn10 && isbn10.identifier) return isbn10.identifier;
  return '';
}

function mapGoogleVolumeToSuggestion(volume) {
  if (!volume || !volume.volumeInfo) return null;
  const info = volume.volumeInfo;
  const title = info.title || '';
  if (!title) return null;
  return {
    source: 'googleBooks',
    title,
    year: extractPrimaryYear(info.publishedDate || ''),
    author: normalizeGoogleBooksAuthors(info.authors),
    googleBooksId: volume.id || '',
    isbn: extractGoogleBooksIsbn(info),
    poster: pickGoogleBooksThumbnail(info.imageLinks || {}),
    pageCount: info.pageCount || null,
  };
}

async function fetchGoogleBooksSuggestions(query) {
  const q = buildGoogleBooksQuery(query);
  if (!q) return [];
  const params = new URLSearchParams({
    q,
    printType: 'books',
    maxResults: '10',
    orderBy: 'relevance',
    fields: 'items(id,volumeInfo/title,volumeInfo/authors,volumeInfo/publishedDate,volumeInfo/imageLinks,volumeInfo/industryIdentifiers,volumeInfo/pageCount)'
  });
  if (GOOGLE_BOOKS_API_KEY) params.set('key', GOOGLE_BOOKS_API_KEY);
  let payload;
  try {
    const resp = await fetch(`${GOOGLE_BOOKS_API_URL}/volumes?${params.toString()}`);
    if (!resp.ok) return [];
    payload = await resp.json();
  } catch (err) {
    console.warn('Google Books suggestion fetch failed', err);
    return [];
  }
  if (!payload || !Array.isArray(payload.items)) return [];
  return payload.items
    .map(mapGoogleVolumeToSuggestion)
    .filter(Boolean);
}

function mapGoogleVolumeToMetadata(volume) {
  if (!volume || !volume.volumeInfo) return null;
  const info = volume.volumeInfo;
  const authors = normalizeGoogleBooksAuthors(info.authors);
  const categories = Array.isArray(info.categories) ? info.categories.filter(Boolean) : [];
  return {
    Title: info.title || '',
    Year: extractPrimaryYear(info.publishedDate || ''),
    Author: authors,
    Plot: info.description || '',
    Poster: pickGoogleBooksThumbnail(info.imageLinks || {}) || 'N/A',
    PageCount: info.pageCount || '',
    Categories: categories,
    Publisher: info.publisher || '',
    PreviewLink: info.previewLink || info.infoLink || volume.selfLink || '',
    AverageRating: info.averageRating || '',
    GoogleBooksId: volume.id || '',
    GoogleBooksUrl: info.infoLink || volume.selfLink || '',
    isbn: extractGoogleBooksIsbn(info),
  };
}

async function fetchGoogleBooksVolumeById(volumeId) {
  if (!volumeId) return null;
  try {
    const params = new URLSearchParams();
    if (GOOGLE_BOOKS_API_KEY) params.set('key', GOOGLE_BOOKS_API_KEY);
    const resp = await fetch(`${GOOGLE_BOOKS_API_URL}/volumes/${volumeId}?${params.toString()}`);
    if (!resp.ok) return null;
    return await resp.json();
  } catch (err) {
    console.warn('Google Books volume fetch failed', err);
    return null;
  }
}

async function fetchGoogleBooksMetadata(lookup = {}) {
  if (!lookup) return null;
  const { volumeId, title, author, isbn } = lookup;
  let volume = null;
  if (volumeId) {
    volume = await fetchGoogleBooksVolumeById(volumeId);
  }
  if (!volume) {
    const terms = [];
    if (isbn) terms.push(`isbn:${isbn}`);
    if (title) terms.push(title);
    if (author) terms.push(`inauthor:${author}`);
    const query = terms.join(' ');
    const params = new URLSearchParams({
      q: query || title || author || '',
      printType: 'books',
      maxResults: '5',
    });
    if (GOOGLE_BOOKS_API_KEY) params.set('key', GOOGLE_BOOKS_API_KEY);
    try {
      const resp = await fetch(`${GOOGLE_BOOKS_API_URL}/volumes?${params.toString()}`);
      if (resp.ok) {
        const json = await resp.json();
        if (json && Array.isArray(json.items) && json.items.length) {
          volume = json.items[0];
        }
      }
    } catch (err) {
      console.warn('Google Books metadata search failed', err);
    }
  }
  if (!volume) return null;
  return mapGoogleVolumeToMetadata(volume);
}

async function searchTmdbKeyword(query) {
  if (!query || !query.trim()) return null;
  try {
    const payload = await tmdbFetch('/search/keyword', { query: query.trim(), page: 1 });
    const results = Array.isArray(payload?.results) ? payload.results : [];
    if (!results.length) return null;
    const normalizedQuery = normalizeTitleKey(query);
    const best = results.reduce((winner, keyword) => {
      if (!keyword || !keyword.id || !keyword.name) return winner;
      const normalizedName = normalizeTitleKey(keyword.name);
      const popularity = Number(keyword.popularity) || 0;
      const exact = normalizedName === normalizedQuery;
      const score = (exact ? 1000 : 0) + popularity;
      if (!winner || score > winner.score) {
        return { id: keyword.id, name: keyword.name, score };
      }
      return winner;
    }, null);
    return best ? { id: best.id, name: best.name } : null;
  } catch (err) {
    console.warn('TMDb keyword search failed', err);
    return null;
  }
}

async function discoverTmdbKeywordEntries(keywordId, mediaType, pageLimit = TMDB_KEYWORD_DISCOVER_PAGE_LIMIT) {
  if (!keywordId) return [];
  const entries = [];
  for (let page = 1; page <= pageLimit; page++) {
    try {
      const payload = await tmdbFetch(`/discover/${mediaType}`, {
        with_keywords: keywordId,
        include_adult: 'false',
        language: 'en-US',
        sort_by: 'popularity.desc',
        page,
      });
      if (Array.isArray(payload?.results)) {
        payload.results.forEach(result => {
          const entry = formatTmdbFranchiseEntry(result, mediaType);
          if (entry) entries.push(entry);
        });
      }
      if (!payload || page >= payload.total_pages || entries.length >= TMDB_KEYWORD_DISCOVER_MAX_RESULTS) {
        break;
      }
    } catch (err) {
      console.warn('TMDb keyword discover failed', mediaType, keywordId, err);
      break;
    }
  }
  return entries;
}

async function fetchTmdbKeywordFranchiseEntries(keywordId) {
  if (!keywordId) return [];
  const [movies, tvShows] = await Promise.all([
    discoverTmdbKeywordEntries(keywordId, 'movie'),
    discoverTmdbKeywordEntries(keywordId, 'tv'),
  ]);
  const combined = [...movies, ...tvShows];
  const map = new Map();
  combined.forEach(entry => {
    if (!entry || !entry.id || !entry.mediaType) return;
    const key = `${entry.mediaType}:${entry.id}`;
    if (map.has(key)) return;
    map.set(key, entry);
  });
  return Array.from(map.values()).slice(0, TMDB_KEYWORD_DISCOVER_MAX_RESULTS);
}

function buildFranchiseEntryKey(mediaType, source) {
  if (!source) return '';
  const tmdbId = source.tmdbId || source.tmdbID || source.TmdbID || source.id || null;
  if (tmdbId) return `${mediaType}:${tmdbId}`;
  const title = normalizeTitleKey(source.title || source.name || '');
  if (!title) return '';
  const yearValue = sanitizeYear(source.year || source.releaseDate || source.firstAirDate || source.Year || '');
  return `${mediaType}:${title}:${yearValue}`;
}

function filterKeywordEntriesAgainstLibrary(entries, sourceItem, sourceListType) {
  const movieSet = new Set();
  const tvSet = new Set();
  Object.values(listCaches.movies || {}).forEach(item => {
    const key = buildFranchiseEntryKey('movie', item);
    if (key) movieSet.add(key);
  });
  Object.values(listCaches.tvShows || {}).forEach(item => {
    const key = buildFranchiseEntryKey('tv', item);
    if (key) tvSet.add(key);
  });
  if (sourceItem && sourceListType === 'movies') {
    const key = buildFranchiseEntryKey('movie', sourceItem);
    if (key) movieSet.add(key);
  } else if (sourceItem && sourceListType === 'tvShows') {
    const key = buildFranchiseEntryKey('tv', sourceItem);
    if (key) tvSet.add(key);
  }
  return entries.filter(entry => {
    if (!entry || !entry.mediaType) return false;
    const targetSet = entry.mediaType === 'tv' ? tvSet : movieSet;
    const key = buildFranchiseEntryKey(entry.mediaType, entry);
    if (!key) return true;
    if (targetSet.has(key)) return false;
    targetSet.add(key);
    return true;
  });
}

async function autoAddTmdbKeywordEntries(franchiseLabel, keywordInfo, entries, options = {}) {
  if (!Array.isArray(entries) || !entries.length) return;
  const { sourceItem = null, sourceListType = null } = options;
  const keywordId = keywordInfo?.id || null;
  const keywordName = keywordInfo?.name || franchiseLabel;
  const sharedSeriesName = (sourceItem && sourceItem.seriesName) ? sourceItem.seriesName : (franchiseLabel || keywordName || '');
  const normalizedSeriesKey = sharedSeriesName ? normalizeTitleKey(sharedSeriesName) : '';
  const additionsPlannedByList = new Map();
  entries.forEach(entry => {
    if (!entry || !entry.mediaType) return;
    const key = entry.mediaType === 'tv' ? 'tvShows' : 'movies';
    additionsPlannedByList.set(key, (additionsPlannedByList.get(key) || 0) + 1);
  });

  const seriesTrackers = new Map();
  function ensureSeriesTracker(targetList) {
    if (!normalizedSeriesKey) return null;
    const trackerKey = `${targetList}:${normalizedSeriesKey}`;
    if (!seriesTrackers.has(trackerKey)) {
      const existingEntries = Object.values(listCaches[targetList] || {}).filter(item => normalizeTitleKey(item.seriesName || '') === normalizedSeriesKey);
      const maxOrder = existingEntries.reduce((max, item) => {
        const numericOrder = numericSeriesOrder(item.seriesOrder);
        if (numericOrder === null || !Number.isFinite(numericOrder)) return max;
        return Math.max(max, numericOrder);
      }, 0);
      seriesTrackers.set(trackerKey, {
        nextOrder: maxOrder + 1,
        baseCount: existingEntries.length,
        totalAdds: additionsPlannedByList.get(targetList) || 0,
      });
    }
    return seriesTrackers.get(trackerKey);
  }

  for (const entry of entries) {
    if (!entry || !entry.id || !entry.title) continue;
    const targetList = entry.mediaType === 'tv' ? 'tvShows' : 'movies';
    const tracker = ensureSeriesTracker(targetList);
    const payload = {
      title: entry.title,
      createdAt: Date.now(),
      year: entry.year || '',
      seriesName: sharedSeriesName || franchiseLabel || keywordName || '',
      franchiseKeywordId: keywordId,
      franchiseKeywordName: keywordName || franchiseLabel || '',
      tmdbId: entry.id,
    };
    if (tracker) {
      payload.seriesOrder = tracker.nextOrder;
      tracker.nextOrder += 1;
      const projectedSize = tracker.baseCount + tracker.totalAdds;
      if (projectedSize > 0) {
        payload.seriesSize = projectedSize;
      }
    }
    if (isDuplicateCandidate(targetList, payload)) continue;
    const baseTrailerUrl = buildTrailerUrl(entry.title, entry.year);
    if (baseTrailerUrl) payload.trailerUrl = baseTrailerUrl;
    try {
      const metadata = await fetchTmdbMetadata(targetList, {
        title: entry.title,
        year: entry.year,
        tmdbId: entry.id,
      });
      if (metadata) {
        const updates = deriveMetadataAssignments(metadata, payload, {
          overwrite: true,
          fallbackTitle: entry.title,
          fallbackYear: entry.year,
        });
        Object.assign(payload, updates);
      }
      await addItem(targetList, payload);
    } catch (err) {
      console.warn('Auto-add keyword franchise entry failed', entry.title, err);
    }
  }
}

// Boot
initFirebase();
if (auth) {
  handleAuthState();
  handleSignInRedirectResult();
} else {
  try {
    handleAuthState();
    handleSignInRedirectResult();
  } catch(e) { /* silent */ }
}

tmEasterEgg.bindTriggers();
initUnifiedLibraryControls();

