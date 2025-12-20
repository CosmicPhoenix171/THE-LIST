import { createEl, setButtonBusy, sanitizeYear, sanitizeSeriesOrder, normalizeTitleKey, buildTrailerUrl, buildComparisonSignature, signaturesMatch } from './utils.js';
import { modalRoot } from './dom.js';
import { ADD_MODAL_LIST_TYPES, MEDIA_TYPE_LABELS, TMDB_API_KEY } from './config.js';
import { 
  setupFormAutocomplete, 
  setupActorAutocomplete, 
  teardownFormAutocomplete,
  hideTitleSuggestions 
} from './autocomplete.js';
import { getCurrentUser, showFinishedOnly, setShowFinishedOnly, listCaches, finishedCaches } from './state.js';
import { 
  fetchTmdbMetadata, 
  deriveMetadataAssignments, 
  getTmdbCollectionInfo, 
  searchTmdbKeyword,
  fetchTmdbKeywordFranchiseEntries,
  fetchGoogleBooksMetadata,
  ensureTvSeriesDefaults
} from './metadata.js';
import { addItem, updateItem, normalizeFinishRating } from './crud.js';
import { getFirebaseDatabase } from './firebase.js';
import { FINISH_RATING_MIN, FINISH_RATING_MAX } from './config.js';
import { ref, update } from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-database.js';

let activeAddModal = null;
let activeEditModal = null;

// Cache form templates from HTML
const addFormTemplateMap = {};
const addFormTemplatesContainer = document.getElementById('add-form-templates');
if (addFormTemplatesContainer) {
  addFormTemplatesContainer.querySelectorAll('template[data-list]').forEach(template => {
    const type = template && template.dataset ? template.dataset.list : '';
    if (type) {
      addFormTemplateMap[type] = template;
    }
  });
}

export function getActiveAddModal() {
  return activeAddModal;
}

export function getActiveEditModal() {
  return activeEditModal;
}

export function closeAddModal() {
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

export function closeEditModal() {
  if (!activeEditModal) return;
  
  if (activeEditModal.backdrop && activeEditModal.backdrop.parentNode) {
    activeEditModal.backdrop.parentNode.removeChild(activeEditModal.backdrop);
  }
  
  if (activeEditModal.keyHandler) {
    document.removeEventListener('keydown', activeEditModal.keyHandler);
  }
  
  activeEditModal = null;
}

export function closeAllModals() {
  closeAddModal();
  closeEditModal();
  if (modalRoot) {
    modalRoot.innerHTML = '';
  }
}

export function createModalBackdrop(className = '') {
  const backdrop = createEl('div', `modal-backdrop ${className}`.trim());
  return backdrop;
}

export function createModal(className = '') {
  const modal = createEl('div', `modal ${className}`.trim());
  return modal;
}

export function openAddModal(initialType = ADD_MODAL_LIST_TYPES[0], callbacks = {}) {
  if (!modalRoot) return;
  const defaultType = ADD_MODAL_LIST_TYPES.includes(initialType) ? initialType : ADD_MODAL_LIST_TYPES[0];
  closeAddModal();
  
  const { onSubmit, afterSubmit, renderUnifiedLibrary } = callbacks;

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
  ADD_MODAL_LIST_TYPES.forEach(type => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'add-type-tab';
    button.dataset.type = type;
    button.textContent = MEDIA_TYPE_LABELS[type] || type;
    button.setAttribute('aria-pressed', 'false');
    button.addEventListener('click', () => setActiveAddModalType(type, callbacks));
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
    callbacks,
  };

  setActiveAddModalType(defaultType, callbacks);
  return activeAddModal;
}

function setActiveAddModalType(listType, callbacks = {}) {
  if (!activeAddModal) return;
  const targetType = ADD_MODAL_LIST_TYPES.includes(listType) ? listType : ADD_MODAL_LIST_TYPES[0];
  const template = addFormTemplateMap[targetType];
  if (!template) {
    console.warn(`No template found for ${targetType}`);
    return;
  }

  destroyActiveAddModalForm();
  activeAddModal.formHost.innerHTML = '';
  const fragment = template.content.cloneNode(true);
  activeAddModal.formHost.appendChild(fragment);
  const form = activeAddModal.formHost.querySelector('form');
  
  if (form) {
    setupFormAutocomplete(form, targetType, callbacks);
    setupActorAutocomplete(form, targetType, callbacks);

    // Handle mode radios (title vs actor search)
    const modeRadios = form.querySelectorAll('input[name="addMode"]');
    if (modeRadios.length > 0) {
      const titleGroup = form.querySelector('.title-group');
      const actorGroup = form.querySelector('.actor-group');
      const standardFields = form.querySelector('.standard-fields');
      
      const updateMode = () => {
        const mode = Array.from(modeRadios).find(r => r.checked)?.value || 'title';
        if (mode === 'actor') {
          if (titleGroup) titleGroup.classList.add('hidden');
          if (standardFields) standardFields.classList.add('hidden');
          if (actorGroup) actorGroup.classList.remove('hidden');
          const titleInput = form.querySelector('input[name="title"]');
          if (titleInput) titleInput.removeAttribute('required');
        } else {
          if (titleGroup) titleGroup.classList.remove('hidden');
          if (standardFields) standardFields.classList.remove('hidden');
          if (actorGroup) actorGroup.classList.add('hidden');
          const titleInput = form.querySelector('input[name="title"]');
          if (titleInput) titleInput.setAttribute('required', '');
        }
      };
      
      modeRadios.forEach(radio => radio.addEventListener('change', updateMode));
      updateMode();
    }

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      
      // Switch to active list if viewing finished
      if (showFinishedOnly) {
        setShowFinishedOnly(false);
        const finishedToggle = document.getElementById('finished-filter-toggle');
        if (finishedToggle) finishedToggle.checked = false;
        if (typeof callbacks.renderUnifiedLibrary === 'function') {
          callbacks.renderUnifiedLibrary();
        }
      }
      
      await addItemFromForm(targetType, form, callbacks);
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

async function addItemFromForm(listType, form, callbacks = {}) {
  const { onSubmit, afterSubmit, renderUnifiedLibrary } = callbacks;
  
  const title = (form.title?.value || '').trim();
  const notes = (form.notes?.value || '').trim();
  const yearRaw = (form.year?.value || '').trim();
  const year = sanitizeYear(yearRaw);
  const creatorField = listType === 'books' ? 'author' : 'director';
  const creatorValue = (form[creatorField]?.value || '').trim();
  const seriesNameValue = listType === 'books' ? '' : (form.seriesName?.value || '').trim();
  const seriesOrderRaw = listType === 'books' ? '' : (form.seriesOrder?.value || '').trim();
  const seriesOrder = listType === 'books' ? null : sanitizeSeriesOrder(seriesOrderRaw);

  // Check mode
  const modeRadios = form.querySelectorAll('input[name="addMode"]');
  const mode = Array.from(modeRadios).find(r => r.checked)?.value || 'title';
  
  if (mode === 'actor') {
    const actorInput = form.querySelector('input[name="actor"]');
    if (actorInput && actorInput.value.trim()) {
      // Actor mode is handled by autocomplete callbacks
      return;
    }
  }

  if (!title) {
    alert('Title is required');
    return;
  }

  const submitBtn = form.querySelector('button[type="submit"]');
  setButtonBusy(submitBtn, true);

  try {
    // Get cached metadata from autocomplete selection
    let metadata = form.__selectedMetadata || null;
    const selectedImdbId = form.dataset.selectedImdbId || '';
    const selectedTmdbId = form.dataset.selectedTmdbId || '';
    const selectedGoogleBookId = form.dataset.selectedGoogleBookId || '';
    const selectedGoogleIsbn = form.dataset.selectedGoogleIsbn || '';
    const supportsMetadata = ['movies', 'tvShows', 'books'].includes(listType);
    const useGoogleBooks = listType === 'books';
    const hasMetadataProvider = useGoogleBooks || Boolean(TMDB_API_KEY);
    let movieCollectionInfo = null;

    // Fetch metadata if not already cached
    if (!metadata && supportsMetadata && hasMetadataProvider) {
      if (useGoogleBooks) {
        metadata = await fetchGoogleBooksMetadata({ 
          volumeId: selectedGoogleBookId, 
          title, 
          author: creatorValue, 
          isbn: selectedGoogleIsbn 
        });
      } else {
        metadata = await fetchTmdbMetadata(listType, { 
          title, 
          year, 
          imdbId: selectedImdbId, 
          tmdbId: selectedTmdbId 
        });
      }
    }

    const item = {
      title,
      createdAt: Date.now(),
    };
    if (notes) item.notes = notes;
    if (year) item.year = year;

    // Build trailer URL
    const baseTrailerUrl = buildTrailerUrl(title, year);
    if (baseTrailerUrl) item.trailerUrl = baseTrailerUrl;

    // Handle franchise keyword lookup
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
          }
        }
      } catch (err) {
        console.warn('Franchise keyword lookup failed', err);
      }
    }

    // Apply media type specific fields
    if (listType === 'books') {
      if (creatorValue) item.author = creatorValue;
    } else {
      if (creatorValue) item.director = creatorValue;
      if (seriesNameValue) item.seriesName = seriesNameValue;
      if (seriesOrder !== null) item.seriesOrder = seriesOrder;
      
      // Derive and apply metadata fields
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

      // Apply TV series defaults
      if (listType === 'tvShows') {
        ensureTvSeriesDefaults(listType, item);
      }
    }

    // Check for duplicates
    if (isDuplicateCandidate(listType, item)) {
      alert("Hey dumbass! It's already in the damn list!");
      return;
    }

    // For movies, try to detect collection membership
    if (listType === 'movies' && TMDB_API_KEY && item.title) {
      try {
        const collInfo = await getTmdbCollectionInfo(item.title, item.year, item.imdbId);
        if (collInfo && collInfo.collectionName && Array.isArray(collInfo.parts) && collInfo.parts.length > 1) {
          movieCollectionInfo = collInfo;
          const idx = collInfo.parts.findIndex(p => p.matchesCurrent);
          if (idx >= 0 && !item.seriesName) {
            item.seriesName = collInfo.collectionName;
            item.seriesOrder = idx + 1;
            item.seriesSize = collInfo.parts.length;
            if (idx + 1 < collInfo.parts.length) {
              item.nextSequel = collInfo.parts[idx + 1].title;
            }
            if (idx > 0) {
              item.previousPrequel = collInfo.parts[idx - 1].title;
            }
          }
          item._tmdbCollectionInfo = collInfo;
        }
      } catch (e) {
        console.warn('TMDb collection enrichment failed', e);
      }
    }

    // Add item via callback or directly
    if (typeof onSubmit === 'function') {
      await onSubmit(listType, item, form);
    } else {
      await addItem(listType, item);
    }

    // Handle follow-up prompts for collections/keywords
    let keywordPromptContext = null;
    if (franchiseKeywordInfo && Array.isArray(franchiseKeywordEntryCandidates) && franchiseKeywordEntryCandidates.length) {
      const filtered = filterKeywordEntriesAgainstLibrary(franchiseKeywordEntryCandidates, item, listType);
      if (filtered.length) {
        keywordPromptContext = {
          entries: filtered.slice(0, 40),
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
    
    if (typeof afterSubmit === 'function') {
      afterSubmit();
    }
    
    form.reset();
    form.__selectedMetadata = null;
    delete form.dataset.selectedImdbId;
    delete form.dataset.selectedTmdbId;
    delete form.dataset.selectedGoogleBookId;
    delete form.dataset.selectedGoogleIsbn;
    hideTitleSuggestions(form);
    
    closeAddModal();
  } catch (err) {
    console.error('Unable to add item', err);
    const message = err?.message === 'Not signed in'
      ? 'Please sign in to add items.'
      : 'Unable to add item right now. Please try again.';
    alert(message);
  } finally {
    setButtonBusy(submitBtn, false);
  }
}

export function openEditModal(listType, id, item, callbacks = {}) {
  const { onSubmit, onClose, setupAutocomplete, onRefreshMetadata, onMergeSeries } = callbacks;
  
  closeEditModal();
  
  const backdrop = createModalBackdrop('edit-modal-backdrop');
  const modal = createModal('edit-modal');
  
  const header = createEl('div', 'modal-header');
  header.appendChild(createEl('h2', '', { text: 'Edit Item' }));
  modal.appendChild(header);
  
  const form = createEl('form', 'edit-form');
  form.dataset.listType = listType;
  form.dataset.itemId = id;
  
  // Type selector
  const typeGroup = createEl('div', 'form-group');
  const typeSelect = createEl('select');
  typeSelect.name = 'listType';
  const typeOptions = [
    { value: 'movies', label: 'Movies' },
    { value: 'tvShows', label: 'TV Shows' },
    { value: 'anime', label: 'Anime' },
    { value: 'books', label: 'Books' },
  ];
  typeOptions.forEach(opt => {
    const option = createEl('option', '', { text: opt.label });
    option.value = opt.value;
    if (opt.value === listType) option.selected = true;
    typeSelect.appendChild(option);
  });
  typeGroup.appendChild(typeSelect);
  form.appendChild(typeGroup);
  
  // Title input
  const titleGroup = createEl('div', 'form-group');
  const titleInput = createEl('input');
  titleInput.type = 'text';
  titleInput.name = 'title';
  titleInput.value = item.title || '';
  titleInput.placeholder = 'Title';
  titleInput.required = true;
  titleGroup.appendChild(titleInput);
  form.appendChild(titleGroup);
  
  // Year input
  const yearGroup = createEl('div', 'form-group');
  const yearInput = createEl('input');
  yearInput.type = 'text';
  yearInput.name = 'year';
  yearInput.value = item.year || '';
  yearInput.placeholder = 'Year';
  yearInput.pattern = '[0-9]{4}';
  yearInput.maxLength = 4;
  yearGroup.appendChild(yearInput);
  form.appendChild(yearGroup);
  
  // Creator input (Director/Author)
  const creatorPlaceholderMap = {
    movies: 'Director',
    tvShows: 'Director / Showrunner',
    anime: 'Director / Studio',
    books: 'Author',
  };
  const creatorGroup = createEl('div', 'form-group');
  const creatorInput = createEl('input');
  creatorInput.type = 'text';
  creatorInput.name = 'creator';
  creatorInput.placeholder = creatorPlaceholderMap[listType] || 'Creator';
  creatorInput.value = listType === 'books' ? (item.author || '') : (item.director || '');
  creatorGroup.appendChild(creatorInput);
  form.appendChild(creatorGroup);
  
  // Series name input
  const seriesNameGroup = createEl('div', 'form-group');
  const seriesNameInput = createEl('input');
  seriesNameInput.type = 'text';
  seriesNameInput.name = 'seriesName';
  seriesNameInput.placeholder = 'Series/Franchise name (optional)';
  seriesNameInput.value = item.seriesName || '';
  seriesNameGroup.appendChild(seriesNameInput);
  form.appendChild(seriesNameGroup);
  
  // Series order input
  const seriesOrderGroup = createEl('div', 'form-group');
  const seriesOrderInput = createEl('input');
  seriesOrderInput.type = 'text';
  seriesOrderInput.name = 'seriesOrder';
  seriesOrderInput.placeholder = 'Series order (e.g., 1, 2, 3)';
  seriesOrderInput.inputMode = 'numeric';
  seriesOrderInput.pattern = '[0-9]{1,3}';
  seriesOrderInput.value = item.seriesOrder !== undefined && item.seriesOrder !== null ? item.seriesOrder : '';
  seriesOrderGroup.appendChild(seriesOrderInput);
  form.appendChild(seriesOrderGroup);
  
  // Rating input (only for finished items)
  let ratingInput = null;
  if (item.finishedAt) {
    const ratingGroup = createEl('div', 'form-group');
    ratingInput = createEl('input');
    ratingInput.type = 'number';
    ratingInput.name = 'rating';
    ratingInput.min = '1';
    ratingInput.max = '10';
    ratingInput.step = '0.5';
    ratingInput.placeholder = 'Rating (1-10)';
    ratingInput.value = item.finishedRating || '';
    ratingGroup.appendChild(ratingInput);
    form.appendChild(ratingGroup);
  }
  
  // Notes input
  const notesGroup = createEl('div', 'form-group');
  const notesInput = createEl('textarea');
  notesInput.name = 'notes';
  notesInput.value = item.notes || '';
  notesInput.placeholder = 'Notes (optional)';
  notesGroup.appendChild(notesInput);
  form.appendChild(notesGroup);
  
  // Actions
  const actions = createEl('div', 'form-actions');
  
  // Refresh metadata button
  const refreshBtn = createEl('button', 'btn ghost', { text: 'Refresh Metadata' });
  refreshBtn.type = 'button';
  actions.appendChild(refreshBtn);
  
  // Merge series button
  const mergeSeriesBtn = createEl('button', 'btn warning', { text: 'Merge Series' });
  mergeSeriesBtn.type = 'button';
  mergeSeriesBtn.hidden = true;
  actions.appendChild(mergeSeriesBtn);
  
  const cancelBtn = createEl('button', 'btn secondary', { text: 'Cancel' });
  cancelBtn.type = 'button';
  actions.appendChild(cancelBtn);
  
  const submitBtn = createEl('button', 'btn primary', { text: 'Save' });
  submitBtn.type = 'submit';
  actions.appendChild(submitBtn);
  
  form.appendChild(actions);
  
  modal.appendChild(form);
  backdrop.appendChild(modal);
  
  if (modalRoot) {
    modalRoot.appendChild(backdrop);
  }
  
  const originalSeriesName = item.seriesName || '';
  
  // Helper functions
  function updateMergeSeriesButtonState() {
    const hasSeriesName = Boolean((seriesNameInput.value || '').trim());
    const isBook = typeSelect.value === 'books';
    mergeSeriesBtn.hidden = !hasSeriesName || isBook;
    mergeSeriesBtn.disabled = mergeSeriesBtn.hidden;
  }
  
  function applyTypeUiState(selectedType) {
    const placeholder = creatorPlaceholderMap[selectedType] || 'Creator';
    creatorInput.placeholder = placeholder;
    const isBook = selectedType === 'books';
    seriesNameGroup.hidden = isBook;
    seriesOrderGroup.hidden = isBook;
    updateMergeSeriesButtonState();
  }
  
  // Initialize UI state
  applyTypeUiState(listType);
  
  // Event listeners
  typeSelect.addEventListener('change', () => {
    applyTypeUiState(typeSelect.value);
  });
  
  seriesNameInput.addEventListener('input', () => {
    updateMergeSeriesButtonState();
  });
  
  refreshBtn.addEventListener('click', async () => {
    if (typeof onRefreshMetadata === 'function') {
      const lookupTitle = (titleInput.value || '').trim();
      const lookupYear = sanitizeYear((yearInput.value || '').trim());
      refreshBtn.disabled = true;
      refreshBtn.textContent = 'Refreshing...';
      try {
        await onRefreshMetadata(listType, id, item, {
          title: lookupTitle,
          year: lookupYear,
          button: refreshBtn,
        });
      } finally {
        refreshBtn.disabled = false;
        refreshBtn.textContent = 'Refresh Metadata';
      }
    }
  });
  
  mergeSeriesBtn.addEventListener('click', async (event) => {
    event.preventDefault();
    const targetSeriesName = (seriesNameInput.value || '').trim();
    if (!targetSeriesName) {
      alert('Enter a series name before merging.');
      return;
    }
    if (typeof onMergeSeries === 'function') {
      const previousLabel = mergeSeriesBtn.textContent;
      mergeSeriesBtn.disabled = true;
      mergeSeriesBtn.textContent = 'Merging...';
      try {
        await onMergeSeries(targetSeriesName, originalSeriesName);
      } finally {
        mergeSeriesBtn.disabled = false;
        mergeSeriesBtn.textContent = previousLabel;
        updateMergeSeriesButtonState();
      }
    }
  });
  
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    
    const newTitle = (titleInput.value || '').trim();
    if (!newTitle) {
      alert('Title is required');
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
    
    if (ratingInput) {
      const newRating = normalizeFinishRating(ratingInput.value);
      if (newRating !== null) {
        payload.finishedRating = newRating;
      }
    }
    
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
      if (targetListType === 'tvShows') {
        ensureTvSeriesDefaults(targetListType, payload);
      }
    }
    
    setButtonBusy(submitBtn, true);
    submitBtn.textContent = 'Saving...';
    
    try {
      const currentUser = getCurrentUser();
      if (!currentUser) {
        alert('Not logged in');
        return;
      }
      
      if (targetListType === listType) {
        if (item.finishedAt) {
          const db = getFirebaseDatabase();
          const finishedRef = ref(db, `users/${currentUser.uid}/finished/${listType}/${id}`);
          await update(finishedRef, payload);
          
          if (finishedCaches[listType] && finishedCaches[listType][id]) {
            Object.assign(finishedCaches[listType][id], payload);
          }
        } else {
          await updateItem(listType, id, payload);
          if (listCaches[listType] && listCaches[listType][id]) {
            Object.assign(listCaches[listType][id], payload);
          }
        }
        Object.assign(item, payload);
      } else {
        // Type change: delete from old list, add to new list
        const db = getFirebaseDatabase();
        if (item.finishedAt) {
          const oldRef = ref(db, `users/${currentUser.uid}/finished/${listType}/${id}`);
          await update(oldRef, null);
          if (finishedCaches[listType] && finishedCaches[listType][id]) {
            delete finishedCaches[listType][id];
          }
        } else {
          const oldRef = ref(db, `users/${currentUser.uid}/lists/${listType}/${id}`);
          await update(oldRef, null);
          if (listCaches[listType] && listCaches[listType][id]) {
            delete listCaches[listType][id];
          }
        }
        
        // Add to new list preserving finished state
        const newItemData = { ...item, ...payload };
        delete newItemData.id;
        
        if (item.finishedAt) {
          const newRef = ref(db, `users/${currentUser.uid}/finished/${targetListType}`);
          const { push } = await import('https://www.gstatic.com/firebasejs/9.22.0/firebase-database.js');
          await push(newRef, newItemData);
        } else {
          await addItem(targetListType, newItemData);
        }
      }
      
      // Custom submit handler if provided
      if (typeof onSubmit === 'function') {
        await onSubmit(form, targetListType, id, item);
      }
    } catch (err) {
      console.error('Edit modal save failed', err);
      alert('Failed to save changes. Please try again.');
    } finally {
      setButtonBusy(submitBtn, false);
      submitBtn.textContent = 'Save';
    }
    
    closeEditModal();
  });
  
  cancelBtn.addEventListener('click', () => closeEditModal());
  
  backdrop.addEventListener('click', (ev) => {
    if (ev.target === backdrop) {
      closeEditModal();
    }
  });
  
  const keyHandler = (ev) => {
    if (ev.key === 'Escape') {
      closeEditModal();
    }
  };
  document.addEventListener('keydown', keyHandler);
  
  activeEditModal = {
    backdrop,
    modal,
    form,
    keyHandler,
  };
  
  titleInput.focus();
  
  return activeEditModal;
}

export function showConfirmModal(options = {}) {
  const { title = 'Confirm', message = 'Are you sure?', confirmText = 'Confirm', cancelText = 'Cancel', onConfirm, onCancel } = options;
  
  return new Promise((resolve) => {
    const backdrop = createModalBackdrop('confirm-modal-backdrop');
    const modal = createModal('confirm-modal');
    
    if (title) {
      modal.appendChild(createEl('h3', 'confirm-title', { text: title }));
    }
    
    if (message) {
      modal.appendChild(createEl('p', 'confirm-message', { text: message }));
    }
    
    const actions = createEl('div', 'confirm-actions');
    
    const confirmBtn = createEl('button', 'btn primary', { text: confirmText });
    confirmBtn.addEventListener('click', () => {
      backdrop.remove();
      if (typeof onConfirm === 'function') onConfirm();
      resolve(true);
    });
    
    const cancelBtn = createEl('button', 'btn secondary', { text: cancelText });
    cancelBtn.addEventListener('click', () => {
      backdrop.remove();
      if (typeof onCancel === 'function') onCancel();
      resolve(false);
    });
    
    actions.appendChild(confirmBtn);
    actions.appendChild(cancelBtn);
    modal.appendChild(actions);
    
    backdrop.appendChild(modal);
    
    if (modalRoot) {
      modalRoot.appendChild(backdrop);
    }
    
    backdrop.addEventListener('click', (ev) => {
      if (ev.target === backdrop) {
        backdrop.remove();
        resolve(false);
      }
    });
  });
}

function isDuplicateCandidate(listType, candidateItem) {
  const cache = listCaches[listType];
  const finishedCache = finishedCaches[listType];
  
  const candidateSig = buildComparisonSignature(candidateItem);
  if (!candidateSig) return false;

  if (cache && Object.values(cache).some(existing => signaturesMatch(candidateSig, buildComparisonSignature(existing)))) {
    return true;
  }
  if (finishedCache && Object.values(finishedCache).some(existing => signaturesMatch(candidateSig, buildComparisonSignature(existing)))) {
    return true;
  }

  return false;
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

async function promptAddMissingCollectionParts(listType, collInfo, currentItem, keywordContext = null) {
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
    listContainer.style.maxHeight = '50vh';
    listContainer.style.overflowY = 'auto';

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
      keywordEntries.slice(0, 15).forEach(entry => {
        const row = document.createElement('label');
        row.style.display = 'flex';
        row.style.alignItems = 'flex-start';
        row.style.gap = '.5rem';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = true;
        cb.dataset.source = 'keyword';
        cb.dataset.mediaType = entry.mediaType === 'tv' ? 'tv' : 'movie';
        cb.dataset.title = entry.title || '';
        cb.dataset.year = entry.year || '';
        cb.dataset.tmdbId = entry.id || '';
        row.appendChild(cb);
        const text = document.createElement('span');
        const typeLabel = entry.mediaType === 'tv' ? ' [TV]' : '';
        text.textContent = `${entry.title}${entry.year ? ` (${entry.year})` : ''}${typeLabel}`;
        row.appendChild(text);
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

      for (const cb of selections) {
        if (cb.dataset.source === 'keyword') {
          // Add keyword entry with full metadata
          const targetListType = cb.dataset.mediaType === 'tv' ? 'tvShows' : 'movies';
          const payload = {
            title: cb.dataset.title,
            year: sanitizeYear(cb.dataset.year),
            seriesName: franchiseLabel || '',
            createdAt: Date.now(),
          };
          if (isDuplicateCandidate(targetListType, payload)) continue;
          const trailerUrl = buildTrailerUrl(payload.title, payload.year);
          if (trailerUrl) payload.trailerUrl = trailerUrl;
          
          // Fetch full metadata for keyword entries
          if (TMDB_API_KEY && cb.dataset.tmdbId) {
            try {
              const metadata = await fetchTmdbMetadata(targetListType, {
                title: cb.dataset.title,
                year: cb.dataset.year,
                tmdbId: Number(cb.dataset.tmdbId) || null,
              });
              if (metadata) {
                const updates = deriveMetadataAssignments(metadata, payload, {
                  overwrite: true,
                  fallbackTitle: cb.dataset.title,
                  fallbackYear: cb.dataset.year,
                  listType: targetListType,
                });
                Object.assign(payload, updates);
              }
            } catch (e) {
              console.warn('Failed to fetch metadata for keyword entry', cb.dataset.title, e);
            }
          }
          
          try {
            await addItem(targetListType, payload);
          } catch (e) {
            console.warn('Failed to add keyword entry', cb.dataset.title, e);
          }
          continue;
        }
        
        // Add collection part with full metadata
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
            createdAt: Date.now(),
          };
          if (isDuplicateCandidate(listType, payload)) continue;
          const trailerUrl = buildTrailerUrl(part.title, part.year);
          if (trailerUrl) payload.trailerUrl = trailerUrl;
          
          // Fetch full metadata for collection parts
          if (TMDB_API_KEY) {
            try {
              const metadata = await fetchTmdbMetadata(listType, {
                title: part.title,
                year: part.year,
                tmdbId: part.tmdbId,
                imdbId: part.imdbId,
              });
              if (metadata) {
                const updates = deriveMetadataAssignments(metadata, payload, {
                  overwrite: true,
                  fallbackTitle: part.title,
                  fallbackYear: part.year,
                  listType,
                });
                Object.assign(payload, updates);
              }
            } catch (e) {
              console.warn('Failed to fetch metadata for collection part', part.title, e);
            }
          }
          
          await addItem(listType, payload);
          if (existingKeys) {
            existingKeys.add(normalizeTitleKey(part.title));
          }
        } catch (e) {
          console.warn('Failed to auto-add part', part.title, e);
        }
      }

      cleanup();
    });

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn secondary';
    cancelBtn.textContent = 'Skip';
    cancelBtn.addEventListener('click', () => cleanup());

    actions.appendChild(addBtn);
    actions.appendChild(cancelBtn);
    modal.appendChild(actions);
    backdrop.appendChild(modal);
    modalRoot.appendChild(backdrop);
  });
}
