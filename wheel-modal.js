import { ref, get } from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-database.js';
import { createModalElements, bindModalDismissHandlers, removeModalDismissHandlers } from './modal-helpers.js';
import { showAlert } from './alerts.js';

const WHEEL_ACCEL_AUDIO_URL = './spin-boost.mp3';
const WHEEL_SPIN_DURATION_MS = 20000;
const WHEEL_SPIN_ALL_OPTION = 'all';

const wheelUIState = { sourceSelect: null, spinnerEl: null, resultEl: null };

const wheelConfig = {
  listCaches: {},
  getCurrentUser: () => null,
  getDb: () => null,
  primaryListTypes: [],
  listSupportsActorFilter: () => false,
  getActorFilterValue: () => '',
  matchesActorFilter: () => true,
  isCollapsibleList: () => false,
  buildCollapsibleMovieCard: () => null,
  buildStandardCard: () => null,
  parseSeriesOrder: () => Number.POSITIVE_INFINITY,
};

let wheelModalController = null;
let spinTimeouts = [];
let wheelAccelAudio = null;
let wheelAccelAudioTimeoutId = null;

export function initWheelModal({
  modalRoot,
  closeAddModal,
  listCaches,
  getCurrentUser,
  getDb,
  primaryListTypes,
  listSupportsActorFilter,
  getActorFilterValue,
  matchesActorFilter,
  isCollapsibleList,
  buildCollapsibleMovieCard,
  buildStandardCard,
  parseSeriesOrder,
} = {}) {
  applyWheelConfigOverrides({
    listCaches,
    getCurrentUser,
    getDb,
    primaryListTypes,
    listSupportsActorFilter,
    getActorFilterValue,
    matchesActorFilter,
    isCollapsibleList,
    buildCollapsibleMovieCard,
    buildStandardCard,
    parseSeriesOrder,
  });

  if (wheelModalController) {
    return wheelModalController;
  }
  const trigger = document.getElementById('open-wheel-modal');
  const template = document.getElementById('wheel-modal-template');
  if (!trigger || !template || !modalRoot) {
    console.warn('Wheel modal is missing required DOM references.');
    return null;
  }
  wheelModalController = createWheelModalManager({
    trigger,
    modalRoot,
    template,
    spinWheel,
    clearWheelAnimation,
    closeAddModal,
    uiState: wheelUIState,
  });
  wheelModalController.setupWheelModal();
  return wheelModalController;
}

export function openWheelModal() {
  if (!wheelModalController) return;
  wheelModalController.openWheelModal();
}

export function closeWheelModal() {
  if (!wheelModalController) return;
  wheelModalController.closeWheelModal();
}

function applyWheelConfigOverrides({
  listCaches,
  getCurrentUser,
  getDb,
  primaryListTypes,
  listSupportsActorFilter,
  getActorFilterValue,
  matchesActorFilter,
  isCollapsibleList,
  buildCollapsibleMovieCard,
  buildStandardCard,
  parseSeriesOrder,
} = {}) {
  if (listCaches) {
    wheelConfig.listCaches = listCaches;
  }
  if (typeof getCurrentUser === 'function') {
    wheelConfig.getCurrentUser = getCurrentUser;
  }
  if (typeof getDb === 'function') {
    wheelConfig.getDb = getDb;
  }
  if (Array.isArray(primaryListTypes) && primaryListTypes.length) {
    wheelConfig.primaryListTypes = primaryListTypes.slice();
  }
  if (typeof listSupportsActorFilter === 'function') {
    wheelConfig.listSupportsActorFilter = listSupportsActorFilter;
  }
  if (typeof getActorFilterValue === 'function') {
    wheelConfig.getActorFilterValue = getActorFilterValue;
  }
  if (typeof matchesActorFilter === 'function') {
    wheelConfig.matchesActorFilter = matchesActorFilter;
  }
  if (typeof isCollapsibleList === 'function') {
    wheelConfig.isCollapsibleList = isCollapsibleList;
  }
  if (typeof buildCollapsibleMovieCard === 'function') {
    wheelConfig.buildCollapsibleMovieCard = buildCollapsibleMovieCard;
  }
  if (typeof buildStandardCard === 'function') {
    wheelConfig.buildStandardCard = buildStandardCard;
  }
  if (typeof parseSeriesOrder === 'function') {
    wheelConfig.parseSeriesOrder = parseSeriesOrder;
  }
}

export function createWheelModalManager({
  trigger,
  modalRoot,
  template,
  spinWheel,
  clearWheelAnimation,
  closeAddModal,
  uiState = { sourceSelect: null, spinnerEl: null, resultEl: null },
}) {
  let wheelModalState = null;

  function setupWheelModal() {
    if (!trigger || !template || !modalRoot) return;
    trigger.addEventListener('click', () => openWheelModal());
  }

  function openWheelModal() {
    if (!template || !modalRoot) return;
    if (typeof closeAddModal === 'function') {
      closeAddModal();
    }
    closeWheelModal();
    const { backdrop, modal } = createModalElements({
      backdropClasses: 'modal-backdrop wheel-modal-backdrop',
      modalClasses: 'modal wheel-modal',
    });
    const fragment = template.content.cloneNode(true);
    modal.appendChild(fragment);
    modalRoot.innerHTML = '';
    modalRoot.appendChild(backdrop);

    const modalElements = getWheelModalElements(modal);
    resetWheelModalUI(modalElements);

    const dismissHandlers = bindModalDismissHandlers(backdrop, closeWheelModal);

    wheelModalState = {
      backdrop,
      modal,
      dismissHandlers,
      ...modalElements,
    };

    bindWheelModalControls(wheelModalState);
  }

  function closeWheelModal() {
    if (wheelModalState) {
      unbindWheelModalControls(wheelModalState);
      removeModalDismissHandlers(wheelModalState);
      if (wheelModalState.backdrop && wheelModalState.backdrop.parentNode) {
        wheelModalState.backdrop.parentNode.removeChild(wheelModalState.backdrop);
      }
    }
    if (typeof clearWheelAnimation === 'function') {
      clearWheelAnimation();
    }
    wheelModalState = null;
    uiState.sourceSelect = null;
    uiState.spinnerEl = null;
    uiState.resultEl = null;
  }

  function getWheelModalElements(modal) {
    if (!modal) {
      return {
        sourceSelect: null,
        spinButton: null,
        spinnerEl: null,
        resultEl: null,
        closeBtn: null,
      };
    }
    const sourceSelect = modal.querySelector('[data-wheel-source]');
    const spinButton = modal.querySelector('[data-wheel-spin]');
    const spinnerEl = modal.querySelector('[data-wheel-spinner]');
    const resultEl = modal.querySelector('[data-wheel-result]');
    const closeBtn = modal.querySelector('[data-wheel-close]');
    return { sourceSelect, spinButton, spinnerEl, resultEl, closeBtn };
  }

  function resetWheelModalUI({ sourceSelect, spinnerEl, resultEl }) {
    uiState.sourceSelect = sourceSelect || null;
    uiState.spinnerEl = spinnerEl || null;
    uiState.resultEl = resultEl || null;
    if (uiState.spinnerEl) {
      uiState.spinnerEl.classList.add('hidden');
      uiState.spinnerEl.classList.remove('spinning');
      uiState.spinnerEl.innerHTML = '';
    }
    if (uiState.resultEl) {
      uiState.resultEl.innerHTML = '';
    }
  }

  function bindWheelModalControls(state) {
    if (!state) return;
    const spinHandler = () => {
      if (!uiState.sourceSelect) return;
      spinWheel(uiState.sourceSelect.value);
    };
    if (state.spinButton) {
      state.spinButton.addEventListener('click', spinHandler);
    }
    const closeHandler = () => closeWheelModal();
    if (state.closeBtn) {
      state.closeBtn.addEventListener('click', closeHandler);
    }
    state.spinHandler = spinHandler;
    state.closeHandler = closeHandler;
  }

  function unbindWheelModalControls(state) {
    if (!state) return;
    if (state.spinButton && state.spinHandler) {
      state.spinButton.removeEventListener('click', state.spinHandler);
    }
    if (state.closeBtn && state.closeHandler) {
      state.closeBtn.removeEventListener('click', state.closeHandler);
    }
    state.spinHandler = null;
    state.closeHandler = null;
  }

  return {
    setupWheelModal,
    openWheelModal,
    closeWheelModal,
  };
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

function buildSpinnerCandidates(listType, rawData, options = {}) {
  const entries = Object.entries(rawData || {});
  if (!entries.length) return [];

  const annotateListType = Boolean(options.annotateListType);
  const mapped = entries
    .map(([id, item]) => {
      if (!item) return null;
      const withId = item.__id ? item : Object.assign({ __id: id }, item);
      if (!annotateListType) {
        return withId;
      }
      if (withId.__listType === listType) {
        return withId;
      }
      return Object.assign({}, withId, { __listType: listType });
    })
    .filter(Boolean);

  const eligibleItems = mapped.filter((item) => isSpinnerStatusEligible(item));
  if (!eligibleItems.length) return [];

  const shouldApplySeriesLogic = ['movies', 'tvShows', 'anime'].includes(listType);
  if (!shouldApplySeriesLogic) {
    return eligibleItems.filter(item => !isItemWatched(item));
  }

  const standalone = [];
  const seriesMap = new Map();
  const parseSeriesOrder = wheelConfig.parseSeriesOrder;

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

function buildSpinnerDataScope(listType, rawData) {
  if (!rawData) return {};
  const supportsFilter = wheelConfig.listSupportsActorFilter(listType);
  if (!supportsFilter) return rawData;
  const filterValue = wheelConfig.getActorFilterValue(listType);
  if (!filterValue) return rawData;
  const scoped = {};
  Object.entries(rawData).forEach(([id, entry]) => {
    if (wheelConfig.matchesActorFilter(listType, entry, filterValue)) {
      scoped[id] = entry;
    }
  });
  return scoped;
}

function loadSpinnerSourceData(listType) {
  const cached = wheelConfig.listCaches?.[listType];
  if (cached) {
    return Promise.resolve({ data: cached, source: 'cache' });
  }
  const user = wheelConfig.getCurrentUser();
  const dbInstance = wheelConfig.getDb();
  if (!user || !dbInstance) {
    return Promise.resolve({ data: {}, source: 'cache' });
  }
  const listRef = ref(dbInstance, `users/${user.uid}/${listType}`);
  return get(listRef).then(snap => ({ data: snap.val() || {}, source: 'remote' }));
}

function ensureWheelAccelerationAudio() {
  if (!WHEEL_ACCEL_AUDIO_URL || typeof Audio === 'undefined') {
    return null;
  }
  if (!wheelAccelAudio) {
    try {
      wheelAccelAudio = new Audio(WHEEL_ACCEL_AUDIO_URL);
      wheelAccelAudio.preload = 'auto';
      wheelAccelAudio.crossOrigin = 'anonymous';
      wheelAccelAudio.volume = 0.9;
    } catch (err) {
      console.warn('Wheel audio init failed', err);
      wheelAccelAudio = null;
      return null;
    }
  }
  return wheelAccelAudio;
}

function playWheelAccelerationAudio() {
  const audio = ensureWheelAccelerationAudio();
  if (!audio) return;
  try {
    audio.currentTime = 0;
    const playPromise = audio.play();
    if (playPromise && typeof playPromise.catch === 'function') {
      playPromise.catch(err => console.warn('Wheel audio playback blocked', err));
    }
  } catch (err) {
    console.warn('Wheel audio playback failed', err);
  }
}

function scheduleWheelAccelerationAudio(schedule) {
  if (!Array.isArray(schedule) || !schedule.length || !WHEEL_ACCEL_AUDIO_URL) {
    return;
  }
  if (wheelAccelAudioTimeoutId) {
    clearTimeout(wheelAccelAudioTimeoutId);
    wheelAccelAudioTimeoutId = null;
  }
  const triggerIndex = Math.min(schedule.length - 1, Math.max(1, Math.floor(schedule.length * 0.12)));
  const triggerDelay = schedule[triggerIndex];
  if (!Number.isFinite(triggerDelay)) {
    return;
  }
  const leadIn = 150;
  wheelAccelAudioTimeoutId = setTimeout(() => {
    wheelAccelAudioTimeoutId = null;
    playWheelAccelerationAudio();
  }, Math.max(0, triggerDelay - leadIn));
}

function resetWheelAccelerationAudio() {
  if (wheelAccelAudioTimeoutId) {
    clearTimeout(wheelAccelAudioTimeoutId);
    wheelAccelAudioTimeoutId = null;
  }
  if (wheelAccelAudio) {
    try {
      wheelAccelAudio.pause();
      wheelAccelAudio.currentTime = 0;
    } catch (_) {}
  }
}

function clearWheelAnimation() {
  resetWheelAccelerationAudio();
  spinTimeouts.forEach(id => clearTimeout(id));
  spinTimeouts = [];
  const { spinnerEl } = wheelUIState;
  if (!spinnerEl) return;
  spinnerEl.classList.remove('spinning');
  spinnerEl.innerHTML = '';
}

function renderWheelResult(item, listType) {
  const { resultEl } = wheelUIState;
  if (!resultEl) return;
  if (!item) {
    resultEl.textContent = '';
    return;
  }

  const actionVerb = listType === 'books' ? 'read' : 'watch';
  resultEl.innerHTML = '';

  const heading = document.createElement('div');
  heading.className = 'wheel-result-heading';
  heading.textContent = `You should ${actionVerb} next:`;
  resultEl.appendChild(heading);

  const entryId = item.__id || item.id || '';
  const cardId = entryId || `wheel-${Date.now()}`;
  let cardNode = null;

  if (wheelConfig.isCollapsibleList(listType)) {
    cardNode = wheelConfig.buildCollapsibleMovieCard(listType, cardId, item, 0, {
      hideCard: false,
      displayEntryId: entryId || cardId,
      interactive: false,
    });
    if (cardNode) {
      cardNode.classList.add('expanded');
    }
  } else {
    cardNode = wheelConfig.buildStandardCard(listType, cardId, item);
  }

  if (!cardNode) {
    const fallback = document.createElement('div');
    fallback.className = 'wheel-result-card';
    fallback.textContent = item.title || '(no title)';
    resultEl.appendChild(fallback);
    return;
  }

  cardNode.classList.add('wheel-result-card');
  resultEl.appendChild(cardNode);
}

function resolveSeriesRedirect(listType, item, rawData) {
  if (!item || !rawData) return item;
  if (!['movies', 'tvShows', 'anime'].includes(listType)) return item;
  const rawSeries = typeof item.seriesName === 'string' ? item.seriesName.trim() : '';
  if (!rawSeries) return item;
  const targetKey = rawSeries.toLowerCase();
  const parseSeriesOrder = wheelConfig.parseSeriesOrder;
  const siblings = Object.entries(rawData || {}).map(([id, entry]) => {
    if (!entry) return null;
    const entrySeries = typeof entry.seriesName === 'string' ? entry.seriesName.trim() : '';
    if (!entrySeries || entrySeries.toLowerCase() !== targetKey) return null;
    return entry.__id ? entry : Object.assign({ __id: id }, entry);
  }).filter(Boolean);
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

function animateWheelSequence(candidates, chosenIndex, listType, finalItemOverride, options = {}) {
  const len = candidates.length;
  const { spinnerEl } = wheelUIState;
  if (len === 0 || !spinnerEl) return;

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

  const totalDuration = WHEEL_SPIN_DURATION_MS;
  const stepCount = sequence.length;
  const lastIndex = stepCount - 1;
  const schedule = [];
  for (let i = 0; i < stepCount; i++) {
    if (lastIndex === 0) {
      schedule.push(0);
    } else {
      const progress = i / lastIndex;
      const eased = 1 - Math.pow(1 - progress, 3);
      schedule.push(Math.round(eased * totalDuration));
    }
  }

  if (options.shouldTriggerAudio) {
    scheduleWheelAccelerationAudio(schedule);
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
      if (!wheelUIState.spinnerEl) return;
      const isFinal = idx === sequence.length - 1;
      wheelUIState.spinnerEl.innerHTML = '';
      const span = document.createElement('span');
      span.className = `spin-text${isFinal ? ' final' : ''}`;
      span.textContent = item.title || '(no title)';
      wheelUIState.spinnerEl.appendChild(span);
      try { console.log(`[Wheel] step ${idx + 1}/${sequence.length}: ${item.title || '(no title)'}${isFinal ? ' [FINAL]' : ''}`); } catch (_) {}
      if (isFinal) {
        wheelUIState.spinnerEl.classList.remove('spinning');
        renderWheelResult(item, listType);
        spinTimeouts = [];
      }
    }, schedule[idx]);
    spinTimeouts.push(timeout);
  });
}

function spinWheel(listType) {
  const user = wheelConfig.getCurrentUser();
  if (!user) {
    showAlert('Not signed in');
    return;
  }
  const { spinnerEl, resultEl } = wheelUIState;
  if (!spinnerEl || !resultEl) {
    console.warn('Wheel spinner UI is not mounted. Open the wheel modal first.');
    return;
  }

  const primaryTypes = Array.isArray(wheelConfig.primaryListTypes) ? wheelConfig.primaryListTypes : [];
  const defaultListType = primaryTypes[0] || 'movies';
  const requestedType = listType || defaultListType;
  const isSpinAll = requestedType === WHEEL_SPIN_ALL_OPTION;
  if (!isSpinAll && primaryTypes.length && !primaryTypes.includes(requestedType)) {
    showAlert('Choose a valid list to spin.');
    return;
  }

  const showEmptyState = (allMode = false) => {
    if (!wheelUIState.spinnerEl || !wheelUIState.resultEl) return;
    clearWheelAnimation();
    const emptyState = document.createElement('span');
    emptyState.className = 'spin-text';
    emptyState.textContent = 'No eligible items to spin.';
    wheelUIState.spinnerEl.appendChild(emptyState);
    wheelUIState.resultEl.textContent = allMode
      ? 'Nothing left to spin across your lists. Add something new or reset a few items back to Planned/Watching.'
      : 'No eligible items right now. Add something new or reset some items back to Planned/Watching.';
  };

  clearWheelAnimation();
  resultEl.innerHTML = '';
  spinnerEl.classList.remove('hidden');
  spinnerEl.classList.add('spinning');
  const placeholder = document.createElement('span');
  placeholder.className = 'spin-text';
  placeholder.textContent = 'Spinning…';
  spinnerEl.appendChild(placeholder);

  const handleError = (err) => {
    console.error('Wheel load failed', err);
    if (!wheelUIState.spinnerEl || !wheelUIState.resultEl) {
      clearWheelAnimation();
      return;
    }
    clearWheelAnimation();
    const errorState = document.createElement('span');
    errorState.className = 'spin-text';
    errorState.textContent = 'Unable to load items.';
    wheelUIState.spinnerEl.appendChild(errorState);
    wheelUIState.resultEl.textContent = 'Unable to load items.';
  };

  const handleSingleSpin = ({ data, source }) => {
    if (!wheelUIState.spinnerEl || !wheelUIState.resultEl) {
      clearWheelAnimation();
      return;
    }
    const scopedData = buildSpinnerDataScope(requestedType, data);
    const candidates = buildSpinnerCandidates(requestedType, scopedData);
    try {
      console.log('[Wheel] spin start', {
        listType: requestedType,
        source,
        candidateCount: candidates.length,
        titles: candidates.map(c => c && c.title).filter(Boolean)
      });
    } catch (_) {}
    if (candidates.length === 0) {
      showEmptyState(false);
      return;
    }
    const chosenIndex = Math.floor(Math.random() * candidates.length);
    const chosenCandidate = candidates[chosenIndex];
    const resolvedCandidate = resolveSeriesRedirect(requestedType, chosenCandidate, data) || chosenCandidate;
    const rawEntryCount = Object.keys(data || {}).length;
    const shouldTriggerAudio = true;
    try { console.log('[Wheel] pick', { chosenIndex, chosen: chosenCandidate?.title, resolved: resolvedCandidate?.title }); } catch (_) {}
    animateWheelSequence(candidates, chosenIndex, requestedType, resolvedCandidate, { shouldTriggerAudio });
  };

  const handleSpinAll = (payloads) => {
    if (!wheelUIState.spinnerEl || !wheelUIState.resultEl) {
      clearWheelAnimation();
      return;
    }
    let totalRawEntries = 0;
    const candidatePool = [];
    const rawDataByType = {};
    const logBreakdown = [];
    payloads.forEach(entry => {
      if (!entry) return;
      const type = entry.listType;
      rawDataByType[type] = entry.data;
      totalRawEntries += Object.keys(entry.data || {}).length;
      const scoped = buildSpinnerDataScope(type, entry.data);
      const candidates = buildSpinnerCandidates(type, scoped, { annotateListType: true });
      if (candidates.length) {
        candidatePool.push(...candidates);
      }
      logBreakdown.push({ listType: type, source: entry.source, candidateCount: candidates.length });
    });
    try {
      console.log('[Wheel] spin start', {
        listType: WHEEL_SPIN_ALL_OPTION,
        totalCandidates: candidatePool.length,
        breakdown: logBreakdown,
      });
    } catch (_) {}
    if (!candidatePool.length) {
      showEmptyState(true);
      return;
    }
    const chosenIndex = Math.floor(Math.random() * candidatePool.length);
    const chosenCandidate = candidatePool[chosenIndex];
    const candidateType = primaryTypes.includes(chosenCandidate.__listType)
      ? chosenCandidate.__listType
      : primaryTypes[0];
    const resolvedCandidate = resolveSeriesRedirect(candidateType, chosenCandidate, rawDataByType[candidateType]) || chosenCandidate;
    const shouldTriggerAudio = true;
    try { console.log('[Wheel] pick', { mode: WHEEL_SPIN_ALL_OPTION, chosenIndex, chosenType: candidateType, chosen: chosenCandidate?.title, resolved: resolvedCandidate?.title }); } catch (_) {}
    animateWheelSequence(candidatePool, chosenIndex, candidateType, resolvedCandidate, { shouldTriggerAudio });
  };

  const loadPromise = isSpinAll
    ? Promise.all(primaryTypes.map(type => loadSpinnerSourceData(type).then(payload => Object.assign({ listType: type }, payload))))
    : loadSpinnerSourceData(requestedType);

  loadPromise.then(result => {
    if (isSpinAll) {
      handleSpinAll(result);
    } else {
      handleSingleSpin(result);
    }
  }).catch(handleError);
}