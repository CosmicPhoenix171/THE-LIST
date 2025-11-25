const nativeAlert = typeof globalThis !== 'undefined' && typeof globalThis.alert === 'function'
  ? globalThis.alert.bind(globalThis)
  : null;

let overlayEl = null;
let overlayKeyHandler = null;
let overlayVisible = false;
let notificationCenterEl = null;
let notificationBellButton = null;
let notificationDropdownEl = null;
let notificationMenuContainer = null;
let notificationListEl = null;
let notificationDotEl = null;
let notificationFormEl = null;
let notificationClearBtn = null;
let notificationEmptyStateEl = null;
let notificationMenuInitialized = false;
let notificationDropdownOpen = false;
const notificationRecords = new Map();
const notificationRecordKeyIndex = new Map();
const NOTIFICATION_STORAGE_KEY = 'appNotificationRecords';
let notificationRecordsHydrated = false;
let storageAvailableFlag = null;

function canUseLocalStorage() {
  if (storageAvailableFlag !== null) {
    return storageAvailableFlag;
  }
  try {
    if (typeof globalThis === 'undefined' || !globalThis.localStorage) {
      storageAvailableFlag = false;
      return false;
    }
    const testKey = '__notif_test__';
    globalThis.localStorage.setItem(testKey, '1');
    globalThis.localStorage.removeItem(testKey);
    storageAvailableFlag = true;
    return true;
  } catch (_) {
    storageAvailableFlag = false;
    return false;
  }
}

function buildNotificationKey(title = '', message = '') {
  const normalizedTitle = typeof title === 'string' ? title.trim().toLowerCase() : '';
  const normalizedMessage = typeof message === 'string' ? message.trim().toLowerCase() : '';
  return JSON.stringify([normalizedTitle, normalizedMessage]);
}

function persistNotificationState() {
  if (!canUseLocalStorage()) {
    return;
  }
  try {
    const payload = Array.from(notificationRecords.values()).map(({ id, title, message, createdAt }) => ({
      id,
      title,
      message,
      createdAt,
    }));
    globalThis.localStorage.setItem(NOTIFICATION_STORAGE_KEY, JSON.stringify(payload));
  } catch (error) {
    console.warn('[notifications] Failed to persist state', error);
  }
}

function loadStoredNotificationData() {
  if (!canUseLocalStorage()) {
    return [];
  }
  try {
    const raw = globalThis.localStorage.getItem(NOTIFICATION_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn('[notifications] Failed to read stored state', error);
    return [];
  }
}

function hydrateNotificationRecords() {
  if (notificationRecordsHydrated) {
    return;
  }
  notificationRecordsHydrated = true;
  const storedRecords = loadStoredNotificationData();
  storedRecords.forEach((item) => {
    if (!item || typeof item !== 'object' || !item.id) {
      return;
    }
    if (notificationRecords.has(item.id)) {
      return;
    }
    const sanitizedTitle = typeof item.title === 'string' ? item.title : '';
    const sanitizedMessage = typeof item.message === 'string' ? item.message : '';
    const key = buildNotificationKey(sanitizedTitle, sanitizedMessage);
    if (notificationRecordKeyIndex.has(key)) {
      return;
    }
    const record = {
      id: item.id,
      title: sanitizedTitle,
      message: sanitizedMessage,
      createdAt: typeof item.createdAt === 'number' ? item.createdAt : Date.now(),
      key,
      listItem: null,
      toastEl: null,
      timerId: null,
      dismissToast: null,
    };
    notificationRecords.set(record.id, record);
    notificationRecordKeyIndex.set(key, record.id);
  });
}

function createNotificationListItem(record) {
  const item = document.createElement('div');
  item.className = 'notification-dropdown-item';
  item.dataset.notificationId = record.id;
  const body = document.createElement('div');
  body.className = 'notification-item-body';
  const titleEl = document.createElement('p');
  titleEl.className = 'notification-item-title';
  titleEl.textContent = record.title || 'Notification';
  body.appendChild(titleEl);
  if (record.message) {
    const msgEl = document.createElement('p');
    msgEl.className = 'notification-item-message';
    msgEl.textContent = record.message;
    body.appendChild(msgEl);
  }
  const deleteBtn = document.createElement('button');
  deleteBtn.type = 'button';
  deleteBtn.className = 'notification-delete-btn';
  deleteBtn.setAttribute('data-notification-delete', record.id);
  deleteBtn.textContent = 'Delete';
  item.appendChild(body);
  item.appendChild(deleteBtn);
  return item;
}

function rebuildNotificationListFromRecords() {
  if (!notificationListEl) {
    return;
  }
  notificationRecords.forEach((record) => {
    if (record.listItem && record.listItem.parentNode) {
      record.listItem.parentNode.removeChild(record.listItem);
    }
    record.listItem = null;
  });
  const fragment = document.createDocumentFragment();
  const sortedRecords = Array.from(notificationRecords.values()).sort((a, b) => b.createdAt - a.createdAt);
  sortedRecords.forEach((record) => {
    const item = createNotificationListItem(record);
    record.listItem = item;
    fragment.appendChild(item);
  });
  const referenceNode = notificationEmptyStateEl && notificationListEl.contains(notificationEmptyStateEl)
    ? notificationEmptyStateEl
    : null;
  notificationListEl.insertBefore(fragment, referenceNode);
  updateNotificationIndicators();
}

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

function requestNotificationMenuInit() {
  if (notificationMenuInitialized || typeof document === 'undefined') {
    return;
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initNotificationMenu, { once: true });
    return;
  }
  initNotificationMenu();
}

function initNotificationMenu() {
  if (notificationMenuInitialized || typeof document === 'undefined') return;
  notificationBellButton = document.getElementById('notification-bell');
  notificationDropdownEl = document.getElementById('notification-dropdown');
  notificationListEl = document.getElementById('notification-dropdown-list');
  notificationFormEl = document.getElementById('notification-create-form');
  notificationClearBtn = notificationDropdownEl ? notificationDropdownEl.querySelector('[data-notification-clear]') : null;
  notificationMenuContainer = notificationBellButton ? notificationBellButton.closest('.notification-menu') : null;
  notificationDotEl = notificationBellButton ? notificationBellButton.querySelector('.notification-dot') : null;
  notificationEmptyStateEl = notificationListEl ? notificationListEl.querySelector('[data-empty-state]') : null;

  if (!notificationBellButton || !notificationDropdownEl || !notificationListEl || !notificationMenuContainer) {
    return;
  }

  notificationMenuInitialized = true;
  hydrateNotificationRecords();
  notificationBellButton.addEventListener('click', () => toggleNotificationDropdown());
  document.addEventListener('click', handleGlobalNotificationClick);
  document.addEventListener('keydown', handleNotificationMenuKeydown);
  if (notificationFormEl) {
    notificationFormEl.addEventListener('submit', handleNotificationCreate);
  }
  if (notificationListEl) {
    notificationListEl.addEventListener('click', handleNotificationListClick);
  }
  if (notificationClearBtn) {
    notificationClearBtn.addEventListener('click', clearAllNotifications);
  }
  rebuildNotificationListFromRecords();
}

function toggleNotificationDropdown(forceState) {
  if (!notificationMenuInitialized) return;
  const next = typeof forceState === 'boolean' ? forceState : !notificationDropdownOpen;
  notificationDropdownOpen = next;
  notificationMenuContainer.classList.toggle('open', next);
  notificationBellButton.setAttribute('aria-expanded', String(next));
}

function handleGlobalNotificationClick(event) {
  if (!notificationDropdownOpen || !notificationMenuContainer) return;
  if (notificationMenuContainer.contains(event.target)) return;
  toggleNotificationDropdown(false);
}

function handleNotificationMenuKeydown(event) {
  if (!notificationDropdownOpen) return;
  if (event.key === 'Escape') {
    toggleNotificationDropdown(false);
    if (notificationBellButton) {
      notificationBellButton.focus();
    }
  }
}

function handleNotificationCreate(event) {
  event.preventDefault();
  const form = event.currentTarget;
  if (!form) return;
  const titleInput = form.querySelector('input[name="title"]');
  const messageInput = form.querySelector('textarea[name="message"]');
  const title = titleInput ? titleInput.value.trim() : '';
  const message = messageInput ? messageInput.value.trim() : '';
  if (!title && !message) {
    showAlert('Enter a title or message before adding a notification.');
    return;
  }
  pushNotification({ title, message });
  form.reset();
}

function handleNotificationListClick(event) {
  const deleteBtn = event.target && event.target.closest('[data-notification-delete]');
  if (!deleteBtn) return;
  const id = deleteBtn.getAttribute('data-notification-delete');
  if (id) {
    dismissNotificationById(id);
  }
}

function dismissNotificationById(id) {
  removeNotificationRecord(id);
}

function clearAllNotifications() {
  if (!notificationRecords.size) return;
  const ids = Array.from(notificationRecords.keys());
  ids.forEach(removeNotificationRecord);
}

function upsertNotificationListItem(record) {
  if (!notificationListEl) return;
  if (record.listItem && record.listItem.parentNode) {
    record.listItem.parentNode.removeChild(record.listItem);
  }
  const item = createNotificationListItem(record);
  record.listItem = item;
  const existingItem = notificationListEl.querySelector('.notification-dropdown-item');
  if (existingItem) {
    notificationListEl.insertBefore(item, existingItem);
  } else if (notificationEmptyStateEl && notificationListEl.contains(notificationEmptyStateEl)) {
    notificationListEl.insertBefore(item, notificationEmptyStateEl);
  } else {
    notificationListEl.appendChild(item);
  }
  updateNotificationIndicators();
}

function removeNotificationRecord(id) {
  const record = notificationRecords.get(id);
  if (!record) return;
  if (typeof record.dismissToast === 'function') {
    record.dismissToast();
  }
  notificationRecords.delete(id);
  const recordKey = record.key || buildNotificationKey(record.title, record.message);
  if (recordKey) {
    notificationRecordKeyIndex.delete(recordKey);
  }
  if (record.listItem && record.listItem.parentNode) {
    record.listItem.parentNode.removeChild(record.listItem);
  }
  updateNotificationIndicators();
  persistNotificationState();
}

function updateNotificationIndicators() {
  const hasItems = notificationRecords.size > 0;
  if (notificationDotEl) {
    notificationDotEl.hidden = !hasItems;
  }
  if (notificationClearBtn) {
    notificationClearBtn.disabled = !hasItems;
  }
  if (notificationEmptyStateEl) {
    notificationEmptyStateEl.hidden = hasItems;
  }
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
  const recordTitle = title === null || title === undefined ? '' : String(title);
  const recordMessage = message === null || message === undefined ? '' : String(message);
  const hasContent = Boolean(recordTitle) || Boolean(recordMessage);
  if (!hasContent) return;
  hydrateNotificationRecords();
  const dedupeKey = buildNotificationKey(recordTitle, recordMessage);
  if (notificationRecordKeyIndex.has(dedupeKey)) {
    return;
  }
  const center = getNotificationCenter();
  if (!center) {
    const fallbackText = [title, message].filter(Boolean).join('\n');
    if (fallbackText) {
      showAlert(fallbackText);
    }
    return;
  }
  requestNotificationMenuInit();
  const id = `notif-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const record = {
    id,
    title: recordTitle,
    message: recordMessage,
    createdAt: Date.now(),
    key: dedupeKey,
    listItem: null,
    toastEl: null,
    timerId: null,
    dismissToast: null,
  };
  notificationRecords.set(id, record);
  notificationRecordKeyIndex.set(dedupeKey, id);
  upsertNotificationListItem(record);
  persistNotificationState();

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
  record.toastEl = card;
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(() => card.classList.add('visible'));
  } else {
    card.classList.add('visible');
  }

  const clearToastTimer = () => {
    if (record.timerId) {
      clearTimeout(record.timerId);
      record.timerId = null;
    }
  };

  const removeToastElement = () => {
    if (!record.toastEl) return;
    const el = record.toastEl;
    record.toastEl = null;
    el.classList.remove('visible');
    setTimeout(() => {
      if (el.parentNode) {
        el.parentNode.removeChild(el);
      }
    }, 240);
  };

  const dismissToastOnly = () => {
    clearToastTimer();
    removeToastElement();
  };

  record.dismissToast = dismissToastOnly;

  const scheduleAutoDismiss = (delay) => {
    clearToastTimer();
    record.timerId = setTimeout(() => {
      record.timerId = null;
      dismissToastOnly();
    }, delay);
  };

  scheduleAutoDismiss(Math.max(4000, duration));

  card.addEventListener('mouseenter', () => {
    clearToastTimer();
  });

  card.addEventListener('mouseleave', () => {
    if (!record.toastEl) return;
    scheduleAutoDismiss(2500);
  });

  closeBtn.addEventListener('click', dismissToastOnly);
}

requestNotificationMenuInit();

export default showAlert;
