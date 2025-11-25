export function createListRenderer({
  listCaches,
  sortModes,
  unifiedFilters,
  primaryListTypes,
  combinedListEl,
  expandedCards,
  listSupportsActorFilter,
  getActorFilterValue,
  matchesActorFilter,
  updateListStats,
  isCollapsibleList,
  renderCollapsibleMediaGrid,
  renderStandardList,
  updateCollapsibleCardStates,
  prepareCollapsibleRecords,
  buildCollapsibleMovieCard,
  buildStandardCard,
  titleSortKey,
  parseSeriesOrder,
}) {
  function renderList(listType, data) {
    listCaches[listType] = data;
    const container = document.getElementById(`${listType}-list`);
    resetListContainer(container);

    const entries = Object.entries(data || {});
    const { filtered, filterValue, supportsActorFilter } = applyListFilters(listType, entries);

    if (!filtered.length) {
      handleEmptyListState(listType, container, filterValue, supportsActorFilter);
      return;
    }

    updateListStats(listType, filtered);
    const sortedEntries = sortListEntries(listType, filtered);
    renderPreparedList(listType, sortedEntries, container);

    if (listType in expandedCards) {
      updateCollapsibleCardStates(listType);
    }

    renderUnifiedLibrary();
  }

  function resetListContainer(container) {
    if (container) {
      container.innerHTML = '';
    }
  }

  function applyListFilters(listType, entries) {
    const supportsActorFilterFlag = listSupportsActorFilter(listType);
    if (!supportsActorFilterFlag) {
      return { filtered: entries.slice(), filterValue: '', supportsActorFilter: supportsActorFilterFlag };
    }
    const filterValue = getActorFilterValue(listType);
    if (!filterValue) {
      return { filtered: entries.slice(), filterValue: '', supportsActorFilter: supportsActorFilterFlag };
    }
    const filtered = entries.filter(([, item]) => matchesActorFilter(listType, item, filterValue));
    return { filtered, filterValue, supportsActorFilter: supportsActorFilterFlag };
  }

  function handleEmptyListState(listType, container, filterValue, supportsActorFilterFlag) {
    const message = supportsActorFilterFlag && filterValue
      ? 'No items match this actor filter yet.'
      : 'No items yet. Add something!';
    if (container) {
      container.innerHTML = '<div class="small">' + message + '</div>';
    }
    updateListStats(listType, []);
    renderUnifiedLibrary();
  }

  function sortListEntries(listType, entries) {
    const mode = sortModes[listType] || 'title';
    const sorted = entries.slice();
    sorted.sort(([, a], [, b]) => {
      const ta = titleSortKey(a && a.title ? a.title : '');
      const tb = titleSortKey(b && b.title ? b.title : '');
      if (mode === 'title') {
        if (ta < tb) return -1;
        if (ta > tb) return 1;
        return 0;
      }
      if (mode === 'yearAsc' || mode === 'yearDesc') {
        const ya = a && a.year ? parseInt(a.year, 10) : 9999;
        const yb = b && b.year ? parseInt(b.year, 10) : 9999;
        if (ya !== yb) return mode === 'yearAsc' ? ya - yb : yb - ya;
        if (ta < tb) return -1;
        if (ta > tb) return 1;
        return 0;
      }
      if (mode === 'director') {
        const da = (a && (a.director || a.author || '')).toLowerCase();
        const db = (b && (b.director || b.author || '')).toLowerCase();
        if (da && db && da !== db) return da < db ? -1 : 1;
        if (ta < tb) return -1;
        if (ta > tb) return 1;
        return 0;
      }
      if (mode === 'series') {
        const sa = (a && a.seriesName ? a.seriesName : '').toLowerCase();
        const sb = (b && b.seriesName ? b.seriesName : '').toLowerCase();
        if (sa && sb && sa !== sb) return sa < sb ? -1 : 1;
        const oa = parseSeriesOrder(a && a.seriesOrder);
        const ob = parseSeriesOrder(b && b.seriesOrder);
        if (oa !== ob) return oa - ob;
        if (ta < tb) return -1;
        if (ta > tb) return 1;
        return 0;
      }
      if (ta < tb) return -1;
      if (ta > tb) return 1;
      return 0;
    });
    return sorted;
  }

  function renderPreparedList(listType, entries, container) {
    if (isCollapsibleList(listType) && container) {
      renderCollapsibleMediaGrid(listType, container, entries);
      return;
    }
    if (container) {
      renderStandardList(container, listType, entries);
    }
  }

  function renderUnifiedLibrary() {
    if (!combinedListEl) return;
    const hasLoadedAny = primaryListTypes.some(type => listCaches[type] !== undefined);
    if (!hasLoadedAny) {
      combinedListEl.innerHTML = '<div class="small">Loading your library...</div>';
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
      const idxA = Math.max(primaryListTypes.indexOf(a.listType), 0);
      const idxB = Math.max(primaryListTypes.indexOf(b.listType), 0);
      return idxA - idxB;
    });

    combinedListEl.innerHTML = '';
    if (!filtered.length) {
      combinedListEl.innerHTML = '<div class="small">No entries match the current filters yet.</div>';
      return;
    }

    const grid = document.createElement('div');
    grid.className = 'movies-grid unified-grid';
    filtered.forEach(entry => {
      const card = buildUnifiedCard(entry);
      if (card) grid.appendChild(card);
    });
    combinedListEl.appendChild(grid);
  }

  function collectUnifiedEntries() {
    const allEntries = [];
    primaryListTypes.forEach(listType => {
      const cacheEntries = Object.entries(listCaches[listType] || {});
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

  return {
    renderList,
    renderUnifiedLibrary,
  };
}
