# THE-LIST JavaScript Module Documentation

This document provides a comprehensive listing of all exported functions from the JavaScript modules in the `js/` directory.

---

## Table of Contents

1. [ads.js](#adsjs)
2. [alphabetScroller.js](#alphabetscrollerjs)
3. [autocomplete.js](#autocompletejs)
4. [bugReport.js](#bugreportjs)
5. [cards.js](#cardsjs)
6. [collapsibleCards.js](#collapsiblecardsjs)
7. [config.js](#configjs)
8. [crud.js](#crudjs)
9. [dom.js](#domjs)
10. [easterEgg.js](#eastereggjs)
11. [firebase.js](#firebasejs)
12. [franchise.js](#franchisejs)
13. [lists.js](#listsjs)
14. [main.js](#mainjs)
15. [metadata.js](#metadatajs)
16. [modals.js](#modalsjs)
17. [notifications.js](#notificationsjs)
18. [seriesGrouping.js](#seriesgroupingjs)
19. [share.js](#sharejs)
20. [state.js](#statejs)
21. [stats.js](#statsjs)
22. [utils.js](#utilsjs)
23. [virtualScroller.js](#virtualscrollerjs)
24. [wheel.js](#wheeljs)

---

## ads.js

Handles ad image cycling and display functionality.

| Function | Description |
|----------|-------------|
| `getAdImages()` | Returns the array of available ad image paths |
| `cycleRandomAd()` | Randomly selects and displays an ad image across all `.fake-ad-image` elements |
| `initializeRandomAds(intervalMs = 60000)` | Initializes random ad cycling with a specified interval (default 60 seconds) |
| `stopAdCycle()` | Stops the ad cycling interval |

---

## alphabetScroller.js

Provides A-Z jump bar navigation for quick scrolling through alphabetically sorted lists.

| Function | Description |
|----------|-------------|
| `initAlphabetScroller()` | Initializes the alphabet scroller UI with A-Z characters and click handlers |
| `updateAlphabetScroller(items, sortMode)` | Updates the scroller visibility based on items count and sort mode (only shows for alphabetical sorting with 20+ items) |

---

## autocomplete.js

Handles autocomplete functionality for title/actor search using TMDb and Google Books APIs.

| Function | Description |
|----------|-------------|
| `getSuggestionForms()` | Returns the set of forms with active suggestion handlers |
| `hideTitleSuggestions(form)` | Hides title and actor suggestion dropdowns for a form |
| `renderTitleSuggestions(container, suggestions, onSelect)` | Renders title suggestions with poster thumbnails in a container |
| `fetchTmdbSuggestions(listType, query)` | Fetches movie/TV suggestions from TMDb API based on list type |
| `fetchGoogleBooksSuggestions(query)` | Fetches book suggestions from Google Books API |
| `fetchTmdbActorSuggestions(query)` | Fetches actor/person suggestions from TMDb API |
| `fetchTmdbActorCredits(personId, listType)` | Fetches movie/TV credits for a specific actor by their TMDb ID |
| `renderActorSuggestions(container, suggestions, onSelect)` | Renders actor suggestions with profile images |
| `setupActorAutocomplete(form, listType, callbacks)` | Sets up actor search autocomplete on a form |
| `setupFormAutocomplete(form, listType, callbacks)` | Sets up title autocomplete with TMDb/Google Books integration |
| `teardownFormAutocomplete(form)` | Removes autocomplete handlers and cleans up form state |
| `initGlobalSuggestionClickHandler()` | Initializes global click handler to dismiss suggestions when clicking outside |

---

## bugReport.js

Manages bug reporting system with Firebase integration and admin controls.

| Function | Description |
|----------|-------------|
| `initBugReportButton(callbacks)` | Initializes bug report button, popover, and form submission handlers |
| `toggleBugPopover(forceState)` | Toggles bug report popover visibility |
| `closeBugPopover()` | Closes the bug report popover |
| `renderBugReportList()` | Renders the list of bug reports with admin controls |
| `isBugReportAdmin(user)` | Checks if a user has admin privileges for bug reports |
| `startBugReportSync()` | Starts real-time sync of bug reports from Firebase |
| `stopBugReportSync()` | Stops bug report synchronization |
| `initGlobalNotificationsListener()` | Initializes listener for global notifications (bug fixes, announcements) |
| `stopGlobalNotificationsListener()` | Stops the global notifications listener |
| `refreshAllMetadataSequential(callbacks)` | Sequentially refreshes metadata for all items in the library |
| `getBugReports()` | Returns the current array of bug reports |
| `isBugReportsLoaded()` | Returns whether bug reports have been loaded |
| `isBugPopoverOpen()` | Returns whether the bug popover is currently open |

---

## cards.js

Provides card building utilities for displaying media items.

| Function | Description |
|----------|-------------|
| `isCollapsibleList(listType)` | Checks if a list type supports collapsible cards |
| `getExpandedCards()` | Returns the expanded cards state object |
| `ensureExpandedSet(listType)` | Ensures the expanded cards store for a list type is a Set |
| `isCardExpanded(listType, cardId)` | Checks if a specific card is expanded |
| `toggleCardExpansion(listType, cardId, callbacks)` | Toggles card expansion state |
| `buildStandardCard(listType, id, item, callbacks)` | Builds a standard (non-collapsible) card element |
| `buildStandardCardHeader(item)` | Builds the header section of a card with title and rating badge |
| `buildStandardMetaText(listType, item)` | Builds meta text (year, director, rating, runtime) for a card |
| `buildStandardActorLine(item)` | Builds the actor/cast line for a card |
| `buildActorPreview(actorsValue, limit)` | Formats actor list with a "+X more" suffix |
| `buildSeriesLine(item)` | Builds the series name and order display line |
| `appendMediaLinks(container, item)` | Appends IMDb, trailer, and preview links to a container |
| `buildStandardCardActions(listType, id, item, callbacks)` | Builds action buttons (Edit, Finished, Delete) for a card |
| `buildFinishedRatingBadge(item)` | Builds the finished rating badge (X/10) |
| `sortSeriesRecords(records)` | Sorts series records by order, year, then title |
| `updateCollapsibleCardStates(listType, callbacks)` | Updates expanded/collapsed states for all collapsible cards |
| `truncateText(text, maxLength)` | Truncates text with ellipsis if over max length |

---

## collapsibleCards.js

Advanced collapsible card rendering for movies, TV shows, and anime with series grouping.

| Function/Export | Description |
|-----------------|-------------|
| `queueCardTitleAutosize(card)` | Queues a card for title auto-sizing on next animation frame |
| `ensureCardTitleResizeListener(card)` | Attaches resize listener for dynamic title sizing |
| `autosizeTitleElement(titleEl)` | Auto-sizes a title element to fit container width |
| `recalcCardTitleSizes` | Debounced function to recalculate all card title sizes |
| `itemHasAnimeKeyword(item)` | Checks if an item has anime-related keywords |
| `isAnimeMovieEntry(item)` | Checks if an anime entry is a movie format |
| `formatAnimeRuntimeLabel(item)` | Formats anime runtime label (min/ep or min for movies) |
| `ensureExpandedSet(listType)` | Ensures expanded cards set exists for list type |
| `toggleCardExpansion(listType, cardId, callbacks)` | Toggles collapsible card expansion |
| `buildPosterNode(posterUrl, title, isPrimary)` | Builds a poster image node or placeholder |
| `buildSeriesPosterStackItems(activeItem, seriesEntries)` | Builds stacked poster items for series display |
| `computeDeckStepValues(options)` | Computes visual step values for poster deck display |
| `formatTvStatusLabel(value)` | Formats TV show status label (Returning, Ended, etc.) |
| `formatAnimeStatusLabel(value)` | Formats anime status label |
| `formatAnimeFormatLabel(value)` | Formats anime format label (TV, OVA, Movie, etc.) |
| `extractEpisodeCount(entry)` | Extracts episode count from an entry object |
| `sumSeasonEpisodeCounts(seasons)` | Sums total episodes across seasons |
| `parseEpisodeValue(value)` | Parses episode count from various input formats |
| `formatAnimeEpisodesLabel(count)` | Formats episode count label (X eps) |
| `getAnimeSeasonField(item)` | Gets the appropriate season field name for anime |
| `deriveSeriesBadgeMetrics(listType, cardId, fallbackItem, providedEntries)` | Derives badge metrics (counts, totals) for series display |
| `resolveSeriesNameFromEntries(seriesEntries, fallbackItem)` | Resolves series name from entries or fallback item |
| `resolveSeriesCardTitleParts(item, context)` | Resolves title parts for series card display |
| `buildMediaSummaryBadges(listType, item, context)` | Builds summary badges for media items |
| `collectMediaBadgeChips(listType, item, context)` | Collects badge chip data for media items |
| `buildSeriesBadgeChips(listType, cardId, item, context)` | Builds series-specific badge chips |
| `getTvSeasonCount(item)` | Gets TV show season count |
| `getTvEpisodeCount(item)` | Gets TV show total episode count |
| `formatTvRuntimeLabel(item)` | Formats TV show runtime label |
| `buildTvStatChips(item, context)` | Builds TV show statistics chips |
| `computeTvBadgeStrings(source, context)` | Computes badge strings for TV shows |
| `buildStatusBadge(listType, item, context)` | Builds status badge element |
| `buildMovieMetaText(item)` | Builds movie metadata text |
| `buildMovieExtendedMeta(item)` | Builds extended movie metadata |
| `buildMovieGenreRow(item)` | Builds genre chips row for movies |
| `buildMovieCastLine(item)` | Builds cast line for movies |
| `buildWatchNowSection(listType, item, inline)` | Builds streaming/watch provider section |
| `buildMovieLinks(listType, item)` | Builds IMDb/trailer links section |
| `buildCollapsibleMovieCard(listType, id, item, positionIndex, options)` | Builds a collapsible movie/TV/anime card |
| `renderMovieCardContent(card, listType, cardId, item, entryId, options)` | Renders content inside a movie card |
| `buildMovieCardSummary(listType, item, context)` | Builds the summary section of a movie card |
| `buildMovieArtwork(listType, item, context)` | Builds artwork/poster section with poster stacking |
| `buildMovieCardInfo(listType, item, context)` | Builds the info section of a movie card |
| `getSeriesTreeEntries(listType, cardId, options)` | Gets series tree entries for a card |
| `buildSeriesTreeBlock(listType, cardId, providedEntries, callbacks)` | Builds the expandable series tree block |
| `buildMovieCardDetails(listType, cardId, entryId, item, context)` | Builds the expanded details section |
| `buildAnimeDetailBlock(listType, entryId, item, options)` | Builds anime-specific detail block |
| `buildTvDetailBlock(listType, entryId, item, options)` | Builds TV show-specific detail block |
| `buildMovieCardActions(listType, id, item, options)` | Builds action buttons for collapsible cards |
| `updateCollapsibleCardStates(listType)` | Updates all collapsible card states |
| `moveSeriesTreeNode(listType, entry, direction)` | Moves a series entry up/down in order |
| `ensureSeriesTreeDragEvents()` | Ensures drag-and-drop events are bound for series tree |

---

## config.js

Application configuration constants and settings.

| Export | Description |
|--------|-------------|
| `firebaseConfig` | Firebase configuration object |
| `TMDB_API_KEY` | TMDb API key |
| `TMDB_API_BASE_URL` | TMDb API base URL |
| `TMDB_IMAGE_BASE_URL` | TMDb image CDN base URL |
| `TMDB_KEYWORD_DISCOVER_PAGE_LIMIT` | Max pages for keyword discovery |
| `TMDB_KEYWORD_DISCOVER_MAX_RESULTS` | Max results for keyword discovery |
| `GOOGLE_BOOKS_API_KEY` | Google Books API key |
| `GOOGLE_BOOKS_API_URL` | Google Books API base URL |
| `LIST_LOAD_STAGGER_MS` | Stagger delay for loading lists |
| `METADATA_SCHEMA_VERSION` | Current metadata schema version |
| `APP_VERSION` | Application version string |
| `BUG_REPORT_DB_PATH` | Firebase path for bug reports |
| `GLOBAL_NOTIFICATIONS_PATH` | Firebase path for global notifications |
| `BUG_REPORT_ADMIN_NAMES` | Set of admin usernames |
| `ANIME_STATUS_PRIORITY` | Priority mapping for anime statuses |
| `ANIME_KEYWORD_REGEX` | Regex for detecting anime keywords |
| `NOTIFICATION_STORAGE_KEY` | LocalStorage key for notifications |
| `MAX_PERSISTED_NOTIFICATIONS` | Maximum stored notifications |
| `NOTIFICATION_SEEN_KEY` | LocalStorage key for seen notifications |
| `INTRO_SESSION_KEY` | SessionStorage key for intro state |
| `FRANCHISE_NORMALIZE_MIGRATION_KEY` | Migration key for franchise normalization |
| `WHEEL_SPIN_AUDIO_SRC` | Audio file for wheel spin |
| `WHEEL_AUDIO_MUTE_KEY` | Storage key for wheel mute state |
| `PERF_DEBUG_FLAG` | Flag for performance debugging |
| `AUTOCOMPLETE_LISTS` | Set of lists supporting autocomplete |
| `PRIMARY_LIST_TYPES` | Array of primary list types |
| `ADD_MODAL_LIST_TYPES` | List types available in add modal |
| `COLLAPSIBLE_LISTS` | Set of lists with collapsible cards |
| `SERIES_BULK_DELETE_LISTS` | Lists supporting bulk series deletion |
| `MEDIA_TYPE_LABELS` | Display labels for media types |
| `FRANCHISE_MEDIA_LABELS` | Labels for franchise media types |
| `FINISH_RATING_MIN` | Minimum finish rating (1) |
| `FINISH_RATING_MAX` | Maximum finish rating (10) |
| `RUNTIME_THRESHOLDS` | Thresholds for runtime pill colors |
| `RUNTIME_PILL_UNITS` | Runtime display units |
| `VIRTUALIZATION_THRESHOLD` | Item count threshold for virtualization |
| `VIRTUALIZATION_OVERSCAN` | Overscan rows for virtual scrolling |
| `DEFAULT_VIRTUAL_ROW_HEIGHT` | Default row height for virtualization |
| `DRAG_SCROLL_EDGE_PX` | Edge zone for drag scrolling |
| `DRAG_SCROLL_STEP_PX` | Step size for drag scrolling |

---

## crud.js

Create, Read, Update, Delete operations for list items.

| Function | Description |
|----------|-------------|
| `addItem(listType, item)` | Adds a new item to a list in Firebase |
| `updateItem(listType, itemId, changes)` | Updates an existing item with partial changes |
| `deleteItem(listType, itemId, options)` | Deletes an item (with confirmation dialog) |
| `moveItemBetweenLists(sourceListType, targetListType, itemId, itemData, callbacks)` | Moves an item from one list to another |
| `normalizeFinishRating(value)` | Normalizes a rating value to valid range (1-10) |
| `promptFinishRating(item, callbacks)` | Shows modal to get rating before finishing an item |
| `finishItem(listType, itemId, ratingValue)` | Moves an item to the finished list with rating |
| `handleFinishRequest(listType, itemId, callbacks)` | Handles the complete finish flow with rating prompt |
| `deleteSeriesEntries(listType, seriesName, options)` | Deletes all entries in a series |
| `mergeSeriesEntriesByName(seriesName, fallbackSeriesName, callbacks)` | Merges series entries across lists |
| `updateLocalItemCaches(listType, itemId, changes)` | Updates local cache after item changes |
| `splitTvShowSeasons(itemId, item, fetchAllTvSeasons)` | Splits a TV show into individual season entries |

---

## dom.js

DOM element references for the application UI.

| Export | Description |
|--------|-------------|
| `loginScreen` | Login screen container element |
| `googleSigninBtn` | Google sign-in button |
| `appRoot` | Main application root container |
| `userNameEl` | User display name element |
| `signOutBtn` | Sign out button |
| `backToTopBtn` | Back to top button |
| `modalRoot` | Modal container element |
| `addModalTrigger` | Add item modal trigger button |
| `combinedListEl` | Combined library list container |
| `franchiseSectionEl` | Franchise section container |
| `franchiseShelfEl` | Franchise shelf container |
| `franchiseMetaEl` | Franchise metadata display |
| `franchiseSortYearBtn` | Franchise year sort button |
| `libraryStatsSummaryEl` | Library statistics summary container |
| `bugReportBtn` | Bug report button |
| `bugReportPopover` | Bug report popover |
| `bugReportForm` | Bug report form |
| `bugReportInput` | Bug report input field |
| `bugReportListEl` | Bug report list container |
| `bugReportCloseBtn` | Bug report close button |
| `unifiedSearchInput` | Library search input |
| `typeFilterButtons` | Media type filter buttons |
| `finishedFilterToggle` | Finished items filter toggle |
| `librarySortSelect` | Library sort dropdown |
| `notificationCenter` | Notification center container |
| `notificationItemsContainer` | Notification items list |
| `notificationClearAllBtn` | Clear all notifications button |
| `notificationShell` | Notification shell wrapper |
| `notificationBellBtn` | Notification bell button |
| `notificationBadgeEl` | Notification count badge |
| `notificationEmptyStateEl` | Notification empty state message |
| `wheelModalTrigger` | Wheel modal trigger button |
| `wheelModalTemplate` | Wheel modal HTML template |

---

## easterEgg.js

Easter egg functionality with seasonal themes (falling sprites, fireworks).

| Function | Description |
|----------|-------------|
| `getSeasonalTheme(now)` | Gets seasonal theme based on date (winter, halloween, new year) |
| `getCurrentTmTheme()` | Gets the current theme for the TM easter egg |
| `bindTriggers()` | Binds click handlers to easter egg trigger elements |
| `stop()` | Stops the easter egg animation |
| `clear()` | Clears all sprites and resets the easter egg |
| `isRunning()` | Returns whether the easter egg is currently running |

---

## firebase.js

Firebase initialization and database operations.

| Function | Description |
|----------|-------------|
| `initializeFirebase()` | Initializes Firebase app, auth, and database |
| `getFirebaseApp()` | Returns the Firebase app instance |
| `getFirebaseAuth()` | Returns the Firebase auth instance |
| `getFirebaseDatabase()` | Returns the Firebase database instance |
| `getGoogleProvider()` | Returns the Google auth provider |
| `signOut()` | Signs out the current user |
| `signInWithGoogle()` | Initiates Google sign-in (popup with redirect fallback) |
| `handleSignInRedirectResult()` | Handles redirect result after Google sign-in |
| `onAuthStateChange(callback)` | Registers auth state change listener |
| `getDatabaseRef(path)` | Gets a database reference for a path |
| `pushData(path, data)` | Pushes new data to a path |
| `setData(path, data)` | Sets data at a path |
| `updateData(path, data)` | Updates data at a path |
| `removeData(path)` | Removes data at a path |
| `getData(path)` | Gets data from a path |
| `onValueChange(path, callback)` | Listens for value changes at a path |
| `onChildAddedListener(path, callback)` | Listens for child added events |
| `createQuery(path, options)` | Creates a database query with ordering/limiting |

---

## franchise.js

Franchise management (collections/universes) with drag-drop reordering.

| Function | Description |
|----------|-------------|
| `getFranchiseState()` | Returns the franchise state object |
| `getFranchiseSortMode()` | Returns current franchise sort mode |
| `setFranchiseSortMode(mode)` | Sets the franchise sort mode |
| `isFranchiseLoaded()` | Returns whether franchises are loaded |
| `getFranchiseRecords()` | Returns the array of franchise records |
| `setFranchiseRecords(records)` | Sets the franchise records array |
| `setFranchiseLoaded(value)` | Sets the franchise loaded state |
| `loadFranchises()` | Loads franchises from Firebase with real-time sync |
| `resetFranchiseSection()` | Resets franchise section to initial state |
| `getFranchiseYear(record)` | Gets the earliest year from a franchise's entries |
| `renderFranchiseShelf(callbacks)` | Renders the franchise shelf with all franchise cards |
| `updateFranchiseMeta(records)` | Updates franchise metadata display |
| `buildFranchiseMetaPill(value, label)` | Builds a metadata pill element |
| `buildFranchiseCard(record)` | Builds a franchise card element |
| `buildFranchiseTimeline(record)` | Builds the timeline/track of franchise entries |
| `buildFranchiseTimelineEntry(record, entry, index)` | Builds a single timeline entry element |
| `moveFranchiseEntry(record, entry, direction)` | Moves a franchise entry up/down in order |
| `resolveFranchiseEntryOrderLabel(record, entry, index)` | Resolves display label for entry order |
| `setupFranchiseSort()` | Sets up franchise sorting controls |
| `enableFranchiseWheelScroll(callback)` | Enables mouse wheel scrolling for franchise shelf |
| `disableFranchiseWheelScroll()` | Disables mouse wheel scrolling |
| `normalizeFranchiseCollection(raw)` | Normalizes raw franchise data from Firebase |
| `normalizeFranchiseRecord(source, fallbackIndex)` | Normalizes a single franchise record |
| `normalizeFranchiseEntries(rawEntries, customOrderList)` | Normalizes franchise entries array |
| `normalizeFranchiseEntry(source, fallbackIndex)` | Normalizes a single franchise entry |
| `refreshFranchiseLibraryMatches()` | Updates library match status for all franchise entries |
| `resolveFranchiseLibraryMatch(entry)` | Finds library match for a franchise entry |
| `computeFranchiseStats(entries)` | Computes statistics for franchise entries |
| `hasFranchiseNormalizationRun()` | Checks if normalization migration has run |
| `markFranchiseNormalizationComplete()` | Marks normalization migration as complete |

---

## lists.js

List cache management and display utilities.

| Function | Description |
|----------|-------------|
| `getListCaches()` | Returns the main list caches object |
| `getFinishedCaches()` | Returns the finished list caches object |
| `setListCache(listType, data)` | Sets cache data for a list type |
| `setFinishedCache(listType, data)` | Sets finished cache data for a list type |
| `clearListCaches()` | Clears all main list caches |
| `clearFinishedCaches()` | Clears all finished list caches |
| `isShowFinishedOnly()` | Returns whether showing finished items only |
| `setShowFinishedOnly(value)` | Sets finished-only display mode |
| `isLibraryFullyLoaded()` | Returns whether library is fully loaded |
| `setLibraryFullyLoaded(value)` | Sets library loaded state |
| `getDisplayCacheMap()` | Gets the active cache map (main or finished) |
| `getDisplayCache(listType)` | Gets display cache for a list type |
| `getSeriesAwareTitle(item)` | Gets title preferring series name if available |
| `sortListEntries(entries, mode)` | Sorts list entries by title, year, director, or series |
| `shouldVirtualize(itemCount)` | Determines if list should use virtualization |
| `resolveCardRenderItem(listType, entryId, fallbackId)` | Resolves item for card rendering |
| `buildUnifiedDisplayEntries(callbacks)` | Builds unified display entries across all lists |
| `buildSpinnerCandidates(listType, data)` | Builds candidate list for wheel spinner |
| `getMediaTypeLabel(listType)` | Gets display label for a media type |

---

## main.js

Main application entry point and initialization.

| Export | Description |
|--------|-------------|
| `config` | Re-exports config module |
| `state` | Re-exports state module |
| `utils` | Re-exports utils module |
| `dom` | Re-exports dom module |
| `firebase` | Re-exports firebase module |
| `notifications` | Re-exports notifications module |
| `lists` | Re-exports lists module |
| `cards` | Re-exports cards module |
| `modals` | Re-exports modals module |
| `metadata` | Re-exports metadata module |
| `autocomplete` | Re-exports autocomplete module |
| `wheel` | Re-exports wheel module |
| `franchise` | Re-exports franchise module |
| `ads` | Re-exports ads module |
| `stats` | Re-exports stats module |
| `bugReport` | Re-exports bugReport module |
| `crud` | Re-exports crud module |
| `easterEgg` | Re-exports easterEgg module |
| `collapsibleCards` | Re-exports collapsibleCards module |
| `VirtualScroller` | Re-exports VirtualScroller class |
| `ensureVirtualListController` | Re-exports virtual list controller function |
| `destroyVirtualListController` | Re-exports virtual list destroyer function |
| `ensureUnifiedVirtualizer` | Re-exports unified virtualizer function |
| `destroyUnifiedVirtualizer` | Re-exports unified virtualizer destroyer |
| `initApp()` | Main function that initializes the entire application |

---

## metadata.js

Metadata fetching from TMDb and Google Books APIs.

| Function | Description |
|----------|-------------|
| `tmdbFetch(path, params)` | Makes authenticated request to TMDb API |
| `fetchTmdbMetadata(listType, options)` | Fetches full metadata for a movie/TV show |
| `findTmdbCandidate(options)` | Finds best matching TMDb entry for a title |
| `fetchTmdbDetail(mediaType, id)` | Fetches detailed info for a TMDb entry |
| `mapTmdbDetailToMetadata(detail, mediaType)` | Maps TMDb detail response to app metadata format |
| `fetchTmdbSuggestions(listType, query)` | Fetches search suggestions from TMDb |
| `fetchTmdbActorSuggestions(query)` | Fetches actor search suggestions |
| `searchTmdbAcrossMedia(query)` | Searches both movies and TV simultaneously |
| `fetchTmdbFranchiseDetails(mediaType, id)` | Fetches franchise-related details |
| `fetchTmdbCollectionMovies(collectionId)` | Fetches all movies in a TMDb collection |
| `formatTmdbFranchiseEntry(item, mediaType, extras)` | Formats TMDb item as franchise entry |
| `pickBestTmdbSearchResult(results, query, mediaType)` | Picks best match from search results |
| `collectRecommendationEntries(details, mediaType)` | Collects recommendations and similar entries |
| `deriveMetadataAssignments(metadata, existing, options)` | Derives field assignments from metadata |
| `computeTvBadgeStrings(source, context)` | Computes badge display strings for TV shows |
| `getTmdbCollectionInfo(title, year, imdbId)` | Gets collection/franchise info for a title |
| `searchTmdbKeyword(query)` | Searches for TMDb keywords |
| `discoverTmdbKeywordEntries(keywordId, mediaType, pageLimit)` | Discovers entries by keyword |
| `fetchTmdbKeywordFranchiseEntries(keywordId)` | Fetches franchise entries by keyword |
| `fetchGoogleBooksMetadata(lookup)` | Fetches book metadata from Google Books |
| `ensureTvSeriesDefaults(listType, item)` | Ensures TV show has required default fields |
| `getUserRegion()` | Gets user's region code for localized data |
| `ensureTmdbIdentity(listType, item)` | Ensures item has TMDb ID |
| `fetchWatchProviders(mediaType, tmdbId)` | Fetches streaming/watch providers |
| `refreshItemMetadata(listType, itemId, item, options)` | Refreshes metadata for an existing item |
| `fetchTmdbSeasonDetails(tmdbId, seasonNumber)` | Fetches details for a specific TV season |
| `fetchAllTvSeasons(tmdbId)` | Fetches all season details for a TV show |

---

## modals.js

Modal dialog management for add/edit operations.

| Function | Description |
|----------|-------------|
| `getActiveAddModal()` | Returns the currently active add modal state |
| `getActiveEditModal()` | Returns the currently active edit modal state |
| `closeAddModal()` | Closes the add item modal |
| `closeEditModal()` | Closes the edit item modal |
| `closeAllModals()` | Closes all open modals |
| `createModalBackdrop(className)` | Creates a modal backdrop element |
| `createModal(className)` | Creates a modal container element |
| `openAddModal(initialType, callbacks)` | Opens the add item modal with type tabs |
| `openEditModal(listType, id, item, callbacks)` | Opens the edit modal for an existing item |
| `showConfirmModal(options)` | Shows a confirmation dialog |

---

## notifications.js

In-app notification system with persistence.

| Function | Description |
|----------|-------------|
| `getPersistedNotifications()` | Returns array of persisted notifications |
| `getNotificationSignatureCache()` | Returns the notification deduplication cache |
| `pushNotification(options)` | Displays a new notification |
| `createNotificationRecord(options)` | Creates a notification record object |
| `renderNotificationCard(record)` | Renders a notification card element |
| `dismissNotification(recordId)` | Dismisses and removes a notification |
| `addPersistedNotification(record)` | Adds notification to persistent storage |
| `removePersistedNotification(recordId)` | Removes notification from storage |
| `loadStoredNotifications()` | Loads notifications from localStorage |
| `persistNotificationsToStorage()` | Saves notifications to localStorage |
| `getNotificationSignature(title, message)` | Generates deduplication signature |
| `loadNotificationSignatures()` | Loads seen notification signatures |
| `persistNotificationSignatures()` | Saves seen notification signatures |
| `markNotificationSignatureSeen(signature)` | Marks a notification signature as seen |
| `initNotificationBell()` | Initializes notification bell UI |
| `clearAllNotifications()` | Clears all notifications |
| `toggleNotificationPopover(forceState)` | Toggles notification popover visibility |
| `closeNotificationPopover()` | Closes the notification popover |
| `setNotificationPopoverState(isOpen)` | Sets notification popover open state |
| `updateNotificationBadge()` | Updates notification count badge |
| `updateNotificationEmptyState()` | Updates empty state message visibility |

---

## seriesGrouping.js

Series grouping logic for unified display of related entries.

| Function | Description |
|----------|-------------|
| `sortSeriesRecords(records)` | Sorts series records by order, year, then title |
| `pickSeriesLeader(entries)` | Picks the leader entry for a series group |
| `resolveSeriesDisplayEntry(listType, leaderId, entries)` | Resolves display entry for a series |
| `collectSeriesEntriesAcrossLists(seriesName)` | Collects all entries for a series across list types |
| `mergeSeriesEntriesAcrossLists(listType, cardId, displayItem, primaryEntries)` | Merges series entries from multiple lists |
| `resolveSeriesNameFromEntries(entries, fallbackItem)` | Resolves series name from entries array |
| `buildSeriesEntryKey(listType, entryId, item)` | Builds unique key for deduplication |
| `compareSeriesEntries(a, b)` | Compares two series entries for sorting |
| `collectUnifiedEntriesWithGrouping(primaryListTypes)` | Collects unified entries with series grouping applied |
| `clearCrossListSeriesCache()` | Clears the cross-list series cache |
| `incrementSeriesIndexVersion()` | Increments cache invalidation version |
| `invalidateSeriesCrossListCache()` | Invalidates the series cache |

---

## share.js

Sharing functionality for Discord and other platforms.

| Function | Description |
|----------|-------------|
| `generateShareUrl(listType, item)` | Generates shareable URL for a single item |
| `fetchSharedCollection(userId, shareId)` | Fetches a shared collection from Firebase |
| `generateCollectionShareUrl(seriesName, entries, primaryItem)` | Generates shareable URL for a collection |
| `buildCollectionDiscordMessage(seriesName, entries, primaryItem)` | Builds Discord message for collection share |
| `parseShareUrl(urlString)` | Parses share parameters from a URL |
| `buildDiscordMessage(listType, item)` | Builds Discord message for single item share |
| `closeShareModal()` | Closes the share modal |
| `openShareModal(listType, item)` | Opens share modal for a single item |
| `openCollectionShareModal(seriesName, entries, primaryItem)` | Opens share modal for a collection |
| `closeSharedItemModal()` | Closes the incoming shared item modal |
| `openSharedItemModal(shareData)` | Opens modal to import a shared item |
| `openSharedCollectionModal(shareData)` | Opens modal to import a shared collection |
| `checkForIncomingShare()` | Checks URL for incoming share and opens import modal |

---

## state.js

Application state management and persistence.

| Export | Description |
|--------|-------------|
| `safeStorageGet/Set/Remove` | Safe sessionStorage operations |
| `safeLocalStorageGet/Set/Remove` | Safe localStorage operations |
| `appInitialized` | App initialization state |
| `currentUser` | Current authenticated user |
| `listeners` | Firebase listener cleanup functions |
| `listCaches` | Main list data caches |
| `finishedCaches` | Finished list data caches |
| `expandedCards` | Expanded card states by list type |
| `seriesGroups` | Series grouping data |
| `crossListSeriesCache` | Cross-list series cache |
| `showFinishedOnly` | Finished-only view state |
| `unifiedFilters` | Library filter state |
| `librarySortMode` | Current library sort mode |
| `setCurrentUser(value)` | Sets current user |
| `getCurrentUser()` | Gets current user |
| `setShowFinishedOnly(value)` | Sets finished-only mode |
| `setLibraryFullyLoaded(value)` | Sets library loaded state |
| `getLibraryFullyLoaded()` | Gets library loaded state |
| `getDisplayCacheMap()` | Gets active cache map |
| `getDisplayCache(listType)` | Gets display cache for list type |
| `getSeriesGroupEntries(listType, cardId)` | Gets series group entries |
| `setSeriesGroup(listType, cardId, entries)` | Sets series group entries |
| `clearSeriesGroups(listType)` | Clears series groups for a list type |
| `setSeriesIndexVersion(value)` | Sets series cache version |
| `setLibrarySortMode(value)` | Sets library sort mode |
| *(Many more state setters/getters)* | Various state management functions |

---

## stats.js

Library statistics calculation and display.

| Function | Description |
|----------|-------------|
| `formatLibraryStatNumber(value)` | Formats number with locale formatting |
| `parseRuntimeMinutes(value)` | Parses runtime string to minutes |
| `formatRuntimeDuration(totalMinutes)` | Formats minutes as duration string (1y 2mth 3d) |
| `formatRuntimeDurationDetailed(totalMinutes, forceShow)` | Formats duration with full unit names |
| `breakdownDurationMinutes(totalMinutes)` | Breaks down minutes into years/months/days/hours/minutes |
| `getRuntimeThresholdClass(totalMinutes)` | Gets CSS class based on runtime threshold |
| `createRuntimePillValueMap()` | Creates empty runtime pill value map |
| `getRuntimeUnitBreakdown(totalMinutes)` | Gets runtime breakdown by unit |
| `renderRuntimePillsDisplay(valueMap, visibilityMap, activeUnit)` | Renders runtime pills HTML |
| `animateRuntimeProgression(chipElement, finalMinutes)` | Animates runtime counting up |
| `buildLibraryStatChip(label, value, options)` | Builds a statistics chip element |
| `estimateMovieRuntimeMinutes(item)` | Estimates movie runtime in minutes |
| `estimateTvEpisodeRuntimeMinutes(item)` | Estimates TV episode runtime |
| `getAnimeEpisodeCount(item)` | Gets anime episode count |
| `estimateAnimeEpisodeRuntimeMinutes(item)` | Estimates anime episode runtime |
| `isAnimeMovieEntry(item)` | Checks if anime is movie format |
| `getTvEpisodeCount(item)` | Gets TV show episode count |
| `computeLibraryRuntimeStats()` | Computes total library runtime statistics |
| `updateLibraryRuntimeStats()` | Updates the library stats display |
| `isRealisticTimeMode()` | Gets realistic time mode state |
| `setRealisticTimeMode(value)` | Sets realistic time mode (7h/day vs 24h/day) |

---

## utils.js

General utility functions.

| Function | Description |
|----------|-------------|
| `safeStorageGet(key)` | Safely gets value from sessionStorage |
| `safeStorageSet(key, value)` | Safely sets value in sessionStorage |
| `safeStorageRemove(key)` | Safely removes value from sessionStorage |
| `safeLocalStorageGet(key)` | Safely gets value from localStorage |
| `safeLocalStorageSet(key, value)` | Safely sets value in localStorage |
| `safeLocalStorageRemove(key)` | Safely removes value from localStorage |
| `debounce(fn, wait)` | Creates debounced version of a function |
| `delay(ms)` | Returns promise that resolves after delay |
| `createEl(tag, classNames, options)` | Creates DOM element with classes and options |
| `shouldLogPerfEvents()` | Checks if performance logging is enabled |
| `logRenderMetrics(eventName, meta)` | Logs render performance metrics |
| `findScrollParent(node)` | Finds nearest scrollable parent element |
| `formatLibraryStatNumber(value)` | Formats number with locale formatting |
| `getRuntimeThresholdClass(totalMinutes)` | Gets CSS class for runtime threshold |
| `createRuntimePillValueMap()` | Creates empty runtime pill value map |
| `formatRuntimePillNumber(value)` | Formats number for runtime pill display |
| `getRuntimeUnitBreakdown(totalMinutes, realisticTimeMode)` | Gets runtime breakdown by unit |
| `renderRuntimePillsDisplay(valueMap, visibilityMap, activeUnit)` | Renders runtime pills HTML |
| `parseRuntimeMinutes(value)` | Parses runtime to minutes |
| `formatRuntimeDuration(totalMinutes)` | Formats duration string |
| `normalizeTitleKey(title)` | Normalizes title for comparison/sorting |
| `titleSortKey(title)` | Gets sort key removing leading articles |
| `sanitizeYear(value)` | Extracts 4-digit year from value |
| `extractPrimaryYear(value)` | Extracts primary year from date string |
| `sanitizeSeriesOrder(value)` | Sanitizes series order to number or null |
| `parseSeriesOrder(value)` | Parses series order with Infinity fallback |
| `numericSeriesOrder(value)` | Gets numeric series order or null |
| `parseEpisodeValue(value)` | Parses episode count from various formats |
| `parseActorsList(raw)` | Parses actors string/array to array |
| `buildTrailerUrl(title, year)` | Builds YouTube search URL for trailer |
| `arraysShallowEqual(a, b)` | Shallow equality check for arrays |
| `setButtonBusy(btn, busy)` | Sets button busy/disabled state |
| `truncateText(value, limit)` | Truncates text with ellipsis |

---

## virtualScroller.js

Virtual scrolling for large lists with performance optimization.

| Export | Description |
|--------|-------------|
| `VirtualScroller` | Class for virtual scrolling with DOM recycling |
| `getVirtualListController(key)` | Gets virtual list controller by key |
| `ensureVirtualListController(key, container, options)` | Creates or returns virtual list controller |
| `destroyVirtualListController(key)` | Destroys and cleans up virtual list controller |
| `ensureUnifiedVirtualizer(container, options)` | Creates unified virtualizer for main library |
| `destroyUnifiedVirtualizer()` | Destroys the unified virtualizer |
| `getUnifiedVirtualController()` | Gets the unified virtual controller instance |

### VirtualScroller Class Methods

| Method | Description |
|--------|-------------|
| `constructor(container, options)` | Creates virtual scroller with container and render options |
| `setItems(entries)` | Sets the items array to virtualize |
| `scrollToIndex(index)` | Scrolls to bring specific index into view |
| `destroy()` | Cleans up scroller and event listeners |

---

## wheel.js

Random selection wheel/spinner functionality.

| Function | Description |
|----------|-------------|
| `getWheelSpinAudio()` | Gets or creates wheel spin audio element |
| `startWheelSpinAudio()` | Starts playing wheel spin sound |
| `stopWheelSpinAudio()` | Stops wheel spin sound |
| `updateWheelMuteButtonState(button)` | Updates mute button text/state |
| `toggleWheelAudioMute(button)` | Toggles audio mute and updates button |
| `isWheelAudioMuted()` | Returns whether wheel audio is muted |
| `getWheelSpinnerEl()` | Gets wheel spinner element |
| `getWheelResultEl()` | Gets wheel result element |
| `getWheelSourceSelect()` | Gets wheel source select element |
| `clearWheelAnimation()` | Clears wheel animation state |
| `addSpinTimeout(id)` | Adds timeout ID to cleanup array |
| `setupWheelModal(callbacks)` | Sets up wheel modal trigger |
| `openWheelModal(callbacks)` | Opens the wheel modal |
| `closeWheelModal()` | Closes the wheel modal |
| `annotateWheelItem(item, listType, fallbackId)` | Annotates item with wheel metadata |
| `createWheelCompositeId(listType, itemId)` | Creates composite ID for wheel items |
| `mapWheelCandidateMap(candidateMap, listType, options)` | Maps candidate items for wheel |
| `renderWheelResult(item, listType, buildCardFn)` | Renders the wheel result display |

---

*Generated on December 25, 2025*
