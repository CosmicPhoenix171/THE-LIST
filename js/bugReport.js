// Bug Report System
import {
  ref,
  push,
  set,
  remove,
  onValue,
  onChildAdded,
  query,
  orderByChild,
  limitToLast,
} from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-database.js';
import { getFirebaseDatabase } from './firebase.js';
import { getCurrentUser, listCaches } from './state.js';
import { refreshItemMetadata } from './metadata.js';
import { 
  BUG_REPORT_DB_PATH, 
  GLOBAL_NOTIFICATIONS_PATH, 
  BUG_REPORT_ADMIN_NAMES,
  PRIMARY_LIST_TYPES 
} from './config.js';
import {
  bugReportBtn,
  bugReportPopover,
  bugReportForm,
  bugReportInput,
  bugReportListEl,
  bugReportCloseBtn,
} from './dom.js';
import { pushNotification } from './notifications.js';

// State
let bugReports = [];
let bugReportsLoaded = false;
let bugReportLoadError = null;
let bugReportUnsubscribe = null;
let bugPopoverOpen = false;
let globalNotificationsUnsubscribe = null;

// ============================================
// INITIALIZATION
// ============================================
export function initBugReportButton(callbacks = {}) {
  if (!bugReportBtn || !bugReportPopover) return;
  bugReports = [];
  bugReportsLoaded = false;
  bugReportLoadError = null;
  renderBugReportList();
  
  bugReportBtn.addEventListener('click', () => toggleBugPopover());
  
  if (bugReportCloseBtn) {
    bugReportCloseBtn.addEventListener('click', () => closeBugPopover());
  }
  
  if (bugReportForm) {
    bugReportForm.addEventListener('submit', handleBugReportSubmit);
  
    const refreshBtn = document.getElementById('refresh-all-metadata');
    if (refreshBtn && callbacks.refreshAllMetadataSequential) {
      refreshBtn.addEventListener('click', async () => {
        refreshBtn.disabled = true;
        refreshBtn.textContent = 'Refreshing...';
        try {
          await callbacks.refreshAllMetadataSequential();
          refreshBtn.textContent = 'Done!';
        } catch (e) {
          refreshBtn.textContent = 'Error';
        }
        setTimeout(() => {
          refreshBtn.disabled = false;
          refreshBtn.textContent = 'Refresh All Metadata';
        }, 2000);
      });
    }
  }
  
  bugReportListEl?.addEventListener('click', handleBugListClick);
  document.addEventListener('click', handleBugDocumentClick);
  document.addEventListener('keydown', handleBugKeydown);
}

// ============================================
// POPOVER CONTROLS
// ============================================
export function toggleBugPopover(forceState) {
  const targetState = typeof forceState === 'boolean' ? forceState : !bugPopoverOpen;
  setBugPopoverState(targetState);
}

export function closeBugPopover() {
  setBugPopoverState(false);
}

function setBugPopoverState(isOpen) {
  if (!bugReportPopover || !bugReportBtn) return;
  bugPopoverOpen = Boolean(isOpen);
  bugReportPopover.classList.toggle('hidden', !bugPopoverOpen);
  bugReportBtn.setAttribute('aria-expanded', bugPopoverOpen ? 'true' : 'false');
  if (bugPopoverOpen) {
    bugReportPopover.focus();
  }
}

function handleBugDocumentClick(event) {
  if (!bugPopoverOpen) return;
  if (bugReportPopover?.contains(event.target) || bugReportBtn?.contains(event.target)) return;
  closeBugPopover();
}

function handleBugKeydown(event) {
  if (event.key !== 'Escape' || !bugPopoverOpen) return;
  closeBugPopover();
  bugReportBtn?.focus();
}

// ============================================
// SUBMIT BUG REPORT
// ============================================
async function handleBugReportSubmit(event) {
  event.preventDefault();
  if (!bugReportInput) return;
  const value = bugReportInput.value.trim();
  if (!value) return;
  const user = getCurrentUser();
  if (!user) {
    alert('Sign in to report bugs.');
    return;
  }
  const db = getFirebaseDatabase();
  if (!db) {
    alert('Bug reporting is unavailable right now. Try again later.');
    return;
  }
  const record = {
    message: value,
    createdAt: Date.now(),
    author: user.displayName || user.email || 'Anonymous',
    authorUid: user.uid || '',
    authorEmail: user.email || '',
  };
  try {
    await push(ref(db, BUG_REPORT_DB_PATH), record);
    bugReportForm?.reset();
    bugReportInput.focus();
  } catch (err) {
    console.error('Bug report submit failed', err);
    alert('Unable to submit bug report right now. Please try again later.');
  }
}

// ============================================
// BUG LIST INTERACTIONS
// ============================================
function handleBugListClick(event) {
  const target = event.target;
  if (!target) return;

  if (target.matches('[data-role="bug-remove"]')) {
    const reportId = target.getAttribute('data-bug-id');
    if (reportId) removeBugReport(reportId);
    return;
  }

  if (target.matches('[data-role="bug-push"]')) {
    const reportId = target.getAttribute('data-bug-id');
    if (reportId) pushBugReportAsNotification(reportId);
    return;
  }
}

function pushBugReportAsNotification(reportId) {
  const report = bugReports.find(r => r.id === reportId);
  if (!report) return;
  
  const confirmPush = confirm(`Mark this bug as fixed and notify everyone?\n\n"${report.message}"`);
  if (!confirmPush) return;

  const db = getFirebaseDatabase();
  const newNotifRef = push(ref(db, GLOBAL_NOTIFICATIONS_PATH));
  set(newNotifRef, {
    title: 'Bug Fixed',
    message: `The bug "${report.message}" has been fixed.`,
    createdAt: Date.now(),
    author: getCurrentUser()?.displayName || 'Admin'
  }).then(() => {
    alert('Notification sent!');
  }).catch(err => {
    console.error(err);
    alert('Failed to send.');
  });
}

// ============================================
// RENDER BUG LIST
// ============================================
export function renderBugReportList() {
  if (!bugReportListEl) return;
  if (!getCurrentUser()) {
    bugReportListEl.innerHTML = '<div class="bug-report-empty">Sign in to view bug reports.</div>';
    return;
  }
  if (bugReportLoadError) {
    bugReportListEl.innerHTML = `<div class="bug-report-empty">${bugReportLoadError}</div>`;
    return;
  }
  if (!bugReportsLoaded) {
    bugReportListEl.innerHTML = '<div class="bug-report-empty">Loading bug reports...</div>';
    return;
  }
  if (!bugReports.length) {
    bugReportListEl.innerHTML = '<div class="bug-report-empty">No bug reports yet.</div>';
    return;
  }
  const fragment = document.createDocumentFragment();
  bugReports.forEach(report => {
    const entry = document.createElement('div');
    entry.className = 'bug-report-entry';
    const message = document.createElement('p');
    message.textContent = report.message;
    const footer = document.createElement('footer');
    const meta = document.createElement('span');
    const timestamp = report.createdAt ? new Date(report.createdAt).toLocaleString() : 'Just now';
    meta.textContent = `${report.author || 'Anonymous'} • ${timestamp}`;
    footer.appendChild(meta);
    
    const canRemove = canCurrentUserRemoveBugReport(report);
    if (canRemove) {
      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.textContent = 'Remove';
      removeBtn.dataset.role = 'bug-remove';
      removeBtn.setAttribute('data-bug-id', report.id);
      footer.appendChild(removeBtn);
    }

    if (isBugReportAdmin(getCurrentUser())) {
      const pushBtn = document.createElement('button');
      pushBtn.type = 'button';
      pushBtn.textContent = 'Fixed';
      pushBtn.dataset.role = 'bug-push';
      pushBtn.setAttribute('data-bug-id', report.id);
      pushBtn.style.marginLeft = '8px';
      footer.appendChild(pushBtn);
    }

    entry.appendChild(message);
    entry.appendChild(footer);
    fragment.appendChild(entry);
  });
  bugReportListEl.innerHTML = '';
  bugReportListEl.appendChild(fragment);
}

// ============================================
// REMOVE BUG REPORT
// ============================================
function removeBugReport(reportId) {
  const db = getFirebaseDatabase();
  if (!reportId || !db) return;
  const target = bugReports.find(report => report.id === reportId);
  const canRemove = canCurrentUserRemoveBugReport(target);
  if (!canRemove) return;
  const reportRef = ref(db, `${BUG_REPORT_DB_PATH}/${reportId}`);
  remove(reportRef).catch(err => {
    console.error('Bug report delete failed', err);
    alert('Unable to remove this report right now.');
  });
}

// ============================================
// ADMIN CHECKS
// ============================================
export function isBugReportAdmin(user) {
  if (!user) return false;
  const normalized = (user.displayName || '').trim().toLowerCase();
  return normalized ? BUG_REPORT_ADMIN_NAMES.has(normalized) : false;
}

function canCurrentUserRemoveBugReport(report) {
  const user = getCurrentUser();
  if (!user || !report) return false;
  if (isBugReportAdmin(user)) return true;
  return Boolean(report.authorUid && user.uid === report.authorUid);
}

// ============================================
// SYNC BUG REPORTS
// ============================================
export function startBugReportSync() {
  const db = getFirebaseDatabase();
  if (!db) return;
  if (bugReportUnsubscribe) {
    bugReportUnsubscribe();
    bugReportUnsubscribe = null;
  }
  bugReportLoadError = null;
  bugReportsLoaded = false;
  renderBugReportList();
  
  const reportsRef = query(ref(db, BUG_REPORT_DB_PATH), orderByChild('createdAt'));
  bugReportUnsubscribe = onValue(reportsRef, (snapshot) => {
    const payload = snapshot.val() || {};
    const entries = Object.entries(payload).map(([id, value]) => ({
      id,
      message: String(value?.message || '').trim(),
      createdAt: Number(value?.createdAt) || 0,
      author: value?.author || 'Anonymous',
      authorUid: value?.authorUid || '',
      authorEmail: value?.authorEmail || '',
    })).filter(entry => entry.message);
    entries.sort((a, b) => {
      if (b.createdAt !== a.createdAt) return b.createdAt - a.createdAt;
      return a.id.localeCompare(b.id);
    });
    bugReports = entries;
    bugReportLoadError = null;
    bugReportsLoaded = true;
    renderBugReportList();
  }, (err) => {
    console.error('Bug report listener error', err);
    bugReportLoadError = 'Unable to load bug reports right now.';
    bugReportsLoaded = true;
    renderBugReportList();
  });
}

export function stopBugReportSync() {
  if (bugReportUnsubscribe) {
    bugReportUnsubscribe();
    bugReportUnsubscribe = null;
  }
  bugReports = [];
  bugReportLoadError = null;
  bugReportsLoaded = false;
  renderBugReportList();
}

// ============================================
// GLOBAL NOTIFICATIONS
// ============================================
export function initGlobalNotificationsListener() {
  const db = getFirebaseDatabase();
  if (!db) return;
  if (globalNotificationsUnsubscribe) {
    globalNotificationsUnsubscribe();
    globalNotificationsUnsubscribe = null;
  }
  
  const notifsRef = query(ref(db, GLOBAL_NOTIFICATIONS_PATH), limitToLast(10));
  globalNotificationsUnsubscribe = onChildAdded(notifsRef, (snapshot) => {
    const val = snapshot.val();
    if (val && val.message) {
      pushNotification({
        title: val.title || 'System Notification',
        message: val.message
      });
    }
  });
}

export function stopGlobalNotificationsListener() {
  if (globalNotificationsUnsubscribe) {
    globalNotificationsUnsubscribe();
    globalNotificationsUnsubscribe = null;
  }
}

// ============================================
// METADATA REFRESH (for admin button)
// ============================================
export async function refreshAllMetadataSequential(callbacks = {}) {
  const { showToast } = callbacks;
  const allTypes = PRIMARY_LIST_TYPES;
  let total = 0;
  let refreshed = 0;
  
  // Count total items first
  for (const type of allTypes) {
    const cache = listCaches[type] || {};
    total += Object.keys(cache).length;
  }
  
  if (showToast) {
    showToast({ message: `Refreshing metadata for ${total} items...`, type: 'info' });
  }
  
  for (const type of allTypes) {
    const cache = listCaches[type] || {};
    const ids = Object.keys(cache);
    for (const id of ids) {
      const item = cache[id];
      if (!item) continue;
      try {
        await refreshItemMetadata(type, id, item, {});
        refreshed++;
      } catch (e) {
        console.error(`Failed to refresh ${type}/${id}:`, e);
        // continue with next item
      }
    }
  }
  
  if (showToast) {
    showToast({ message: `Refreshed ${refreshed} of ${total} items!`, type: 'success' });
  }
  
  return refreshed;
}

// Getters for state
export function getBugReports() {
  return bugReports;
}

export function isBugReportsLoaded() {
  return bugReportsLoaded;
}

export function isBugPopoverOpen() {
  return bugPopoverOpen;
}
