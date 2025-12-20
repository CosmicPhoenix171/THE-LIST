import { PRIMARY_LIST_TYPES, INTRO_SESSION_KEY, WHEEL_AUDIO_MUTE_KEY } from './config.js';
import { 
  safeStorageGet, 
  safeStorageSet, 
  safeStorageRemove,
  safeLocalStorageGet,
  safeLocalStorageSet,
  safeLocalStorageRemove
} from './utils.js';

export { 
  safeStorageGet, 
  safeStorageSet, 
  safeStorageRemove,
  safeLocalStorageGet,
  safeLocalStorageSet,
  safeLocalStorageRemove
};

export let appInitialized = false;
export let currentUser = null;
export const listeners = {};
export let tmdbWarningShown = false;
export let spinTimeouts = [];

export const actorFilters = { movies: '', tvShows: '', anime: '' };
export const expandedCards = { movies: new Set() };
export const sortModes = { movies: 'title', tvShows: 'title', anime: 'title', books: 'title' };
export const listCaches = {};
export const finishedCaches = {};
export const metadataRefreshInflight = new Set();

export const suggestionForms = new Set();
export let globalSuggestionClickBound = false;
export let activeSeasonEditor = null;

export const seriesGroups = {};
export const crossListSeriesCache = new Map();
export let seriesIndexVersion = 0;
export let crossSeriesRefreshScheduled = false;

export const seriesTreeDragState = {
  activeNode: null,
  listElement: null,
  placeholder: null,
  cardId: null,
  listType: null,
  cardElement: null,
  entries: null,
  entryMap: null,
  activeEntryKey: null,
};
export let seriesTreeDragEventsBound = false;
export let seriesTreeWheelUnsubscribe = null;
export const seriesSortState = new Map();

export let introPlayed = safeStorageGet(INTRO_SESSION_KEY) === '1';

export const franchiseState = {
  loaded: false,
  records: [],
};
export let franchiseSortMode = 'default';

export const franchiseDragState = {
  activeEntryId: null,
  activeFranchiseId: null,
  activeTrack: null,
  placeholder: null,
};
export let franchiseDragEventsBound = false;
export let franchiseWheelUnsubscribe = null;

export let persistedNotifications = [];
export let notificationSignatureCache = new Set();
export const finishedListeners = {};
export let showFinishedOnly = false;
export let libraryFullyLoaded = false;

export const unifiedFilters = {
  search: '',
  types: new Set(PRIMARY_LIST_TYPES),
};

export let bugReports = [];
export let bugReportsLoaded = false;
export let bugReportLoadError = null;
export let bugReportUnsubscribe = null;
export let bugPopoverOpen = false;

export let realisticTimeMode = false;
export const virtualListControllers = new Map();
export let unifiedVirtualController = null;

export let wheelSourceSelect = null;
export let wheelSpinnerEl = null;
export let wheelResultEl = null;
export let wheelModalState = null;
export let wheelSpinAudio = null;
export let wheelAudioMuted = safeStorageGet(WHEEL_AUDIO_MUTE_KEY) === '1';

export let notificationPopoverOpen = false;
export let activeAddModal = null;
export let librarySortMode = 'default';

export let globalNotificationsUnsubscribe = null;

export function setAppInitialized(value) { appInitialized = value; }
export function setCurrentUser(value) { currentUser = value; }
export function getCurrentUser() { return currentUser; }
export function setTmdbWarningShown(value) { tmdbWarningShown = value; }
export function setGlobalSuggestionClickBound(value) { globalSuggestionClickBound = value; }
export function setActiveSeasonEditor(value) { activeSeasonEditor = value; }
export function setSeriesIndexVersion(value) { seriesIndexVersion = value; }
export function setCrossSeriesRefreshScheduled(value) { crossSeriesRefreshScheduled = value; }
export function setSeriesTreeDragEventsBound(value) { seriesTreeDragEventsBound = value; }
export function setSeriesTreeWheelUnsubscribe(value) { seriesTreeWheelUnsubscribe = value; }
export function setIntroPlayed(value) { introPlayed = value; }
export function setFranchiseSortMode(value) { franchiseSortMode = value; }
export function setFranchiseDragEventsBound(value) { franchiseDragEventsBound = value; }
export function setFranchiseWheelUnsubscribe(value) { franchiseWheelUnsubscribe = value; }
export function setShowFinishedOnly(value) {
  const next = Boolean(value);
  if (showFinishedOnly === next) return;
  showFinishedOnly = next;

  // Changing the display pool (main vs finished) must invalidate any
  // cached cross-list series/collection grouping.
  try {
    crossListSeriesCache.clear();
  } catch (_) {
    // no-op
  }
  seriesIndexVersion += 1;
}
export function setLibraryFullyLoaded(value) { libraryFullyLoaded = value; }
export function getLibraryFullyLoaded() { return libraryFullyLoaded; }
export function setBugReports(value) { bugReports = value; }
export function setBugReportsLoaded(value) { bugReportsLoaded = value; }
export function setBugReportLoadError(value) { bugReportLoadError = value; }
export function setBugReportUnsubscribe(value) { bugReportUnsubscribe = value; }
export function setBugPopoverOpen(value) { bugPopoverOpen = value; }
export function setRealisticTimeMode(value) { realisticTimeMode = value; }
export function setUnifiedVirtualController(value) { unifiedVirtualController = value; }
export function setWheelSourceSelect(value) { wheelSourceSelect = value; }
export function setWheelSpinnerEl(value) { wheelSpinnerEl = value; }
export function setWheelResultEl(value) { wheelResultEl = value; }
export function setWheelModalState(value) { wheelModalState = value; }
export function setWheelSpinAudio(value) { wheelSpinAudio = value; }
export function setWheelAudioMuted(value) { wheelAudioMuted = value; }
export function setNotificationPopoverOpen(value) { notificationPopoverOpen = value; }
export function setActiveAddModal(value) { activeAddModal = value; }
export function setLibrarySortMode(value) { librarySortMode = value; }
export function setGlobalNotificationsUnsubscribe(value) { globalNotificationsUnsubscribe = value; }
export function setPersistedNotifications(value) { persistedNotifications = value; }
export function setNotificationSignatureCache(value) { notificationSignatureCache = value; }

export function getDisplayCacheMap() {
  return showFinishedOnly ? finishedCaches : listCaches;
}

export function getDisplayCache(listType) {
  return getDisplayCacheMap()[listType];
}

export function getSeriesGroupEntries(listType, cardId) {
  if (!seriesGroups[listType]) return null;
  return seriesGroups[listType].get(cardId) || null;
}

export function setSeriesGroup(listType, cardId, entries) {
  if (!seriesGroups[listType]) {
    seriesGroups[listType] = new Map();
  }
  seriesGroups[listType].set(cardId, entries);
}

export function clearSeriesGroups(listType) {
  if (seriesGroups[listType]) {
    seriesGroups[listType].clear();
  }
}
