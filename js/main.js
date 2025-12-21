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
import * as seriesGrouping from './seriesGrouping.js';
import * as share from './share.js';
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
  
  // Initialize UI components
  notifications.initNotificationBell();
  autocomplete.initGlobalSuggestionClickHandler();
  franchise.setupFranchiseSort();
  easterEgg.bindTriggers();
  
  // Bug report button
  bugReport.initBugReportButton({
    refreshAllMetadataSequential: () => bugReport.refreshAllMetadataSequential({
      listCaches: state.listCaches,
      showToast: notifications.pushNotification
    })
  });
  
  // Add modal trigger
  setupAddModalTrigger();
  
  // Wheel modal
  wheel.setupWheelModal({
    onSpin: spinWheel,
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
  
  // Check for incoming share links
  share.checkForIncomingShare();
  
  console.info('[THE-LIST] App initialized with modular architecture');
}

function setupAddModalTrigger() {
  if (!dom.addModalTrigger || !dom.modalRoot) return;
  dom.addModalTrigger.addEventListener('click', () => {
    modals.openAddModal(config.ADD_MODAL_LIST_TYPES[0], getModalCallbacks());
  });
}

function getModalCallbacks() {
  return {
    onSubmit: async (listType, item, form) => {
      await crud.addItem(listType, item);
    },
    afterSubmit: () => {
      renderUnifiedLibrary();
    },
    renderUnifiedLibrary,
    fetchSuggestions: autocomplete.fetchTmdbSuggestions
  };
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
  franchise.loadFranchises();
  initUnifiedLibraryControls();
  bugReport.startBugReportSync();
  bugReport.initGlobalNotificationsListener();
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
  return seriesGrouping.collectUnifiedEntriesWithGrouping(config.PRIMARY_LIST_TYPES);
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
  // Update stats panel
  try {
    stats.updateLibraryRuntimeStats();
  } catch (err) {
    console.warn('Stats update error:', err);
  }
  
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
      renderItem: (entry, index) => buildUnifiedCard(entry, index),
    });
    controller?.setItems(filtered);
    return;
  }

  destroyUnifiedVirtualizer();
  dom.combinedListEl.innerHTML = '';
  const grid = utils.createEl('div', 'movies-grid unified-grid');
  filtered.forEach((entry, index) => {
    const node = buildUnifiedCard(entry, index);
    if (node) grid.appendChild(node);
  });
  dom.combinedListEl.appendChild(grid);
}

function buildUnifiedCard(entry, index = 0) {
  const { listType, id, displayItem } = entry;
  if (!displayItem) return null;

  // Use the full collapsible card system
  return collapsibleCards.buildCollapsibleMovieCard(listType, id, displayItem, index, {
    isUnified: true,
    displayEntryId: id,
    interactive: true
  });
}

// ============================================
// WHEEL SPIN FUNCTIONALITY
// ============================================
function spinWheel(listType) {
  if (!state.currentUser) {
    notifications.pushNotification({ message: 'Please sign in first', type: 'error' });
    return;
  }
  
  const spinnerEl = wheel.getWheelSpinnerEl();
  const resultEl = wheel.getWheelResultEl();
  
  if (!spinnerEl || !resultEl) {
    console.warn('Wheel spinner UI not ready');
    return;
  }
  
  wheel.clearWheelAnimation();
  resultEl.innerHTML = '';
  spinnerEl.classList.remove('hidden');
  spinnerEl.classList.add('spinning');
  
  const placeholder = document.createElement('span');
  placeholder.className = 'spin-text';
  placeholder.textContent = 'Spinning…';
  spinnerEl.appendChild(placeholder);
  
  wheel.startWheelSpinAudio();
  
  // Gather candidates from caches
  const candidates = [];
  const targetTypes = listType === 'all' 
    ? config.PRIMARY_LIST_TYPES 
    : [listType];
  
  targetTypes.forEach(type => {
    const cache = state.listCaches[type] || {};
    Object.entries(cache).forEach(([id, item]) => {
      if (!item) return;
      // Skip finished items
      if (item.finished || item.finishedAt) return;
      candidates.push({ id, item, listType: type });
    });
  });
  
  if (candidates.length === 0) {
    wheel.clearWheelAnimation();
    spinnerEl.innerHTML = '<span class="spin-text">No eligible items to spin.</span>';
    resultEl.textContent = 'No eligible items. Add something new or check your filters.';
    return;
  }
  
  // Pick a random winner
  const chosenIndex = Math.floor(Math.random() * candidates.length);
  const winner = candidates[chosenIndex];
  
  // Animate through candidates
  animateWheelSequence(candidates, chosenIndex, winner, spinnerEl, resultEl);
}

function animateWheelSequence(candidates, chosenIndex, winner, spinnerEl, resultEl) {
  const totalTicks = 25 + Math.floor(Math.random() * 10);
  let tickIndex = 0;
  
  const tick = () => {
    if (tickIndex >= totalTicks) {
      // Final winner
      wheel.clearWheelAnimation();
      spinnerEl.classList.add('hidden');
      renderWheelWinner(winner, resultEl);
      return;
    }
    
    // Show random candidate during animation
    const randomIdx = Math.floor(Math.random() * candidates.length);
    const preview = candidates[randomIdx];
    spinnerEl.innerHTML = '';
    const label = document.createElement('span');
    label.className = 'spin-text';
    label.textContent = preview.item?.title || 'Spinning...';
    spinnerEl.appendChild(label);
    
    // Slow down towards end
    const progress = tickIndex / totalTicks;
    const delay = 50 + (progress * progress * 400);
    
    tickIndex++;
    const timeoutId = setTimeout(tick, delay);
    wheel.addSpinTimeout(timeoutId);
  };
  
  tick();
}

function renderWheelWinner(winner, resultEl) {
  if (!resultEl || !winner) return;
  
  const { item, listType, id } = winner;
  const actionVerb = listType === 'books' ? 'read' : 'watch';
  
  resultEl.innerHTML = '';
  
  const heading = document.createElement('div');
  heading.className = 'wheel-result-heading';
  heading.textContent = `You should ${actionVerb} next:`;
  resultEl.appendChild(heading);
  
  const cardNode = collapsibleCards.buildCollapsibleMovieCard(listType, id, item, 0, {
    isUnified: false,
    displayEntryId: id,
    interactive: false
  });
  
  if (cardNode) {
    cardNode.classList.add('wheel-result-card', 'expanded');
    resultEl.appendChild(cardNode);
  }
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
