import { 
  WHEEL_SPIN_AUDIO_SRC, 
  WHEEL_AUDIO_MUTE_KEY,
  PRIMARY_LIST_TYPES,
  MEDIA_TYPE_LABELS
} from './config.js';
import { safeStorageGet, safeStorageSet } from './utils.js';
import { modalRoot, wheelModalTrigger, wheelModalTemplate } from './dom.js';

let wheelSpinAudio = null;
let wheelAudioMuted = safeStorageGet(WHEEL_AUDIO_MUTE_KEY) === '1';
let wheelSourceSelect = null;
let wheelSpinnerEl = null;
let wheelResultEl = null;
let wheelModalState = null;
let spinTimeouts = [];

export function getWheelSpinAudio() {
  if (typeof Audio === 'undefined') return null;
  if (!wheelSpinAudio) {
    try {
      wheelSpinAudio = new Audio(WHEEL_SPIN_AUDIO_SRC);
      wheelSpinAudio.preload = 'auto';
      wheelSpinAudio.loop = true;
      wheelSpinAudio.volume = 0.65;
    } catch (err) {
      console.warn('Wheel audio initialization failed', err);
      wheelSpinAudio = null;
    }
  }
  return wheelSpinAudio;
}

export function startWheelSpinAudio() {
  if (wheelAudioMuted) return;
  const audio = getWheelSpinAudio();
  if (!audio) return;
  try {
    audio.currentTime = 0;
    const playback = audio.play();
    if (playback && typeof playback.catch === 'function') {
      playback.catch(err => {
        console.warn('Wheel audio playback blocked', err);
      });
    }
  } catch (err) {
    console.warn('Wheel audio play failed', err);
  }
}

export function stopWheelSpinAudio() {
  if (!wheelSpinAudio) return;
  try {
    wheelSpinAudio.pause();
    wheelSpinAudio.currentTime = 0;
  } catch (err) {
    console.warn('Wheel audio stop failed', err);
  }
}

export function updateWheelMuteButtonState(button) {
  if (!button) return;
  const label = wheelAudioMuted ? 'Unmute Sound' : 'Mute Sound';
  button.textContent = label;
  button.setAttribute('aria-pressed', wheelAudioMuted ? 'true' : 'false');
}

export function toggleWheelAudioMute(button) {
  wheelAudioMuted = !wheelAudioMuted;
  safeStorageSet(WHEEL_AUDIO_MUTE_KEY, wheelAudioMuted ? '1' : '0');
  if (wheelAudioMuted) {
    stopWheelSpinAudio();
  }
  updateWheelMuteButtonState(button);
}

export function isWheelAudioMuted() {
  return wheelAudioMuted;
}

export function getWheelSpinnerEl() {
  return wheelSpinnerEl;
}

export function getWheelResultEl() {
  return wheelResultEl;
}

export function getWheelSourceSelect() {
  return wheelSourceSelect;
}

export function clearWheelAnimation() {
  spinTimeouts.forEach(id => clearTimeout(id));
  spinTimeouts = [];
  stopWheelSpinAudio();
  if (!wheelSpinnerEl) return;
  wheelSpinnerEl.classList.remove('spinning');
  wheelSpinnerEl.innerHTML = '';
}

export function addSpinTimeout(id) {
  spinTimeouts.push(id);
}

export function setupWheelModal(callbacks = {}) {
  if (!wheelModalTrigger || !wheelModalTemplate || !modalRoot) return;
  wheelModalTrigger.addEventListener('click', () => openWheelModal(callbacks));
}

export function openWheelModal(callbacks = {}) {
  const { onSpin, closeAddModal } = callbacks;
  
  if (!wheelModalTemplate || !modalRoot) return;
  if (typeof closeAddModal === 'function') closeAddModal();
  closeWheelModal();
  
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop wheel-modal-backdrop';
  const modal = document.createElement('div');
  modal.className = 'modal wheel-modal';
  const fragment = wheelModalTemplate.content.cloneNode(true);
  modal.appendChild(fragment);
  backdrop.appendChild(modal);
  modalRoot.innerHTML = '';
  modalRoot.appendChild(backdrop);

  const sourceSelect = modal.querySelector('[data-wheel-source]');
  const spinButton = modal.querySelector('[data-wheel-spin]');
  const muteButton = modal.querySelector('[data-wheel-mute]');
  const spinnerEl = modal.querySelector('[data-wheel-spinner]');
  const resultEl = modal.querySelector('[data-wheel-result]');
  const closeBtn = modal.querySelector('[data-wheel-close]');

  wheelSourceSelect = sourceSelect || null;
  wheelSpinnerEl = spinnerEl || null;
  wheelResultEl = resultEl || null;
  
  if (wheelSpinnerEl) {
    wheelSpinnerEl.classList.add('hidden');
    wheelSpinnerEl.classList.remove('spinning');
    wheelSpinnerEl.innerHTML = '';
  }
  if (wheelResultEl) {
    wheelResultEl.innerHTML = '';
  }

  const spinHandler = () => {
    if (!wheelSourceSelect) return;
    if (typeof onSpin === 'function') {
      onSpin(wheelSourceSelect.value);
    }
  };
  if (spinButton) {
    spinButton.addEventListener('click', spinHandler);
  }

  let muteHandler = null;
  if (muteButton) {
    updateWheelMuteButtonState(muteButton);
    muteHandler = () => toggleWheelAudioMute(muteButton);
    muteButton.addEventListener('click', muteHandler);
  }

  const closeHandler = () => closeWheelModal();
  if (closeBtn) {
    closeBtn.addEventListener('click', closeHandler);
  }

  const backdropHandler = (event) => {
    if (event.target === backdrop) {
      closeWheelModal();
    }
  };
  backdrop.addEventListener('click', backdropHandler);

  const keyHandler = (event) => {
    if (event.key === 'Escape') {
      closeWheelModal();
    }
  };
  document.addEventListener('keydown', keyHandler);

  wheelModalState = {
    backdrop,
    modal,
    spinButton,
    spinHandler,
    closeBtn,
    closeHandler,
    muteButton,
    muteHandler,
    backdropHandler,
    keyHandler,
  };
}

export function closeWheelModal() {
  if (wheelModalState) {
    if (wheelModalState.spinButton && wheelModalState.spinHandler) {
      wheelModalState.spinButton.removeEventListener('click', wheelModalState.spinHandler);
    }
    if (wheelModalState.closeBtn && wheelModalState.closeHandler) {
      wheelModalState.closeBtn.removeEventListener('click', wheelModalState.closeHandler);
    }
    if (wheelModalState.muteButton && wheelModalState.muteHandler) {
      wheelModalState.muteButton.removeEventListener('click', wheelModalState.muteHandler);
    }
    if (wheelModalState.backdrop && wheelModalState.backdropHandler) {
      wheelModalState.backdrop.removeEventListener('click', wheelModalState.backdropHandler);
    }
    if (wheelModalState.keyHandler) {
      document.removeEventListener('keydown', wheelModalState.keyHandler);
    }
    if (wheelModalState.backdrop && wheelModalState.backdrop.parentNode) {
      wheelModalState.backdrop.parentNode.removeChild(wheelModalState.backdrop);
    }
  }
  clearWheelAnimation();
  wheelModalState = null;
  wheelSourceSelect = null;
  wheelSpinnerEl = null;
  wheelResultEl = null;
}

export function annotateWheelItem(item, listType, fallbackId) {
  if (!item) return null;
  const baseId = fallbackId || item.__id || item.id;
  if (!baseId) return null;
  return {
    ...item,
    __id: baseId,
    __wheelListType: listType,
    __wheelSourceId: baseId,
  };
}

export function createWheelCompositeId(listType, itemId) {
  return `${listType}:${itemId}`;
}

export function mapWheelCandidateMap(candidateMap, listType, { compositeKeys = false } = {}) {
  const mapped = new Map();
  candidateMap.forEach((item, id) => {
    const annotated = annotateWheelItem(item, listType, id);
    if (!annotated) return;
    const key = compositeKeys ? createWheelCompositeId(listType, id) : id;
    if (compositeKeys) {
      mapped.set(key, { ...annotated, __wheelCompositeId: key });
    } else {
      mapped.set(key, annotated);
    }
  });
  return mapped;
}

export function renderWheelResult(item, listType, buildCardFn) {
  if (!wheelResultEl) return;
  if (!item) {
    wheelResultEl.textContent = '';
    return;
  }

  const actionVerb = listType === 'books' ? 'read' : 'watch';
  wheelResultEl.innerHTML = '';

  const heading = document.createElement('div');
  heading.className = 'wheel-result-heading';
  heading.textContent = `You should ${actionVerb} next:`;
  wheelResultEl.appendChild(heading);

  const entryId = item.__id || item.id || '';
  const cardId = entryId || `wheel-${Date.now()}`;
  
  let cardNode = null;
  if (typeof buildCardFn === 'function') {
    cardNode = buildCardFn(listType, cardId, item);
  } else {
    cardNode = document.createElement('div');
    cardNode.className = 'wheel-result-card';
    cardNode.textContent = item.title || 'Unknown';
  }

  if (cardNode) {
    cardNode.classList.add('wheel-result-card');
    wheelResultEl.appendChild(cardNode);
  }
}
