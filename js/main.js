import * as config from './config.js';
import * as state from './state.js';
import * as utils from './utils.js';
import * as dom from './dom.js';
import * as firebase from './firebase.js';
import * as notifications from './notifications.js';
import * as lists from './lists.js';
import * as cards from './cards.js';
import * as modals from './modals.js';
import * as metadata from './metadata.js';
import * as autocomplete from './autocomplete.js';
import * as wheel from './wheel.js';
import * as franchise from './franchise.js';
import * as ads from './ads.js';
import * as stats from './stats.js';
import * as bugReport from './bugReport.js';
import * as crud from './crud.js';
import * as easterEgg from './easterEgg.js';
import * as collapsibleCards from './collapsibleCards.js';
import { 
  VirtualScroller, 
  ensureVirtualListController, 
  destroyVirtualListController,
  ensureUnifiedVirtualizer,
  destroyUnifiedVirtualizer
} from './virtualScroller.js';
import {
  ref,
  query,
  orderByChild,
  onValue
} from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-database.js';

export {
  config,
  state,
  utils,
  dom,
  firebase,
  notifications,
  lists,
  cards,
  modals,
  metadata,
  autocomplete,
  wheel,
  franchise,
  ads,
  stats,
  bugReport,
  crud,
  easterEgg,
  collapsibleCards,
  VirtualScroller,
  ensureVirtualListController,
  destroyVirtualListController,
  ensureUnifiedVirtualizer,
  destroyUnifiedVirtualizer
};

export function initApp() {
  firebase.initializeFirebase();
  
  if (dom.googleSigninBtn) {
    dom.googleSigninBtn.addEventListener('click', () => firebase.signInWithGoogle());
  }
  
  if (dom.signOutBtn) {
    dom.signOutBtn.addEventListener('click', () => firebase.signOut());
  }
  
  notifications.initNotificationBell();
  autocomplete.initGlobalSuggestionClickHandler();
  franchise.setupFranchiseSort();
  
  wheel.setupWheelModal({
    onSpin: (source) => {
      console.log('Wheel spin requested for:', source);
    },
    closeAddModal: modals.closeAddModal
  });
  
  firebase.onAuthStateChange((user) => {
    if (user) {
      state.setCurrentUser(user);
      showAppForUser(user);
    } else {
      state.setCurrentUser(null);
      showLogin();
    }
  });
  
  firebase.handleSignInRedirectResult();
  
  initBackToTop();
  ads.initializeRandomAds();
  
  console.info('[THE-LIST] App initialized with modular architecture');
}

function showLogin() {
  if (dom.loginScreen) dom.loginScreen.classList.remove('hidden');
  if (dom.appRoot) dom.appRoot.classList.add('hidden');
  state.setIntroPlayed(false);
  state.safeStorageRemove(config.INTRO_SESSION_KEY);
}

function showAppForUser(user) {
  if (dom.loginScreen) dom.loginScreen.classList.add('hidden');
  if (dom.appRoot) dom.appRoot.classList.remove('hidden');
  if (dom.userNameEl) {
    dom.userNameEl.textContent = user.displayName || user.email || 'You';
  }
  playTheListIntro();
  loadPrimaryLists();
  initUnifiedLibraryControls();
}

function playTheListIntro() {
  if (state.introPlayed) return;
  const intro = document.getElementById('the-list-intro');
  if (!intro) return;
  state.setIntroPlayed(true);
  state.safeStorageSet(config.INTRO_SESSION_KEY, '1');
  intro.classList.remove('hidden');
  intro.classList.add('active');
  setTimeout(() => {
    intro.classList.add('hidden');
    intro.classList.remove('active');
  }, 3600);
}

function loadPrimaryLists() {
  state.setLibraryFullyLoaded(false);
  const order = [...config.PRIMARY_LIST_TYPES];
  let index = 0;
  const loadNext = () => {
    if (index >= order.length) {
      setTimeout(() => {
        state.setLibraryFullyLoaded(true);
        renderUnifiedLibrary();
      }, config.LIST_LOAD_STAGGER_MS + 100);
      return;
    }
    const listType = order[index++];
    loadList(listType);
    loadFinishedList(listType);
    if (index < order.length) {
      setTimeout(loadNext, config.LIST_LOAD_STAGGER_MS);
    } else {
      setTimeout(() => {
        state.setLibraryFullyLoaded(true);
        renderUnifiedLibrary();
      }, config.LIST_LOAD_STAGGER_MS + 100);
    }
  };
  loadNext();
}

function loadList(listType) {
  if (!state.currentUser) return;
  
  if (state.listeners[listType]) {
    state.listeners[listType]();
    delete state.listeners[listType];
  }

  const db = firebase.getFirebaseDatabase();
  const listRef = query(ref(db, `users/${state.currentUser.uid}/${listType}`), orderByChild('title'));
  
  const off = onValue(listRef, (snap) => {
    const data = snap.val() || {};
    state.listCaches[listType] = data;
    renderUnifiedLibrary();
  }, (err) => {
    console.error('DB read error', err);
  });

  state.listeners[listType] = off;
}

function loadFinishedList(listType) {
  if (!state.currentUser) return;
  
  if (state.finishedListeners[listType]) {
    state.finishedListeners[listType]();
    delete state.finishedListeners[listType];
  }
  
  const db = firebase.getFirebaseDatabase();
  const finishedRef = ref(db, `users/${state.currentUser.uid}/finished/${listType}`);
  
  const off = onValue(finishedRef, (snap) => {
    state.finishedCaches[listType] = snap.val() || {};
    if (state.showFinishedOnly) {
      renderUnifiedLibrary();
    }
  }, (err) => {
    console.error('Finished list read error', err);
  });
  
  state.finishedListeners[listType] = off;
}

function getDisplayCacheMap() {
  return state.showFinishedOnly ? state.finishedCaches : state.listCaches;
}

function getDisplayCache(listType) {
  return getDisplayCacheMap()[listType];
}

function initUnifiedLibraryControls() {
  if (dom.unifiedSearchInput) {
    dom.unifiedSearchInput.addEventListener('input', utils.debounce((ev) => {
      state.unifiedFilters.search = (ev.target.value || '').trim().toLowerCase();
      renderUnifiedLibrary();
    }, 180));
  }
  
  dom.typeFilterButtons.forEach(btn => {
    const type = btn.dataset.typeToggle;
    btn.addEventListener('click', () => toggleUnifiedTypeFilter(type));
  });
  
  if (dom.finishedFilterToggle) {
    dom.finishedFilterToggle.checked = state.showFinishedOnly;
    dom.finishedFilterToggle.addEventListener('change', (ev) => {
      state.setShowFinishedOnly(Boolean(ev.target.checked));
      renderUnifiedLibrary();
    });
  }
  
  if (dom.librarySortSelect) {
    dom.librarySortSelect.addEventListener('change', (ev) => {
      state.setLibrarySortMode(ev.target.value);
      renderUnifiedLibrary();
    });
  }
}

function toggleUnifiedTypeFilter(listType) {
  if (!listType) return;
  const filters = state.unifiedFilters.types;
  if (filters.has(listType)) {
    if (filters.size === 1) return;
    filters.delete(listType);
  } else {
    filters.add(listType);
  }
  updateUnifiedTypeControls();
  renderUnifiedLibrary();
}

function updateUnifiedTypeControls() {
  dom.typeFilterButtons.forEach(btn => {
    const type = btn.dataset.typeToggle;
    const isActive = !!(type && state.unifiedFilters.types.has(type));
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  });
}

function collectUnifiedEntries() {
  const allEntries = [];
  config.PRIMARY_LIST_TYPES.forEach(listType => {
    const cache = getDisplayCache(listType) || {};
    Object.entries(cache).forEach(([id, item]) => {
      if (!item) return;
      allEntries.push({
        listType,
        id,
        item,
        displayItem: item,
        displayEntryId: id,
      });
    });
  });
  return allEntries;
}

function matchesUnifiedSearch(item, queryStr) {
  if (!queryStr) return true;
  const title = (item?.title || '').toLowerCase();
  const director = (item?.director || item?.author || '').toLowerCase();
  const year = String(item?.year || '');
  const seriesName = (item?.seriesName || '').toLowerCase();
  return title.includes(queryStr) || director.includes(queryStr) || 
         year.includes(queryStr) || seriesName.includes(queryStr);
}

function renderUnifiedLibrary() {
  if (!dom.combinedListEl) return;
  
  const displayCaches = getDisplayCacheMap();
  const hasLoadedAny = config.PRIMARY_LIST_TYPES.some(type => displayCaches[type] !== undefined);
  
  if (!hasLoadedAny) {
    const message = state.showFinishedOnly ? 'Loading finished entries...' : 'Loading your library...';
    destroyUnifiedVirtualizer();
    dom.combinedListEl.innerHTML = `<div class="small">${message}</div>`;
    return;
  }

  const unifiedEntries = collectUnifiedEntries();
  const activeTypes = state.unifiedFilters.types;
  
  let filtered = unifiedEntries.filter(entry => activeTypes.has(entry.listType));
  
  const queryStr = state.unifiedFilters.search;
  if (queryStr) {
    filtered = filtered.filter(entry => matchesUnifiedSearch(entry.displayItem, queryStr));
  }

  filtered.sort((a, b) => {
    const sortMode = state.librarySortMode;
    
    if (sortMode === 'alphaAsc' || sortMode === 'alphaDesc') {
      const ta = utils.titleSortKey(a.displayItem?.title || '');
      const tb = utils.titleSortKey(b.displayItem?.title || '');
      if (ta !== tb) {
        return sortMode === 'alphaAsc' ? (ta < tb ? -1 : 1) : (ta > tb ? -1 : 1);
      }
    }
    
    if (sortMode === 'yearDesc' || sortMode === 'yearAsc') {
      const ya = Number(a.displayItem?.year) || 0;
      const yb = Number(b.displayItem?.year) || 0;
      if (ya !== yb) {
        return sortMode === 'yearDesc' ? yb - ya : ya - yb;
      }
    }

    const ta = utils.titleSortKey(a.displayItem?.title || '');
    const tb = utils.titleSortKey(b.displayItem?.title || '');
    if (ta < tb) return -1;
    if (ta > tb) return 1;
    return 0;
  });

  if (!filtered.length) {
    const emptyMessage = state.showFinishedOnly
      ? 'No finished entries match the current filters yet.'
      : 'No entries match the current filters yet.';
    destroyUnifiedVirtualizer();
    dom.combinedListEl.innerHTML = `<div class="small">${emptyMessage}</div>`;
    return;
  }

  const shouldVirtualize = filtered.length >= config.VIRTUALIZATION_THRESHOLD;
  
  if (shouldVirtualize) {
    const controller = ensureUnifiedVirtualizer(dom.combinedListEl, {
      estimateHeight: 360,
      overscan: 8,
      hostClass: 'movies-grid unified-grid virtualized-grid',
      scrollTarget: window,
      renderItem: (entry) => buildUnifiedCard(entry),
    });
    controller?.setItems(filtered);
    return;
  }

  destroyUnifiedVirtualizer();
  dom.combinedListEl.innerHTML = '';
  const grid = utils.createEl('div', 'movies-grid unified-grid');
  filtered.forEach(entry => {
    const node = buildUnifiedCard(entry);
    if (node) grid.appendChild(node);
  });
  dom.combinedListEl.appendChild(grid);
}

function buildUnifiedCard(entry) {
  const { listType, id, displayItem } = entry;
  if (!displayItem) return null;

  const card = utils.createEl('div', 'movie-card');
  card.dataset.listType = listType;
  card.dataset.itemId = id;

  const posterUrl = displayItem.poster || displayItem.posterUrl || '';
  const title = displayItem.title || 'Untitled';
  const year = displayItem.year || '';
  const director = displayItem.director || displayItem.author || '';

  const typeLabel = config.MEDIA_TYPE_LABELS[listType] || listType;
  
  card.innerHTML = `
    <div class="card-poster">
      ${posterUrl 
        ? `<img src="${posterUrl}" alt="${title}" loading="lazy" />` 
        : `<div class="no-poster">No Poster</div>`}
    </div>
    <div class="card-info">
      <div class="card-title">${title}</div>
      ${year ? `<div class="card-year">${year}</div>` : ''}
      ${director ? `<div class="card-director">${director}</div>` : ''}
      <div class="card-type-badge">${typeLabel}</div>
    </div>
  `;

  card.addEventListener('click', () => {
    modals.openEditModal(listType, id, displayItem);
  });

  return card;
}

function initBackToTop() {
  if (!dom.backToTopBtn) return;
  
  dom.backToTopBtn.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
  
  const updateVisibility = () => {
    const scrollTop = window.scrollY || document.documentElement.scrollTop || 0;
    const show = scrollTop > 400;
    dom.backToTopBtn.classList.toggle('visible', show);
  };
  
  window.addEventListener('scroll', updateVisibility, { passive: true });
  updateVisibility();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
