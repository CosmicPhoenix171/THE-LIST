import { createEl } from './utils.js';
import { modalRoot } from './dom.js';

let activeAddModal = null;
let activeEditModal = null;

export function getActiveAddModal() {
  return activeAddModal;
}

export function getActiveEditModal() {
  return activeEditModal;
}

export function closeAddModal() {
  if (!activeAddModal) return;
  
  if (activeAddModal.backdrop && activeAddModal.backdrop.parentNode) {
    activeAddModal.backdrop.parentNode.removeChild(activeAddModal.backdrop);
  }
  
  if (activeAddModal.keyHandler) {
    document.removeEventListener('keydown', activeAddModal.keyHandler);
  }
  
  activeAddModal = null;
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

export function openAddModal(listType, callbacks = {}) {
  const { onSubmit, onClose, setupAutocomplete } = callbacks;
  
  closeAddModal();
  
  const backdrop = createModalBackdrop('add-modal-backdrop');
  const modal = createModal('add-modal');
  
  const header = createEl('div', 'modal-header');
  header.appendChild(createEl('h2', '', { text: `Add to ${listType}` }));
  modal.appendChild(header);
  
  const form = createEl('form', 'add-form');
  form.dataset.listType = listType;
  
  const titleGroup = createEl('div', 'form-group input-suggest');
  const titleInput = createEl('input');
  titleInput.type = 'text';
  titleInput.name = 'title';
  titleInput.placeholder = 'Title';
  titleInput.required = true;
  titleGroup.appendChild(titleInput);
  
  const suggestionsContainer = createEl('div', 'title-suggestions');
  suggestionsContainer.dataset.role = 'title-suggestions';
  titleGroup.appendChild(suggestionsContainer);
  form.appendChild(titleGroup);
  
  const yearGroup = createEl('div', 'form-group');
  const yearInput = createEl('input');
  yearInput.type = 'text';
  yearInput.name = 'year';
  yearInput.placeholder = 'Year';
  yearGroup.appendChild(yearInput);
  form.appendChild(yearGroup);
  
  const notesGroup = createEl('div', 'form-group');
  const notesInput = createEl('textarea');
  notesInput.name = 'notes';
  notesInput.placeholder = 'Notes (optional)';
  notesGroup.appendChild(notesInput);
  form.appendChild(notesGroup);
  
  const actions = createEl('div', 'form-actions');
  const submitBtn = createEl('button', 'btn primary', { text: 'Add' });
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
      await onSubmit(form, listType);
    }
    closeAddModal();
  });
  
  cancelBtn.addEventListener('click', () => closeAddModal());
  
  backdrop.addEventListener('click', (ev) => {
    if (ev.target === backdrop) {
      closeAddModal();
    }
  });
  
  const keyHandler = (ev) => {
    if (ev.key === 'Escape') {
      closeAddModal();
    }
  };
  document.addEventListener('keydown', keyHandler);
  
  if (typeof setupAutocomplete === 'function') {
    setupAutocomplete(form, listType);
  }
  
  activeAddModal = {
    backdrop,
    modal,
    form,
    keyHandler,
  };
  
  titleInput.focus();
  
  return activeAddModal;
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
