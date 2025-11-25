const nativeAlert = typeof globalThis !== 'undefined' && typeof globalThis.alert === 'function'
  ? globalThis.alert.bind(globalThis)
  : null;

let overlayEl = null;
let overlayKeyHandler = null;
let overlayVisible = false;
let notificationCenterEl = null;

function getNotificationCenter() {
  if (typeof document === 'undefined') {
    return null;
  }
  if (notificationCenterEl && document.body.contains(notificationCenterEl)) {
    return notificationCenterEl;
  }
  notificationCenterEl = document.getElementById('notification-center');
  return notificationCenterEl;
}

function normalizeMessage(input) {
  if (input === null || input === undefined) {
    return '';
  }
  if (typeof input === 'string') {
    return input;
  }
  if (input instanceof Error) {
    return input.message || String(input);
  }
  if (Array.isArray(input)) {
    return input.map(normalizeMessage).join('\n');
  }
  if (typeof input === 'object') {
    if (typeof input.message === 'string') {
      return input.message;
    }
    try {
      return JSON.stringify(input, null, 2);
    } catch (_) {
      return String(input);
    }
  }
  return String(input);
}

function ensureOverlay() {
  if (typeof document === 'undefined') {
    return null;
  }
  if (overlayEl && document.body.contains(overlayEl)) {
    return overlayEl;
  }
  overlayEl = document.createElement('div');
  overlayEl.id = 'app-alert-overlay';
  overlayEl.style.position = 'fixed';
  overlayEl.style.inset = '0';
  overlayEl.style.display = 'flex';
  overlayEl.style.alignItems = 'center';
  overlayEl.style.justifyContent = 'center';
  overlayEl.style.padding = '2rem';
  overlayEl.style.background = 'rgba(2, 6, 23, 0.65)';
  overlayEl.style.backdropFilter = 'blur(3px)';
  overlayEl.style.zIndex = '9999';
  overlayEl.style.opacity = '0';
  overlayEl.style.pointerEvents = 'none';
  overlayEl.style.transition = 'opacity 200ms ease';
  overlayEl.addEventListener('click', (event) => {
    if (event.target === overlayEl) {
      hideOverlay();
    }
  });
  document.body.appendChild(overlayEl);
  overlayKeyHandler = (event) => {
    if (event.key === 'Escape' && overlayVisible) {
      hideOverlay();
    }
  };
  document.addEventListener('keydown', overlayKeyHandler);
  return overlayEl;
}

function hideOverlay() {
  if (!overlayEl) return;
  overlayVisible = false;
  overlayEl.style.opacity = '0';
  overlayEl.style.pointerEvents = 'none';
  overlayEl.innerHTML = '';
}

function buildAlertCard({ title, message, dismissText }) {
  const card = document.createElement('div');
  card.style.maxWidth = 'min(420px, 90vw)';
  card.style.width = '100%';
  card.style.background = 'var(--card-bg, rgba(10,16,28,0.95))';
  card.style.border = '1px solid rgba(255,255,255,0.08)';
  card.style.borderRadius = '18px';
  card.style.padding = '1.5rem';
  card.style.boxShadow = '0 25px 70px rgba(0,0,0,0.45)';
  card.style.color = 'var(--text, #f5f7fb)';
  card.style.display = 'flex';
  card.style.flexDirection = 'column';
  card.style.gap = '1rem';
  if (title) {
    const heading = document.createElement('h3');
    heading.textContent = title;
    heading.style.margin = '0';
    heading.style.fontSize = '1.25rem';
    heading.style.fontWeight = '600';
    card.appendChild(heading);
  }
  const body = document.createElement('p');
  body.textContent = message;
  body.style.margin = '0';
  body.style.whiteSpace = 'pre-wrap';
  body.style.lineHeight = '1.4';
  card.appendChild(body);
  const actions = document.createElement('div');
  actions.style.display = 'flex';
  actions.style.justifyContent = 'flex-end';
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = dismissText;
  button.style.padding = '0.65rem 1.4rem';
  button.style.borderRadius = '999px';
  button.style.border = 'none';
  button.style.cursor = 'pointer';
  button.style.background = 'var(--accent, #70e1c4)';
  button.style.color = '#0d1117';
  button.style.fontWeight = '600';
  button.addEventListener('click', hideOverlay);
  actions.appendChild(button);
  card.appendChild(actions);
  return card;
}

export function showAlert(message, options = {}) {
  const normalized = normalizeMessage(message);
  const { title = '', dismissText = 'OK', preferNative = false } = options;
  if (preferNative || typeof document === 'undefined' || !document.body) {
    if (nativeAlert) {
      nativeAlert(title ? `${title}\n\n${normalized}` : normalized);
    } else {
      console.warn('[alert]', title || normalized);
    }
    return;
  }
  const overlay = ensureOverlay();
  if (!overlay) {
    if (nativeAlert) nativeAlert(normalized);
    return;
  }
  overlayVisible = true;
  overlay.innerHTML = '';
  overlay.appendChild(buildAlertCard({ title, message: normalized, dismissText }));
  requestAnimationFrame(() => {
    overlay.style.opacity = '1';
    overlay.style.pointerEvents = 'auto';
  });
}

export function pushNotification({ title, message, duration = 9000 } = {}) {
  const hasContent = Boolean(title) || Boolean(message);
  if (!hasContent) return;
  const center = getNotificationCenter();
  if (!center) {
    const fallbackText = [title, message].filter(Boolean).join('\n');
    if (fallbackText) {
      showAlert(fallbackText);
    }
    return;
  }
  const card = document.createElement('div');
  card.className = 'notification-card';
  if (title) {
    const titleEl = document.createElement('div');
    titleEl.className = 'notification-title';
    titleEl.textContent = title;
    card.appendChild(titleEl);
  }
  if (message) {
    const bodyEl = document.createElement('div');
    bodyEl.className = 'notification-body';
    bodyEl.textContent = message;
    card.appendChild(bodyEl);
  }
  const footer = document.createElement('div');
  footer.className = 'notification-footer';
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'notification-close';
  closeBtn.textContent = 'Dismiss';
  footer.appendChild(closeBtn);
  card.appendChild(footer);

  center.appendChild(card);
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(() => card.classList.add('visible'));
  } else {
    card.classList.add('visible');
  }

  let dismissed = false;
  let timerId = null;

  const dismiss = () => {
    if (dismissed) return;
    dismissed = true;
    card.classList.remove('visible');
    setTimeout(() => {
      if (card.parentNode) {
        card.parentNode.removeChild(card);
      }
    }, 240);
  };

  timerId = setTimeout(dismiss, Math.max(4000, duration));

  card.addEventListener('mouseenter', () => {
    if (!timerId) return;
    clearTimeout(timerId);
    timerId = null;
  });

  card.addEventListener('mouseleave', () => {
    if (dismissed || timerId) return;
    timerId = setTimeout(dismiss, 2500);
  });

  closeBtn.addEventListener('click', dismiss);
}

export default showAlert;
