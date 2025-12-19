import { 
  MAX_PERSISTED_NOTIFICATIONS, 
  NOTIFICATION_STORAGE_KEY, 
  NOTIFICATION_SEEN_KEY 
} from './config.js';
import { 
  safeLocalStorageGet, 
  safeLocalStorageSet, 
  safeLocalStorageRemove 
} from './utils.js';
import {
  notificationCenter,
  notificationItemsContainer,
  notificationClearAllBtn,
  notificationShell,
  notificationBellBtn,
  notificationBadgeEl,
  notificationEmptyStateEl
} from './dom.js';

let persistedNotifications = [];
let notificationSignatureCache = new Set();
let notificationPopoverOpen = false;

export function getPersistedNotifications() {
  return persistedNotifications;
}

export function getNotificationSignatureCache() {
  return notificationSignatureCache;
}

export function pushNotification({ title, message } = {}) {
  if (!title && !message) return;
  if (!notificationCenter) {
    const fallbackText = [title, message].filter(Boolean).join('\n');
    if (fallbackText) alert(fallbackText);
    return;
  }
  const signature = getNotificationSignature(title, message);
  if (signature && notificationSignatureCache.has(signature)) {
    return;
  }
  const record = createNotificationRecord({ title, message, signature });
  addPersistedNotification(record);
  renderNotificationCard(record);
  updateNotificationEmptyState();
  updateNotificationBadge();
}

export function createNotificationRecord({ title = '', message = '', signature = '' } = {}) {
  return {
    id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    title,
    message,
    createdAt: Date.now(),
    signature: signature || getNotificationSignature(title, message),
  };
}

export function renderNotificationCard(record) {
  if (!notificationItemsContainer || !record) return null;
  const card = document.createElement('div');
  card.className = 'notification-card';
  card.dataset.notificationId = record.id;
  if (record.title) {
    const titleEl = document.createElement('div');
    titleEl.className = 'notification-title';
    titleEl.textContent = record.title;
    card.appendChild(titleEl);
  }
  if (record.message) {
    const bodyEl = document.createElement('div');
    bodyEl.className = 'notification-body';
    bodyEl.textContent = record.message;
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
  closeBtn.addEventListener('click', () => dismissNotification(record.id));
  notificationItemsContainer.appendChild(card);
  requestAnimationFrame(() => card.classList.add('visible'));
  return card;
}

export function dismissNotification(recordId) {
  removePersistedNotification(recordId);
  if (!notificationItemsContainer) {
    updateNotificationEmptyState();
    updateNotificationBadge();
    return;
  }
  const card = notificationItemsContainer.querySelector(`[data-notification-id="${recordId}"]`);
  const finalize = () => {
    if (card && card.parentNode) {
      card.parentNode.removeChild(card);
    }
    updateNotificationEmptyState();
    updateNotificationBadge();
  };
  if (!card) {
    finalize();
    return;
  }
  card.classList.remove('visible');
  setTimeout(finalize, 240);
}

export function addPersistedNotification(record) {
  if (!record) return;
  const duplicate = persistedNotifications.some(existing => existing.title === record.title && existing.message === record.message);
  if (duplicate) return;
  persistedNotifications = [...persistedNotifications, record];
  if (persistedNotifications.length > MAX_PERSISTED_NOTIFICATIONS) {
    persistedNotifications = persistedNotifications.slice(-MAX_PERSISTED_NOTIFICATIONS);
  }
  persistNotificationsToStorage();
  if (record.signature) {
    markNotificationSignatureSeen(record.signature);
  }
}

export function removePersistedNotification(recordId) {
  if (!recordId) return;
  const next = persistedNotifications.filter(record => record.id !== recordId);
  if (next.length === persistedNotifications.length) return;
  persistedNotifications = next;
  persistNotificationsToStorage();
}

export function loadStoredNotifications() {
  const raw = safeLocalStorageGet(NOTIFICATION_STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(entry => ({
        id: entry.id || `notif_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        title: entry.title || '',
        message: entry.message || '',
        createdAt: Number(entry.createdAt) || Date.now(),
        signature: entry.signature || getNotificationSignature(entry.title || '', entry.message || ''),
      }))
      .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  } catch (_) {
    return [];
  }
}

export function persistNotificationsToStorage() {
  if (!persistedNotifications.length) {
    safeLocalStorageRemove(NOTIFICATION_STORAGE_KEY);
    return;
  }
  try {
    safeLocalStorageSet(NOTIFICATION_STORAGE_KEY, JSON.stringify(persistedNotifications));
  } catch (_) {}
}

export function getNotificationSignature(title = '', message = '') {
  const normalizedTitle = (title || '').trim().toLowerCase();
  const normalizedMessage = (message || '').trim().toLowerCase();
  if (!normalizedTitle && !normalizedMessage) return '';
  return `${normalizedTitle}::${normalizedMessage}`;
}

export function loadNotificationSignatures() {
  const raw = safeLocalStorageGet(NOTIFICATION_SEEN_KEY);
  if (!raw) return new Set();
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter(Boolean));
  } catch (_) {
    return new Set();
  }
}

export function persistNotificationSignatures() {
  try {
    if (!notificationSignatureCache.size) {
      safeLocalStorageRemove(NOTIFICATION_SEEN_KEY);
      return;
    }
    safeLocalStorageSet(NOTIFICATION_SEEN_KEY, JSON.stringify(Array.from(notificationSignatureCache)));
  } catch (_) {}
}

export function markNotificationSignatureSeen(signature) {
  if (!signature) return;
  if (notificationSignatureCache.has(signature)) return;
  notificationSignatureCache.add(signature);
  persistNotificationSignatures();
}

export function initNotificationBell() {
  if (!notificationBellBtn || !notificationCenter) return;

  if (notificationClearAllBtn) {
    notificationClearAllBtn.addEventListener('click', clearAllNotifications);
  }

  notificationSignatureCache = loadNotificationSignatures();
  persistedNotifications = loadStoredNotifications();
  persistedNotifications.forEach(record => renderNotificationCard(record));
  let signatureAdded = false;
  persistedNotifications.forEach(record => {
    if (record.signature && !notificationSignatureCache.has(record.signature)) {
      notificationSignatureCache.add(record.signature);
      signatureAdded = true;
    }
  });
  if (signatureAdded) {
    persistNotificationSignatures();
  }
  notificationBellBtn.addEventListener('click', () => {
    toggleNotificationPopover();
  });
  document.addEventListener('click', handleNotificationDocumentClick);
  document.addEventListener('keydown', handleNotificationKeydown);
  updateNotificationBadge();
  updateNotificationEmptyState();
}

export function clearAllNotifications() {
  persistedNotifications = [];
  persistNotificationsToStorage();
  if (notificationItemsContainer) {
    notificationItemsContainer.innerHTML = '';
  }
  updateNotificationEmptyState();
  updateNotificationBadge();
}

export function toggleNotificationPopover(forceState) {
  const targetState = typeof forceState === 'boolean' ? forceState : !notificationPopoverOpen;
  setNotificationPopoverState(targetState);
}

export function closeNotificationPopover() {
  setNotificationPopoverState(false);
}

export function setNotificationPopoverState(isOpen) {
  if (!notificationCenter || !notificationBellBtn) return;
  notificationPopoverOpen = Boolean(isOpen);
  notificationCenter.classList.toggle('hidden', !notificationPopoverOpen);
  notificationBellBtn.setAttribute('aria-expanded', notificationPopoverOpen ? 'true' : 'false');
  if (notificationPopoverOpen) {
    notificationCenter.focus();
  }
}

function handleNotificationDocumentClick(event) {
  if (!notificationPopoverOpen) return;
  if (notificationShell && notificationShell.contains(event.target)) return;
  closeNotificationPopover();
}

function handleNotificationKeydown(event) {
  if (event.key !== 'Escape') return;
  if (!notificationPopoverOpen) return;
  closeNotificationPopover();
  if (notificationBellBtn) {
    notificationBellBtn.focus();
  }
}

export function updateNotificationBadge() {
  if (!notificationBadgeEl) return;
  const count = notificationCenter ? notificationCenter.querySelectorAll('.notification-card').length : 0;
  notificationBadgeEl.textContent = count;
  notificationBadgeEl.classList.toggle('hidden', count === 0);
  if (notificationBellBtn) {
    const label = count === 0 ? 'Notifications' : `${count} notification${count === 1 ? '' : 's'}`;
    notificationBellBtn.setAttribute('aria-label', label);
  }
}

export function updateNotificationEmptyState() {
  if (!notificationEmptyStateEl || !notificationItemsContainer) return;
  const hasNotifications = Boolean(notificationItemsContainer.querySelector('.notification-card'));
  notificationEmptyStateEl.classList.toggle('hidden', hasNotifications);
  if (notificationClearAllBtn) {
    notificationClearAllBtn.style.display = hasNotifications ? 'block' : 'none';
  }
}
