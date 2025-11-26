import { createModalElements, bindModalDismissHandlers, removeModalDismissHandlers } from './modal-helpers.js';

export const wheelUIState = { sourceSelect: null, spinnerEl: null, resultEl: null };

let wheelModalController = null;

export function initWheelModal({
  modalRoot,
  spinWheel,
  clearWheelAnimation,
  closeAddModal,
}) {
  if (wheelModalController) {
    return wheelModalController;
  }
  const trigger = document.getElementById('open-wheel-modal');
  const template = document.getElementById('wheel-modal-template');
  if (!trigger || !template || !modalRoot) {
    console.warn('Wheel modal is missing required DOM references.');
    return null;
  }
  wheelModalController = createWheelModalManager({
    trigger,
    modalRoot,
    template,
    spinWheel,
    clearWheelAnimation,
    closeAddModal,
    uiState: wheelUIState,
  });
  wheelModalController.setupWheelModal();
  return wheelModalController;
}

export function openWheelModal() {
  if (!wheelModalController) return;
  wheelModalController.openWheelModal();
}

export function closeWheelModal() {
  if (!wheelModalController) return;
  wheelModalController.closeWheelModal();
}

export function createWheelModalManager({
  trigger,
  modalRoot,
  template,
  spinWheel,
  clearWheelAnimation,
  closeAddModal,
  uiState = { sourceSelect: null, spinnerEl: null, resultEl: null },
}) {
  let wheelModalState = null;

  function setupWheelModal() {
    if (!trigger || !template || !modalRoot) return;
    trigger.addEventListener('click', () => openWheelModal());
  }

  function openWheelModal() {
    if (!template || !modalRoot) return;
    if (typeof closeAddModal === 'function') {
      closeAddModal();
    }
    closeWheelModal();
    const { backdrop, modal } = createModalElements({
      backdropClasses: 'modal-backdrop wheel-modal-backdrop',
      modalClasses: 'modal wheel-modal',
    });
    const fragment = template.content.cloneNode(true);
    modal.appendChild(fragment);
    modalRoot.innerHTML = '';
    modalRoot.appendChild(backdrop);

    const modalElements = getWheelModalElements(modal);
    resetWheelModalUI(modalElements);

    const dismissHandlers = bindModalDismissHandlers(backdrop, closeWheelModal);

    wheelModalState = {
      backdrop,
      modal,
      dismissHandlers,
      ...modalElements,
    };

    bindWheelModalControls(wheelModalState);
  }

  function closeWheelModal() {
    if (wheelModalState) {
      unbindWheelModalControls(wheelModalState);
      removeModalDismissHandlers(wheelModalState);
      if (wheelModalState.backdrop && wheelModalState.backdrop.parentNode) {
        wheelModalState.backdrop.parentNode.removeChild(wheelModalState.backdrop);
      }
    }
    if (typeof clearWheelAnimation === 'function') {
      clearWheelAnimation();
    }
    wheelModalState = null;
    uiState.sourceSelect = null;
    uiState.spinnerEl = null;
    uiState.resultEl = null;
  }

  function getWheelModalElements(modal) {
    if (!modal) {
      return {
        sourceSelect: null,
        spinButton: null,
        spinnerEl: null,
        resultEl: null,
        closeBtn: null,
      };
    }
    const sourceSelect = modal.querySelector('[data-wheel-source]');
    const spinButton = modal.querySelector('[data-wheel-spin]');
    const spinnerEl = modal.querySelector('[data-wheel-spinner]');
    const resultEl = modal.querySelector('[data-wheel-result]');
    const closeBtn = modal.querySelector('[data-wheel-close]');
    return { sourceSelect, spinButton, spinnerEl, resultEl, closeBtn };
  }

  function resetWheelModalUI({ sourceSelect, spinnerEl, resultEl }) {
    uiState.sourceSelect = sourceSelect || null;
    uiState.spinnerEl = spinnerEl || null;
    uiState.resultEl = resultEl || null;
    if (uiState.spinnerEl) {
      uiState.spinnerEl.classList.add('hidden');
      uiState.spinnerEl.classList.remove('spinning');
      uiState.spinnerEl.innerHTML = '';
    }
    if (uiState.resultEl) {
      uiState.resultEl.innerHTML = '';
    }
  }

  function bindWheelModalControls(state) {
    if (!state) return;
    const spinHandler = () => {
      if (!uiState.sourceSelect) return;
      spinWheel(uiState.sourceSelect.value);
    };
    if (state.spinButton) {
      state.spinButton.addEventListener('click', spinHandler);
    }
    const closeHandler = () => closeWheelModal();
    if (state.closeBtn) {
      state.closeBtn.addEventListener('click', closeHandler);
    }
    state.spinHandler = spinHandler;
    state.closeHandler = closeHandler;
  }

  function unbindWheelModalControls(state) {
    if (!state) return;
    if (state.spinButton && state.spinHandler) {
      state.spinButton.removeEventListener('click', state.spinHandler);
    }
    if (state.closeBtn && state.closeHandler) {
      state.closeBtn.removeEventListener('click', state.closeHandler);
    }
    state.spinHandler = null;
    state.closeHandler = null;
  }

  return {
    setupWheelModal,
    openWheelModal,
    closeWheelModal,
  };
}
