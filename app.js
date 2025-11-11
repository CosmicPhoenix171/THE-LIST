/**
 * THE LIST ™ - app.js
 *
 * Firebase Realtime Database rules (paste into Firebase Console -> Realtime Database -> Rules):
 *
 * {
 *   "rules": {
 *     "users": {
 *       "$uid": {
 *         ".read": "auth != null && auth.uid === $uid",
 *         ".write": "auth != null && auth.uid === $uid"
 *       }
 *     }
 *   }
 * }
 *
 * This ensures users can only read/write their own data.
 */

// Imports (modular Firebase v9)
import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut as fbSignOut,
  onAuthStateChanged,
} from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js';
import {
  getDatabase,
  ref,
  push,
  set,
  update,
  remove,
  onValue,
  query,
  orderByChild,
  get
} from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-database.js';

// ===== TODO: Paste your Firebase config here =====
// Replace the placeholder below with your Firebase project's config object.
// Example:
// const firebaseConfig = {
//   apiKey: "...",
//   authDomain: "...",
//   databaseURL: "https://<your-db>.firebaseio.com",
//   projectId: "...",
//   storageBucket: "...",
//   messagingSenderId: "...",
//   appId: "..."
// };
const firebaseConfig = {
  // TODO: paste your config here
};

// -----------------------
// App state
let appInitialized = false;
let currentUser = null;
const listeners = {};

// DOM references
const loginScreen = document.getElementById('login-screen');
const googleSigninBtn = document.getElementById('google-signin');
const appRoot = document.getElementById('app');
const userNameEl = document.getElementById('user-name');
const signOutBtn = document.getElementById('sign-out');
const tabs = document.querySelectorAll('.tab');
const sections = document.querySelectorAll('.section');
const modalRoot = document.getElementById('modal-root');
const wheelSpinnerEl = document.getElementById('wheel-spinner');
const wheelResultEl = document.getElementById('wheel-result');

// firebase instances
let db = null;
let auth = null;

// Initialize Firebase and services
function initFirebase() {
  if (appInitialized) return;
  if (!firebaseConfig || Object.keys(firebaseConfig).length === 0) {
    console.warn('Firebase config is empty. Paste your config into app.js to enable Firebase.');
    // still create a fake environment to avoid runtime exceptions in dev (but DB calls will fail)
  }
  const app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getDatabase(app);
  appInitialized = true;

  // Wire UI events
  googleSigninBtn.addEventListener('click', () => signInWithGoogle());
  signOutBtn.addEventListener('click', () => signOut());

  // Tab switching
  tabs.forEach(t => t.addEventListener('click', () => switchSection(t.dataset.section)));

  // Add form handlers
  document.querySelectorAll('.add-form').forEach(form => {
    form.addEventListener('submit', (ev) => {
      ev.preventDefault();
      const listType = form.dataset.list;
      addItemFromForm(listType, form);
    });
  });

  // Wheel
  document.getElementById('spin-wheel').addEventListener('click', () => {
    const src = document.getElementById('wheel-source').value;
    spinWheel(src);
  });
}

// Authentication
function signInWithGoogle() {
  const provider = new GoogleAuthProvider();
  signInWithPopup(auth, provider).catch(err => alert('Sign in failed: ' + err.message));
}

function signOut() {
  fbSignOut(auth).catch(err => console.error('Sign-out error', err));
}

// Listen to auth state changes
function handleAuthState() {
  onAuthStateChanged(auth, (user) => {
    if (user) {
      currentUser = user;
      showAppForUser(user);
    } else {
      currentUser = null;
      showLogin();
      detachAllListeners();
    }
  });
}

// UI helpers
function showLogin() {
  loginScreen.classList.remove('hidden');
  appRoot.classList.add('hidden');
}

function showAppForUser(user) {
  loginScreen.classList.add('hidden');
  appRoot.classList.remove('hidden');
  userNameEl.textContent = user.displayName || user.email || 'You';

  // load default section
  switchSection('movies');
}

function switchSection(sectionId) {
  tabs.forEach(t => t.classList.toggle('active', t.dataset.section === sectionId));
  sections.forEach(s => s.classList.toggle('hidden', s.id !== sectionId));

  // load data when switched to a list
  if (['movies','tvShows','anime','books'].includes(sectionId)) {
    loadList(sectionId);
  }
}

// Detach all DB listeners
function detachAllListeners() {
  for (const k in listeners) {
    if (typeof listeners[k] === 'function') listeners[k]();
  }
  Object.keys(listeners).forEach(k => delete listeners[k]);
}

// Load list items in real-time
// listType: movies | tvShows | anime | books
function loadList(listType) {
  if (!currentUser) return;
  const listContainer = document.getElementById(`${listType}-list`);
  listContainer.innerHTML = 'Loading...';

  // remove previous listener for this list
  if (listeners[listType]) {
    listeners[listType]();
    delete listeners[listType];
  }

  const listRef = query(ref(db, `users/${currentUser.uid}/${listType}`), orderByChild('title'));
  const off = onValue(listRef, (snap) => {
    const data = snap.val() || {};
    renderList(listType, data);
  }, (err) => {
    console.error('DB read error', err);
    listContainer.innerHTML = '<div class="small">Unable to load items.</div>';
  });

  // store unsubscribe
  listeners[listType] = off;
}

// Render list items
function renderList(listType, data) {
  const container = document.getElementById(`${listType}-list`);
  container.innerHTML = '';
  const keys = Object.keys(data || {}).sort((a,b)=>{
    const ta = (data[a].title||'').toLowerCase();
    const tb = (data[b].title||'').toLowerCase();
    return ta < tb ? -1 : ta > tb ? 1 : 0;
  });
  if (keys.length === 0) {
    container.innerHTML = '<div class="small">No items yet. Add something!</div>';
    return;
  }
  keys.forEach(id => {
    const item = data[id];
    const card = document.createElement('div');
    card.className = 'card';
    const left = document.createElement('div');
    left.style.flex = '1';
    const title = document.createElement('div');
    title.className = 'title';
    title.textContent = item.title || '(no title)';
    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.textContent = item.status || '';
    left.appendChild(title);
    left.appendChild(meta);
    if (item.notes) {
      const notes = document.createElement('div');
      notes.className = 'notes';
      notes.textContent = item.notes;
      left.appendChild(notes);
    }

    const actions = document.createElement('div');
    actions.className = 'actions';
    const editBtn = document.createElement('button');
    editBtn.className = 'btn secondary';
    editBtn.textContent = 'Edit';
    editBtn.addEventListener('click', () => openEditModal(listType, id, item));

    const delBtn = document.createElement('button');
    delBtn.className = 'btn';
    delBtn.style.background = 'transparent';
    delBtn.style.border = '1px solid rgba(255,255,255,0.04)';
    delBtn.textContent = 'Delete';
    delBtn.addEventListener('click', () => deleteItem(listType, id));

    actions.appendChild(editBtn);
    actions.appendChild(delBtn);

    // For media lists, add 'Mark Completed'
    if (['movies','tvShows','anime'].includes(listType)) {
      const markBtn = document.createElement('button');
      markBtn.className = 'btn primary';
      markBtn.textContent = 'Mark Completed';
      markBtn.addEventListener('click', () => updateItem(listType, id, { status: 'Completed' }));
      actions.appendChild(markBtn);
    }

    card.appendChild(left);
    card.appendChild(actions);
    container.appendChild(card);
  });
}

// Add item from form
function addItemFromForm(listType, form) {
  const title = (form.title.value || '').trim();
  const status = form.status.value;
  const notes = (form.notes.value || '').trim();
  if (!title) {
    alert('Title is required');
    return;
  }
  addItem(listType, { title, status, notes, createdAt: Date.now() });
  form.reset();
}

// Create a new item
function addItem(listType, item) {
  if (!currentUser) return alert('Not signed in');
  const listRef = ref(db, `users/${currentUser.uid}/${listType}`);
  const newRef = push(listRef);
  set(newRef, item).catch(err => console.error('Add failed', err));
}

// Update an existing item
function updateItem(listType, itemId, changes) {
  if (!currentUser) return alert('Not signed in');
  const itemRef = ref(db, `users/${currentUser.uid}/${listType}/${itemId}`);
  update(itemRef, changes).catch(err => console.error('Update failed', err));
}

// Delete an item
function deleteItem(listType, itemId) {
  if (!currentUser) return alert('Not signed in');
  if (!confirm('Delete this item?')) return;
  const itemRef = ref(db, `users/${currentUser.uid}/${listType}/${itemId}`);
  remove(itemRef).catch(err => console.error('Delete failed', err));
}

// Open a small modal to edit
function openEditModal(listType, itemId, item) {
  modalRoot.innerHTML = '';
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  const modal = document.createElement('div');
  modal.className = 'modal';

  const form = document.createElement('form');
  const titleInput = document.createElement('input');
  titleInput.name = 'title';
  titleInput.value = item.title || '';
  const statusSelect = document.createElement('select');
  ['Planned','Watching/Reading','Completed','Dropped'].forEach(s => {
    const o = document.createElement('option'); o.value = s; o.text = s; if (s === item.status) o.selected = true; statusSelect.appendChild(o);
  });
  const notesInput = document.createElement('textarea');
  notesInput.name = 'notes';
  notesInput.value = item.notes || '';
  const saveBtn = document.createElement('button');
  saveBtn.className = 'btn primary';
  saveBtn.textContent = 'Save';
  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'btn secondary';
  cancelBtn.textContent = 'Cancel';

  form.appendChild(titleInput);
  form.appendChild(statusSelect);
  form.appendChild(notesInput);
  const controls = document.createElement('div');
  controls.style.display = 'flex'; controls.style.gap = '.5rem'; controls.style.justifyContent = 'flex-end';
  controls.appendChild(cancelBtn); controls.appendChild(saveBtn);
  form.appendChild(controls);

  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const newTitle = (titleInput.value || '').trim();
    if (!newTitle) return alert('Title is required');
    updateItem(listType, itemId, { title: newTitle, status: statusSelect.value, notes: notesInput.value });
    closeModal();
  });

  cancelBtn.addEventListener('click', (ev) => { ev.preventDefault(); closeModal(); });

  modal.appendChild(form);
  backdrop.appendChild(modal);
  modalRoot.appendChild(backdrop);

  function closeModal() { modalRoot.innerHTML = ''; }
}

// Wheel spinner logic
function spinWheel(listType) {
  if (!currentUser) return alert('Not signed in');
  wheelResultEl.textContent = '';
  wheelSpinnerEl.classList.remove('hidden');
  wheelSpinnerEl.classList.add('spin');

  // load items once
  const listRef = ref(db, `users/${currentUser.uid}/${listType}`);
  get(listRef).then(snap => {
    const data = snap.val() || {};
    const candidates = Object.values(data).filter(it => ['Planned','Watching/Reading'].includes(it.status));
    // short animation
    setTimeout(() => {
      wheelSpinnerEl.classList.remove('spin');
      if (candidates.length === 0) {
        wheelResultEl.textContent = 'No items available to spin. Add some first!';
      } else {
        const chosen = candidates[Math.floor(Math.random() * candidates.length)];
        wheelResultEl.textContent = `You should watch/read: ${chosen.title}`;
      }
    }, 1400);
  }).catch(err => {
    console.error('Wheel load failed', err);
    wheelSpinnerEl.classList.remove('spin');
    wheelResultEl.textContent = 'Unable to load items.';
  });
}

// Boot
initFirebase();
if (auth) {
  handleAuthState();
} else {
  // If config was not added, attempt to still listen after a small delay
  try { handleAuthState(); } catch(e) { /* silent */ }
}

/*
  README-style notes:

  How to set up Firebase
  1. Create a Firebase project at https://console.firebase.google.com
  2. Enable Authentication -> Sign-in method -> Google
  3. Create a Realtime Database and set its rules to the block at the top of this file.
  4. In Project Settings -> Your apps, register a new Web App and copy the config.
  5. Paste the config object into the `firebaseConfig` constant near the top of this file.

  Where to paste Database Rules
  - Copy the rules at the top of this file (inside the comment) into the Realtime Database Rules editor.

  How to run locally
  - This is a static site. You can open `index.html` directly, but some browsers block module imports when opened via file://.
  - Recommended: run a simple static server. Example using Python 3:

      python3 -m http.server 8000

    Then open http://localhost:8000 in your browser.

  Notes
  - The `firebaseConfig` object must include `databaseURL` (Realtime DB URL).
  - Security rules must be applied in the Firebase Console to enforce per-user access.
  - This app uses Firebase v9 modular SDK via CDN imports.

*/
