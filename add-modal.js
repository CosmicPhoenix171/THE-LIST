import { createModalElements, bindModalDismissHandlers, removeModalDismissHandlers } from './modal-helpers.js';

export function createAddModalManager({
  trigger,
  modalRoot,
  primaryListTypes,
  mediaTypeLabels,
  addFormTemplateMap,
  setupFormAutocomplete,
  teardownFormAutocomplete,
  addItemFromForm,
  closeWheelModal,
}) {
  let activeAddModal = null;

  function setupAddModal() {
    if (!trigger || !modalRoot) return;
    trigger.addEventListener('click', () => openAddModal());
  }

  function openAddModal(initialType = primaryListTypes[0]) {
    if (!modalRoot) return;
    const defaultType = primaryListTypes.includes(initialType) ? initialType : primaryListTypes[0];
    closeAddModal();
    if (typeof closeWheelModal === 'function') {
      closeWheelModal();
    }

    const { backdrop, modal } = createModalElements({
      backdropClasses: 'modal-backdrop add-item-backdrop',
      modalClasses: 'modal add-item-modal',
    });
    applyAddModalAccessibility(modal);

    const header = buildAddModalHeader();
    const blurb = createAddModalBlurb();
    const { tabs, tabButtons } = buildAddModalTabs();
    const formHost = createAddModalFormHost();

    modal.append(header, blurb, tabs, formHost);
    modalRoot.innerHTML = '';
    modalRoot.appendChild(backdrop);

    const dismissHandlers = bindModalDismissHandlers(backdrop, closeAddModal);

    activeAddModal = {
      backdrop,
      modal,
      formHost,
      tabButtons,
      dismissHandlers,
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
    removeModalDismissHandlers(activeAddModal);
    if (activeAddModal.backdrop && activeAddModal.backdrop.parentNode) {
      activeAddModal.backdrop.parentNode.removeChild(activeAddModal.backdrop);
    } else if (modalRoot) {
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
    const targetType = primaryListTypes.includes(listType) ? listType : primaryListTypes[0];
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

  function applyAddModalAccessibility(modal) {
    if (!modal) return;
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-label', 'Add new item');
  }

  function buildAddModalHeader() {
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
    return header;
  }

  function createAddModalBlurb() {
    const blurb = document.createElement('p');
    blurb.className = 'small';
    blurb.textContent = 'Pick a media type to fill out its details.';
    return blurb;
  }

  function buildAddModalTabs() {
    const tabs = document.createElement('div');
    tabs.className = 'add-type-tabs';
    const tabButtons = new Map();
    primaryListTypes.forEach(type => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'add-type-tab';
      button.dataset.type = type;
      button.textContent = mediaTypeLabels[type] || type;
      button.setAttribute('aria-pressed', 'false');
      button.addEventListener('click', () => setActiveAddModalType(type));
      tabs.appendChild(button);
      tabButtons.set(type, button);
    });
    return { tabs, tabButtons };
  }

  function createAddModalFormHost() {
    const formHost = document.createElement('div');
    formHost.className = 'add-modal-form';
    return formHost;
  }

  return {
    setupAddModal,
    openAddModal,
    closeAddModal,
  };
}
