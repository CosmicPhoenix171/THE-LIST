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
const TMDB_API_BASE_URL = 'https://api.themoviedb.org/3';
const TMDB_IMAGE_BASE_URL = 'https://image.tmdb.org/t/p/w500';
const TMDB_KEYWORD_DISCOVER_PAGE_LIMIT = 3;
const TMDB_KEYWORD_DISCOVER_MAX_RESULTS = 40;
const GOOGLE_BOOKS_API_KEY = '';
const GOOGLE_BOOKS_API_URL = 'https://www.googleapis.com/books/v1';
const JIKAN_API_BASE_URL = 'https://api.jikan.moe/v4';
const LIST_LOAD_STAGGER_MS = 600;
const JIKAN_REQUEST_MIN_DELAY_MS = 500;
const JIKAN_RETRY_BASE_DELAY_MS = 1500;
const JIKAN_MAX_RETRIES = 2;
const MYANIMELIST_ANIME_URL = 'https://myanimelist.net/anime';
const METADATA_SCHEMA_VERSION = 4;
const APP_VERSION = 'test-pages-2025.11.15';
const ANIME_FRANCHISE_RELATION_TYPES = new Set([
  'SEQUEL',
  'PREQUEL',
  'MAIN_STORY',
  'SIDE_STORY',
  'ALTERNATIVE',
  'SPIN_OFF',
  'COMPILATION',
  'CONTAINS',
  'PARENT',
  'CHILD',
  'OTHER'
]);
const ANIME_FRANCHISE_ALLOWED_FORMATS = new Set([
  'TV',
  'TV_SHORT',
  'ONA',
  'OVA',
  'MOVIE',
  'SPECIAL'
]);
const ANIME_FRANCHISE_MAX_DEPTH = 4;
const ANIME_FRANCHISE_MAX_ENTRIES = 25;
const ANIME_FRANCHISE_SCAN_SERIES_LIMIT = 4;
const ANIME_FRANCHISE_RESCAN_INTERVAL_MS = 6 * 60 * 60 * 1000;
const ANIME_FRANCHISE_IGNORE_KEY = '__THE_LIST_ANIME_IGNORE__';
const ANIME_STATUS_PRIORITY = {
  RELEASING: 6,
  NOT_YET_RELEASED: 5,
  HIATUS: 4,
  CANCELLED: 3,
  FINISHED: 2,
  UNKNOWN: 1,
};
const NOTIFICATION_STORAGE_KEY = '__THE_LIST_NOTIFICATIONS__';
const MAX_PERSISTED_NOTIFICATIONS = 50;
const NOTIFICATION_SEEN_KEY = '__THE_LIST_NOTIFICATIONS_SEEN__';

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
const finishedCaches = {};
const metadataRefreshInflight = new Set();
const AUTOCOMPLETE_LISTS = new Set(['movies', 'tvShows', 'anime', 'books']);
const PRIMARY_LIST_TYPES = ['movies', 'tvShows', 'anime', 'books'];
const suggestionForms = new Set();
let globalSuggestionClickBound = false;
let activeSeasonEditor = null;
const seriesGroups = {};
const crossListSeriesCache = new Map();
let seriesIndexVersion = 0;
let crossSeriesRefreshScheduled = false;
const COLLAPSIBLE_LISTS = new Set(['movies', 'tvShows', 'anime']);
const SERIES_BULK_DELETE_LISTS = new Set(['movies', 'tvShows', 'anime']);
const INTRO_SESSION_KEY = '__THE_LIST_INTRO_SEEN__';
let introPlayed = safeStorageGet(INTRO_SESSION_KEY) === '1';
const franchiseState = {
  loaded: false,
  records: [],
};
const FRANCHISE_MEDIA_LABELS = {
  movie: 'Movie',
  tv: 'TV Series',
  season: 'Season',
  special: 'Special',
};
const jikanRequestQueue = [];
let jikanQueueActive = false;
let lastJikanRequestTime = 0;
let persistedNotifications = [];
let notificationSignatureCache = new Set();
const finishedListeners = {};
let showFinishedOnly = false;
let libraryFullyLoaded = false;
const unifiedFilters = {
  search: '',
  types: new Set(PRIMARY_LIST_TYPES),
};
const MEDIA_TYPE_LABELS = {
  movies: 'Movies',
  tvShows: 'TV Shows',
  anime: 'Anime',
  books: 'Books',
};
const FINISH_RATING_MIN = 1;
const FINISH_RATING_MAX = 10;
const RUNTIME_THRESHOLDS = {
  MINUTES: { max: 60, color: 'minutes', label: 'minutes' },
  HOURS: { max: 1440, color: 'hours', label: 'hours' },
  DAYS: { max: 10080, color: 'days', label: 'days' },
  WEEKS: { max: 43200, color: 'weeks', label: 'weeks' },
  MONTHS: { max: 525600, color: 'months', label: 'months' },
  YEARS: { color: 'years', label: 'years' }
};

const RUNTIME_PILL_UNITS = [
  { key: 'minutes', label: 'Minutes' },
  { key: 'hours', label: 'Hours' },
  { key: 'days', label: 'Days' },
  { key: 'weeks', label: 'Weeks' },
  { key: 'months', label: 'Months' },
  { key: 'years', label: 'Years' }
];

function getDisplayCacheMap() {
  return showFinishedOnly ? finishedCaches : listCaches;
}

function getDisplayCache(listType) {
  const map = getDisplayCacheMap();
  return map[listType];
}

function resolveCardRenderItem(listType, entryId, fallbackId) {
  if (!listType) return null;
  const cache = getDisplayCache(listType) || {};
  if (entryId && cache[entryId]) {
    return cache[entryId];
  }
  if (fallbackId && cache[fallbackId]) {
    return cache[fallbackId];
  }
  return null;
}

function invalidateSeriesCrossListCache(options = {}) {
  const { schedule = true } = options;
  seriesIndexVersion += 1;
  crossListSeriesCache.clear();
  if (schedule) {
    scheduleCrossSeriesRefresh();
  }
}

function scheduleCrossSeriesRefresh() {
  if (crossSeriesRefreshScheduled) return;
  if (typeof window === 'undefined') return;
  crossSeriesRefreshScheduled = true;
  window.requestAnimationFrame(() => {
    crossSeriesRefreshScheduled = false;
    refreshAllSeriesCards();
  });
}

function refreshAllSeriesCards() {
  if (typeof document === 'undefined') return;
  document.querySelectorAll('.card.collapsible.movie-card').forEach(card => {
    const listType = card.dataset.listType || '';
    const cardId = card.dataset.id || '';
    if (!listType || !cardId) {
      return;
    }
    const entryId = card.dataset.entryId || cardId;
    const item = resolveCardRenderItem(listType, entryId, cardId);
    if (!item) {
      return;
    }
    renderMovieCardContent(card, listType, cardId, item, entryId);
  });
}

function refreshSeriesCardContent(card) {
  if (!card) return;
  const listType = card.dataset.listType || '';
  const cardId = card.dataset.id || '';
  if (!listType || !cardId) return;
  const entryId = card.dataset.entryId || cardId;
  const item = resolveCardRenderItem(listType, entryId, cardId);
  if (!item) return;
  renderMovieCardContent(card, listType, cardId, item, entryId);
}

function formatLibraryStatNumber(value) {
  const num = Number(value) || 0;
  return num.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function getRuntimeThresholdClass(totalMinutes) {
  if (totalMinutes < RUNTIME_THRESHOLDS.MINUTES.max) return 'runtime-minutes';
  if (totalMinutes < RUNTIME_THRESHOLDS.HOURS.max) return 'runtime-hours';
  if (totalMinutes < RUNTIME_THRESHOLDS.DAYS.max) return 'runtime-days';
  if (totalMinutes < RUNTIME_THRESHOLDS.WEEKS.max) return 'runtime-weeks';
  if (totalMinutes < RUNTIME_THRESHOLDS.MONTHS.max) return 'runtime-months';
  return 'runtime-years';
}

function createRuntimePillValueMap() {
  return {
    minutes: 0,
    hours: 0,
    days: 0,
    weeks: 0,
    months: 0,
    years: 0,
  };
}

function formatRuntimePillNumber(value) {
  const amount = Math.max(0, Math.floor(value));
  if (amount === 0) {
    return '00';
  }
  if (amount < 10) {
    return `<span class="runtime-pill-leading-zero">0</span>${amount}`;
  }
  return amount.toString().padStart(2, '0');
}

function getRuntimeUnitBreakdown(totalMinutes) {
  const minutesPerHour = 60;
  const minutesPerDay = minutesPerHour * 24;
  const minutesPerWeek = minutesPerDay * 7;
  const minutesPerMonth = minutesPerDay * 30;
  const minutesPerYear = minutesPerDay * 365;
  let remaining = Math.max(0, Math.floor(totalMinutes));
  const years = Math.floor(remaining / minutesPerYear);
  remaining -= years * minutesPerYear;
  const months = Math.floor(remaining / minutesPerMonth);
  remaining -= months * minutesPerMonth;
  const weeks = Math.floor(remaining / minutesPerWeek);
  remaining -= weeks * minutesPerWeek;
  const days = Math.floor(remaining / minutesPerDay);
  remaining -= days * minutesPerDay;
  const hours = Math.floor(remaining / minutesPerHour);
  remaining -= hours * minutesPerHour;
  const minutes = remaining;
  return { minutes, hours, days, weeks, months, years };
}

function renderRuntimePillsDisplay(valueMap = createRuntimePillValueMap(), visibilityMap = {}, activeUnit = null) {
  const pills = [...RUNTIME_PILL_UNITS].reverse().map(({ key, label }) => {
    const isVisible = key === 'minutes' || Boolean(visibilityMap[key]);
    if (!isVisible) return '';
    const isActive = activeUnit === key;
    const valueMarkup = formatRuntimePillNumber(valueMap[key] || 0);
    return `
      <span class="runtime-pill runtime-pill-${key} is-visible${isActive ? ' is-active' : ''}">
        <span class="runtime-pill-value">${valueMarkup}</span>
        <span class="runtime-pill-label">${label}</span>
      </span>
    `;
  }).filter(Boolean).join('');
  return `<span class="runtime-pill-row">${pills}</span>`;
}

function animateRuntimeProgression(chipElement, finalMinutes) {
  if (!chipElement || finalMinutes <= 0) return;
  
  const valueEl = chipElement.querySelector('.library-stat-value');
  if (!valueEl) return;
  
  const TARGET_SECTION_DURATION_MS = 5000;
  const FPS = 60;
  const FRAMES_PER_SECTION = (TARGET_SECTION_DURATION_MS / 1000) * FPS;
  const finalUnitValues = getRuntimeUnitBreakdown(finalMinutes);
  
  const definitions = [
    { unit: 'minutes', threshold: 0, divisor: 1, max: 60, className: 'runtime-minutes' },
    { unit: 'hours', threshold: 60, divisor: 60, max: 24, className: 'runtime-hours' },
    { unit: 'days', threshold: 1440, divisor: 1440, max: 7, className: 'runtime-days' },
    { unit: 'weeks', threshold: 10080, divisor: 10080, max: 4, className: 'runtime-weeks' },
    { unit: 'months', threshold: 43200, divisor: 43200, max: 12, className: 'runtime-months' },
    { unit: 'years', threshold: 525600, divisor: 525600, max: Infinity, className: 'runtime-years' }
  ];

  const sequence = [];
  let stageStartMinutes = 0;
  for (let i = 0; i < definitions.length; i++) {
    const def = definitions[i];
    if (finalMinutes < def.threshold && i !== 0) break;
    const nextDef = definitions[i + 1];
    const isLastStage = !nextDef || finalMinutes < nextDef.threshold;
    const plannedRange = isLastStage
      ? Math.max(finalMinutes - stageStartMinutes, 0)
      : def.max * def.divisor;
    const stageEndMinutes = stageStartMinutes + plannedRange;
    const rangeMinutes = stageEndMinutes - stageStartMinutes;
    sequence.push({
      unit: def.unit,
      className: def.className,
      startMinutes: stageStartMinutes,
      endMinutes: stageEndMinutes,
      rangeMinutes,
      finalValue: finalUnitValues[def.unit] || 0,
    });
    stageStartMinutes = stageEndMinutes;
    if (isLastStage) break;
  }

  if (!sequence.length) {
    valueEl.innerHTML = renderRuntimePillsDisplay(finalUnitValues, { minutes: true });
    return;
  }
  
  let activeStageIndex = 0;
  let currentFrame = 0;

  function updateFrame() {
    if (activeStageIndex >= sequence.length) {
      const visibilityMap = sequence.reduce((acc, stage) => {
        acc[stage.unit] = true;
        return acc;
      }, {});
      valueEl.innerHTML = renderRuntimePillsDisplay(finalUnitValues, visibilityMap);
      definitions.forEach(d => chipElement.classList.remove(d.className));
      chipElement.classList.add(getRuntimeThresholdClass(finalMinutes));
      return;
    }
    
    const stage = sequence[activeStageIndex];
    if (stage.rangeMinutes <= 0) {
      activeStageIndex++;
      requestAnimationFrame(updateFrame);
      return;
    }

    currentFrame++;
    const progress = Math.min(currentFrame / FRAMES_PER_SECTION, 1);
    const currentTotalMinutes = stage.startMinutes + (stage.rangeMinutes * progress);
    const displayValues = getRuntimeUnitBreakdown(currentTotalMinutes);
    const visibilityMap = {};
    for (let i = 0; i <= activeStageIndex; i++) {
      visibilityMap[sequence[i].unit] = true;
    }

    definitions.forEach(d => chipElement.classList.remove(d.className));
    chipElement.classList.add(stage.className);

    valueEl.innerHTML = renderRuntimePillsDisplay(displayValues, visibilityMap, stage.unit);

    if (progress >= 1) {
      activeStageIndex++;
      currentFrame = 0;
    }

    requestAnimationFrame(updateFrame);
  }
  
  setTimeout(() => requestAnimationFrame(updateFrame), 300);
}

function buildLibraryStatChip(label, value, options = {}) {
  const { modifier = '' } = options;
  const chip = createEl('span', modifier ? `library-stat-chip ${modifier}` : 'library-stat-chip');
  const valueEl = createEl('span', 'library-stat-value', { text: value });
  const labelEl = createEl('span', 'library-stat-label', { text: label });
  chip.appendChild(valueEl);
  chip.appendChild(labelEl);
  return chip;
}
// ============================================================================
// Feature Map (grouped by responsibilities)
// 1. Auth & Session Flow
// 2. Add Modal & Item Management
// 3. List Loading & Collapsible Cards
// 4. Unified Library
// 5. Franchise Timelines
// 6. Metadata & External API Pipelines
// 7. Spinner / Wheel Experience
// 8. Anime Franchise Automations
// 9. Utility Helpers & Shared Formatters
// ============================================================================

// DOM references
const loginScreen = document.getElementById('login-screen');
const googleSigninBtn = document.getElementById('google-signin');
const appRoot = document.getElementById('app');
const userNameEl = document.getElementById('user-name');
const signOutBtn = document.getElementById('sign-out');
const backToTopBtn = document.getElementById('back-to-top');
const modalRoot = document.getElementById('modal-root');
const combinedListEl = document.getElementById('combined-list');
const franchiseSectionEl = document.getElementById('franchise-section');
const franchiseShelfEl = document.getElementById('franchise-shelf');
const franchiseMetaEl = document.getElementById('franchise-meta');
const libraryStatsSummaryEl = document.getElementById('library-stats-summary');
const unifiedSearchInput = document.getElementById('library-search');
const typeFilterButtons = document.querySelectorAll('[data-type-toggle]');
const finishedFilterToggle = document.getElementById('finished-filter-toggle');
const notificationCenter = document.getElementById('notification-center');
const notificationShell = document.getElementById('notification-shell');
const notificationBellBtn = document.getElementById('notification-bell');
const notificationBadgeEl = document.getElementById('notification-count');
const notificationEmptyStateEl = document.getElementById('notification-empty-state');
const wheelModalTrigger = document.getElementById('open-wheel-modal');
const wheelModalTemplate = document.getElementById('wheel-modal-template');
let wheelSourceSelect = null;
let wheelSpinnerEl = null;
let wheelResultEl = null;
let wheelModalState = null;
let notificationPopoverOpen = false;
const addModalTrigger = document.getElementById('open-add-modal');
const addFormTemplatesContainer = document.getElementById('add-form-templates');
const addFormTemplateMap = {};
if (addFormTemplatesContainer) {
  addFormTemplatesContainer.querySelectorAll('template[data-list]').forEach(template => {
    const type = template && template.dataset ? template.dataset.list : '';
    if (type) {
      addFormTemplateMap[type] = template;
    }
  });
}
let activeAddModal = null;

let animeFranchiseScanTimer = null;
let animeFranchiseScanInflight = false;
let animeFranchiseLastScanSignature = '';
let animeFranchiseLastScanTime = 0;
let pendingAnimeScanData = null;
const animeFranchiseMissingHashes = new Map();
const animeFranchiseIgnoredIds = loadAnimeFranchiseIgnoredIds();

const tmEasterEgg = (() => {
  const sprites = [];
  let running = false;
  let spawnTimer = null;
  let rafId = null;
  let layer = null;
  let intensityMultiplier = 1;
  const gravity = 0.32;
  const bounce = 0.68;
  const friction = 0.995;
  const settleThreshold = 0.12;
  const wakeSpeed = 0.35;
  const supportAngleThreshold = 0.5;
  const supportDistanceEpsilon = 0.75;
  const spawnMinDelay = 320;
  const spawnMaxDelay = 900;

  const seasonThemes = {
    winter: {
      text: '❄',
      color: '#c3e8ff',
      glow: '0 0 18px rgba(195,232,255,0.85)',
    },
    halloween: {
      text: '🎃',
      color: '#ffb347',
      glow: '0 0 18px rgba(255,138,0,0.85)',
    },
  };

  function getSeasonalTheme(now = new Date()) {
    const month = now.getMonth(); // 0-indexed
    if (month === 11) return seasonThemes.winter; // December
    if (month === 9) return seasonThemes.halloween; // October
    return null;
  }

  function getCurrentTmTheme() {
    return getSeasonalTheme();
  }

  function ensureLayer() {
    if (layer) return layer;
    layer = document.createElement('div');
    layer.id = 'tm-rain-layer';
    document.body.appendChild(layer);
    return layer;
  }

  function bindTriggers() {
    document.querySelectorAll('.tm').forEach(node => {
      if (node.dataset.tmEggBound === 'true') return;
      node.dataset.tmEggBound = 'true';
      node.classList.add('tm-clickable');
      node.addEventListener('click', handleTmClick);
    });
  }

  function handleTmClick() {
    if (!running) {
      start();
    } else {
      boostIntensity();
    }
  }

  function start() {
    if (running) return;
    running = true;
    intensityMultiplier = 1;
    ensureLayer();
    spawnBurst(4 * intensityMultiplier);
    scheduleNextSpawn();
    tick();
  }

  function boostIntensity() {
    intensityMultiplier *= 2;
    spawnBurst(Math.max(4, Math.round(intensityMultiplier * 2)));
    if (spawnTimer) {
      clearTimeout(spawnTimer);
      scheduleNextSpawn();
    }
  }

  function scheduleNextSpawn() {
    const delayScale = Math.max(1, intensityMultiplier);
    const minDelay = Math.max(50, spawnMinDelay / delayScale);
    const maxDelay = Math.max(minDelay + 10, spawnMaxDelay / delayScale);
    spawnTimer = setTimeout(() => {
      const batch = Math.max(1, Math.round(intensityMultiplier));
      spawnBurst(batch);
      scheduleNextSpawn();
    }, minDelay + Math.random() * (maxDelay - minDelay));
  }

  function spawnBurst(count) {
    for (let i = 0; i < count; i++) {
      spawnSprite();
    }
  }

  function spawnSprite() {
    if (!layer) ensureLayer();
    const size = 20 + Math.random() * 26;
    const theme = getCurrentTmTheme();
    const sprite = {
      size,
      radius: size / 2,
      x: Math.random() * (window.innerWidth - size) + size / 2,
      y: -size - Math.random() * 40,
      vx: (Math.random() - 0.5) * 1.4,
      vy: Math.random() * -1.5,
      rotation: Math.random() * 360,
      spin: (Math.random() - 0.5) * 120,
      resting: false,
      supported: false,
    };
    const el = document.createElement('div');
    el.className = 'tm-sprite';
    el.textContent = theme && theme.text ? theme.text : '™';
    el.style.fontSize = `${size}px`;
    if (theme) {
      el.classList.add('tm-themed');
      if (theme.color) {
        el.style.color = theme.color;
      }
      if (theme.glow) {
        el.style.textShadow = theme.glow;
      }
    }
    el.style.setProperty('--tm-spin', `${sprite.spin}deg`);
    layer.appendChild(el);
    sprite.el = el;
    sprites.push(sprite);
    syncSprite(sprite);
  }

  function syncSprite(sprite) {
    if (!sprite.el) return;
    sprite.el.style.left = `${sprite.x}px`;
    sprite.el.style.top = `${sprite.y}px`;
    sprite.el.style.transform = `translate(-50%, -50%) rotate(${sprite.rotation}deg)`;
  }

  function resolveCollisions() {
    for (let i = 0; i < sprites.length; i++) {
      for (let j = i + 1; j < sprites.length; j++) {
        const a = sprites[i];
        const b = sprites[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.hypot(dx, dy) || 0.0001;
        const minDist = a.radius + b.radius;
        const nx = dx / dist;
        const ny = dy / dist;
        if (Math.abs(ny) > supportAngleThreshold && dist - minDist <= supportDistanceEpsilon) {
          if (ny > 0) a.supported = true;
          if (ny < 0) b.supported = true;
        }
        if (dist >= minDist) continue;
        const overlap = (minDist - dist) / 2;
        a.x -= nx * overlap;
        a.y -= ny * overlap;
        b.x += nx * overlap;
        b.y += ny * overlap;
        const relVelX = b.vx - a.vx;
        const relVelY = b.vy - a.vy;
        const velAlongNormal = relVelX * nx + relVelY * ny;
        if (velAlongNormal > 0) continue;
        const restitution = 0.65;
        const impulse = -(1 + restitution) * velAlongNormal / 2;
        const impulseX = impulse * nx;
        const impulseY = impulse * ny;
        a.vx -= impulseX;
        a.vy -= impulseY;
        b.vx += impulseX;
        b.vy += impulseY;
        if (Math.abs(a.vx) > wakeSpeed || Math.abs(a.vy) > wakeSpeed) a.resting = false;
        if (Math.abs(b.vx) > wakeSpeed || Math.abs(b.vy) > wakeSpeed) b.resting = false;
        if (ny > supportAngleThreshold) a.supported = true;
        if (ny < -supportAngleThreshold) b.supported = true;
      }
    }
  }

  function tick() {
    rafId = requestAnimationFrame(tick);
    const width = window.innerWidth;
    const height = window.innerHeight;
    sprites.forEach(sprite => {
      sprite.supported = false;
      if (!sprite.resting) {
        sprite.vy += gravity;
        sprite.vx *= friction;
        sprite.x += sprite.vx;
        sprite.y += sprite.vy;
      }
      sprite.rotation = (sprite.rotation + sprite.spin * 0.016) % 360;
      const radius = sprite.radius;
      if (sprite.x - radius < 0) {
        sprite.x = radius;
        sprite.vx *= -bounce;
      } else if (sprite.x + radius > width) {
        sprite.x = width - radius;
        sprite.vx *= -bounce;
      }
      if (sprite.y + radius > height) {
        sprite.y = height - radius;
        if (!sprite.resting) {
          sprite.vy *= -bounce;
        }
        sprite.supported = true;
      }
    });
    resolveCollisions();
    sprites.forEach(sprite => {
      const settledVertically = Math.abs(sprite.vy) < settleThreshold;
      const settledHorizontally = Math.abs(sprite.vx) < settleThreshold;
      if (sprite.supported && settledVertically && settledHorizontally) {
        sprite.vx = 0;
        sprite.vy = 0;
        sprite.resting = true;
      } else if (!sprite.supported && sprite.resting) {
        sprite.resting = false;
      }
    });
    sprites.forEach(syncSprite);
  }

  return {
    bindTriggers,
    getSeasonalTheme,
    getCurrentTmTheme,
  };
})();

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

// ============================================================================
// Feature 1: Auth & Session Flow
// ============================================================================

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
  setupWheelModal();

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

// ============================================================================
// Feature 2: Add Modal & Item Management
// ============================================================================

function setupAddModal() {
  if (!addModalTrigger || !modalRoot) return;
  addModalTrigger.addEventListener('click', () => openAddModal());
}

function openAddModal(initialType = PRIMARY_LIST_TYPES[0]) {
  if (!modalRoot) return;
  const defaultType = PRIMARY_LIST_TYPES.includes(initialType) ? initialType : PRIMARY_LIST_TYPES[0];
  closeAddModal();
  closeWheelModal();

  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop add-item-backdrop';
  const modal = document.createElement('div');
  modal.className = 'modal add-item-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-label', 'Add new item');

  const header = document.createElement('div');
  header.className = 'add-modal-header';
  const heading = document.createElement('h3');
  heading.textContent = 'Add New Item';
  header.appendChild(heading);
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'btn ghost close-add-modal';
  closeBtn.textContent = 'Close';
  closeBtn.addEventListener('click', () => closeAddModal());
  header.appendChild(closeBtn);

  const blurb = document.createElement('p');
  blurb.className = 'small';
  blurb.textContent = 'Pick a media type to fill out its details.';

  const tabs = document.createElement('div');
  tabs.className = 'add-type-tabs';
  const tabButtons = new Map();
  PRIMARY_LIST_TYPES.forEach(type => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'add-type-tab';
    button.dataset.type = type;
    button.textContent = MEDIA_TYPE_LABELS[type] || type;
    button.setAttribute('aria-pressed', 'false');
    button.addEventListener('click', () => setActiveAddModalType(type));
    tabs.appendChild(button);
    tabButtons.set(type, button);
  });

  const formHost = document.createElement('div');
  formHost.className = 'add-modal-form';

  modal.appendChild(header);
  modal.appendChild(blurb);
  modal.appendChild(tabs);
  modal.appendChild(formHost);
  backdrop.appendChild(modal);
  modalRoot.innerHTML = '';
  modalRoot.appendChild(backdrop);

  const keyHandler = (event) => {
    if (event.key === 'Escape') {
      closeAddModal();
    }
  };
  backdrop.addEventListener('click', (event) => {
    if (event.target === backdrop) {
      closeAddModal();
    }
  });
  document.addEventListener('keydown', keyHandler);

  activeAddModal = {
    backdrop,
    modal,
    formHost,
    tabButtons,
    keyHandler,
    currentForm: null,
    activeType: null,
  };

  setActiveAddModalType(defaultType);
}

function closeAddModal() {
  if (!activeAddModal) {
    if (modalRoot) {
      modalRoot.innerHTML = '';
    }
    return;
  }
  destroyActiveAddModalForm();
  if (activeAddModal.keyHandler) {
    document.removeEventListener('keydown', activeAddModal.keyHandler);
  }
  if (modalRoot) {
    modalRoot.innerHTML = '';
  }
  activeAddModal = null;
}

function destroyActiveAddModalForm() {
  if (!activeAddModal || !activeAddModal.currentForm) return;
  teardownFormAutocomplete(activeAddModal.currentForm);
  activeAddModal.currentForm = null;
}

function setActiveAddModalType(listType) {
  if (!activeAddModal) return;
  const targetType = PRIMARY_LIST_TYPES.includes(listType) ? listType : PRIMARY_LIST_TYPES[0];
  const template = addFormTemplateMap[targetType];
  if (!template) return;

  destroyActiveAddModalForm();
  activeAddModal.formHost.innerHTML = '';
  const fragment = template.content.cloneNode(true);
  activeAddModal.formHost.appendChild(fragment);
  const form = activeAddModal.formHost.querySelector('form');
  if (form) {
    setupFormAutocomplete(form, targetType);
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      await addItemFromForm(targetType, form);
    });
    activeAddModal.currentForm = form;
  }
  activeAddModal.activeType = targetType;

  activeAddModal.tabButtons.forEach((button, type) => {
    if (!button) return;
    if (type === targetType) {
      button.classList.add('active');
      button.setAttribute('aria-pressed', 'true');
    } else {
      button.classList.remove('active');
      button.setAttribute('aria-pressed', 'false');
    }
  });
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
              listType,
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

// ============================================================================
// Feature 8: Anime Franchise Automations
// ============================================================================

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

function pushNotification({ title, message } = {}) {
  if (!title && !message) return;
  if (!notificationCenter) {
    const fallbackText = [title, message].filter(Boolean).join('\n');
    if (fallbackText) alert(fallbackText);
    return;
  }
  const signature = getNotificationSignature(title, message);
  if (signature && notificationSignatureCache.has(signature)) {
    return;
  }
  const record = createNotificationRecord({ title, message, signature });
  addPersistedNotification(record);
  renderNotificationCard(record);
  updateNotificationEmptyState();
  updateNotificationBadge();
}

function createNotificationRecord({ title = '', message = '', signature = '' } = {}) {
  return {
    id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    title,
    message,
    createdAt: Date.now(),
    signature: signature || getNotificationSignature(title, message),
  };
}

function renderNotificationCard(record) {
  if (!notificationCenter || !record) return null;
  const card = document.createElement('div');
  card.className = 'notification-card';
  card.dataset.notificationId = record.id;
  if (record.title) {
    const titleEl = document.createElement('div');
    titleEl.className = 'notification-title';
    titleEl.textContent = record.title;
    card.appendChild(titleEl);
  }
  if (record.message) {
    const bodyEl = document.createElement('div');
    bodyEl.className = 'notification-body';
    bodyEl.textContent = record.message;
    card.appendChild(bodyEl);
  }
  const footer = document.createElement('div');
  footer.className = 'notification-footer';
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'notification-close';
  closeBtn.textContent = 'Dismiss';
  footer.appendChild(closeBtn);
  card.appendChild(footer);
  closeBtn.addEventListener('click', () => dismissNotification(record.id));
  notificationCenter.appendChild(card);
  requestAnimationFrame(() => card.classList.add('visible'));
  return card;
}

function dismissNotification(recordId) {
  removePersistedNotification(recordId);
  if (!notificationCenter) {
    updateNotificationEmptyState();
    updateNotificationBadge();
    return;
  }
  const card = notificationCenter.querySelector(`[data-notification-id="${recordId}"]`);
  const finalize = () => {
    if (card && card.parentNode) {
      card.parentNode.removeChild(card);
    }
    updateNotificationEmptyState();
    updateNotificationBadge();
  };
  if (!card) {
    finalize();
    return;
  }
  card.classList.remove('visible');
  setTimeout(finalize, 240);
}

function addPersistedNotification(record) {
  if (!record) return;
  const duplicate = persistedNotifications.some(existing => existing.title === record.title && existing.message === record.message);
  if (duplicate) return;
  persistedNotifications = [...persistedNotifications, record];
  if (persistedNotifications.length > MAX_PERSISTED_NOTIFICATIONS) {
    persistedNotifications = persistedNotifications.slice(-MAX_PERSISTED_NOTIFICATIONS);
  }
  persistNotificationsToStorage();
  if (record.signature) {
    markNotificationSignatureSeen(record.signature);
  }
}

function removePersistedNotification(recordId) {
  if (!recordId) return;
  const next = persistedNotifications.filter(record => record.id !== recordId);
  if (next.length === persistedNotifications.length) return;
  persistedNotifications = next;
  persistNotificationsToStorage();
}

function loadStoredNotifications() {
  const raw = safeLocalStorageGet(NOTIFICATION_STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(entry => ({
        id: entry.id || `notif_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        title: entry.title || '',
        message: entry.message || '',
        createdAt: Number(entry.createdAt) || Date.now(),
        signature: entry.signature || getNotificationSignature(entry.title || '', entry.message || ''),
      }))
      .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  } catch (_) {
    return [];
  }
}

function persistNotificationsToStorage() {
  if (!persistedNotifications.length) {
    safeLocalStorageRemove(NOTIFICATION_STORAGE_KEY);
    return;
  }
  try {
    safeLocalStorageSet(NOTIFICATION_STORAGE_KEY, JSON.stringify(persistedNotifications));
  } catch (_) {
    /* ignore storage failures */
  }
}

function getNotificationSignature(title = '', message = '') {
  const normalizedTitle = (title || '').trim().toLowerCase();
  const normalizedMessage = (message || '').trim().toLowerCase();
  if (!normalizedTitle && !normalizedMessage) return '';
  return `${normalizedTitle}::${normalizedMessage}`;
}

function loadNotificationSignatures() {
  const raw = safeLocalStorageGet(NOTIFICATION_SEEN_KEY);
  if (!raw) return new Set();
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter(Boolean));
  } catch (_) {
    return new Set();
  }
}

function persistNotificationSignatures() {
  try {
    if (!notificationSignatureCache.size) {
      safeLocalStorageRemove(NOTIFICATION_SEEN_KEY);
      return;
    }
    safeLocalStorageSet(NOTIFICATION_SEEN_KEY, JSON.stringify(Array.from(notificationSignatureCache)));
  } catch (_) {
    /* ignore */
  }
}

function markNotificationSignatureSeen(signature) {
  if (!signature) return;
  if (notificationSignatureCache.has(signature)) return;
  notificationSignatureCache.add(signature);
  persistNotificationSignatures();
}

function initNotificationBell() {
  if (!notificationBellBtn || !notificationCenter) return;
  notificationSignatureCache = loadNotificationSignatures();
  persistedNotifications = loadStoredNotifications();
  persistedNotifications.forEach(record => renderNotificationCard(record));
  let signatureAdded = false;
  persistedNotifications.forEach(record => {
    if (record.signature && !notificationSignatureCache.has(record.signature)) {
      notificationSignatureCache.add(record.signature);
      signatureAdded = true;
    }
  });
  if (signatureAdded) {
    persistNotificationSignatures();
  }
  notificationBellBtn.addEventListener('click', () => {
    toggleNotificationPopover();
  });
  document.addEventListener('click', handleNotificationDocumentClick);
  document.addEventListener('keydown', handleNotificationKeydown);
  updateNotificationBadge();
  updateNotificationEmptyState();
}

function toggleNotificationPopover(forceState) {
  const targetState = typeof forceState === 'boolean' ? forceState : !notificationPopoverOpen;
  setNotificationPopoverState(targetState);
}

function closeNotificationPopover() {
  setNotificationPopoverState(false);
}

function setNotificationPopoverState(isOpen) {
  if (!notificationCenter || !notificationBellBtn) return;
  notificationPopoverOpen = Boolean(isOpen);
  notificationCenter.classList.toggle('hidden', !notificationPopoverOpen);
  notificationBellBtn.setAttribute('aria-expanded', notificationPopoverOpen ? 'true' : 'false');
  if (notificationPopoverOpen) {
    notificationCenter.focus();
  }
}

function handleNotificationDocumentClick(event) {
  if (!notificationPopoverOpen) return;
  if (notificationShell && notificationShell.contains(event.target)) return;
  closeNotificationPopover();
}

function handleNotificationKeydown(event) {
  if (event.key !== 'Escape') return;
  if (!notificationPopoverOpen) return;
  closeNotificationPopover();
  if (notificationBellBtn) {
    notificationBellBtn.focus();
  }
}

function updateNotificationBadge() {
  if (!notificationBadgeEl) return;
  const count = notificationCenter ? notificationCenter.querySelectorAll('.notification-card').length : 0;
  notificationBadgeEl.textContent = count;
  notificationBadgeEl.classList.toggle('hidden', count === 0);
  if (notificationBellBtn) {
    const label = count === 0 ? 'Notifications' : `${count} notification${count === 1 ? '' : 's'}`;
    notificationBellBtn.setAttribute('aria-label', label);
  }
}

function updateNotificationEmptyState() {
  if (!notificationEmptyStateEl || !notificationCenter) return;
  const hasNotifications = Boolean(notificationCenter.querySelector('.notification-card'));
  notificationEmptyStateEl.classList.toggle('hidden', hasNotifications);
}

function showAnimeFranchiseNotification(seriesName, missingEntries) {
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
    ? `${summary} ready to add from MyAnimeList. Use the anime Add form to pull them in.`
    : 'New related entries are available on MyAnimeList. Use the anime Add form to pull them in.';
  const heading = seriesName ? `New entries for ${seriesName}` : 'New anime entries found';
  pushNotification({ title: heading, message: body });
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
  introPlayed = false;
  safeStorageRemove(INTRO_SESSION_KEY);
  resetFilterState();
   resetFranchiseSection();
  updateBackToTopVisibility();
}

function showAppForUser(user) {
  loginScreen.classList.add('hidden');
  appRoot.classList.remove('hidden');
  userNameEl.textContent = user.displayName || user.email || 'You';
  updateBackToTopVisibility();
  playTheListIntro();
  loadPrimaryLists();
  loadFranchises();
}

function loadPrimaryLists() {
  libraryFullyLoaded = false;
  const order = [...PRIMARY_LIST_TYPES];
  let index = 0;
  const loadNext = () => {
    if (index >= order.length) {
      setTimeout(() => {
        libraryFullyLoaded = true;
        renderUnifiedLibrary();
      }, LIST_LOAD_STAGGER_MS + 100);
      return;
    }
    const listType = order[index++];
    loadList(listType);
    loadFinishedList(listType);
    if (index < order.length) {
      setTimeout(loadNext, LIST_LOAD_STAGGER_MS);
    } else {
      setTimeout(() => {
        libraryFullyLoaded = true;
        renderUnifiedLibrary();
      }, LIST_LOAD_STAGGER_MS + 100);
    }
  };
  loadNext();
}

function initUnifiedLibraryControls() {
  if (unifiedSearchInput) {
    unifiedSearchInput.addEventListener('input', debounce((ev) => {
      unifiedFilters.search = (ev.target.value || '').trim().toLowerCase();
      renderUnifiedLibrary();
    }, 180));
  }
  typeFilterButtons.forEach(btn => {
    const type = btn.dataset.typeToggle;
    btn.addEventListener('click', () => toggleUnifiedTypeFilter(type));
  });
  if (finishedFilterToggle) {
    finishedFilterToggle.checked = showFinishedOnly;
    finishedFilterToggle.addEventListener('change', (ev) => {
      showFinishedOnly = Boolean(ev.target.checked);
      renderUnifiedLibrary();
      updateLibraryRuntimeStats();
    });
  }
  updateUnifiedTypeControls();
}

function toggleUnifiedTypeFilter(listType) {
  if (!listType) return;
  const filters = unifiedFilters.types;
  if (filters.has(listType)) {
    if (filters.size === 1) return; // always keep at least one type active
    filters.delete(listType);
  } else {
    filters.add(listType);
  }
  updateUnifiedTypeControls();
  renderUnifiedLibrary();
}

function updateUnifiedTypeControls() {
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
  if (introPlayed) return;
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

// ============================================================================
// Feature 3: List Loading & Collapsible Cards
// ============================================================================

// Detach all DB listeners
function detachAllListeners() {
  for (const k in listeners) {
    if (typeof listeners[k] === 'function') listeners[k]();
  }
  Object.keys(listeners).forEach(k => delete listeners[k]);
  for (const k in finishedListeners) {
    if (typeof finishedListeners[k] === 'function') finishedListeners[k]();
  }
  Object.keys(finishedListeners).forEach(k => delete finishedListeners[k]);
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

function loadFinishedList(listType) {
  if (!currentUser) return;
  if (finishedListeners[listType]) {
    finishedListeners[listType]();
    delete finishedListeners[listType];
  }
  const finishedRef = ref(db, `users/${currentUser.uid}/finished/${listType}`);
  const off = onValue(finishedRef, (snap) => {
    finishedCaches[listType] = snap.val() || {};
    invalidateSeriesCrossListCache();
    if (showFinishedOnly) {
      renderUnifiedLibrary();
      updateLibraryRuntimeStats();
    }
    refreshFranchiseLibraryMatches();
  }, (err) => {
    console.error('Finished list read error', err);
  });
  finishedListeners[listType] = off;
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
  invalidateSeriesCrossListCache({ schedule: false });
  const container = document.getElementById(`${listType}-list`);
  if (container) {
    container.innerHTML = '';
  }

  const entries = Object.entries(data || {});
  const supportsActorFilter = listSupportsActorFilter(listType);
  const filterValue = supportsActorFilter ? getActorFilterValue(listType) : '';

  let filtered = entries;
  if (filterValue && supportsActorFilter) {
    filtered = entries.filter(([, item]) => matchesActorFilter(listType, item, filterValue));
  }

  if (filtered.length === 0) {
    const message = supportsActorFilter && filterValue
      ? 'No items match this actor filter yet.'
      : 'No items yet. Add something!';
    if (container) {
      container.innerHTML = '<div class="small">' + message + '</div>';
    }
    updateListStats(listType, filtered);
    renderUnifiedLibrary();
    return;
  }

  updateListStats(listType, filtered);

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

  if (isCollapsibleList(listType) && container) {
    renderCollapsibleMediaGrid(listType, container, filtered);
  } else if (container) {
    renderStandardList(container, listType, filtered);
  }

  if (listType in expandedCards) {
    updateCollapsibleCardStates(listType);
  }

  renderUnifiedLibrary();
  refreshFranchiseLibraryMatches();
  scheduleCrossSeriesRefresh();
}

// ============================================================================
// Feature 4: Unified Library
// ============================================================================

function renderUnifiedLibrary() {
  updateLibraryRuntimeStats();
  if (!combinedListEl) return;
  const displayCaches = getDisplayCacheMap();
  const hasLoadedAny = PRIMARY_LIST_TYPES.some(type => displayCaches[type] !== undefined);
  if (!hasLoadedAny) {
    const message = showFinishedOnly ? 'Loading finished entries...' : 'Loading your library...';
    combinedListEl.innerHTML = `<div class="small">${message}</div>`;
    return;
  }

  const unifiedEntries = collectUnifiedEntries();
  const activeTypes = unifiedFilters.types;
  let filtered = unifiedEntries.filter(entry => activeTypes.has(entry.listType));
  const query = unifiedFilters.search;
  if (query) {
    filtered = filtered.filter(entry => matchesUnifiedSearch(entry.displayItem, query));
  }

  filtered.sort((a, b) => {
    const ta = titleSortKey(a.displayItem?.title || '');
    const tb = titleSortKey(b.displayItem?.title || '');
    if (ta < tb) return -1;
    if (ta > tb) return 1;
    const ya = Number(a.displayItem?.year) || 9999;
    const yb = Number(b.displayItem?.year) || 9999;
    if (ya !== yb) return ya - yb;
    const idxA = Math.max(PRIMARY_LIST_TYPES.indexOf(a.listType), 0);
    const idxB = Math.max(PRIMARY_LIST_TYPES.indexOf(b.listType), 0);
    return idxA - idxB;
  });

  if (!filtered.length) {
    const emptyMessage = showFinishedOnly
      ? 'No finished entries match the current filters yet.'
      : 'No entries match the current filters yet.';
    combinedListEl.innerHTML = `<div class="small">${emptyMessage}</div>`;
    return;
  }

  combinedListEl.innerHTML = '';
  const grid = createEl('div', 'movies-grid unified-grid');
  filtered.forEach(entry => {
    const node = buildUnifiedCard(entry);
    if (node) {
      grid.appendChild(node);
    }
  });
  combinedListEl.appendChild(grid);
}

function collectUnifiedEntries() {
  const allEntries = [];
  PRIMARY_LIST_TYPES.forEach(listType => {
    const cacheEntries = Object.entries(getDisplayCache(listType) || {});
    if (!cacheEntries.length) return;
    if (isCollapsibleList(listType)) {
      const { displayRecords } = prepareCollapsibleRecords(listType, cacheEntries);
      displayRecords.forEach(record => {
        allEntries.push({
          listType,
          id: record.id,
          item: record.item,
          displayItem: record.displayItem,
          displayEntryId: record.displayEntryId,
          positionIndex: record.index,
        });
      });
    } else {
      cacheEntries.forEach(([id, item], index) => {
        if (!item) return;
        allEntries.push({
          listType,
          id,
          item,
          displayItem: item,
          displayEntryId: id,
          positionIndex: index,
        });
      });
    }
  });
  return allEntries;
}

function updateLibraryRuntimeStats() {
  if (!libraryStatsSummaryEl) return;
  const stats = computeLibraryRuntimeStats();
  if (!stats.hasAnyData || !libraryFullyLoaded) {
    libraryStatsSummaryEl.textContent = 'Totals update once your lists load.';
    libraryStatsSummaryEl.classList.remove('has-data');
    libraryStatsSummaryEl.removeAttribute('aria-label');
    return;
  }
  libraryStatsSummaryEl.classList.add('has-data');
  libraryStatsSummaryEl.innerHTML = '';
  const movieLabel = stats.movieCount === 1 ? 'Movie' : 'Movies';
  const episodeLabel = stats.episodeCount === 1 ? 'Episode' : 'Episodes';
  const runtimePlaceholder = renderRuntimePillsDisplay();

  const movieChip = buildLibraryStatChip(movieLabel, formatLibraryStatNumber(stats.movieCount));
  const episodeChip = buildLibraryStatChip(episodeLabel, formatLibraryStatNumber(stats.episodeCount));
  const runtimeChip = buildLibraryStatChip('Finish Time', '', { 
    modifier: 'runtime runtime-minutes' 
  });
  const runtimeValueEl = runtimeChip.querySelector('.library-stat-value');
  if (runtimeValueEl) {
    runtimeValueEl.innerHTML = runtimePlaceholder;
  }

  libraryStatsSummaryEl.appendChild(movieChip);
  libraryStatsSummaryEl.appendChild(episodeChip);
  libraryStatsSummaryEl.appendChild(runtimeChip);

  if (stats.totalMinutes > 0) {
    animateRuntimeProgression(runtimeChip, stats.totalMinutes);
  } else {
    const valueEl = runtimeChip.querySelector('.library-stat-value');
    if (valueEl) valueEl.textContent = 'Runtime info unavailable';
  }

  const runtimeSummaryText = stats.totalMinutes > 0
    ? (formatRuntimeDuration(stats.totalMinutes) || 'Runtime info unavailable')
    : 'Runtime info unavailable';
  const spokenSummary = `${stats.movieCount} ${movieLabel}, ${stats.episodeCount} ${episodeLabel}, ${runtimeSummaryText}`;
  libraryStatsSummaryEl.setAttribute('aria-label', spokenSummary);
}

function computeLibraryRuntimeStats() {
  const cacheMap = getDisplayCacheMap();
  const stats = {
    hasAnyData: PRIMARY_LIST_TYPES.some(type => cacheMap[type] !== undefined),
    movieCount: 0,
    episodeCount: 0,
    totalMinutes: 0,
  };
  if (!stats.hasAnyData) {
    return stats;
  }

  Object.values(cacheMap.movies || {}).forEach(item => {
    if (!item) return;
    stats.movieCount += 1;
    const minutes = estimateMovieRuntimeMinutes(item);
    if (minutes > 0) {
      stats.totalMinutes += minutes;
    }
  });

  Object.values(cacheMap.tvShows || {}).forEach(item => {
    if (!item) return;
    const episodes = getTvEpisodeCount(item);
    if (episodes > 0) {
      stats.episodeCount += episodes;
      const runtimePerEpisode = estimateTvEpisodeRuntimeMinutes(item);
      if (runtimePerEpisode > 0) {
        stats.totalMinutes += runtimePerEpisode * episodes;
      }
    }
  });

  Object.values(cacheMap.anime || {}).forEach(item => {
    if (!item) return;
    const episodes = getAnimeEpisodeCount(item);
    if (episodes > 0) {
      stats.episodeCount += episodes;
    }
    const runtimePerEpisode = estimateAnimeEpisodeRuntimeMinutes(item);
    if (runtimePerEpisode > 0) {
      const multiplier = episodes > 0 ? episodes : (isAnimeMovieEntry(item) ? 1 : 0);
      if (multiplier > 0) {
        stats.totalMinutes += runtimePerEpisode * multiplier;
      }
    }
  });

  return stats;
}

// ============================================================================
// Feature 5: Franchise Timelines
// ============================================================================

function loadFranchises() {
  if (listeners.franchises) {
    listeners.franchises();
    delete listeners.franchises;
  }
  if (!currentUser || !db) {
    resetFranchiseSection();
    return;
  }
  if (franchiseShelfEl) {
    franchiseShelfEl.innerHTML = '<div class="franchise-empty small">Loading franchises...</div>';
  }
  const path = ref(db, `users/${currentUser.uid}/franchises`);
  const off = onValue(path, (snap) => {
    const raw = snap.val() || {};
    franchiseState.records = normalizeFranchiseCollection(raw);
    franchiseState.loaded = true;
    renderFranchiseShelf();
    refreshFranchiseLibraryMatches();
  }, (err) => {
    console.warn('Franchise load failed', err);
    franchiseState.loaded = true;
    if (franchiseShelfEl) {
      franchiseShelfEl.innerHTML = '<div class="franchise-empty small">Unable to load franchises.</div>';
    }
    updateFranchiseMeta([]);
  });
  listeners.franchises = off;
}

function resetFranchiseSection() {
  franchiseState.loaded = false;
  franchiseState.records = [];
  if (franchiseMetaEl) {
    franchiseMetaEl.innerHTML = '';
  }
  if (franchiseShelfEl) {
    franchiseShelfEl.innerHTML = '<div class="franchise-empty small">Sign in to load curated franchises.</div>';
  }
}

function renderFranchiseShelf() {
  if (!franchiseShelfEl) return;
  updateFranchiseMeta(franchiseState.records);
  if (!franchiseState.loaded) {
    franchiseShelfEl.innerHTML = '<div class="franchise-empty small">Loading franchises...</div>';
    return;
  }
  const records = franchiseState.records || [];
  if (!records.length) {
    franchiseShelfEl.innerHTML = '';
    return;
  }
  const fragment = document.createDocumentFragment();
  records.forEach(record => {
    const card = buildFranchiseCard(record);
    if (card) fragment.appendChild(card);
  });
  franchiseShelfEl.innerHTML = '';
  franchiseShelfEl.appendChild(fragment);
}

function updateFranchiseMeta(records) {
  if (!franchiseMetaEl) return;
  franchiseMetaEl.innerHTML = '';
  if (!franchiseState.loaded || !records || !records.length) return;
  const totalFranchises = records.length;
  const totalEntries = records.reduce((sum, record) => sum + (record.stats?.totalEntries || record.entries.length || 0), 0);
  const trackedEntries = records.reduce((sum, record) => sum + (record.stats?.libraryMatches || 0), 0);
  const finishedEntries = records.reduce((sum, record) => sum + (record.stats?.finishedCount || 0), 0);
  const fragment = document.createDocumentFragment();
  fragment.appendChild(buildFranchiseMetaPill(totalFranchises, totalFranchises === 1 ? 'Franchise' : 'Franchises'));
  fragment.appendChild(buildFranchiseMetaPill(totalEntries, totalEntries === 1 ? 'Entry' : 'Entries'));
  if (trackedEntries > 0) {
    fragment.appendChild(buildFranchiseMetaPill(trackedEntries, 'Tracked'));
  }
  if (finishedEntries > 0) {
    fragment.appendChild(buildFranchiseMetaPill(finishedEntries, 'Finished'));
  }
  franchiseMetaEl.appendChild(fragment);
}

function buildFranchiseMetaPill(value, label) {
  const pill = createEl('span', 'franchise-meta-pill');
  const strong = createEl('strong', '', { text: formatLibraryStatNumber(value) });
  pill.appendChild(strong);
  pill.appendChild(document.createTextNode(` ${label}`));
  return pill;
}

function buildFranchiseCard(record) {
  if (!record) return null;
  const card = createEl('article', 'franchise-card');
  const header = createEl('div', 'franchise-card-header');
  const titleBlock = createEl('div', 'franchise-card-title-block');
  const title = createEl('h3', 'franchise-card-title', { text: record.name || 'Franchise' });
  titleBlock.appendChild(title);
  if (record.tagline) {
    titleBlock.appendChild(createEl('p', 'franchise-card-subtitle', { text: record.tagline }));
  } else if (record.synopsis) {
    titleBlock.appendChild(createEl('p', 'franchise-card-subtitle', { text: record.synopsis }));
  }
  header.appendChild(titleBlock);

  const metaRow = createEl('div', 'franchise-card-meta');
  const totalEntries = record.stats?.totalEntries ?? record.entries.length;
  metaRow.appendChild(buildFranchiseMetaPill(totalEntries, totalEntries === 1 ? 'Entry' : 'Entries'));
  const tracked = record.stats?.libraryMatches || 0;
  if (tracked > 0) {
    metaRow.appendChild(buildFranchiseMetaPill(tracked, 'Tracked'));
  }
  const remaining = record.stats?.remainingCount || Math.max(totalEntries - (record.stats?.finishedCount || 0), 0);
  if (remaining > 0) {
    metaRow.appendChild(buildFranchiseMetaPill(remaining, 'Remaining'));
  }
  header.appendChild(metaRow);
  card.appendChild(header);

  card.appendChild(buildFranchiseTimeline(record));
  return card;
}

function buildFranchiseTimeline(record) {
  const wrapper = createEl('div', 'franchise-timeline');
  if (!Array.isArray(record.entries) || !record.entries.length) {
    wrapper.appendChild(createEl('div', 'franchise-empty small', { text: 'No timeline entries yet.' }));
    if (context.isExpanded) {
      wrapper.classList.add('artwork-wrapper-expanded');
    }
    return wrapper;
  }
  const track = createEl('div', 'franchise-track');
  record.entries.forEach(entry => {
    const node = buildFranchiseTimelineEntry(entry);
    if (node) track.appendChild(node);
  });
  if (!track.childElementCount) {
    wrapper.appendChild(createEl('div', 'franchise-empty small', { text: 'No timeline entries yet.' }));
    return wrapper;
  }
  wrapper.appendChild(track);
  return wrapper;
}

function buildFranchiseTimelineEntry(entry) {
  if (!entry) return null;
  const entryEl = createEl('div', 'franchise-entry');
  entryEl.classList.add(`media-${entry.mediaType || 'movie'}`);
  if (entry.isFinished) entryEl.classList.add('is-finished');
  if (entry.libraryMatch) entryEl.classList.add('in-library');

  const header = createEl('div', 'franchise-entry-header');
  if (entry.orderLabel) {
    header.appendChild(createEl('span', 'franchise-entry-order', { text: entry.orderLabel }));
  }
  header.appendChild(createEl('span', 'franchise-entry-badge', { text: entry.badgeLabel || FRANCHISE_MEDIA_LABELS[entry.mediaType] || 'Entry' }));
  entryEl.appendChild(header);

  entryEl.appendChild(createEl('div', 'franchise-entry-title', { text: entry.title || 'Untitled entry' }));
  if (entry.subtitle) {
    entryEl.appendChild(createEl('div', 'franchise-entry-subtitle', { text: entry.subtitle }));
  }

  const metaBits = [];
  if (entry.releaseLabel) metaBits.push(entry.releaseLabel);
  if (entry.runtimeMinutes) metaBits.push(`${entry.runtimeMinutes} min`);
  if (entry.episodes) metaBits.push(`${entry.episodes} ep`);
  if (entry.watchStatusLabel && entry.watchStatus !== 'finished') metaBits.push(entry.watchStatusLabel);
  if (metaBits.length) {
    entryEl.appendChild(createEl('div', 'franchise-entry-meta', { text: metaBits.join(' • ') }));
  }

  if (entry.notes) {
    entryEl.appendChild(createEl('p', 'franchise-entry-notes', { text: entry.notes }));
  }

  const statusText = entry.libraryMatch
    ? (entry.isFinished ? 'Finished in your library' : 'In your library')
    : (entry.highlightLabel || entry.watchStatusLabel || entry.releaseStatusLabel || '');
  if (statusText) {
    entryEl.appendChild(createEl('div', 'franchise-entry-status', { text: statusText }));
  }

  return entryEl;
}

function normalizeFranchiseCollection(raw) {
  let records = [];
  if (Array.isArray(raw)) {
    records = raw;
  } else if (raw && typeof raw === 'object') {
    records = Object.entries(raw).map(([id, value]) => ({ ...(value || {}), id }));
  }
  return records.map((record, index) => normalizeFranchiseRecord(record, index)).filter(Boolean).sort((a, b) => {
    if (a.order !== b.order) return a.order - b.order;
    return titleSortKey(a.name).localeCompare(titleSortKey(b.name));
  });
}

function normalizeFranchiseRecord(source, fallbackIndex = 0) {
  if (!source) return null;
  const id = source.id || source.franchiseId || `franchise-${fallbackIndex + 1}`;
  const entries = normalizeFranchiseEntries(source.entries || source.timeline || source.parts || source.mediaItems || []);
  const record = {
    id,
    name: source.name || source.title || `Franchise ${fallbackIndex + 1}`,
    tagline: source.tagline || source.subtitle || '',
    synopsis: source.description || source.summary || '',
    order: resolveFranchiseDisplayOrder(source, fallbackIndex),
    updatedAt: Number(source.updatedAt || source.updated || source.timestamp || 0) || 0,
    entries,
  };
  record.stats = computeFranchiseStats(entries);
  return record;
}

function normalizeFranchiseEntries(rawEntries) {
  let entries = [];
  if (Array.isArray(rawEntries)) {
    entries = rawEntries;
  } else if (rawEntries && typeof rawEntries === 'object') {
    entries = Object.entries(rawEntries).map(([id, value]) => ({ ...(value || {}), id }));
  }
  return entries.map((entry, index) => normalizeFranchiseEntry(entry, index)).filter(Boolean).sort((a, b) => {
    if (a.displayOrder !== b.displayOrder) return a.displayOrder - b.displayOrder;
    if (a.releaseDate && b.releaseDate && a.releaseDate !== b.releaseDate) {
      return a.releaseDate < b.releaseDate ? -1 : 1;
    }
    if ((a.releaseYear || 0) !== (b.releaseYear || 0)) {
      return (a.releaseYear || 0) - (b.releaseYear || 0);
    }
    return titleSortKey(a.title).localeCompare(titleSortKey(b.title));
  });
}

function normalizeFranchiseEntry(source, fallbackIndex = 0) {
  if (!source) return null;
  const id = source.id || source.entryId || `entry-${fallbackIndex + 1}`;
  const mediaType = coerceFranchiseMediaType(source.mediaType || source.type || source.category || source.format, source);
  const listType = resolveFranchiseListType(mediaType, source.listType);
  const releaseDate = sanitizeFranchiseDate(source.releaseDate || source.airDate || source.date || '');
  const releaseYearStr = sanitizeYear(source.year || source.releaseYear || releaseDate);
  const releaseYear = releaseYearStr ? Number(releaseYearStr) : null;
  const releaseLabel = formatFranchiseReleaseLabel(releaseDate, releaseYearStr);
  const watchStatus = normalizeFranchiseWatchStatus(source.watchStatus || source.status || source.progress);
  const entry = {
    id,
    title: source.title || source.name || source.episodeTitle || source.seriesTitle || 'Untitled entry',
    subtitle: source.subtitle || source.seriesTitle || '',
    mediaType,
    listType,
    releaseDate,
    releaseYear,
    releaseLabel,
    watchStatus,
    watchStatusLabel: formatFranchiseWatchStatusLabel(watchStatus),
    releaseStatusLabel: formatFranchiseReleaseStatusLabel(normalizeFranchiseReleaseStatus(source.releaseStatus || source.availability)),
    highlightLabel: source.highlight || source.nextAction || '',
    notes: source.notes || source.summary || '',
    badgeLabel: formatFranchiseBadgeLabel(mediaType, source),
    orderLabel: source.phase || source.arc || source.era || source.timelineLabel || '',
    runtimeMinutes: parseRuntimeMinutes(source.runtimeMinutes || source.runtime || source.duration),
    episodes: parseEpisodeValue(source.episodes || source.episodeCount || source.totalEpisodes),
    seasonNumber: Number.isFinite(Number(source.seasonNumber)) ? Number(source.seasonNumber) : null,
    tmdbId: source.tmdbId || source.tmdbID || null,
    imdbId: source.imdbId || source.imdbID || null,
    aniListId: source.aniListId || null,
    listEntryId: source.listEntryId || source.listId || source.libraryId || null,
    displayOrder: resolveFranchiseDisplayOrder(source, fallbackIndex),
    libraryMatch: false,
    isFinished: watchStatus === 'finished',
  };
  return entry;
}

function coerceFranchiseMediaType(value, source = {}) {
  if (source && source.mediaType && typeof source.mediaType === 'object') {
    value = source.mediaType.type || source.mediaType.name || value;
  }
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized && source && (source.seasonNumber !== undefined || source.episodes)) {
    return 'season';
  }
  if (['movie', 'film', 'feature'].includes(normalized)) return 'movie';
  if (['season', 'tv_season', 'series_season'].includes(normalized)) return 'season';
  if (['tv', 'show', 'series'].includes(normalized)) return 'tv';
  if (['special', 'ova', 'ona', 'short'].includes(normalized)) return 'special';
  return normalized || 'movie';
}

function resolveFranchiseListType(mediaType, provided) {
  if (provided && PRIMARY_LIST_TYPES.includes(provided)) {
    return provided;
  }
  if (mediaType === 'tv' || mediaType === 'season') return 'tvShows';
  if (mediaType === 'special') return 'movies';
  return 'movies';
}

function resolveFranchiseDisplayOrder(source, fallbackIndex = 0) {
  const candidates = [source.order, source.sort, source.timelineOrder, source.rank, source.position];
  for (const candidate of candidates) {
    const numeric = Number(candidate);
    if (Number.isFinite(numeric)) {
      return numeric;
    }
  }
  const dateValue = sanitizeFranchiseDate(source.releaseDate || source.date || '');
  if (dateValue) {
    const timestamp = Date.parse(dateValue);
    if (Number.isFinite(timestamp)) {
      return timestamp;
    }
  }
  const yearValue = Number(sanitizeYear(source.year || source.releaseYear));
  if (Number.isFinite(yearValue)) {
    return yearValue * 1000;
  }
  return fallbackIndex;
}

function sanitizeFranchiseDate(value) {
  if (!value) return '';
  const match = String(value).match(/(\d{4})(?:[-/.]?(\d{1,2}))?(?:[-/.]?(\d{1,2}))?/);
  if (!match) return '';
  const year = match[1];
  const month = match[2] ? match[2].padStart(2, '0') : '01';
  const day = match[3] ? match[3].padStart(2, '0') : '01';
  return `${year}-${month}-${day}`;
}

function formatFranchiseReleaseLabel(releaseDate, releaseYear) {
  if (releaseDate) {
    const [year, month] = releaseDate.split('-');
    if (year && month) {
      const monthIndex = Number(month) - 1;
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      if (monthIndex >= 0 && monthIndex < monthNames.length) {
        return `${monthNames[monthIndex]} ${year}`;
      }
      return year;
    }
  }
  if (releaseYear) return releaseYear;
  return '';
}

function normalizeFranchiseWatchStatus(value) {
  if (!value) return '';
  const normalized = String(value).trim().toLowerCase();
  if (['finished', 'complete', 'completed', 'watched', 'done'].includes(normalized)) return 'finished';
  if (['watching', 'in_progress', 'in-progress', 'ongoing', 'current'].includes(normalized)) return 'in-progress';
  if (['planned', 'backlog', 'pending', 'queue', 'queued', 'up next', 'up-next'].includes(normalized)) return 'pending';
  if (['skipped', 'dropped', 'abandoned'].includes(normalized)) return 'skipped';
  return normalized;
}

function normalizeFranchiseReleaseStatus(value) {
  if (!value) return '';
  const normalized = String(value).trim().toLowerCase();
  if (['released', 'available'].includes(normalized)) return 'released';
  if (['upcoming', 'announced', 'tba'].includes(normalized)) return 'upcoming';
  if (['delayed', 'hiatus'].includes(normalized)) return 'delayed';
  return normalized;
}

function formatFranchiseWatchStatusLabel(status) {
  switch (status) {
    case 'finished':
      return 'Finished';
    case 'in-progress':
      return 'In progress';
    case 'pending':
      return 'Backlog';
    case 'skipped':
      return 'Skipped';
    default:
      return status ? status.replace(/_/g, ' ').replace(/\b\w/g, ch => ch.toUpperCase()) : '';
  }
}

function formatFranchiseReleaseStatusLabel(status) {
  switch (status) {
    case 'released':
      return 'Released';
    case 'upcoming':
      return 'Upcoming';
    case 'delayed':
      return 'Delayed';
    default:
      return status ? status.replace(/_/g, ' ').replace(/\b\w/g, ch => ch.toUpperCase()) : '';
  }
}

function formatFranchiseBadgeLabel(mediaType, source = {}) {
  if (source.badge) return source.badge;
  if (mediaType === 'season') {
    const numeric = Number(source.seasonNumber);
    if (Number.isFinite(numeric)) {
      return `S${String(numeric).padStart(2, '0')}`;
    }
  }
  if (source.part) {
    const numeric = Number(source.part);
    if (Number.isFinite(numeric)) {
      return `Part ${numeric}`;
    }
  }
  return FRANCHISE_MEDIA_LABELS[mediaType] || 'Entry';
}

function refreshFranchiseLibraryMatches() {
  if (!franchiseState.loaded || !Array.isArray(franchiseState.records) || !franchiseState.records.length) return;
  let updated = false;
  franchiseState.records.forEach(record => {
    let recordChanged = false;
    record.entries.forEach(entry => {
      const match = resolveFranchiseLibraryMatch(entry);
      const isMatched = Boolean(match);
      if (entry.libraryMatch !== isMatched) {
        entry.libraryMatch = isMatched;
        recordChanged = true;
        updated = true;
      }
      if (isMatched && !entry.isFinished && match && (match.finishedAt || match.finishedDate)) {
        entry.isFinished = true;
        recordChanged = true;
      }
    });
    if (recordChanged) {
      record.stats = computeFranchiseStats(record.entries);
    }
  });
  if (updated) {
    renderFranchiseShelf();
  } else {
    updateFranchiseMeta(franchiseState.records);
  }
}

function resolveFranchiseLibraryMatch(entry) {
  if (!entry || !entry.listType) return null;
  const pools = [listCaches[entry.listType] || {}, finishedCaches[entry.listType] || {}];
  for (const pool of pools) {
    if (!pool) continue;
    if (entry.listEntryId && pool[entry.listEntryId]) {
      return pool[entry.listEntryId];
    }
    if (entry.tmdbId) {
      const match = Object.values(pool).find(item => Number(item.tmdbId) === Number(entry.tmdbId));
      if (match) return match;
    }
    if (entry.imdbId) {
      const match = Object.values(pool).find(item => item.imdbId && item.imdbId === entry.imdbId);
      if (match) return match;
    }
    if (entry.title) {
      const targetTitle = normalizeTitleKey(entry.title);
      const match = Object.values(pool).find(item => normalizeTitleKey(item.title) === targetTitle && (!entry.releaseYear || sanitizeYear(item.year) === String(entry.releaseYear)));
      if (match) return match;
    }
  }
  return null;
}

function computeFranchiseStats(entries) {
  const stats = {
    totalEntries: Array.isArray(entries) ? entries.length : 0,
    finishedCount: 0,
    libraryMatches: 0,
    remainingCount: 0,
  };
  if (!Array.isArray(entries)) {
    return stats;
  }
  entries.forEach(entry => {
    if (!entry) return;
    if (entry.isFinished || entry.watchStatus === 'finished') {
      stats.finishedCount += 1;
    }
    if (entry.libraryMatch) {
      stats.libraryMatches += 1;
    }
  });
  stats.remainingCount = Math.max(stats.totalEntries - stats.finishedCount, 0);
  return stats;
}

function estimateMovieRuntimeMinutes(item) {
  if (!item) return 0;
  const candidates = [item.runtimeMinutes, item.runtime, item.Runtime, item.duration];
  for (const value of candidates) {
    const minutes = parseRuntimeMinutes(value);
    if (minutes > 0) {
      return minutes;
    }
  }
  return 0;
}

function estimateTvEpisodeRuntimeMinutes(item) {
  if (!item) return 0;
  const candidates = [item.tvEpisodeRuntime, item.tvRuntime, item.runtime];
  for (const value of candidates) {
    const minutes = parseRuntimeMinutes(value);
    if (minutes > 0) {
      return minutes;
    }
  }
  return 0;
}

function getAnimeEpisodeCount(item) {
  if (!item) return 0;
  const count = Number(item.animeEpisodes || item.episodes || item.totalEpisodes);
  return Number.isFinite(count) && count > 0 ? count : 0;
}

function estimateAnimeEpisodeRuntimeMinutes(item) {
  if (!item) return 0;
  const candidates = [item.animeDuration, item.duration, item.runtime];
  for (const value of candidates) {
    const minutes = parseRuntimeMinutes(value);
    if (minutes > 0) {
      return minutes;
    }
  }
  return 0;
}

function isAnimeMovieEntry(item) {
  if (!item) return false;
  const format = String(item.animeFormat || item.format || '').trim().toUpperCase();
  return format === 'MOVIE' || format === 'FILM';
}

function matchesUnifiedSearch(item, query) {
  if (!query) return true;
  if (!item) return false;
  const fields = [
    item.title,
    item.notes,
    item.plot,
    item.seriesName,
    item.director,
    item.author,
    Array.isArray(item.actors) ? item.actors.join(' ') : item.actors,
    Array.isArray(item.animeGenres) ? item.animeGenres.join(' ') : item.animeGenres,
  ];
  return fields.some(field => field && String(field).toLowerCase().includes(query));
}


function buildUnifiedCard(entry) {
  const { listType, id, displayItem, displayEntryId, positionIndex } = entry;
  if (isCollapsibleList(listType)) {
    return buildCollapsibleMovieCard(listType, id, displayItem, positionIndex, {
      displayEntryId,
    });
  }
  return buildStandardCard(listType, id, displayItem);
}

function isCollapsibleList(listType) {
  return COLLAPSIBLE_LISTS.has(listType);
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
        listType,
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

function renderCollapsibleMediaGrid(listType, container, entries) {
  const grid = createEl('div', 'movies-grid');
  const { displayRecords, leaderMembersByCardId, visibleIds } = prepareCollapsibleRecords(listType, entries);
  seriesGroups[listType] = leaderMembersByCardId;

  displayRecords.forEach(record => {
    const { id, displayItem, displayEntryId, index } = record;
    const card = buildCollapsibleMovieCard(listType, id, displayItem, index, {
      displayEntryId,
    });
    grid.appendChild(card);
    queueCardTitleAutosize(card);
  });

  container.appendChild(grid);

  const expandedSet = ensureExpandedSet(listType);
  expandedSet.forEach(cardId => {
    if (!visibleIds.has(cardId)) {
      expandedSet.delete(cardId);
    }
  });

  updateCollapsibleCardStates(listType);
}

function renderStandardList(container, listType, entries) {
  entries.forEach(([id, item]) => {
    if (!item) return;
    const card = buildStandardCard(listType, id, item);
    container.appendChild(card);
    queueCardTitleAutosize(card);
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
  ensureCardTitleResizeListener(card);
  return card;
}

function renderMovieCardContent(card, listType, cardId, item, entryId = cardId) {
  if (!card) return;
  card.dataset.entryId = entryId;
  card.querySelectorAll('.movie-card-summary, .movie-card-details').forEach(el => el.remove());
  const isExpanded = card.classList.contains('expanded');
  const baseSeriesEntries = isCollapsibleList(listType) ? getSeriesGroupEntries(listType, cardId) : null;
  const seriesEntries = mergeSeriesEntriesAcrossLists(listType, cardId, item, baseSeriesEntries);
  const summary = buildMovieCardSummary(listType, item, { cardId, entryId, seriesEntries, isExpanded });
  const details = buildMovieCardDetails(listType, cardId, entryId, item, { seriesEntries, isExpanded });
  card.insertBefore(summary, card.firstChild || null);
  card.appendChild(details);
  restoreActiveSeasonEditor(card);
  queueCardTitleAutosize(card);
}

const cardTitleResizeQueue = new Set();
let cardTitleResizeScheduled = false;
const cardTitleResizeHandlers = new WeakMap();

function queueCardTitleAutosize(card) {
  if (!card) return;
  cardTitleResizeQueue.add(card);
  if (!cardTitleResizeScheduled) {
    cardTitleResizeScheduled = true;
    requestAnimationFrame(flushCardTitleAutosizeQueue);
  }
}

function ensureCardTitleResizeListener(card) {
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
  cardTitleResizeQueue.forEach(card => {
    applyCardTitleAutosize(card);
  });
  cardTitleResizeQueue.clear();
}

function applyCardTitleAutosize(card) {
  if (!card) return;
  const titleEl = card.querySelector('.movie-card-header .title') || card.querySelector('.card-header .title');
  if (!titleEl) return;
  autosizeTitleElement(titleEl);
}

function autosizeTitleElement(titleEl) {
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

const recalcCardTitleSizes = debounce(() => {
  document.querySelectorAll('.single-line-title').forEach(titleEl => autosizeTitleElement(titleEl));
}, 200);

if (typeof window !== 'undefined') {
  window.addEventListener('resize', () => {
    recalcCardTitleSizes();
  });
}

function buildMovieCardSummary(listType, item, context = {}) {
  const summary = createEl('div', 'movie-card-summary');
  summary.appendChild(buildMovieArtwork(item, context));
  summary.appendChild(buildMovieCardInfo(listType, item, context));
  return summary;
}

function buildMovieArtwork(item, context = {}) {
  const wrapper = createEl('div', 'artwork-wrapper');
  const seriesEntries = Array.isArray(context.seriesEntries) ? context.seriesEntries : [];
  const stackItems = buildSeriesPosterStackItems(item, seriesEntries);
  const shouldStack = stackItems.length > 1;
  if (shouldStack) {
    wrapper.classList.add('artwork-stack-wrapper');
    const stackClasses = ['artwork-stack'];
    if (!context.isExpanded) {
      stackClasses.push('artwork-deck', 'artwork-deck-collapsed');
    } else {
      stackClasses.push('artwork-deck', 'artwork-deck-expanded');
    }
    const stack = createEl('div', stackClasses.join(' '));
    stackItems.slice(0, 3).forEach((entry, index) => {
      const art = buildPosterNode(entry.poster, entry.title, index === 0);
      art.classList.add('artwork-stack-item');
      stack.appendChild(art);
    });
    if (stackItems.length > 3) {
      const spill = createEl('div', 'artwork-stack-count', { text: `+${stackItems.length - 3}` });
      stack.appendChild(spill);
    }
    wrapper.appendChild(stack);
    return wrapper;
  }

  const fallbackPoster = stackItems.length ? stackItems[0].poster : '';
  const fallbackTitle = stackItems.length ? stackItems[0].title : '';
  const posterNode = buildPosterNode(item?.poster || fallbackPoster, item?.title || fallbackTitle || 'Poster');
  if (posterNode) {
    wrapper.appendChild(posterNode);
    return wrapper;
  }
  wrapper.appendChild(createEl('div', 'artwork placeholder', { text: 'No Poster' }));
  return wrapper;
}

function buildPosterNode(posterUrl, title = '', isPrimary = false) {
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

function buildSeriesPosterStackItems(activeItem, seriesEntries = []) {
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
  if (activeItem) {
    addItem(activeItem);
  }
  seriesEntries.forEach(entry => addItem(entry?.item));
  return items.filter(entry => entry.poster);
}

function buildMovieCardInfo(listType, item, context = {}) {
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
    const badges = buildMediaSummaryBadges(listType, item, { ...context, listType });
    if (badges) info.appendChild(badges);
  }

  return info;
}

function resolveSeriesCardTitleParts(item, context = {}) {
  const defaultTitle = item?.title || '(no title)';
  const seriesName = resolveSeriesNameFromEntries(context.seriesEntries, item);
  if (!context.isExpanded && seriesName) {
    const subtitle = seriesName !== defaultTitle ? defaultTitle : '';
    return { titleText: seriesName, subtitleText: subtitle };
  }
  return { titleText: defaultTitle, subtitleText: '' };
}

function buildMediaSummaryBadges(listType, item, context = {}) {
  if (!item) return null;
  const chips = collectMediaBadgeChips(listType, item, context);
  if (!chips.length) return null;
  const isTv = listType === 'tvShows';
  const rowClass = isTv ? 'tv-summary-badges' : 'anime-summary-badges';
  const chipClass = isTv ? 'tv-chip' : 'anime-chip';
  const row = createEl('div', rowClass);
  if (context.cardId) {
    row.dataset.cardId = context.cardId;
  }
  if (context.listType) {
    row.dataset.listType = context.listType;
  }
  chips.forEach(text => row.appendChild(createEl('span', chipClass, { text })));
  return row;
}

function collectMediaBadgeChips(listType, item, context = {}) {
  if (listType === 'tvShows') {
    return buildTvStatChips(item);
  }
  if (listType === 'movies' || listType === 'anime') {
    return buildSeriesBadgeChips(listType, context.cardId, item);
  }
  return [];
}

function buildSeriesBadgeChips(listType, cardId, item) {
  const metrics = deriveSeriesBadgeMetrics(listType, cardId, item);
  if (!metrics) return [];
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
  return chips;
}

function buildTvStatChips(item) {
  if (!item) return [];
  if (Array.isArray(item.cachedTvBadges) && item.cachedTvBadges.length) {
    return item.cachedTvBadges.slice();
  }
  return computeTvBadgeStrings(item);
}

function computeTvBadgeStrings(source) {
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
    chips.push(runtimeLabel);
  }
  const statusLabel = formatTvStatusLabel(source?.tvStatus || source?.status);
  if (statusLabel) {
    chips.push(statusLabel);
  }
  return chips;
}

function getTvSeasonCount(item) {
  if (!item) return 0;
  const direct = Number(item.tvSeasonCount);
  if (Number.isFinite(direct) && direct > 0) {
    return direct;
  }
  if (Array.isArray(item.tvSeasonSummaries)) {
    return item.tvSeasonSummaries.filter(season => season && (season.seasonNumber !== undefined && season.seasonNumber !== null)).length;
  }
  return 0;
}

function getTvEpisodeCount(item) {
  if (!item) return 0;
  const direct = Number(item.tvEpisodeCount);
  if (Number.isFinite(direct) && direct > 0) {
    return direct;
  }
  if (Array.isArray(item.tvSeasonSummaries)) {
    return item.tvSeasonSummaries.reduce((total, season) => {
      const count = Number(season?.episodeCount);
      return Number.isFinite(count) && count > 0 ? total + count : total;
    }, 0);
  }
  return 0;
}

function formatTvRuntimeLabel(item) {
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

function formatTvStatusLabel(value) {
  if (!value) return '';
  return value.toString().replace(/_/g, ' ').replace(/\b\w/g, ch => ch.toUpperCase());
}

function formatAnimeFormatLabel(value) {
  if (!value) return '';
  return String(value).replace(/_/g, ' ').replace(/\b\w/g, ch => ch.toUpperCase());
}

function extractEpisodeCount(entry) {
  if (!entry) return 0;
  const seasonFields = ['animeSeasonSummaries', 'tvSeasonSummaries'];
  for (const field of seasonFields) {
    const total = sumSeasonEpisodeCounts(entry[field]);
    if (total > 0) {
      return total;
    }
  }
  const directCandidates = [entry.animeEpisodes, entry.totalEpisodes, entry.episodes];
  for (const candidate of directCandidates) {
    const parsed = parseEpisodeValue(candidate);
    if (parsed > 0) {
      return parsed;
    }
  }
  return 0;
}

function sumSeasonEpisodeCounts(seasons) {
  if (!Array.isArray(seasons) || !seasons.length) return 0;
  return seasons.reduce((total, season) => {
    const parsed = parseEpisodeValue(season?.episodeCount);
    return parsed > 0 ? total + parsed : total;
  }, 0);
}

function parseEpisodeValue(value) {
  if (value === undefined || value === null) return 0;
  if (typeof value === 'number') {
    return Number.isFinite(value) && value > 0 ? value : 0;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return 0;
    if (/season/i.test(trimmed) && !/episod|\bep\b/i.test(trimmed)) {
      return 0;
    }
    const match = trimmed.match(/(\d+(?:\.\d+)?)/);
    if (!match) return 0;
    const parsed = Number(match[1]);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  }
  return 0;
}

function deriveSeriesBadgeMetrics(listType, cardId, fallbackItem) {
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
    const epValue = extractEpisodeCount(entry);
    const isMovieEntry = isAnimeMovieEntry(entry);
    if (epValue > 0 && !isMovieEntry) {
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

function buildMovieCardDetails(listType, cardId, entryId, item, context = {}) {
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

  if (listType === 'anime') {
    const animeBlock = buildAnimeDetailBlock(listType, entryId, item);
    if (animeBlock) {
      details.appendChild(animeBlock);
    }
  }

  if (listType === 'tvShows') {
    const tvBlock = buildTvDetailBlock(listType, entryId, item);
    if (tvBlock) {
      details.appendChild(tvBlock);
    }
  }

  if (isCollapsibleList(listType)) {
    const seriesBlock = buildSeriesTreeBlock(listType, cardId, context.seriesEntries);
    if (seriesBlock) {
      details.appendChild(seriesBlock);
    }
  }

  details.appendChild(buildMovieCardActions(listType, entryId, item));
  return details;
}

function buildAnimeDetailBlock(listType, entryId, item) {
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
  const resolvedEntryId = entryId || item.__id || item.id || '';
  const animeSeasonField = getAnimeSeasonField(item);
  if (animeSeasonField) {
    const seasonBreakdown = buildSeasonNotesBreakdown({
      listType,
      entryId: resolvedEntryId,
      rawSeasons: Array.isArray(item[animeSeasonField]) ? item[animeSeasonField] : [],
      fieldName: animeSeasonField,
      fallbackLabel: 'Season',
      placeholder: 'Notes for this season',
    });
    if (seasonBreakdown) {
      block.appendChild(seasonBreakdown);
    }
  }
  return block.children.length ? block : null;
}

function buildTvDetailBlock(listType, entryId, item) {
  if (!item) return null;
  const chips = buildTvStatChips(item);
  const hasChips = chips.length > 0;
  const resolvedEntryId = entryId || item.__id || item.id || '';
  const seasonBreakdown = buildSeasonNotesBreakdown({
    listType,
    entryId: resolvedEntryId,
    rawSeasons: Array.isArray(item.tvSeasonSummaries) ? item.tvSeasonSummaries : [],
    fieldName: 'tvSeasonSummaries',
    fallbackLabel: 'Season',
    placeholder: 'Notes for this season',
  });
  if (!hasChips && !seasonBreakdown) return null;
  const block = createEl('div', 'detail-block tv-detail-block');
  if (hasChips) {
    const row = createEl('div', 'tv-stats-row');
    row.dataset.cardId = resolvedEntryId;
    row.dataset.listType = listType;
    chips.forEach(text => row.appendChild(createEl('span', 'tv-chip', { text })));
    block.appendChild(row);
  }
  if (seasonBreakdown) {
    block.appendChild(seasonBreakdown);
  }
  return block;
}

function buildSeasonNotesBreakdown({
  listType,
  entryId,
  rawSeasons = [],
  fieldName,
  fallbackLabel = 'Season',
  placeholder = 'Notes for this season',
} = {}) {
  if (!Array.isArray(rawSeasons) || !rawSeasons.length || !fieldName) return null;
  const normalized = rawSeasons
    .filter(season => season && (season.seasonNumber !== undefined || season.title))
    .slice();
  if (!normalized.length) return null;
  normalized.sort((a, b) => {
    const seasonA = Number(a.seasonNumber);
    const seasonB = Number(b.seasonNumber);
    if (Number.isFinite(seasonA) && Number.isFinite(seasonB)) return seasonA - seasonB;
    if (Number.isFinite(seasonA)) return -1;
    if (Number.isFinite(seasonB)) return 1;
    const titleA = (a.title || '').toLowerCase();
    const titleB = (b.title || '').toLowerCase();
    if (titleA < titleB) return -1;
    if (titleA > titleB) return 1;
    return 0;
  });
  const breakdown = createEl('div', 'tv-season-breakdown');
  normalized.forEach(season => {
    breakdown.appendChild(createSeasonNoteRow({
      listType,
      entryId,
      season,
      fieldName,
      sourceSeasons: rawSeasons,
      fallbackLabel,
      placeholder,
    }));
  });
  return breakdown;
}

function createSeasonNoteRow({
  listType,
  entryId,
  season,
  fieldName,
  sourceSeasons = [],
  fallbackLabel = 'Season',
  placeholder = 'Notes for this season',
} = {}) {
  const row = createEl('div', 'tv-season-line');
  const seasonKey = buildSeasonRowKey(season);
  if (seasonKey) {
    row.dataset.seasonKey = seasonKey;
  }
  const summaryText = formatSeasonSummary(season, fallbackLabel);
  row.appendChild(createEl('div', 'tv-season-line-summary', { text: summaryText }));
  const statusControls = createSeasonStatusControls({
    listType,
    entryId,
    season,
    fieldName,
    sourceSeasons,
    seasonKey,
  });
  if (statusControls) {
    row.appendChild(statusControls);
  }
  const notesLabel = createEl('label', 'season-notes-field');
  notesLabel.appendChild(createEl('span', 'sr-only', { text: `${summaryText} notes` }));
  const textarea = document.createElement('textarea');
  textarea.className = 'season-notes-input';
  if (seasonKey) {
    textarea.dataset.seasonKey = seasonKey;
  }
  textarea.dataset.seasonField = 'notes';
  textarea.dataset.entryId = entryId || '';
  textarea.dataset.listType = listType || '';
  textarea.placeholder = placeholder;
  textarea.value = typeof season?.notes === 'string' ? season.notes : '';
  textarea.rows = 3;
  notesLabel.appendChild(textarea);
  row.appendChild(notesLabel);

  const canPersist = Boolean(listType && entryId && fieldName);
  if (!canPersist) {
    textarea.disabled = true;
    textarea.placeholder = 'Notes unavailable in this view';
    return row;
  }

  const saveNote = (value) => persistSeasonNote(listType, entryId, fieldName, sourceSeasons, season, value);

  textarea.addEventListener('input', () => {
    updateSeasonEditorSelection(textarea);
  });
  ['click', 'keydown', 'keyup'].forEach(evt => {
    textarea.addEventListener(evt, (ev) => {
      ev.stopPropagation();
      updateSeasonEditorSelection(textarea);
    });
  });
  textarea.addEventListener('mouseup', () => updateSeasonEditorSelection(textarea));
  textarea.addEventListener('focus', () => {
    rememberSeasonEditor(textarea, { field: 'notes' });
    updateSeasonEditorSelection(textarea);
  });
  textarea.addEventListener('blur', () => {
    saveNote(textarea.value);
    clearActiveSeasonEditor(textarea);
  });

  return row;
}

const SEASON_STATUS_OPTIONS = [
  { value: 'soon', label: 'Soon™' },
  { value: 'watching', label: 'Watching' },
  { value: 'finished', label: 'Finished' },
];

const DEFAULT_EPISODE_TRACKING_LIMIT = 100;
const MAX_EPISODE_TRACKING_LIMIT = 200;
const DEFAULT_SEASON_STATUS = 'soon';

function createSeasonStatusControls({
  listType,
  entryId,
  season,
  fieldName,
  sourceSeasons = [],
  seasonKey = '',
} = {}) {
  if (!season) return null;
  const container = createEl('div', 'season-status-controls');
  const statusSelect = document.createElement('select');
  statusSelect.className = 'season-pill-select season-status-pill';
  if (seasonKey) statusSelect.dataset.seasonKey = seasonKey;
  statusSelect.dataset.seasonField = 'status';
  statusSelect.dataset.entryId = entryId || '';
  statusSelect.dataset.listType = listType || '';
  SEASON_STATUS_OPTIONS.forEach(opt => {
    const option = document.createElement('option');
    option.value = opt.value;
    option.textContent = opt.label;
    statusSelect.appendChild(option);
  });
  const storedStatus = normalizeSeasonStatus(season.watchStatus);
  const normalizedStatus = storedStatus || DEFAULT_SEASON_STATUS;
  statusSelect.value = normalizedStatus;
  const canPersist = Boolean(listType && entryId && fieldName && Array.isArray(sourceSeasons) && sourceSeasons.length);
  if (!canPersist) {
    statusSelect.disabled = true;
  }

  const episodeCount = resolveSeasonEpisodeCount(season);
  const episodeSelect = buildSeasonEpisodeSelect({
    season,
    initialStatus: normalizedStatus,
    episodeCount,
    listType,
    entryId,
    fieldName,
    sourceSeasons,
    seasonKey,
  });

  const persistStatus = (nextStatus) => {
    if (!canPersist) return;
    const resolvedStatus = normalizeSeasonStatus(nextStatus) || DEFAULT_SEASON_STATUS;
    const updates = { watchStatus: resolvedStatus };
    if (resolvedStatus !== 'watching') {
      updates.progressEpisode = '';
    }
    persistSeasonFields(listType, entryId, fieldName, sourceSeasons, season, updates);
    if (episodeSelect) {
      toggleEpisodeVisibility(episodeSelect, resolvedStatus === 'watching');
      if (resolvedStatus !== 'watching') {
        episodeSelect.value = '';
      }
    }
  };

  statusSelect.addEventListener('change', (event) => {
    event.stopPropagation();
    persistStatus(statusSelect.value);
    rememberSeasonEditor(statusSelect, { field: 'status' });
  });
  ['click', 'keydown', 'keyup'].forEach(evt => {
    statusSelect.addEventListener(evt, (event) => event.stopPropagation());
  });
  statusSelect.addEventListener('focus', () => {
    rememberSeasonEditor(statusSelect, { field: 'status' });
  });
  statusSelect.addEventListener('blur', () => {
    clearActiveSeasonEditor(statusSelect);
  });

  container.appendChild(statusSelect);
  if (episodeSelect) {
    container.appendChild(episodeSelect);
  }
  return container;
}

function buildSeasonEpisodeSelect({
  season,
  initialStatus,
  episodeCount,
  listType,
  entryId,
  fieldName,
  sourceSeasons = [],
  seasonKey = '',
} = {}) {
  if (!season) return null;
  const totalEpisodes = Math.max(episodeCount || DEFAULT_EPISODE_TRACKING_LIMIT, 1);
  const cappedEpisodes = Math.min(totalEpisodes, MAX_EPISODE_TRACKING_LIMIT);
  const select = document.createElement('select');
  select.className = 'season-pill-select season-episode-pill';
  if (seasonKey) select.dataset.seasonKey = seasonKey;
  select.dataset.seasonField = 'episode';
  select.dataset.entryId = entryId || '';
  select.dataset.listType = listType || '';
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = episodeCount > 0 ? `Ep 1-${episodeCount}` : 'Episode…';
  select.appendChild(placeholder);
  for (let i = 1; i <= cappedEpisodes; i += 1) {
    const option = document.createElement('option');
    option.value = String(i);
    option.textContent = episodeCount > 0 ? `Ep ${i}/${episodeCount}` : `Episode ${i}`;
    select.appendChild(option);
  }
  const storedEpisode = parseEpisodeValue(season.progressEpisode);
  if (storedEpisode > 0 && storedEpisode > cappedEpisodes) {
    const custom = document.createElement('option');
    custom.value = String(storedEpisode);
    custom.textContent = `Episode ${storedEpisode}`;
    select.appendChild(custom);
  }
  if (storedEpisode > 0) {
    select.value = String(storedEpisode);
  }
  toggleEpisodeVisibility(select, initialStatus === 'watching');

  const canPersist = Boolean(listType && entryId && fieldName && Array.isArray(sourceSeasons) && sourceSeasons.length);
  if (!canPersist) {
    select.disabled = true;
  }

  select.addEventListener('change', (event) => {
    event.stopPropagation();
    if (!canPersist) return;
    const parsed = parseEpisodeValue(select.value);
    const normalized = parsed > 0 ? parsed : '';
    persistSeasonFields(listType, entryId, fieldName, sourceSeasons, season, { progressEpisode: normalized });
    rememberSeasonEditor(select, { field: 'episode' });
  });
  ['click', 'keydown', 'keyup'].forEach(evt => {
    select.addEventListener(evt, (event) => event.stopPropagation());
  });
  select.addEventListener('focus', () => rememberSeasonEditor(select, { field: 'episode' }));
  select.addEventListener('blur', () => clearActiveSeasonEditor(select));
  return select;
}

function toggleEpisodeVisibility(select, shouldShow) {
  if (!select) return;
  if (shouldShow) {
    select.classList.remove('is-hidden');
    select.disabled = false;
  } else {
    select.classList.add('is-hidden');
    select.disabled = true;
    clearActiveSeasonEditor(select);
  }
}

function normalizeSeasonStatus(value) {
  if (!value) return '';
  const normalized = String(value).trim().toLowerCase();
  if (normalized.startsWith('watch')) return 'watching';
  if (normalized.startsWith('finish') || normalized.startsWith('complete')) return 'finished';
  if (normalized.startsWith('soon')) return 'soon';
  return '';
}

function resolveSeasonEpisodeCount(season) {
  if (!season) return 0;
  return parseEpisodeValue(season.episodeCount ?? season.totalEpisodes ?? season.episodes ?? season.animeEpisodes);
}

function buildSeasonRowKey(season) {
  if (!season) return '';
  const tokens = [];
  if (season.id) tokens.push(`id:${season.id}`);
  if (season.malId) tokens.push(`mal:${season.malId}`);
  if (season.seasonId) tokens.push(`sid:${season.seasonId}`);
  if (season.seasonNumber !== undefined && season.seasonNumber !== null) {
    tokens.push(`num:${season.seasonNumber}`);
  }
  if (season.title) tokens.push(`title:${season.title.toLowerCase()}`);
  if (season.year) tokens.push(`year:${season.year}`);
  if (!tokens.length) {
    const keys = Object.keys(season).sort();
    keys.forEach(key => {
      if (season[key] === undefined || season[key] === null) return;
      tokens.push(`${key}:${String(season[key])}`);
    });
  }
  return tokens.join('|') || 'season';
}

function rememberSeasonEditor(target, meta = {}) {
  if (!target) return;
  const dataset = target.dataset || {};
  activeSeasonEditor = {
    listType: meta.listType || dataset.listType || '',
    entryId: meta.entryId || dataset.entryId || '',
    seasonKey: meta.seasonKey || dataset.seasonKey || '',
    field: meta.field || dataset.seasonField || '',
    selectionStart: typeof target.selectionStart === 'number' ? target.selectionStart : null,
    selectionEnd: typeof target.selectionEnd === 'number' ? target.selectionEnd : null,
  };
}

function updateSeasonEditorSelection(target) {
  if (!activeSeasonEditor || !target) return;
  const dataset = target.dataset || {};
  if (activeSeasonEditor.entryId !== (dataset.entryId || '')) return;
  if (activeSeasonEditor.seasonKey !== (dataset.seasonKey || '')) return;
  if (activeSeasonEditor.field !== (dataset.seasonField || '')) return;
  if (typeof target.selectionStart === 'number') {
    activeSeasonEditor.selectionStart = target.selectionStart;
    activeSeasonEditor.selectionEnd = target.selectionEnd;
  }
}

function clearActiveSeasonEditor(target) {
  if (!activeSeasonEditor) return;
  if (!target) {
    activeSeasonEditor = null;
    return;
  }
  const dataset = target.dataset || {};
  if (
    activeSeasonEditor.entryId === (dataset.entryId || '') &&
    activeSeasonEditor.seasonKey === (dataset.seasonKey || '') &&
    activeSeasonEditor.field === (dataset.seasonField || '')
  ) {
    activeSeasonEditor = null;
  }
}

function restoreActiveSeasonEditor(card) {
  if (!activeSeasonEditor || !card) return;
  const cardListType = card.dataset.listType || '';
  if (activeSeasonEditor.listType && cardListType && activeSeasonEditor.listType !== cardListType) {
    return;
  }
  const selectorCandidates = card.querySelectorAll('[data-season-field]');
  const target = Array.from(selectorCandidates).find(node => {
    const dataset = node.dataset || {};
    return dataset.seasonField === activeSeasonEditor.field
      && dataset.entryId === activeSeasonEditor.entryId
      && dataset.seasonKey === activeSeasonEditor.seasonKey;
  });
  if (!target) return;
  requestAnimationFrame(() => {
    if (typeof target.focus === 'function') {
      target.focus({ preventScroll: true });
    }
    if (
      activeSeasonEditor.field === 'notes'
      && typeof target.setSelectionRange === 'function'
      && typeof activeSeasonEditor.selectionStart === 'number'
    ) {
      const start = activeSeasonEditor.selectionStart;
      const end = typeof activeSeasonEditor.selectionEnd === 'number'
        ? activeSeasonEditor.selectionEnd
        : start;
      try {
        target.setSelectionRange(start, end);
      } catch (err) {
        // ignore selection errors
      }
    }
  });
}

function persistSeasonNote(listType, entryId, fieldName, sourceSeasons, targetSeason, noteValue) {
  if (!listType || !entryId || !fieldName || !Array.isArray(sourceSeasons) || !targetSeason) return;
  const normalizedValue = typeof noteValue === 'string' ? noteValue : '';
  persistSeasonFields(listType, entryId, fieldName, sourceSeasons, targetSeason, { notes: normalizedValue });
}

function persistSeasonFields(listType, entryId, fieldName, sourceSeasons, targetSeason, updates = {}) {
  if (!listType || !entryId || !fieldName || !Array.isArray(sourceSeasons) || !targetSeason) return;
  const entries = Object.entries(updates).filter(([, value]) => value !== undefined);
  if (!entries.length) return;
  let mutated = false;
  const next = sourceSeasons.map(season => {
    if (!seasonMatches(season, targetSeason)) return season;
    let changed = false;
    const updated = { ...season };
    entries.forEach(([key, value]) => {
      const currentValue = season?.[key];
      const normalizedCurrent = currentValue ?? '';
      const normalizedNext = value ?? '';
      if (normalizedCurrent === normalizedNext) return;
      updated[key] = value;
      changed = true;
    });
    if (changed) {
      mutated = true;
      return updated;
    }
    return season;
  });
  if (!mutated) return;
  Object.assign(targetSeason, updates);
  updateItem(listType, entryId, { [fieldName]: next }).catch(err => {
    console.warn('Failed to save season metadata', { listType, entryId, fieldName, updates }, err);
  });
}

function seasonMatches(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.seasonNumber !== undefined && b.seasonNumber !== undefined) {
    return Number(a.seasonNumber) === Number(b.seasonNumber);
  }
  if (a.title && b.title) {
    return a.title === b.title;
  }
  return false;
}

function formatSeasonSummary(season, fallbackLabel = 'Season') {
  if (!season) return fallbackLabel;
  const segments = [];
  if (season.title) {
    segments.push(season.title);
  } else if (season.seasonNumber !== undefined && season.seasonNumber !== null) {
    segments.push(`${fallbackLabel} ${season.seasonNumber}`);
  }
  const count = Number(season.episodeCount);
  if (Number.isFinite(count) && count > 0) {
    segments.push(`${count} episode${count === 1 ? '' : 's'}`);
  }
  if (season.year) {
    segments.push(`(${season.year})`);
  }
  return segments.length ? segments.join(' • ') : fallbackLabel;
}

function getAnimeSeasonField(item) {
  if (!item) return null;
  if (Array.isArray(item.animeSeasonSummaries) && item.animeSeasonSummaries.length) {
    return 'animeSeasonSummaries';
  }
  if (Array.isArray(item.tvSeasonSummaries) && item.tvSeasonSummaries.length) {
    return 'tvSeasonSummaries';
  }
  return null;
}

function formatAnimeEpisodesLabel(value) {
  const count = parseEpisodeValue(value);
  if (count > 0) {
    return `${count} episode${count === 1 ? '' : 's'}`;
  }
  return '';
}

function formatAnimeRuntimeLabel(item) {
  if (!item) return '';
  const duration = parseEpisodeValue(item.animeDuration);
  if (!duration) return '';
  if (isAnimeMovieEntry(item)) {
    return `${duration} min`;
  }
  return `${duration} min/ep`;
}

function buildSeriesTreeBlock(listType, cardId, providedEntries = null) {
  const entries = Array.isArray(providedEntries) && providedEntries.length
    ? providedEntries
    : getSeriesGroupEntries(listType, cardId);
  if (!entries || entries.length <= 1) return null;

  const block = createEl('div', 'series-tree detail-block');
  block.dataset.cardId = cardId;
  block.dataset.listType = listType;
  block.appendChild(buildSeriesTreeHeader(entries.length));

  const list = createEl('div', 'series-tree-list');
  entries.forEach((entry, index) => {
    const node = buildSeriesTreeNode(listType, entry, index);
    if (node) {
      list.appendChild(node);
    }
  });

  if (!list.children.length) return null;
  const listWrapper = createEl('div', 'series-tree-scroll');
  listWrapper.appendChild(list);
  block.appendChild(listWrapper);
  return block;
}

function buildSeriesTreeHeader(count) {
  const heading = createEl('div', 'series-tree-heading');
  heading.appendChild(createEl('div', 'series-tree-heading-title', { text: 'Franchise order' }));
  heading.appendChild(createEl('div', 'series-tree-heading-count', { text: `${count} ${count === 1 ? 'entry' : 'entries'}` }));
  return heading;
}

function getSeriesGroupEntries(listType, cardId) {
  const store = seriesGroups[listType];
  if (!store) return null;
  const entries = store.get(cardId);
  if (!entries || !entries.length) return null;
  return entries.slice();
}

function collectSeriesEntriesAcrossLists(seriesName) {
  const normalizedKey = normalizeTitleKey(seriesName);
  if (!normalizedKey) return [];
  const cached = crossListSeriesCache.get(normalizedKey);
  if (cached && cached.version === seriesIndexVersion) {
    return cached.entries.slice();
  }
  const entries = [];
  const cacheMap = getDisplayCacheMap();
  COLLAPSIBLE_LISTS.forEach(type => {
    const pool = cacheMap[type];
    if (!pool) return;
    Object.entries(pool).forEach(([id, item]) => {
      if (!item || !item.seriesName) return;
      if (normalizeTitleKey(item.seriesName) !== normalizedKey) return;
      entries.push({ id, item, listType: type, order: numericSeriesOrder(item.seriesOrder) });
    });
  });
  crossListSeriesCache.set(normalizedKey, { version: seriesIndexVersion, entries });
  return entries.slice();
}

function mergeSeriesEntriesAcrossLists(listType, cardId, displayItem, primaryEntries) {
  const baseEntries = Array.isArray(primaryEntries) ? primaryEntries.slice() : [];
  const seriesName = resolveSeriesNameFromEntries(baseEntries, displayItem);
  if (!seriesName) {
    return baseEntries.length ? baseEntries : null;
  }
  const merged = [];
  const seen = new Set();
  const addEntry = (entry, fallbackListType = listType) => {
    if (!entry || !entry.item) return;
    const entryListType = entry.listType || fallbackListType;
    const entryId = entry.id || cardId;
    const key = buildSeriesEntryKey(entryListType, entryId, entry.item);
    if (seen.has(key)) return;
    seen.add(key);
    merged.push({
      id: entryId,
      item: entry.item,
      order: entry.order ?? numericSeriesOrder(entry.item?.seriesOrder),
      listType: entryListType,
    });
  };
  baseEntries.forEach(entry => addEntry(entry, listType));
  if (!baseEntries.length && displayItem) {
    addEntry({ id: cardId, item: displayItem, listType, order: numericSeriesOrder(displayItem.seriesOrder) }, listType);
  }
  const crossEntries = collectSeriesEntriesAcrossLists(seriesName);
  crossEntries.forEach(entry => addEntry(entry, entry.listType));
  if (!merged.length) return null;
  merged.sort(compareSeriesEntries);
  return merged;
}

function resolveSeriesNameFromEntries(entries, fallbackItem) {
  if (Array.isArray(entries)) {
    for (const entry of entries) {
      const candidate = entry?.item?.seriesName;
      if (candidate) return candidate;
    }
  }
  if (fallbackItem && fallbackItem.seriesName) {
    return fallbackItem.seriesName;
  }
  return '';
}

function buildSeriesEntryKey(listType, entryId, item) {
  const safeType = listType || 'unknown';
  if (entryId) {
    return `${safeType}:${entryId}`;
  }
  const titleKey = titleSortKey(item?.title || '');
  const yearKey = sanitizeYear(item?.year || '') || '----';
  return `${safeType}:${titleKey}:${yearKey}`;
}

function compareSeriesEntries(a, b) {
  const orderA = numericSeriesOrder(a?.order ?? a?.item?.seriesOrder);
  const orderB = numericSeriesOrder(b?.order ?? b?.item?.seriesOrder);
  const safeA = orderA === null || orderA === undefined ? Number.POSITIVE_INFINITY : orderA;
  const safeB = orderB === null || orderB === undefined ? Number.POSITIVE_INFINITY : orderB;
  if (safeA !== safeB) return safeA - safeB;
  const yearA = parseInt(sanitizeYear(a?.item?.year || ''), 10) || 9999;
  const yearB = parseInt(sanitizeYear(b?.item?.year || ''), 10) || 9999;
  if (yearA !== yearB) return yearA - yearB;
  const titleA = titleSortKey(a?.item?.title || '');
  const titleB = titleSortKey(b?.item?.title || '');
  if (titleA < titleB) return -1;
  if (titleA > titleB) return 1;
  const typeA = (a?.listType || '').toString();
  const typeB = (b?.listType || '').toString();
  return typeA.localeCompare(typeB);
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

function buildSeriesTreeNode(listType, entry, fallbackIndex = 0) {
  if (!entry || !entry.item) return null;
  const { item } = entry;
  const entryListType = entry.listType || listType;
  const node = createEl('div', 'series-tree-node');
  node.dataset.entryId = entry.id || '';

  const orderLabel = resolveSeriesNodeOrder(entry, fallbackIndex);
  node.appendChild(createEl('div', 'series-tree-order', { text: `#${orderLabel}` }));

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

  const seriesLine = buildSeriesLine(item, 'series-tree-line');
  if (seriesLine) {
    body.appendChild(seriesLine);
  }

  const plot = buildSeriesTreePlot(item);
  if (plot) {
    body.appendChild(plot);
  }

  if (item.notes) {
    body.appendChild(createEl('div', 'series-tree-notes', { text: item.notes }));
  }

  node.appendChild(body);
  return node;
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
  const episodeCount = extractEpisodeCount(item);
  const isMovie = isAnimeMovieEntry(item) || (item.imdbType && String(item.imdbType).toLowerCase() === 'movie');
  if (!isMovie && episodeCount > 0) {
    parts.push(`${episodeCount} ep`);
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

function truncateText(value, limit = 240) {
  if (!value) return '';
  if (value.length <= limit) return value;
  return `${value.slice(0, limit - 1).trim()}…`;
}

function resetSeriesCardToFirstEntry(listType, cardId) {
  const entries = getSeriesGroupEntries(listType, cardId);
  if (!entries || !entries.length) return;
  const first = entries[0];
  if (!first || !first.item) return;
  const cards = document.querySelectorAll(`.card.collapsible.movie-card[data-list-type="${listType}"][data-id="${cardId}"]`);
  cards.forEach(card => renderMovieCardContent(card, listType, cardId, first.item, first.id));
}

function buildMovieMetaText(item) {
  const metaParts = [];
  if (item.year) metaParts.push(item.year);
  if (item.director) metaParts.push(item.director);
  if (item.runtime) metaParts.push(item.runtime);
  else if (item.animeDuration) {
    const animeRuntime = formatAnimeRuntimeLabel(item);
    if (animeRuntime) metaParts.push(animeRuntime);
  }
  if (item.imdbRating) metaParts.push(`IMDb ${item.imdbRating}`);
  return metaParts.join(' • ');
}

function buildMovieExtendedMeta(item) {
  const parts = [];
  if (item.originalLanguage) {
    parts.push(`Original Language: ${item.originalLanguage}`);
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
      className: 'btn success',
      label: 'Finished',
      handler: () => handleFinishRequest(listType, id)
    },
    ...(SERIES_BULK_DELETE_LISTS.has(listType) && item?.seriesName ? [{
      className: 'btn danger',
      label: 'Delete Series',
      handler: () => deleteSeriesEntries(listType, item.seriesName)
    }] : []),
    {
      className: 'btn ghost',
      label: 'Delete',
      handler: () => deleteItem(listType, id, { fromFinished: showFinishedOnly })
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

function getFinishedRatingData(item) {
  if (!item) return null;
  const rating = normalizeFinishRating(item.finishedRating);
  if (rating === null) {
    return null;
  }
  const scaleValue = Number(item.finishedRatingScale);
  const scale = Number.isFinite(scaleValue) && scaleValue > 0 ? scaleValue : FINISH_RATING_MAX;
  return { rating, scale };
}

function buildFinishedRatingBadge(item) {
  const data = getFinishedRatingData(item);
  if (!data) return null;
  const badge = createEl('span', 'rating-badge');
  badge.setAttribute('title', `Finished rating: ${data.rating}/${data.scale}`);
  badge.setAttribute('aria-label', `Finished rating ${data.rating} out of ${data.scale}`);
  const icon = createEl('span', 'rating-badge-icon', { text: '★' });
  const value = createEl('span', 'rating-badge-value', { text: `${data.rating}/${data.scale}` });
  badge.appendChild(icon);
  badge.appendChild(value);
  return badge;
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
  const ratingBadge = buildFinishedRatingBadge(item);
  if (ratingBadge) {
    header.appendChild(ratingBadge);
  }
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

  const finishBtn = createEl('button', 'btn success', { text: 'Finished' });
  finishBtn.addEventListener('click', async (ev) => {
    ev.stopPropagation();
    await handleFinishRequest(listType, id);
  });
  actions.appendChild(finishBtn);

  if (SERIES_BULK_DELETE_LISTS.has(listType) && item?.seriesName) {
    const deleteSeriesBtn = createEl('button', 'btn danger', { text: 'Delete Series' });
    deleteSeriesBtn.addEventListener('click', () => deleteSeriesEntries(listType, item.seriesName));
    actions.appendChild(deleteSeriesBtn);
  }

  const deleteBtn = createEl('button', 'btn ghost', { text: 'Delete' });
  deleteBtn.addEventListener('click', () => deleteItem(listType, id, { fromFinished: showFinishedOnly }));
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
    const wasExpanded = card.classList.contains('expanded');
    card.classList.toggle('expanded', isMatch);
    if (wasExpanded !== isMatch) {
      refreshSeriesCardContent(card);
    }
    queueCardTitleAutosize(card);
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
    alert('Title is required');
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
          listType,
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
      alert("Hey dumbass! It's already in the damn list!");
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
  const breakdown = breakdownDurationMinutes(totalMinutes);
  const parts = [];
  if (breakdown.years) parts.push(`${breakdown.years}y`);
  if (breakdown.months) parts.push(`${breakdown.months}mth`);
  if (breakdown.days) parts.push(`${breakdown.days}d`);
  if (breakdown.hours) parts.push(`${breakdown.hours}h`);
  if (breakdown.minutes) parts.push(`${breakdown.minutes}m`);
  return parts.join(' ');
}

function formatRuntimeDurationDetailed(totalMinutes, forceShow = {}) {
  if ((!totalMinutes || totalMinutes <= 0) && Object.keys(forceShow).length === 0) return '';
  const breakdown = breakdownDurationMinutes(totalMinutes);
  
  // Extract weeks from days
  let weeks = 0;
  if (breakdown.days >= 7) {
    weeks = Math.floor(breakdown.days / 7);
    breakdown.days = breakdown.days % 7;
  }
  breakdown.weeks = weeks;

  const parts = [];
  const hasYears = breakdown.years > 0 || forceShow.years;
  const hasMonths = breakdown.months > 0 || forceShow.months;
  const hasWeeks = breakdown.weeks > 0 || forceShow.weeks;
  const hasDays = breakdown.days > 0 || forceShow.days;
  const hasHours = breakdown.hours > 0 || forceShow.hours;
  const hasMinutes = true; // Always show minutes if we are showing anything
  
  if (hasYears) parts.push(formatDurationUnit(breakdown.years, 'year', true));
  if (hasMonths) parts.push(formatDurationUnit(breakdown.months, 'month', true));
  if (hasWeeks) parts.push(formatDurationUnit(breakdown.weeks, 'week', true));
  if (hasDays) parts.push(formatDurationUnit(breakdown.days, 'day', true));
  if (hasHours) parts.push(formatDurationUnit(breakdown.hours, 'hour', true));
  if (hasMinutes) parts.push(formatDurationUnit(breakdown.minutes, 'minute', true));
  
  if (!parts.length) {
    return 'Less than a minute';
  }
  
  // Wrap each part in a span for stability
  return parts.map(p => `<span class="runtime-part">${p}</span>`).join(', ');
}

function formatDurationUnit(value, unitLabel, keepZero = false) {
  const amount = Math.floor(value);
  if (!amount && !keepZero) return '';
  
  if (amount === 0) {
    return `00 ${unitLabel}s`;
  }
  
  const formattedAmount = amount < 10 
    ? `<span style="opacity: 0;">0</span>${amount}` 
    : `${amount}`;
  return `${formattedAmount} ${unitLabel}${amount === 1 ? '' : 's'}`;
}

function breakdownDurationMinutes(totalMinutes) {
  const minutesPerHour = 60;
  const minutesPerDay = minutesPerHour * 24;
  const minutesPerMonth = minutesPerDay * 30;
  const minutesPerYear = minutesPerDay * 365;
  let remaining = Math.max(0, Math.floor(totalMinutes));
  const years = Math.floor(remaining / minutesPerYear);
  remaining -= years * minutesPerYear;
  const months = Math.floor(remaining / minutesPerMonth);
  remaining -= months * minutesPerMonth;
  const days = Math.floor(remaining / minutesPerDay);
  remaining -= days * minutesPerDay;
  const hours = Math.floor(remaining / minutesPerHour);
  remaining -= hours * minutesPerHour;
  const minutes = remaining;
  return { years, months, days, hours, minutes };
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
    listType: targetListType = '',
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

  const budgetValue = metadata.Budget && metadata.Budget !== 'N/A' ? metadata.Budget : '';
  setField('budget', budgetValue);

  const revenueValue = metadata.Revenue && metadata.Revenue !== 'N/A' ? metadata.Revenue : '';
  setField('revenue', revenueValue);

  const getEffectiveValue = (key) => (Object.prototype.hasOwnProperty.call(updates, key) ? updates[key] : existing[key]);

  if (metadata.TvSeasonCount !== undefined && metadata.TvSeasonCount !== null) {
    setField('tvSeasonCount', metadata.TvSeasonCount);
  }
  if (metadata.TvEpisodeCount !== undefined && metadata.TvEpisodeCount !== null) {
    setField('tvEpisodeCount', metadata.TvEpisodeCount);
  }
  if (metadata.TvEpisodeRuntime !== undefined && metadata.TvEpisodeRuntime !== null) {
    setField('tvEpisodeRuntime', metadata.TvEpisodeRuntime);
  }
  if (metadata.TvStatus) {
    setField('tvStatus', metadata.TvStatus);
  }
  if (Array.isArray(metadata.TvSeasonSummaries) && metadata.TvSeasonSummaries.length) {
    setField('tvSeasonSummaries', metadata.TvSeasonSummaries);
  }

  if (targetListType === 'tvShows') {
    const badgeSource = {
      tvSeasonCount: getEffectiveValue('tvSeasonCount'),
      tvEpisodeCount: getEffectiveValue('tvEpisodeCount'),
      tvEpisodeRuntime: getEffectiveValue('tvEpisodeRuntime'),
      tvStatus: getEffectiveValue('tvStatus'),
      runtime: getEffectiveValue('runtime'),
      tvSeasonSummaries: getEffectiveValue('tvSeasonSummaries'),
    };
    const tvBadges = computeTvBadgeStrings(badgeSource);
    if (tvBadges.length) {
      setField('cachedTvBadges', tvBadges);
    }
  }

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
  const entries = Object.entries(rawData || {});
  if (!entries.length) {
    return { displayCandidates: [], candidateMap: new Map() };
  }

  const normalized = entries
    .map(([id, item]) => {
      if (!item) return null;
      return item.__id ? item : Object.assign({ __id: id }, item);
    })
    .filter(Boolean);

  const eligibleItems = normalized.filter(isSpinnerStatusEligible);
  if (!eligibleItems.length) {
    return { displayCandidates: [], candidateMap: new Map() };
  }

  const shouldApplySeriesLogic = ['movies', 'tvShows', 'anime'].includes(listType);
  const selectedItems = [];

  if (shouldApplySeriesLogic) {
    const seriesBuckets = new Map();
    eligibleItems.forEach(item => {
      const key = (item.seriesName || item.series?.name || '').trim().toLowerCase();
      if (!key) {
        selectedItems.push(item);
        return;
      }
      if (!seriesBuckets.has(key)) {
        seriesBuckets.set(key, []);
      }
      seriesBuckets.get(key).push(item);
    });

    seriesBuckets.forEach(items => {
      const sorted = items.slice().sort((a, b) => {
        const orderDiff = parseSeriesOrder(a.seriesOrder) - parseSeriesOrder(b.seriesOrder);
        if (orderDiff !== 0) return orderDiff;
        const titleA = (a.title || '').toLowerCase();
        const titleB = (b.title || '').toLowerCase();
        if (titleA < titleB) return -1;
        if (titleA > titleB) return 1;
        return 0;
      });
      const firstUnwatched = sorted.find(item => !isItemWatched(item));
      selectedItems.push(firstUnwatched || sorted[0]);
    });
  } else {
    selectedItems.push(...eligibleItems);
  }

  const candidateMap = new Map();
  const displayCandidates = [];

  selectedItems.forEach(item => {
    if (!item) return;
    const id = item.__id || item.id;
    if (!id || candidateMap.has(id)) return;
    candidateMap.set(id, item);
    displayCandidates.push({
      id,
      title: item.title || '(no title)'
    });
  });

  displayCandidates.sort((a, b) => {
    const titleA = (a.title || '').toLowerCase();
    const titleB = (b.title || '').toLowerCase();
    if (titleA < titleB) return -1;
    if (titleA > titleB) return 1;
    return 0;
  });

  return { displayCandidates, candidateMap };
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

// ============================================================================
// Feature 6: Metadata Refresh & External API Pipelines
// ============================================================================

function needsMetadataRefresh(listType, item) {
  if (!item || !item.title) return false;
  if (!['movies', 'tvShows', 'anime'].includes(listType)) return false;
  if (item.metadataVersion !== METADATA_SCHEMA_VERSION) return true;
  return getMissingMetadataFields(item, listType).length > 0;
}

function refreshTmdbMetadataForItem(listType, itemId, item, missingFields = []) {
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
      listType,
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
  if (metadataRefreshInflight.has(key)) return;
  metadataRefreshInflight.add(key);
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
      listType,
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

// ============================================================================
// Feature 9: Utility Helpers & Shared Formatters
// ============================================================================

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

function delay(ms) {
  const duration = Math.max(0, Number(ms) || 0);
  return new Promise(resolve => setTimeout(resolve, duration));
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
  Object.keys(finishedCaches).forEach(key => delete finishedCaches[key]);
  document.querySelectorAll('[data-role="actor-filter"]').forEach(input => {
    input.value = '';
  });
  document.querySelectorAll('[data-role="sort"]').forEach(sel => {
    const listType = sel.dataset.list;
    const mode = sortModes[listType] || 'title';
    sel.value = mode;
  });
  showFinishedOnly = false;
  if (finishedFilterToggle) {
    finishedFilterToggle.checked = false;
  }
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
  const normalizedRuntime = typeof runtimeMinutes === 'number' && Number.isFinite(runtimeMinutes)
    ? runtimeMinutes
    : null;
  const runtimeLabel = normalizedRuntime
    ? `${normalizedRuntime} min${mediaType === 'tv' ? '/ep' : ''}`
    : '';
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
  const tvSeasonCount = mediaType === 'tv'
    ? (Number(detail.number_of_seasons) || (Array.isArray(detail.seasons) ? detail.seasons.length : 0))
    : null;
  const tvEpisodeCount = mediaType === 'tv' ? Number(detail.number_of_episodes) || null : null;
  const tvStatus = mediaType === 'tv' ? (detail.status || '') : '';
  const tvEpisodeRuntime = mediaType === 'tv' ? normalizedRuntime : null;
  const tvSeasonSummaries = mediaType === 'tv' && Array.isArray(detail.seasons)
    ? detail.seasons
        .filter(season => season && typeof season.season_number === 'number')
        .map(season => ({
          seasonNumber: season.season_number,
          episodeCount: typeof season.episode_count === 'number' ? season.episode_count : null,
          title: season.name || `Season ${season.season_number}`,
          year: extractPrimaryYear(season.air_date || ''),
          airDate: season.air_date || '',
        }))
    : [];

  return {
    Title: detail.title || detail.name || '',
    Year: releaseDate ? String(releaseDate).slice(0, 4) : '',
    Director: director,
    Runtime: runtimeLabel,
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
    TmdbID: tmdbId,
    TvSeasonCount: tvSeasonCount,
    TvEpisodeCount: tvEpisodeCount,
    TvEpisodeRuntime: tvEpisodeRuntime,
    TvStatus: tvStatus,
    TvSeasonSummaries: tvSeasonSummaries,
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

async function moveItemBetweenLists(sourceListType, targetListType, itemId, itemData) {
  if (!currentUser) {
    alert('Not signed in');
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

function normalizeFinishRating(value) {
  if (value === null || value === undefined) {
    return null;
  }
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return null;
  }
  const rounded = Math.round(num);
  if (rounded < FINISH_RATING_MIN || rounded > FINISH_RATING_MAX) {
    return null;
  }
  return rounded;
}

function promptFinishRatingFallback(item) {
  const input = prompt(`Rate "${item.title || 'this entry'}" from ${FINISH_RATING_MIN}-${FINISH_RATING_MAX} stars before finishing:`);
  if (input === null) {
    return null;
  }
  const normalized = normalizeFinishRating(input);
  if (normalized === null) {
    alert(`Please enter a number between ${FINISH_RATING_MIN} and ${FINISH_RATING_MAX}.`);
    return null;
  }
  return normalized;
}

function promptFinishRating(item) {
  if (!modalRoot) {
    return Promise.resolve(promptFinishRatingFallback(item));
  }
  closeAddModal();
  closeWheelModal();

  return new Promise(resolve => {
    let selectedRating = null;
    let resolved = false;

    const backdrop = createEl('div', 'modal-backdrop finish-rating-backdrop');
    const modal = createEl('div', 'modal finish-rating-modal');
    const heading = createEl('h3', 'finish-rating-heading', { text: `Rate ${item.title || 'this entry'}` });
    const subtitle = createEl('p', 'finish-rating-subtitle', { text: 'Pick how many stars it earned before filing it in Finished.' });
    const options = createEl('div', 'finish-rating-options');
    const optionButtons = [];

    const preview = createEl('div', 'finish-rating-preview', { text: 'Select a rating to continue.' });
    const actions = createEl('div', 'finish-rating-actions');
    const cancelBtn = createEl('button', 'btn ghost', { text: 'Cancel' });
    const confirmBtn = createEl('button', 'btn success', { text: 'Finish' });
    confirmBtn.disabled = true;

    function selectRating(value) {
      selectedRating = value;
      preview.textContent = `Rated ${value} star${value === 1 ? '' : 's'}`;
      confirmBtn.disabled = false;
      optionButtons.forEach(btn => {
        btn.classList.toggle('is-selected', Number(btn.dataset.rating) === selectedRating);
      });
    }

    function cleanup(result) {
      if (resolved) return;
      resolved = true;
      document.removeEventListener('keydown', handleKeyDown);
      backdrop.removeEventListener('click', handleBackdropClick);
      if (modalRoot) {
        modalRoot.innerHTML = '';
      }
      resolve(result);
    }

    function handleKeyDown(ev) {
      if (ev.key === 'Escape') {
        ev.preventDefault();
        cleanup(null);
      } else if (ev.key === 'Enter' && selectedRating !== null && !confirmBtn.disabled) {
        ev.preventDefault();
        cleanup(selectedRating);
      }
    }

    function handleBackdropClick(ev) {
      if (ev.target === backdrop) {
        cleanup(null);
      }
    }

    for (let rating = FINISH_RATING_MIN; rating <= FINISH_RATING_MAX; rating++) {
      const btn = createEl('button', 'finish-rating-option');
      btn.dataset.rating = String(rating);
      const valueEl = createEl('span', 'finish-rating-value', { text: rating });
      const starEl = createEl('span', 'finish-rating-star', { text: '★' });
      btn.appendChild(valueEl);
      btn.appendChild(starEl);
      btn.addEventListener('click', (ev) => {
        ev.preventDefault();
        selectRating(rating);
      });
      optionButtons.push(btn);
      options.appendChild(btn);
    }

    cancelBtn.addEventListener('click', (ev) => {
      ev.preventDefault();
      cleanup(null);
    });
    confirmBtn.addEventListener('click', (ev) => {
      ev.preventDefault();
      if (selectedRating !== null) {
        cleanup(selectedRating);
      }
    });

    actions.appendChild(cancelBtn);
    actions.appendChild(confirmBtn);

    modal.appendChild(heading);
    modal.appendChild(subtitle);
    modal.appendChild(options);
    modal.appendChild(preview);
    modal.appendChild(actions);
    backdrop.appendChild(modal);
    modalRoot.innerHTML = '';
    modalRoot.appendChild(backdrop);

    document.addEventListener('keydown', handleKeyDown);
    backdrop.addEventListener('click', handleBackdropClick);
  });
}

async function handleFinishRequest(listType, itemId) {
  if (!currentUser) {
    alert('Not signed in');
    return;
  }
  const cache = listCaches[listType] || {};
  const item = cache[itemId];
  if (!item) {
    alert('Unable to find this entry. Refresh and try again.');
    return;
  }
  const rating = await promptFinishRating(item);
  if (rating === null) {
    return;
  }
  await finishItem(listType, itemId, rating);
}

async function finishItem(listType, itemId, ratingValue) {
  if (!currentUser) {
    alert('Not signed in');
    return;
  }
  const cache = listCaches[listType] || {};
  const item = cache[itemId];
  if (!item) {
    alert('Unable to find this entry. Refresh and try again.');
    return;
  }
  const payload = { ...item };
  delete payload.__id;
  delete payload.__type;
  delete payload.__source;
  payload.finishedAt = Date.now();
  const normalizedRating = normalizeFinishRating(ratingValue);
  if (normalizedRating !== null) {
    payload.finishedRating = normalizedRating;
    payload.finishedRatingScale = FINISH_RATING_MAX;
  }

  const finishedRef = ref(db, `users/${currentUser.uid}/finished/${listType}/${itemId}`);
  const sourceRef = ref(db, `users/${currentUser.uid}/${listType}/${itemId}`);
  try {
    await set(finishedRef, payload);
    await remove(sourceRef);
    const ratingSuffix = normalizedRating !== null ? ` (${normalizedRating}/10)` : '';
    pushNotification({
      title: 'Moved to Finished',
      message: `${item.title || 'Entry'} now lives in your Finished list${ratingSuffix}.`
    });
  } catch (err) {
    console.error('finishItem failed', err);
    pushNotification({
      title: 'Could not finish item',
      message: 'Something went wrong while filing this entry. Please try again.'
    });
  }
}

// Delete an item
function deleteItem(listType, itemId, options = {}) {
  if (!currentUser) {
    alert('Not signed in');
    return Promise.reject(new Error('Not signed in'));
  }
  const { fromFinished = false } = options;
  if (!confirm('Delete this item?')) return;
  const cacheSource = fromFinished ? finishedCaches : listCaches;
  if (listType === 'anime' && cacheSource[listType] && cacheSource[listType][itemId]) {
    const target = cacheSource[listType][itemId];
    const aniListId = getAniListIdFromItem(target);
    if (aniListId) {
      rememberIgnoredAniListId(aniListId);
    }
  }
  const basePath = fromFinished
    ? `users/${currentUser.uid}/finished/${listType}`
    : `users/${currentUser.uid}/${listType}`;
  const itemRef = ref(db, `${basePath}/${itemId}`);
  remove(itemRef).catch(err => console.error('Delete failed', err));
}

async function deleteSeriesEntries(listType, seriesName) {
  if (!SERIES_BULK_DELETE_LISTS.has(listType)) return;
  if (!currentUser) {
    alert('Not signed in');
    return;
  }
  if (!seriesName) {
    alert('Series name missing for bulk delete.');
    return;
  }
  const normalized = normalizeTitleKey(seriesName);
  if (!normalized) {
    alert('Unable to determine which series to delete.');
    return;
  }
  const entries = Object.entries(listCaches[listType] || {}).filter(([, item]) => normalizeTitleKey(item?.seriesName || '') === normalized);
  if (!entries.length) {
    alert(`No entries found for "${seriesName}".`);
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
    alert(`Deleted ${entries.length} entr${entries.length === 1 ? 'y' : 'ies'} from "${seriesName}".`);
  } catch (err) {
    alert('Some entries could not be deleted. Please try again.');
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
    if (!newTitle) return alert('Title is required');
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
      alert('Unable to save changes right now. Please try again.');
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
    alert('Metadata refresh is only available for movies, TV, anime, or books.');
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
        alert('TMDb metadata refresh requires an API key.');
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
      alert('No metadata found for this title.');
      return;
    }

    const updates = deriveMetadataAssignments(metadata, item, {
      overwrite: true,
      fallbackTitle: lookupTitle,
      fallbackYear: lookupYear,
      listType,
    });

    if (!updates || Object.keys(updates).length === 0) {
      alert('Metadata already looks up to date.');
      return;
    }

    await updateItem(listType, itemId, updates);
    Object.assign(item, updates);
    alert('Metadata refreshed!');
  } catch (err) {
    console.error('Manual metadata refresh failed', err);
    alert('Unable to refresh metadata right now. Please try again.');
  } finally {
    setButtonState(false);
  }
}

// ============================================================================
// Feature 7: Spinner / Wheel Experience
// ============================================================================

function setupWheelModal() {
  if (!wheelModalTrigger || !wheelModalTemplate || !modalRoot) return;
  wheelModalTrigger.addEventListener('click', () => openWheelModal());
}

function openWheelModal() {
  if (!wheelModalTemplate || !modalRoot) return;
  closeAddModal();
  closeWheelModal();
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop wheel-modal-backdrop';
  const modal = document.createElement('div');
  modal.className = 'modal wheel-modal';
  const fragment = wheelModalTemplate.content.cloneNode(true);
  modal.appendChild(fragment);
  backdrop.appendChild(modal);
  modalRoot.innerHTML = '';
  modalRoot.appendChild(backdrop);

  const sourceSelect = modal.querySelector('[data-wheel-source]');
  const spinButton = modal.querySelector('[data-wheel-spin]');
  const spinnerEl = modal.querySelector('[data-wheel-spinner]');
  const resultEl = modal.querySelector('[data-wheel-result]');
  const closeBtn = modal.querySelector('[data-wheel-close]');

  wheelSourceSelect = sourceSelect || null;
  wheelSpinnerEl = spinnerEl || null;
  wheelResultEl = resultEl || null;
  if (wheelSpinnerEl) {
    wheelSpinnerEl.classList.add('hidden');
    wheelSpinnerEl.classList.remove('spinning');
    wheelSpinnerEl.innerHTML = '';
  }
  if (wheelResultEl) {
    wheelResultEl.innerHTML = '';
  }

  const spinHandler = () => {
    if (!wheelSourceSelect) return;
    spinWheel(wheelSourceSelect.value);
  };
  if (spinButton) {
    spinButton.addEventListener('click', spinHandler);
  }

  const closeHandler = () => closeWheelModal();
  if (closeBtn) {
    closeBtn.addEventListener('click', closeHandler);
  }

  const backdropHandler = (event) => {
    if (event.target === backdrop) {
      closeWheelModal();
    }
  };
  backdrop.addEventListener('click', backdropHandler);

  const keyHandler = (event) => {
    if (event.key === 'Escape') {
      closeWheelModal();
    }
  };
  document.addEventListener('keydown', keyHandler);

  wheelModalState = {
    backdrop,
    modal,
    spinButton,
    spinHandler,
    closeBtn,
    closeHandler,
    backdropHandler,
    keyHandler,
  };
}

function closeWheelModal() {
  if (wheelModalState) {
    if (wheelModalState.spinButton && wheelModalState.spinHandler) {
      wheelModalState.spinButton.removeEventListener('click', wheelModalState.spinHandler);
    }
    if (wheelModalState.closeBtn && wheelModalState.closeHandler) {
      wheelModalState.closeBtn.removeEventListener('click', wheelModalState.closeHandler);
    }
    if (wheelModalState.backdrop && wheelModalState.backdropHandler) {
      wheelModalState.backdrop.removeEventListener('click', wheelModalState.backdropHandler);
    }
    if (wheelModalState.keyHandler) {
      document.removeEventListener('keydown', wheelModalState.keyHandler);
    }
    if (wheelModalState.backdrop && wheelModalState.backdrop.parentNode) {
      wheelModalState.backdrop.parentNode.removeChild(wheelModalState.backdrop);
    }
  }
  clearWheelAnimation();
  wheelModalState = null;
  wheelSourceSelect = null;
  wheelSpinnerEl = null;
  wheelResultEl = null;
}

function buildSpinnerDataScope(listType, rawData) {
  if (!rawData) return {};
  if (!listSupportsActorFilter(listType)) return rawData;
  const filterValue = getActorFilterValue(listType);
  if (!filterValue) return rawData;
  const scoped = {};
  Object.entries(rawData).forEach(([id, entry]) => {
    if (matchesActorFilter(listType, entry, filterValue)) {
      scoped[id] = entry;
    }
  });
  return scoped;
}

function loadSpinnerSourceData(listType) {
  const cached = listCaches[listType];
  if (cached) {
    return Promise.resolve({ data: cached, source: 'cache' });
  }
  const listRef = ref(db, `users/${currentUser.uid}/${listType}`);
  return get(listRef).then(snap => ({ data: snap.val() || {}, source: 'remote' }));
}

function loadAllSpinnerSourceData() {
  if (!currentUser) return Promise.resolve([]);
  const tasks = PRIMARY_LIST_TYPES.map(listType =>
    loadSpinnerSourceData(listType)
      .then(payload => ({ listType, ...payload }))
      .catch(err => {
        console.warn('Wheel source load failed', listType, err);
        return { listType, data: {}, source: 'error' };
      })
  );
  return Promise.all(tasks);
}

function annotateWheelItem(item, listType, fallbackId) {
  if (!item) return null;
  const baseId = fallbackId || item.__id || item.id;
  if (!baseId) return null;
  return {
    ...item,
    __id: baseId,
    __wheelListType: listType,
    __wheelSourceId: baseId,
  };
}

function createWheelCompositeId(listType, itemId) {
  return `${listType}:${itemId}`;
}

function mapWheelCandidateMap(candidateMap, listType, { compositeKeys = false } = {}) {
  const mapped = new Map();
  candidateMap.forEach((item, id) => {
    const annotated = annotateWheelItem(item, listType, id);
    if (!annotated) return;
    const key = compositeKeys ? createWheelCompositeId(listType, id) : id;
    if (compositeKeys) {
      mapped.set(key, { ...annotated, __wheelCompositeId: key });
    } else {
      mapped.set(key, annotated);
    }
  });
  return mapped;
}

function buildAllSpinnerCandidates(scopedDataByType = {}) {
  const displayCandidates = [];
  const candidateMap = new Map();
  PRIMARY_LIST_TYPES.forEach(listType => {
    const data = scopedDataByType[listType];
    if (!data) return;
    const { displayCandidates: typeDisplay, candidateMap: typeMap } = buildSpinnerCandidates(listType, data);
    const annotatedMap = mapWheelCandidateMap(typeMap, listType, { compositeKeys: true });
    annotatedMap.forEach((item, key) => {
      candidateMap.set(key, item);
    });
    const label = MEDIA_TYPE_LABELS[listType] || listType;
    typeDisplay.forEach(entry => {
      const compositeId = createWheelCompositeId(listType, entry.id);
      if (!candidateMap.has(compositeId)) return;
      displayCandidates.push({
        id: compositeId,
        sourceId: entry.id,
        listType,
        title: `${label}: ${entry.title}`,
      });
    });
  });
  displayCandidates.sort((a, b) => {
    const titleA = (a.title || '').toLowerCase();
    const titleB = (b.title || '').toLowerCase();
    if (titleA < titleB) return -1;
    if (titleA > titleB) return 1;
    return 0;
  });
  return { displayCandidates, candidateMap };
}

function prepareWheelCandidateContext(listType) {
  if (listType === 'all') {
    return loadAllSpinnerSourceData().then(results => {
      const scopedDataByType = {};
      results.forEach(({ listType: type, data }) => {
        scopedDataByType[type] = buildSpinnerDataScope(type, data);
      });
      const { displayCandidates, candidateMap } = buildAllSpinnerCandidates(scopedDataByType);
      const sourceLabel = results.map(({ listType: type, source }) => `${type}:${source || 'cache'}`).join(', ');
      return {
        scopeLabel: 'all',
        candidates: displayCandidates,
        candidateMap,
        rawDataByType: scopedDataByType,
        sourceLabel,
      };
    });
  }
  return loadSpinnerSourceData(listType).then(({ data, source }) => {
    const scopedData = buildSpinnerDataScope(listType, data);
    const { displayCandidates, candidateMap } = buildSpinnerCandidates(listType, scopedData);
    const annotatedMap = mapWheelCandidateMap(candidateMap, listType);
    const decoratedCandidates = displayCandidates.map(entry => ({
      ...entry,
      sourceId: entry.id,
      listType,
    }));
    return {
      scopeLabel: listType,
      candidates: decoratedCandidates,
      candidateMap: annotatedMap,
      rawDataByType: { [listType]: scopedData },
      sourceLabel: source,
    };
  });
}

function clearWheelAnimation() {
  spinTimeouts.forEach(id => clearTimeout(id));
  spinTimeouts = [];
  if (!wheelSpinnerEl) return;
  wheelSpinnerEl.classList.remove('spinning');
  wheelSpinnerEl.innerHTML = '';
}

function renderWheelResult(item, listType) {
  if (!wheelResultEl) return;
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

  const entryId = item.__id || item.id || '';
  const cardId = entryId || `wheel-${Date.now()}`;
  let cardNode = null;

  if (isCollapsibleList(listType)) {
    cardNode = buildCollapsibleMovieCard(listType, cardId, item, 0, {
      hideCard: false,
      displayEntryId: entryId || cardId,
      interactive: false,
    });
    cardNode.classList.add('expanded');
  } else {
    cardNode = buildStandardCard(listType, cardId, item);
  }

  cardNode.classList.add('wheel-result-card');
  wheelResultEl.appendChild(cardNode);
}

function renderWheelWinnerFromLookup(listType, finalEntry, candidateMap, rawData) {
  if (!wheelResultEl) return;
  if (!finalEntry || !finalEntry.id) {
    wheelResultEl.textContent = 'Winner selected, but no details were found.';
    return;
  }
  const rawId = finalEntry && (finalEntry.sourceId || finalEntry.id);
  let winner = candidateMap?.get(finalEntry.id) || null;
  if (!winner && rawData && rawId && rawData[rawId]) {
    const fromRaw = rawData[rawId];
    if (fromRaw) {
      winner = fromRaw.__id ? fromRaw : Object.assign({ __id: rawId }, fromRaw);
    }
  }
  if (!winner && rawId && listCaches[listType] && listCaches[listType][rawId]) {
    const fromCache = listCaches[listType][rawId];
    if (fromCache) {
      winner = fromCache.__id ? fromCache : Object.assign({ __id: rawId }, fromCache);
    }
  }
  if (!winner) {
    wheelResultEl.innerHTML = '';
    const heading = document.createElement('div');
    heading.className = 'wheel-result-heading';
    heading.textContent = finalEntry.title
      ? `Winner: ${finalEntry.title}`
      : 'Winner selected';
    wheelResultEl.appendChild(heading);
    const note = document.createElement('div');
    note.className = 'small';
    note.textContent = 'Unable to load winner details. Please refresh and try again.';
    wheelResultEl.appendChild(note);
    return;
  }
  renderWheelResult(winner, listType);
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
  alert('No related titles found on TMDb.');
}

function resolveSeriesRedirect(listType, item, rawData) {
  if (!item || !rawData) return item;
  if (!['movies', 'tvShows', 'anime'].includes(listType)) return item;
  const rawSeries = typeof item.seriesName === 'string' ? item.seriesName.trim() : '';
  if (!rawSeries) return item;
  const targetKey = rawSeries.toLowerCase();
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

function animateWheelSequence(candidates, chosenIndex, listType, finalDisplayEntry, finalizeCallback) {
  const len = candidates.length;
  if (len === 0 || !wheelSpinnerEl) return;

  const chosenEntry = candidates[chosenIndex];
  const finalEntry = finalDisplayEntry || chosenEntry;
  const iterations = Math.max(28, len * 5);
  let pointer = Math.floor(Math.random() * len);
  const sequence = [];
  for (let i = 0; i < iterations; i++) {
    sequence.push(candidates[pointer % len]);
    pointer++;
  }
  sequence.push(finalEntry);

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
      chosenTitle: chosenEntry?.title,
      finalTitle: finalEntry?.title,
      candidates: candidates.map(c => c && c.title).filter(Boolean),
      steps: stepCount
    });
  } catch (_) {}

  sequence.forEach((item, idx) => {
    const timeout = setTimeout(() => {
      if (!wheelSpinnerEl) return;
      const isFinal = idx === sequence.length - 1;
      wheelSpinnerEl.innerHTML = '';
      const span = document.createElement('span');
      span.className = `spin-text${isFinal ? ' final' : ''}`;
      span.textContent = item.title || '(no title)';
      wheelSpinnerEl.appendChild(span);
      try { console.log(`[Wheel] step ${idx + 1}/${sequence.length}: ${item.title || '(no title)'}${isFinal ? ' [FINAL]' : ''}`); } catch (_) {}
      if (isFinal) {
        wheelSpinnerEl.classList.remove('spinning');
        if (typeof finalizeCallback === 'function') {
          finalizeCallback(finalEntry);
        }
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
  if (!wheelSpinnerEl || !wheelResultEl) {
    console.warn('Wheel spinner UI is not mounted. Open the wheel modal first.');
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

  prepareWheelCandidateContext(listType).then(({ scopeLabel, candidates, candidateMap, rawDataByType, sourceLabel }) => {
    if (!wheelSpinnerEl || !wheelResultEl) {
      clearWheelAnimation();
      return;
    }
    try {
      console.log('[Wheel] spin start', {
        listType: scopeLabel,
        source: sourceLabel,
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
    const chosenEntry = candidates[chosenIndex];
    const chosenItem = chosenEntry ? candidateMap.get(chosenEntry.id) : null;
    const entryListType = chosenItem?.__wheelListType || chosenEntry?.listType || listType;
    const scopedData = rawDataByType[entryListType] || {};
    const resolvedItem = chosenItem ? (resolveSeriesRedirect(entryListType, chosenItem, scopedData) || chosenItem) : null;
    const resolvedSourceId = resolvedItem
      ? (resolvedItem.__wheelSourceId || resolvedItem.__id || resolvedItem.id)
      : (chosenEntry?.sourceId || chosenEntry?.id);
    const compositeId = resolvedSourceId ? createWheelCompositeId(entryListType, resolvedSourceId) : '';
    const candidateKey = compositeId && candidateMap.has(compositeId)
      ? compositeId
      : resolvedSourceId || chosenEntry?.id;
    const resolvedEntry = {
      id: candidateKey,
      listType: entryListType,
      sourceId: resolvedSourceId || chosenEntry?.sourceId || chosenEntry?.id,
      title: resolvedItem?.title || chosenEntry?.title || '(no title)'
    };
    try {
      console.log('[Wheel] pick', {
        scope: scopeLabel,
        chosenIndex,
        chosen: chosenEntry?.title,
        chosenType: entryListType,
        resolved: resolvedEntry?.title,
        resolvedId: resolvedEntry?.id,
      });
    } catch (_) {}
    const finalize = (finalEntry) => {
      const finalType = finalEntry?.listType || entryListType;
      renderWheelWinnerFromLookup(finalType, finalEntry, candidateMap, rawDataByType[finalType]);
    };
    animateWheelSequence(candidates, chosenIndex, scopeLabel, resolvedEntry, finalize);
  }).catch(err => {
    console.error('Wheel load failed', err);
    if (!wheelSpinnerEl || !wheelResultEl) {
      clearWheelAnimation();
      return;
    }
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

tmEasterEgg.bindTriggers();
initUnifiedLibraryControls();
initNotificationBell();
renderUnifiedLibrary();

function updateListStats(listType, entries) {
  const statsEl = document.getElementById(`${listType}-stats`);
  if (!statsEl) return;
  const count = Array.isArray(entries) ? entries.length : 0;
  if (listType === 'movies') {
    const totalMinutes = (Array.isArray(entries) ? entries : []).reduce((sum, [, item]) => {
      return sum + parseRuntimeMinutes(item && item.runtime);
    }, 0);
    const label = `${count} movie${count === 1 ? '' : 's'}`;
    const runtimeLabel = totalMinutes > 0
      ? `${formatRuntimeDuration(totalMinutes)} total runtime`
      : 'Runtime unavailable';
    statsEl.textContent = `${label} • ${runtimeLabel}`;
    return;
  }
  statsEl.textContent = `${count} item${count === 1 ? '' : 's'}`;
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
  const englishFirst = [
    source.titleEnglish,
    source.title_english,
    source.english,
    typeof source.title === 'object' ? source.title?.english : undefined,
  ];
  englishFirst.forEach(pushCandidate);
  if (Array.isArray(source.titles)) {
    const englishEntry = source.titles.find(entry => entry && /english/i.test(entry.type || ''));
    if (englishEntry && englishEntry.title) {
      pushCandidate(englishEntry.title);
    }
    source.titles.forEach(entry => {
      if (entry && entry.title) pushCandidate(entry.title);
    });
  }
  if (typeof source.title === 'string') pushCandidate(source.title);
  if (source.title_japanese) pushCandidate(source.title_japanese);
  if (typeof source.name === 'string') pushCandidate(source.name);
  if (source.romaji) pushCandidate(source.romaji);
  if (source.native) pushCandidate(source.native);
  if (typeof source === 'object' && source.title && typeof source.title === 'object') {
    pushCandidate(source.title.romaji);
    pushCandidate(source.title.native);
  }
  return candidates[0] || '';
}

function pickAnimeSuggestionTitle(source = {}) {
  if (!source) return '';
  const englishTitle = source.titleEnglish
    || source.title_english
    || (source.title && typeof source.title === 'object' ? source.title.english : null)
    || extractEnglishTitleFromList(source.titles);
  const cleanedEnglish = typeof englishTitle === 'string' ? englishTitle.trim() : '';
  if (cleanedEnglish) return cleanedEnglish;
  return pickAnimeTitle(source);
}

function extractEnglishTitleFromList(titles) {
  if (!Array.isArray(titles)) return '';
  const englishEntry = titles.find(entry => entry && /english/i.test(entry?.type || ''));
  if (englishEntry && englishEntry.title) {
    return englishEntry.title;
  }
  return '';
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

function enqueueJikanRequest(taskFn) {
  return new Promise((resolve, reject) => {
    jikanRequestQueue.push({ taskFn, resolve, reject });
    pumpJikanQueue();
  });
}

function pumpJikanQueue() {
  if (jikanQueueActive) return;
  jikanQueueActive = true;

  const runNext = () => {
    if (!jikanRequestQueue.length) {
      jikanQueueActive = false;
      return;
    }
    const now = Date.now();
    const wait = Math.max(0, JIKAN_REQUEST_MIN_DELAY_MS - (now - lastJikanRequestTime));
    const next = jikanRequestQueue.shift();
    setTimeout(() => {
      lastJikanRequestTime = Date.now();
      Promise.resolve()
        .then(next.taskFn)
        .then(next.resolve)
        .catch(next.reject)
        .finally(() => {
          runNext();
        });
    }, wait);
  };

  runNext();
}

async function fetchJikanJson(path, params = {}) {
  return enqueueJikanRequest(() => executeJikanFetch(path, params));
}

async function executeJikanFetch(path, params = {}, attempt = 0) {
  try {
    const url = new URL(`${JIKAN_API_BASE_URL}${path}`);
    Object.entries(params || {}).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '') return;
      url.searchParams.set(key, value);
    });
    const resp = await fetch(url.toString(), {
      headers: { Accept: 'application/json' },
    });

    if (resp.status === 429) {
      const retryDelay = computeJikanRetryDelay(attempt, resp);
      console.warn('Jikan request rate-limited', path, { attempt, retryDelay });
      if (attempt < JIKAN_MAX_RETRIES) {
        await delay(retryDelay);
        return executeJikanFetch(path, params, attempt + 1);
      }
      return null;
    }

    if (!resp.ok) {
      const text = await resp.text();
      console.warn('Jikan request failed', resp.status, path, text);
      return null;
    }

    return await resp.json();
  } catch (err) {
    console.warn('Jikan request error', err);
    return null;
  }
}

function computeJikanRetryDelay(attempt, resp) {
  const retryAfter = resp?.headers?.get ? resp.headers.get('Retry-After') : null;
  const parsedSeconds = retryAfter ? Number(retryAfter) : NaN;
  if (Number.isFinite(parsedSeconds) && parsedSeconds >= 0) {
    return Math.max(parsedSeconds * 1000, JIKAN_REQUEST_MIN_DELAY_MS);
  }
  return JIKAN_RETRY_BASE_DELAY_MS * (attempt + 1);
}

async function fetchJikanAnimeDetails(id) {
  const numericId = Number(id);
  if (!Number.isFinite(numericId) || numericId <= 0) return null;
  const json = await fetchJikanJson(`/anime/${numericId}/full`);
  return json && json.data ? json.data : null;
}

async function fetchJikanAnimeSearch(query, limit = 10) {
  if (!query || query.length < 2) return [];
  const json = await fetchJikanJson('/anime', {
    q: query,
    limit: String(limit),
    order_by: 'score',
    sort: 'desc',
    sfw: 'true',
  });
  if (!json || !Array.isArray(json.data)) return [];
  return json.data;
}

async function fetchAniListSuggestions(query) {
  const entries = await fetchJikanAnimeSearch(query, 10);
  if (!entries.length) return [];
  return entries.map(anime => ({
    source: 'jikan',
    title: pickAnimeSuggestionTitle(anime),
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
    const json = await fetchJikanJson('/anime', params);
    if (json && Array.isArray(json.data) && json.data.length) {
      anime = await fetchJikanAnimeDetails(json.data[0].mal_id);
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
  filtered.forEach((entry, idx) => {
    entry.seriesOrder = idx + 1;
  });
  const seriesName = deriveAnimeSeriesName(filtered, preferredSeriesName);
  filtered.forEach(entry => {
    entry.seriesName = seriesName;
  });
  return {
    seriesName,
    entries: filtered,
  };
}

async function autoAddAnimeFranchiseEntries(plan, rootAniListId, selectedIds) {
  if (!plan || !Array.isArray(plan.entries) || !plan.entries.length) return;
  const rootId = rootAniListId ? Number(rootAniListId) : null;
  const selectionSet = Array.isArray(selectedIds) && selectedIds.length
    ? new Set(selectedIds.map(id => String(id)))
    : null;
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
      seriesSize: plan.entries.length,
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
}

function getAniListIdFromItem(item) {
  if (!item) return '';
  const value = item.aniListId || item.anilistId || item.AniListId || (item.metadata && (item.metadata.AniListId || item.metadata.anilistId));
  return value ? String(value) : '';
}

function computeAnimeDatasetSignature(data) {
  const ids = Object.values(data || {})
    .map(item => getAniListIdFromItem(item))
    .filter(Boolean)
    .sort();
  return ids.join(',');
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
  const signature = computeAnimeDatasetSignature(data);
  const now = Date.now();
  const shouldRun = signature !== animeFranchiseLastScanSignature
    || (now - animeFranchiseLastScanTime) > ANIME_FRANCHISE_RESCAN_INTERVAL_MS;
  if (!shouldRun) return;
  animeFranchiseLastScanSignature = signature;
  if (animeFranchiseScanTimer) {
    clearTimeout(animeFranchiseScanTimer);
  }
  animeFranchiseScanTimer = setTimeout(() => {
    animeFranchiseScanTimer = null;
    animeFranchiseLastScanTime = Date.now();
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
      showAnimeFranchiseNotification(plan.seriesName || info.seriesName, missingEntries);
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
          listType: targetList,
        });
        Object.assign(payload, updates);
      }
      await addItem(targetList, payload);
    } catch (err) {
      console.warn('Auto-add keyword franchise entry failed', entry.title, err);
    }
  }
}

