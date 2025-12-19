export const firebaseConfig = {
  apiKey: 'AIzaSyCWJpMYjSdV9awGRwJ3zyZ_9sDjUrnTu2I',
  authDomain: 'the-list-a700d.firebaseapp.com',
  databaseURL: 'https://the-list-a700d-default-rtdb.firebaseio.com',
  projectId: 'the-list-a700d',
  storageBucket: 'the-list-a700d.firebasestorage.app',
  messagingSenderId: '24313817411',
  appId: '1:24313817411:web:0aba69eaadade9843a27f6',
  measurementId: 'G-YXJ2E2XG42',
};

export const TMDB_API_KEY = '46dcf1eaa2ce4284037a00fdefca9bb8';
export const TMDB_API_BASE_URL = 'https://api.themoviedb.org/3';
export const TMDB_IMAGE_BASE_URL = 'https://image.tmdb.org/t/p/w500';
export const TMDB_KEYWORD_DISCOVER_PAGE_LIMIT = 3;
export const TMDB_KEYWORD_DISCOVER_MAX_RESULTS = 40;
export const GOOGLE_BOOKS_API_KEY = '';
export const GOOGLE_BOOKS_API_URL = 'https://www.googleapis.com/books/v1';
export const LIST_LOAD_STAGGER_MS = 600;
export const METADATA_SCHEMA_VERSION = 4;
export const APP_VERSION = 'test-pages-2025.11.15';
export const BUG_REPORT_DB_PATH = 'bugReports';
export const GLOBAL_NOTIFICATIONS_PATH = 'globalNotifications';
export const BUG_REPORT_ADMIN_NAMES = new Set(['cosmicphoenix 171']);

export const ANIME_STATUS_PRIORITY = {
  RELEASING: 6,
  NOT_YET_RELEASED: 5,
  HIATUS: 4,
  CANCELLED: 3,
  FINISHED: 2,
  UNKNOWN: 1,
};

export const ANIME_KEYWORD_REGEX = /\banime\b/i;
export const NOTIFICATION_STORAGE_KEY = '__THE_LIST_NOTIFICATIONS__';
export const MAX_PERSISTED_NOTIFICATIONS = 50;
export const NOTIFICATION_SEEN_KEY = '__THE_LIST_NOTIFICATIONS_SEEN__';
export const INTRO_SESSION_KEY = '__THE_LIST_INTRO_SEEN__';
export const FRANCHISE_NORMALIZE_MIGRATION_KEY = '__THE_LIST_FRANCHISE_NORM_2025_12_15__';
export const WHEEL_SPIN_AUDIO_SRC = 'spin-boost.mp3';
export const WHEEL_AUDIO_MUTE_KEY = '__THE_LIST_WHEEL_MUTE__';
export const PERF_DEBUG_FLAG = '__THE_LIST_PROFILE__';

export const AUTOCOMPLETE_LISTS = new Set(['movies', 'tvShows', 'books']);
export const PRIMARY_LIST_TYPES = ['movies', 'tvShows', 'anime', 'books'];
export const ADD_MODAL_LIST_TYPES = ['movies', 'tvShows', 'books'];
export const COLLAPSIBLE_LISTS = new Set(['movies', 'tvShows', 'anime']);
export const SERIES_BULK_DELETE_LISTS = new Set(['movies', 'tvShows', 'anime']);

export const MEDIA_TYPE_LABELS = {
  movies: 'Movies',
  tvShows: 'TV Shows',
  anime: 'Anime',
  books: 'Books',
};

export const FRANCHISE_MEDIA_LABELS = {
  movie: 'Movie',
  tv: 'TV',
  tvSeason: 'Season',
  season: 'Season',
  special: 'Special',
};

export const FINISH_RATING_MIN = 1;
export const FINISH_RATING_MAX = 10;

export const RUNTIME_THRESHOLDS = {
  MINUTES: { max: 60, color: 'minutes', label: 'minutes' },
  HOURS: { max: 1440, color: 'hours', label: 'hours' },
  DAYS: { max: 40320, color: 'days', label: 'days' },
  MONTHS: { max: 524160, color: 'months', label: 'months' },
  YEARS: { color: 'years', label: 'years' }
};

export const RUNTIME_PILL_UNITS = [
  { key: 'minutes', label: 'Minutes' },
  { key: 'hours', label: 'Hours' },
  { key: 'days', label: 'Days' },
  { key: 'months', label: 'Months' },
  { key: 'years', label: 'Years' }
];

export const VIRTUALIZATION_THRESHOLD = 220;
export const VIRTUALIZATION_OVERSCAN = 6;
export const DEFAULT_VIRTUAL_ROW_HEIGHT = 320;

export const DRAG_SCROLL_EDGE_PX = 80;
export const DRAG_SCROLL_STEP_PX = 18;
