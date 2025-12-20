import { createEl, setButtonBusy, sanitizeYear, sanitizeSeriesOrder } from './utils.js';
import { modalRoot } from './dom.js';
import { ADD_MODAL_LIST_TYPES, MEDIA_TYPE_LABELS } from './config.js';
import { 
  setupFormAutocomplete, 
  setupActorAutocomplete, 
  teardownFormAutocomplete,
  hideTitleSuggestions 
} from './autocomplete.js';
import { getCurrentUser, showFinishedOnly, setShowFinishedOnly } from './state.js';

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
  const { onSubmit, afterSubmit } = callbacks;
  
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
    const item = {
      title,
      createdAt: Date.now(),
    };
    if (notes) item.notes = notes;
    if (year) item.year = year;
    
    if (listType === 'books') {
      if (creatorValue) item.author = creatorValue;
    } else {
      if (creatorValue) item.director = creatorValue;
      if (seriesNameValue) item.seriesName = seriesNameValue;
      if (seriesOrder !== null) item.seriesOrder = seriesOrder;
    }

    // Use callback to add item
    if (typeof onSubmit === 'function') {
      await onSubmit(listType, item, form);
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
  const { onSubmit, onClose, setupAutocomplete } = callbacks;
  
  closeEditModal();
  
  const backdrop = createModalBackdrop('edit-modal-backdrop');
  const modal = createModal('edit-modal');
  
  const header = createEl('div', 'modal-header');
  header.appendChild(createEl('h2', '', { text: 'Edit Item' }));
  modal.appendChild(header);
  
  const form = createEl('form', 'edit-form');
  form.dataset.listType = listType;
  form.dataset.itemId = id;
  
  const titleGroup = createEl('div', 'form-group');
  const titleInput = createEl('input');
  titleInput.type = 'text';
  titleInput.name = 'title';
  titleInput.value = item.title || '';
  titleInput.placeholder = 'Title';
  titleInput.required = true;
  titleGroup.appendChild(titleInput);
  form.appendChild(titleGroup);
  
  const yearGroup = createEl('div', 'form-group');
  const yearInput = createEl('input');
  yearInput.type = 'text';
  yearInput.name = 'year';
  yearInput.value = item.year || '';
  yearInput.placeholder = 'Year';
  yearGroup.appendChild(yearInput);
  form.appendChild(yearGroup);
  
  const notesGroup = createEl('div', 'form-group');
  const notesInput = createEl('textarea');
  notesInput.name = 'notes';
  notesInput.value = item.notes || '';
  notesInput.placeholder = 'Notes (optional)';
  notesGroup.appendChild(notesInput);
  form.appendChild(notesGroup);
  
  const actions = createEl('div', 'form-actions');
  const submitBtn = createEl('button', 'btn primary', { text: 'Save' });
  submitBtn.type = 'submit';
  const cancelBtn = createEl('button', 'btn secondary', { text: 'Cancel' });
  cancelBtn.type = 'button';
  actions.appendChild(submitBtn);
  actions.appendChild(cancelBtn);
  form.appendChild(actions);
  
  modal.appendChild(form);
  backdrop.appendChild(modal);
  
  if (modalRoot) {
    modalRoot.appendChild(backdrop);
  }
  
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    if (typeof onSubmit === 'function') {
      await onSubmit(form, listType, id, item);
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
