export function createModalElements({ backdropClasses = 'modal-backdrop', modalClasses = 'modal' } = {}) {
  const backdrop = document.createElement('div');
  backdrop.className = backdropClasses;
  const modal = document.createElement('div');
  modal.className = modalClasses;
  backdrop.appendChild(modal);
  return { backdrop, modal };
}

export function bindModalDismissHandlers(backdrop, closeFn) {
  const backdropHandler = (event) => {
    if (event.target === backdrop) {
      closeFn();
    }
  };
  backdrop.addEventListener('click', backdropHandler);
  const keyHandler = (event) => {
    if (event.key === 'Escape') {
      closeFn();
    }
  };
  document.addEventListener('keydown', keyHandler);
  return { backdropHandler, keyHandler };
}

export function removeModalDismissHandlers(target) {
  if (!target || !target.dismissHandlers) return;
  const { backdropHandler, keyHandler } = target.dismissHandlers;
  if (target.backdrop && backdropHandler) {
    target.backdrop.removeEventListener('click', backdropHandler);
  }
  if (keyHandler) {
    document.removeEventListener('keydown', keyHandler);
  }
  target.dismissHandlers = null;
}
