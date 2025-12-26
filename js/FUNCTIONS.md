# THE-LIST JavaScript Functions Reference

A comprehensive reference of all exported functions in the js folder.  
**Total Exports: ~554**

---

## Table of Contents
1. [ads.js (4 exports)](#adsjs)
2. [alphabetScroller.js (2 exports)](#alphabetscrollerjs)
3. [autocomplete.js (12 exports)](#autocompletejs)
4. [bugReport.js (13 exports)](#bugreportjs)
5. [cards.js (17 exports)](#cardsjs)
6. [collapsibleCards.js (52 exports)](#collapsiblecardsjs)
7. [config.js (40 exports)](#configjs)
8. [crud.js (12 exports)](#crudjs)
9. [dom.js (33 exports)](#domjs)
10. [easterEgg.js (6 exports)](#eastereggjs)
11. [firebase.js (29 exports)](#firebasejs)
12. [franchise.js (30 exports)](#franchisejs)
13. [lists.js (19 exports)](#listsjs)
14. [main.js (27 exports)](#mainjs)
15. [metadata.js (27 exports)](#metadatajs)
16. [modals.js (10 exports)](#modalsjs)
17. [notifications.js (21 exports)](#notificationsjs)
18. [seriesGrouping.js (12 exports)](#seriesgroupingjs)
19. [share.js (13 exports)](#sharejs)
20. [state.js (93 exports)](#statejs)
21. [stats.js (21 exports)](#statsjs)
22. [utils.js (36 exports)](#utilsjs)
23. [virtualScroller.js (7 exports)](#virtualscrollerjs)
24. [wheel.js (18 exports)](#wheeljs)

---

## ads.js

Ad management and cycling functionality. **(4 exports)**

| Export | Type | Description |
|--------|------|-------------|
| `getAdImages` | function | Get available ad images |
| `cycleRandomAd` | function | Cycle to a random ad |
| `startAdCycle` | function | Start ad rotation |
| `stopAdCycle` | function | Stop ad rotation |

---

## alphabetScroller.js

A-Z navigation/jumper bar for quick list navigation. **(2 exports)**

| Export | Type | Description |
|--------|------|-------------|
| `initAlphabetScroller` | function | Initialize the alphabet scroller UI |
| `updateAlphabetScroller` | function | Update which letters are active |

---

## autocomplete.js

Search autocomplete functionality with TMDB/Google Books integration. **(12 exports)**

| Export | Type | Description |
|--------|------|-------------|
| `getSuggestionForms` | function | Get suggestion form elements |
| `hideTitleSuggestions` | function | Hide title suggestions dropdown |
| `renderTitleSuggestions` | function | Render title suggestions |
| `fetchTmdbSuggestions` | async function | Fetch suggestions from TMDB |
| `fetchGoogleBooksSuggestions` | async function | Fetch suggestions from Google Books |
| `fetchTmdbActorSuggestions` | async function | Fetch actor suggestions |
| `fetchTmdbActorCredits` | async function | Fetch actor credits |
| `renderActorSuggestions` | function | Render actor suggestions |
| `setupActorAutocomplete` | function | Setup actor autocomplete |
| `setupFormAutocomplete` | function | Setup form autocomplete |
| `teardownFormAutocomplete` | function | Teardown form autocomplete |
| `setupSearchAutocomplete` | function | Setup search autocomplete |

---

## bugReport.js

Bug reporting modal and submission functionality. **(13 exports)**

| Export | Type | Description |
|--------|------|-------------|
| `initBugReport` | function | Initialize bug report system |
| `toggleBugPopover` | function | Toggle bug report popover |
| `closeBugPopover` | function | Close bug report popover |
| `renderBugReportList` | function | Render list of bug reports |
| `isBugReportAdmin` | function | Check if user is admin |
| `startBugReportSync` | function | Start syncing bug reports |
| `stopBugReportSync` | function | Stop syncing bug reports |
| `startGlobalNotificationsListener` | function | Start global notifications |
| `stopGlobalNotificationsListener` | function | Stop global notifications |
| `submitBugReport` | async function | Submit a bug report |
| `getBugReports` | function | Get all bug reports |
| `isBugReportsLoaded` | function | Check if reports loaded |
| `isBugPopoverOpen` | function | Check if popover is open |

---

## cards.js

Core card building and rendering functionality. **(17 exports)**

| Export | Type | Description |
|--------|------|-------------|
| `isCollapsibleList` | function | Check if list is collapsible |
| `getExpandedCards` | function | Get expanded cards set |
| `ensureExpandedSet` | function | Ensure expanded set exists |
| `isCardExpanded` | function | Check if card is expanded |
| `toggleCardExpansion` | function | Toggle card expansion |
| `buildStandardCard` | function | Build a standard card |
| `buildStandardCardHeader` | function | Build card header |
| `buildStandardMetaText` | function | Build metadata text |
| `buildStandardActorLine` | function | Build actor line |
| `buildActorPreview` | function | Build actor preview |
| `buildSeriesLine` | function | Build series line |
| `appendMediaLinks` | function | Append media links |
| `buildStandardCardActions` | function | Build card actions |
| `buildFinishedRatingBadge` | function | Build rating badge |
| `sortSeriesRecords` | function | Sort series records |
| `updateCollapsibleCardStates` | function | Update card states |
| `truncateText` | function | Truncate text |

---

## collapsibleCards.js

Advanced card rendering with collapsible series groups. **(52 exports)**

| Export | Type | Description |
|--------|------|-------------|
| `queueCardTitleAutosize` | function | Queue title for auto-sizing |
| `ensureCardTitleResizeListener` | function | Setup resize observer |
| `autosizeTitleElement` | function | Auto-size title element |
| `recalcCardTitleSizes` | const | Recalculate title sizes (debounced) |
| `itemHasAnimeKeyword` | function | Check for anime keywords |
| `isAnimeMovieEntry` | function | Check if anime movie |
| `formatAnimeRuntimeLabel` | function | Format anime runtime |
| `ensureExpandedSet` | function | Ensure expanded set exists |
| `toggleCardExpansion` | function | Toggle card expansion |
| `buildPosterNode` | function | Build poster node |
| `buildSeriesPosterStackItems` | function | Build poster stack |
| `computeDeckStepValues` | function | Compute deck values |
| `formatTvStatusLabel` | function | Format TV status |
| `formatAnimeStatusLabel` | function | Format anime status |
| `formatAnimeFormatLabel` | function | Format anime format |
| `extractEpisodeCount` | function | Extract episode count |
| `sumSeasonEpisodeCounts` | function | Sum season episodes |
| `parseEpisodeValue` | function | Parse episode value |
| `formatAnimeEpisodesLabel` | function | Format episodes label |
| `getAnimeSeasonField` | function | Get anime season field |
| `deriveSeriesBadgeMetrics` | function | Derive badge metrics |
| `resolveSeriesNameFromEntries` | function | Resolve series name |
| `resolveSeriesCardTitleParts` | function | Resolve title parts |
| `buildMediaSummaryBadges` | function | Build summary badges |
| `collectMediaBadgeChips` | function | Collect badge chips |
| `buildSeriesBadgeChips` | function | Build series badges |
| `getTvSeasonCount` | function | Get TV season count |
| `getTvEpisodeCount` | function | Get TV episode count |
| `formatTvRuntimeLabel` | function | Format TV runtime |
| `buildTvStatChips` | function | Build TV stat chips |
| `computeTvBadgeStrings` | function | Compute TV badges |
| `buildStatusBadge` | function | Build status badge |
| `buildMovieMetaText` | function | Build movie meta |
| `buildMovieExtendedMeta` | function | Build extended meta |
| `buildMovieGenreRow` | function | Build genre row |
| `buildMovieCastLine` | function | Build cast line |
| `buildWatchNowSection` | function | Build watch section |
| `buildMovieLinks` | function | Build movie links |
| `buildTvLinks` | function | Build TV links |
| `renderMovieCardContent` | function | Render movie content |
| `buildMovieCardSummary` | function | Build movie summary |
| `buildMovieArtwork` | function | Build movie artwork |
| `buildMovieCardInfo` | function | Build movie info |
| `getSeriesTreeEntries` | function | Get tree entries |
| `buildSeriesTreeBlock` | function | Build tree block |
| `buildMovieCardDetails` | function | Build movie details |
| `buildAnimeDetailBlock` | function | Build anime details |
| `buildTvDetailBlock` | function | Build TV details |
| `buildMovieCardActions` | function | Build movie actions |
| `updateCollapsibleCardStates` | function | Update card states |
| `moveSeriesTreeNode` | async function | Move tree node |
| `ensureSeriesTreeDragEvents` | function | Setup tree drag events |

---

## config.js

Application configuration constants. **(40 exports)**

| Export | Type | Description |
|--------|------|-------------|
| `FIREBASE_CONFIG` | const | Firebase configuration |
| `TMDB_API_KEY` | const | TMDB API key |
| `TMDB_BASE_URL` | const | TMDB base URL |
| `TMDB_IMG_BASE` | const | TMDB image base |
| `GOOGLE_BOOKS_API_KEY` | const | Google Books API key |
| `SHARE_WORKER_URL` | const | Share worker URL |
| `SHARE_BASE_URL` | const | Share base URL |
| `SHARE_PARAM_PREFIX` | const | Share param prefix |
| `LIST_TYPES` | const | List types array |
| `COLLAPSIBLE_LISTS` | const | Collapsible lists |
| `SORT_OPTIONS` | const | Sort options |
| `DEFAULT_SORT` | const | Default sort |
| `BUG_REPORT_ADMIN_NAMES` | const | Admin names set |
| `ANIME_STATUS_PRIORITY` | const | Anime status priority |
| `ANIME_KEYWORD_REGEX` | const | Anime keyword regex |
| `DEFAULT_POSTER` | const | Default poster URL |
| `DEBOUNCE_DELAY` | const | Debounce delay |
| `CACHE_DURATION` | const | Cache duration |
| `MAX_SEARCH_RESULTS` | const | Max search results |
| `ANIMATION_DURATION` | const | Animation duration |
| `POSTER_PLACEHOLDER` | const | Poster placeholder |
| `PERF_DEBUG_FLAG` | const | Performance debug flag |
| `WHEEL_COLORS` | const | Wheel colors set |
| `LIST_TYPE_LABELS` | const | List type labels |
| `SEARCH_SOURCES` | const | Search sources |
| `FINISHED_LIST_TYPES` | const | Finished list types |
| `SERIES_BULK_DELETE_LISTS` | const | Bulk delete lists |
| `MEDIA_TYPE_LABELS` | const | Media type labels |
| `FRANCHISE_MEDIA_LABELS` | const | Franchise media labels |
| `FINISH_RATING_MIN` | const | Min finish rating |
| `FINISH_RATING_MAX` | const | Max finish rating |
| `RUNTIME_THRESHOLDS` | const | Runtime thresholds |
| `RUNTIME_PILL_UNITS` | const | Runtime pill units |
| `BACK_TO_TOP_THRESHOLD` | const | Back to top threshold |
| `VIRTUAL_SCROLL_BUFFER` | const | Virtual scroll buffer |
| `DEFAULT_VIRTUAL_ROW_HEIGHT` | const | Default row height |
| `VIRTUAL_ROW_GAP` | const | Virtual row gap |
| `DRAG_SCROLL_STEP_PX` | const | Drag scroll step |

---

## crud.js

Create, Read, Update, Delete operations for list items. **(12 exports)**

| Export | Type | Description |
|--------|------|-------------|
| `addItem` | function | Add item to list |
| `updateItem` | function | Update existing item |
| `deleteItem` | function | Delete item from list |
| `moveItemBetweenLists` | async function | Move item between lists |
| `normalizeFinishRating` | function | Normalize finish rating |
| `promptFinishRating` | function | Prompt for rating |
| `finishItem` | async function | Mark item as finished |
| `handleFinishRequest` | async function | Handle finish request |
| `deleteSeriesEntries` | async function | Delete series entries |
| `mergeSeriesEntriesByName` | async function | Merge series entries |
| `updateLocalItemCaches` | function | Update local caches |
| `splitTvShowSeasons` | async function | Split TV show seasons |

---

## dom.js

DOM element references and helpers. **(33 exports)**

| Export | Type | Description |
|--------|------|-------------|
| `createEl` | const | Create element helper |
| `searchInput` | const | Search input element |
| `searchButton` | const | Search button element |
| `moviesList` | const | Movies list container |
| `tvShowsList` | const | TV Shows container |
| `animeList` | const | Anime list container |
| `booksList` | const | Books list container |
| `finishedList` | const | Finished list container |
| `statsPanel` | const | Statistics panel |
| `statsPanelContent` | const | Stats panel content |
| `modalsContainer` | const | Modals container |
| `notificationArea` | const | Notification area |
| `wheelContainer` | const | Wheel container |
| `backToTopBtn` | const | Back to top button |
| `headerElement` | const | Header element |
| `mainContent` | const | Main content area |
| `navButtons` | const | Navigation buttons |
| `sortSelect` | const | Sort select element |
| `finishedToggle` | const | Finished toggle |
| `userSection` | const | User section |
| `signInBtn` | const | Sign in button |
| `signOutBtn` | const | Sign out button |
| `userDisplayName` | const | User display name |
| `franchiseSection` | const | Franchise section |
| `franchiseShelf` | const | Franchise shelf |
| `bugReportBtn` | const | Bug report button |
| `bugPopover` | const | Bug popover |
| `notificationBtn` | const | Notification button |
| `notificationPopover` | const | Notification popover |
| `alphabetScroller` | const | Alphabet scroller |
| `wheelBtn` | const | Wheel button |
| `refreshMetadataBtn` | const | Refresh metadata button |
| `wheelModalTemplate` | const | Wheel modal template |

---

## easterEgg.js

Seasonal easter egg effects (snow, fireworks, etc.). **(6 exports)**

| Export | Type | Description |
|--------|------|-------------|
| `getSeasonalTheme` | function | Get current seasonal theme |
| `getCurrentTmTheme` | function | Get current TM theme |
| `start` | function | Start easter egg effect |
| `stop` | function | Stop easter egg effect |
| `init` | function | Initialize easter eggs |
| `isRunning` | function | Check if effect running |

---

## firebase.js

Firebase initialization and database operations. **(29 exports)**

| Export | Type | Description |
|--------|------|-------------|
| `initializeFirebase` | function | Initialize Firebase |
| `getFirebaseApp` | function | Get Firebase app |
| `getFirebaseDatabase` | function | Get database instance |
| `getFirebaseAuth` | function | Get auth instance |
| `getCurrentUser` | function | Get current user |
| `isUserLoggedIn` | function | Check if logged in |
| `signInWithGoogle` | async function | Sign in with Google |
| `signOutUser` | async function | Sign out user |
| `loadUserLibrary` | function | Load user library |
| `syncLibrary` | function | Sync library |
| `addItemToFirebase` | async function | Add item to Firebase |
| `updateItemInFirebase` | async function | Update item |
| `deleteItemFromFirebase` | async function | Delete item |
| `moveItemInFirebase` | async function | Move item |
| `loadFinishedItems` | async function | Load finished items |
| `subscribeToList` | function | Subscribe to list |
| `unsubscribeFromList` | function | Unsubscribe from list |
| `batchWriteItems` | function | Batch write items |
| `ref` | re-export | Firebase ref |
| `get` | re-export | Firebase get |
| `set` | re-export | Firebase set |
| `push` | re-export | Firebase push |
| `update` | re-export | Firebase update |
| `remove` | re-export | Firebase remove |
| `onValue` | re-export | Firebase onValue |
| `off` | re-export | Firebase off |
| `query` | re-export | Firebase query |
| `orderByChild` | re-export | Firebase orderByChild |
| `onAuthStateChanged` | re-export | Auth state changed |

---

## franchise.js

Franchise/collection management functionality. **(30 exports)**

| Export | Type | Description |
|--------|------|-------------|
| `getFranchiseState` | function | Get franchise state |
| `getFranchiseSortMode` | function | Get sort mode |
| `initFranchise` | function | Initialize franchise |
| `isFranchiseLoaded` | function | Check if loaded |
| `getFranchiseRecords` | function | Get franchise records |
| `setFranchiseRecords` | function | Set franchise records |
| `setFranchiseLoaded` | function | Set loaded state |
| `loadFranchiseData` | function | Load franchise data |
| `resetFranchiseSection` | function | Reset franchise section |
| `getFranchiseYear` | function | Get franchise year |
| `renderFranchiseShelf` | function | Render franchise shelf |
| `updateFranchiseMeta` | function | Update franchise meta |
| `buildFranchiseMetaPill` | function | Build meta pill |
| `buildFranchiseCard` | function | Build franchise card |
| `buildFranchiseTimeline` | function | Build timeline |
| `buildFranchiseTimelineEntry` | function | Build timeline entry |
| `moveFranchiseEntry` | async function | Move franchise entry |
| `resolveFranchiseEntryOrderLabel` | function | Resolve order label |
| `renderFranchiseSection` | function | Render section |
| `enableFranchiseWheelScroll` | function | Enable wheel scroll |
| `disableFranchiseWheelScroll` | function | Disable wheel scroll |
| `normalizeFranchiseCollection` | function | Normalize collection |
| `normalizeFranchiseRecord` | function | Normalize record |
| `normalizeFranchiseEntries` | function | Normalize entries |
| `normalizeFranchiseEntry` | function | Normalize entry |
| `refreshFranchiseLibraryMatches` | function | Refresh library matches |
| `resolveFranchiseLibraryMatch` | function | Resolve library match |
| `computeFranchiseStats` | function | Compute stats |
| `hasFranchiseNormalizationRun` | function | Check normalization |
| `markFranchiseNormalizationComplete` | function | Mark normalization done |

---

## lists.js

List cache management and rendering. **(19 exports)**

| Export | Type | Description |
|--------|------|-------------|
| `getListCaches` | function | Get list caches |
| `getFinishedCaches` | function | Get finished caches |
| `setListCache` | function | Set list cache |
| `setFinishedCache` | function | Set finished cache |
| `clearListCaches` | function | Clear list caches |
| `clearFinishedCaches` | function | Clear finished caches |
| `isShowFinishedOnly` | function | Check finished filter |
| `setShowFinishedOnly` | function | Set finished filter |
| `isLibraryFullyLoaded` | function | Check if library loaded |
| `getDisplayCacheMap` | function | Get display cache map |
| `renderListSection` | function | Render list section |
| `rerenderActiveList` | function | Re-render active list |
| `getSeriesAwareTitle` | function | Get series-aware title |
| `sortListEntries` | function | Sort list entries |
| `filterListEntries` | function | Filter list entries |
| `resolveCardRenderItem` | function | Resolve card item |
| `buildUnifiedDisplayEntries` | function | Build display entries |
| `buildSpinnerCandidates` | function | Build spinner candidates |
| `getMediaTypeLabel` | function | Get media type label |

---

## main.js

Application entry point and initialization. **(27 exports)**

| Export | Type | Description |
|--------|------|-------------|
| `init` | function | Main initialization |
| *Re-exports from:* | | |
| `state` | module | State exports |
| `config` | module | Config exports |
| `dom` | module | DOM exports |
| `firebase` | module | Firebase exports |
| `crud` | module | CRUD exports |
| `lists` | module | Lists exports |
| `cards` | module | Cards exports |
| `collapsibleCards` | module | Collapsible cards exports |
| `modals` | module | Modals exports |
| `metadata` | module | Metadata exports |
| `notifications` | module | Notifications exports |
| `share` | module | Share exports |
| `stats` | module | Stats exports |
| `wheel` | module | Wheel exports |
| `franchise` | module | Franchise exports |
| `easterEgg` | module | Easter egg exports |
| `bugReport` | module | Bug report exports |
| `seriesGrouping` | module | Series grouping exports |
| `VirtualScroller` | class | Virtual scroller class |
| `getVirtualListController` | function | Get virtual controller |
| `initVirtualList` | function | Init virtual list |
| `destroyVirtualList` | function | Destroy virtual list |
| `refreshVirtualList` | function | Refresh virtual list |

---

## metadata.js

TMDB and Google Books API integration for metadata. **(27 exports)**

| Export | Type | Description |
|--------|------|-------------|
| `tmdbFetch` | async function | Fetch from TMDB |
| `fetchTmdbMetadata` | async function | Fetch TMDB metadata |
| `findTmdbCandidate` | async function | Find TMDB candidate |
| `fetchTmdbDetail` | async function | Fetch TMDB detail |
| `mapTmdbDetailToMetadata` | function | Map detail to metadata |
| `searchTmdb` | async function | Search TMDB |
| `fetchTmdbActorSuggestions` | async function | Fetch actor suggestions |
| `searchTmdbAcrossMedia` | async function | Search across media |
| `fetchTmdbFranchiseDetails` | async function | Fetch franchise details |
| `fetchTmdbCollectionMovies` | async function | Fetch collection movies |
| `formatTmdbFranchiseEntry` | function | Format franchise entry |
| `pickBestTmdbSearchResult` | function | Pick best result |
| `collectRecommendationEntries` | function | Collect recommendations |
| `deriveMetadataAssignments` | function | Derive assignments |
| `computeTvBadgeStrings` | function | Compute TV badges |
| `getTmdbCollectionInfo` | async function | Get collection info |
| `searchTmdbKeyword` | async function | Search keyword |
| `discoverTmdbKeywordEntries` | async function | Discover keywords |
| `fetchTmdbKeywordFranchiseEntries` | async function | Fetch keyword entries |
| `fetchGoogleBooksMetadata` | async function | Fetch Google Books |
| `ensureTvSeriesDefaults` | function | Ensure TV defaults |
| `getUserRegion` | function | Get user region |
| `ensureTmdbIdentity` | async function | Ensure TMDB identity |
| `fetchWatchProviders` | async function | Fetch watch providers |
| `refreshItemMetadata` | async function | Refresh item metadata |
| `fetchTmdbSeasonDetails` | async function | Fetch season details |
| `fetchAllTvSeasons` | async function | Fetch all seasons |

---

## modals.js

Modal dialog management. **(10 exports)**

| Export | Type | Description |
|--------|------|-------------|
| `getActiveAddModal` | function | Get active add modal |
| `getActiveEditModal` | function | Get active edit modal |
| `openAddModal` | function | Open add modal |
| `closeEditModal` | function | Close edit modal |
| `closeAllModals` | function | Close all modals |
| `createModalBackdrop` | function | Create modal backdrop |
| `createModal` | function | Create modal element |
| `openDetailsModal` | function | Open details modal |
| `openEditModal` | function | Open edit modal |
| `showConfirmModal` | function | Show confirm modal |

---

## notifications.js

Toast notification system. **(21 exports)**

| Export | Type | Description |
|--------|------|-------------|
| `getPersistedNotifications` | function | Get persisted notifications |
| `getNotificationSignatureCache` | function | Get signature cache |
| `initNotifications` | function | Initialize notifications |
| `createNotificationRecord` | function | Create notification record |
| `renderNotificationCard` | function | Render notification card |
| `dismissNotification` | function | Dismiss notification |
| `addPersistedNotification` | function | Add persisted notification |
| `removePersistedNotification` | function | Remove notification |
| `loadStoredNotifications` | function | Load stored notifications |
| `persistNotificationsToStorage` | function | Persist to storage |
| `getNotificationSignature` | function | Get notification signature |
| `loadNotificationSignatures` | function | Load signatures |
| `persistNotificationSignatures` | function | Persist signatures |
| `markNotificationSignatureSeen` | function | Mark signature seen |
| `showNotification` | function | Show notification |
| `clearAllNotifications` | function | Clear all notifications |
| `toggleNotificationPopover` | function | Toggle popover |
| `closeNotificationPopover` | function | Close popover |
| `setNotificationPopoverState` | function | Set popover state |
| `updateNotificationBadge` | function | Update badge |
| `updateNotificationEmptyState` | function | Update empty state |

---

## seriesGrouping.js

Series grouping and cross-list collection. **(12 exports)**

| Export | Type | Description |
|--------|------|-------------|
| `sortSeriesRecords` | function | Sort series records |
| `pickSeriesLeader` | function | Pick series leader |
| `resolveSeriesDisplayEntry` | function | Resolve display entry |
| `collectSeriesEntriesAcrossLists` | function | Collect across lists |
| `mergeSeriesEntriesAcrossLists` | function | Merge across lists |
| `resolveSeriesNameFromEntries` | function | Resolve series name |
| `buildSeriesEntryKey` | function | Build entry key |
| `compareSeriesEntries` | function | Compare entries |
| `getSeriesGroupEntries` | function | Get group entries |
| `clearCrossListSeriesCache` | function | Clear cache |
| `incrementSeriesIndexVersion` | function | Increment version |
| `rebuildSeriesIndex` | function | Rebuild index |

---

## share.js

Sharing functionality (Discord, collections). **(13 exports)**

| Export | Type | Description |
|--------|------|-------------|
| `generateShareUrl` | function | Generate share URL |
| `fetchSharedCollection` | async function | Fetch shared collection |
| `generateCollectionShareUrl` | async function | Generate collection URL |
| `buildCollectionDiscordMessage` | async function | Build collection message |
| `parseShareUrl` | function | Parse share URL |
| `buildDiscordMessage` | function | Build Discord message |
| `closeShareModal` | function | Close share modal |
| `openShareModal` | function | Open share modal |
| `openCollectionShareModal` | async function | Open collection share |
| `closeSharedItemModal` | function | Close shared item modal |
| `openSharedItemModal` | function | Open shared item modal |
| `openSharedCollectionModal` | function | Open shared collection |
| `handleIncomingShare` | async function | Handle incoming share |

---

## state.js

Application state management. **(93 exports)**

### Re-exports from utils.js
| Export | Type |
|--------|------|
| `debounce` | function |
| `throttle` | function |
| `createEl` | function |
| `clamp` | function |
| `delay` | function |
| `normalizeTitleKey` | function |

### State Variables (let)
| Export | Description |
|--------|-------------|
| `activeListType` | Active list type |
| `showFinishedOnly` | Finished filter state |
| `currentSort` | Current sort setting |
| `currentSortDirection` | Sort direction |
| `searchQuery` | Current search query |
| `isLibraryLoaded` | Library loaded state |
| `currentUser` | Current user |
| `isSigningIn` | Signing in state |
| `isSigningOut` | Signing out state |
| `activeAddModal` | Active add modal |
| `activeEditModal` | Active edit modal |
| `detailsModalItem` | Details modal item |
| `wheelModalOpen` | Wheel modal state |
| `wheelItems` | Wheel items |
| `wheelResult` | Wheel result |
| `franchiseLoaded` | Franchise loaded |
| `franchiseRecords` | Franchise records |
| `franchiseSortMode` | Franchise sort mode |
| `notificationPopoverOpen` | Notification popover |
| `bugPopoverOpen` | Bug popover open |
| `statsRealisticMode` | Stats realistic mode |
| `virtualListController` | Virtual list controller |
| `unifiedVirtualController` | Unified controller |
| `alphabetScrollerActive` | Alphabet scroller state |
| `headerHeight` | Header height |
| `scrollThrottle` | Scroll throttle |
| `resizeThrottle` | Resize throttle |
| `lastScrollTop` | Last scroll position |
| `lastRenderTime` | Last render time |
| `pendingRender` | Pending render |
| `renderQueue` | Render queue |
| `renderBatchSize` | Render batch size |
| `isRendering` | Is rendering |
| `seriesIndexVersion` | Series index version |
| `crossListSeriesCache` | Cross-list cache |

### State Variables (const)
| Export | Description |
|--------|-------------|
| `listCaches` | List cache objects |
| `finishedCaches` | Finished caches |
| `expandedCards` | Expanded cards state |
| `seriesGroups` | Series groups |
| `collapsedGroups` | Collapsed groups |
| `cardRenderCache` | Card render cache |
| `LIST_TYPES` | List types set |
| `COLLAPSIBLE_LISTS` | Collapsible lists |
| `virtualScrollState` | Virtual scroll state |
| `metadataCache` | Metadata cache |
| `suggestionCache` | Suggestion cache |
| `pendingMetadataRefresh` | Pending refresh |
| `firebaseListeners` | Firebase listeners |
| `firebaseSubscriptions` | Firebase subscriptions |
| `syncState` | Sync state |
| `crossListSeriesCache` | Cross-list cache |
| `perfMetrics` | Performance metrics |

### Setter/Getter Functions
| Export | Description |
|--------|-------------|
| `setActiveListType` | Set active list |
| `getActiveListType` | Get active list |
| `setShowFinishedOnly` | Set finished filter |
| `getShowFinishedOnly` | Get finished filter |
| `setCurrentSort` | Set current sort |
| `getCurrentSort` | Get current sort |
| `setSearchQuery` | Set search query |
| `getSearchQuery` | Get search query |
| `setIsLibraryLoaded` | Set library loaded |
| `getIsLibraryLoaded` | Get library loaded |
| `setCurrentUser` | Set current user |
| `getCurrentUser` | Get current user |
| `setActiveAddModal` | Set add modal |
| `getActiveAddModal` | Get add modal |
| `setActiveEditModal` | Set edit modal |
| `getActiveEditModal` | Get edit modal |
| `setDetailsModalItem` | Set details item |
| `getDetailsModalItem` | Get details item |
| `setWheelModalOpen` | Set wheel modal |
| `isWheelModalOpen` | Check wheel modal |
| `setWheelItems` | Set wheel items |
| `getWheelItems` | Get wheel items |
| `setWheelResult` | Set wheel result |
| `getWheelResult` | Get wheel result |
| `setFranchiseLoaded` | Set franchise loaded |
| `isFranchiseLoaded` | Check franchise loaded |
| `setFranchiseRecords` | Set franchise records |
| `getFranchiseRecords` | Get franchise records |
| `setFranchiseSortMode` | Set franchise sort |
| `getFranchiseSortMode` | Get franchise sort |
| `setNotificationPopoverOpen` | Set notification popover |
| `isNotificationPopoverOpen` | Check notification popover |
| `setBugPopoverOpen` | Set bug popover |
| `isBugPopoverOpen` | Check bug popover |
| `setStatsRealisticMode` | Set stats mode |
| `isStatsRealisticMode` | Check stats mode |
| `setVirtualListController` | Set virtual controller |
| `getVirtualListController` | Get virtual controller |
| `incrementSeriesIndexVersion` | Increment series version |
| `getSeriesIndexVersion` | Get series version |
| `clearCrossListSeriesCache` | Clear series cache |

---

## stats.js

Statistics panel functionality. **(21 exports)**

| Export | Type | Description |
|--------|------|-------------|
| `formatLibraryStatNumber` | function | Format stat number |
| `parseRuntimeMinutes` | function | Parse runtime to minutes |
| `formatRuntimeDuration` | function | Format runtime duration |
| `formatRuntimeDurationDetailed` | function | Format detailed duration |
| `breakdownDurationMinutes` | function | Breakdown duration |
| `getRuntimeThresholdClass` | function | Get threshold class |
| `createRuntimePillValueMap` | function | Create pill value map |
| `getRuntimeUnitBreakdown` | function | Get unit breakdown |
| `renderRuntimePillsDisplay` | function | Render runtime pills |
| `animateRuntimeProgression` | function | Animate progression |
| `buildLibraryStatChip` | function | Build stat chip |
| `estimateMovieRuntimeMinutes` | function | Estimate movie runtime |
| `estimateTvEpisodeRuntimeMinutes` | function | Estimate TV runtime |
| `getAnimeEpisodeCount` | function | Get anime episode count |
| `estimateAnimeEpisodeRuntimeMinutes` | function | Estimate anime runtime |
| `isAnimeMovieEntry` | function | Check if anime movie |
| `getTvEpisodeCount` | function | Get TV episode count |
| `computeLibraryRuntimeStats` | function | Compute runtime stats |
| `renderStatsPanel` | function | Render stats panel |
| `isRealisticTimeMode` | function | Check realistic mode |
| `toggleRealisticTimeMode` | function | Toggle realistic mode |

---

## utils.js

Utility functions. **(36 exports)**

| Export | Type | Description |
|--------|------|-------------|
| `debounce` | function | Debounce function calls |
| `throttle` | function | Throttle function calls |
| `clamp` | function | Clamp number to range |
| `createEl` | function | Create DOM element |
| `generateUniqueId` | function | Generate unique ID |
| `deepClone` | function | Deep clone object |
| `delay` | function | Async delay/sleep |
| `formatNumber` | function | Format number |
| `shouldLogPerfEvents` | function | Check perf logging |
| `logRenderMetrics` | function | Log render metrics |
| `findScrollParent` | function | Find scroll parent |
| `formatLibraryStatNumber` | function | Format library stat |
| `getRuntimeThresholdClass` | function | Get runtime class |
| `createRuntimePillValueMap` | function | Create pill map |
| `formatRuntimePillNumber` | function | Format pill number |
| `getRuntimeUnitBreakdown` | function | Get unit breakdown |
| `renderRuntimePillsDisplay` | function | Render pills display |
| `parseRuntimeMinutes` | function | Parse runtime |
| `formatRuntimeDuration` | function | Format duration |
| `normalizeTitleKey` | function | Normalize title key |
| `normalizeSeriesKey` | function | Normalize series key |
| `sanitizeYear` | function | Sanitize year |
| `extractPrimaryYear` | function | Extract primary year |
| `sanitizeSeriesOrder` | function | Sanitize series order |
| `parseSeriesOrder` | function | Parse series order |
| `parseRating` | function | Parse rating |
| `parseEpisodeValue` | function | Parse episode value |
| `parseActorsList` | function | Parse actors list |
| `buildTrailerUrl` | function | Build trailer URL |
| `arraysShallowEqual` | function | Shallow array compare |
| `setButtonBusy` | function | Set button busy state |
| `truncateText` | function | Truncate text |
| `buildComparisonSignature` | function | Build comparison signature |
| `signaturesMatch` | function | Check signatures match |
| `buildFranchiseEntryKey` | function | Build franchise key |

---

## virtualScroller.js

Virtual scrolling for performance with large lists. **(7 exports)**

| Export | Type | Description |
|--------|------|-------------|
| `VirtualScroller` | class | Virtual scroller class |
| `getVirtualListController` | function | Get virtual controller |
| `initVirtualList` | function | Initialize virtual list |
| `destroyVirtualList` | function | Destroy virtual list |
| `refreshVirtualList` | function | Refresh virtual list |
| `scrollToVirtualIndex` | function | Scroll to index |
| `getUnifiedVirtualController` | function | Get unified controller |

---

## wheel.js

Random selection wheel functionality. **(18 exports)**

| Export | Type | Description |
|--------|------|-------------|
| `getWheelSpinAudio` | function | Get wheel spin audio |
| `initWheel` | function | Initialize wheel |
| `renderWheel` | function | Render wheel |
| `updateWheelMuteButtonState` | function | Update mute button |
| `toggleWheelAudioMute` | function | Toggle audio mute |
| `isWheelAudioMuted` | function | Check if muted |
| `spinWheel` | function | Spin the wheel |
| `stopWheel` | function | Stop wheel spinning |
| `getWheelSourceSelect` | function | Get source select |
| `setWheelItems` | function | Set wheel items |
| `getWheelItems` | function | Get wheel items |
| `clearWheelItems` | function | Clear wheel items |
| `openWheelModal` | function | Open wheel modal |
| `closeWheelModal` | function | Close wheel modal |
| `annotateWheelItem` | function | Annotate wheel item |
| `createWheelCompositeId` | function | Create composite ID |
| `mapWheelCandidateMap` | function | Map candidate map |
| `renderWheelResult` | function | Render wheel result |

---

*Generated: December 25, 2025*  
*Total Exports: ~554*
