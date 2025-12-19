import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  setPersistence,
  browserLocalPersistence,
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
  onChildAdded,
  query,
  orderByChild,
  limitToLast,
  get
} from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-database.js';

import { firebaseConfig, INTRO_SESSION_KEY } from './config.js';
import { safeStorageRemove, setCurrentUser } from './state.js';

let app = null;
let auth = null;
let database = null;
let googleProvider = null;

export function initializeFirebase() {
  if (app) return { app, auth, database };
  
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  database = getDatabase(app);
  googleProvider = new GoogleAuthProvider();
  
  setPersistence(auth, browserLocalPersistence).catch(err => {
    console.warn('Failed to set auth persistence:', err);
  });
  
  return { app, auth, database };
}

export function getFirebaseApp() {
  return app;
}

export function getFirebaseAuth() {
  return auth;
}

export function getFirebaseDatabase() {
  return database;
}

export function getGoogleProvider() {
  return googleProvider;
}

export function signOut() {
  safeStorageRemove(INTRO_SESSION_KEY);
  fbSignOut(auth).catch(err => console.error('Sign-out error', err));
}

function shouldFallbackToRedirect(err) {
  if (!err || !err.code) return false;
  return [
    'auth/operation-not-supported-in-this-environment',
    'auth/popup-blocked',
    'auth/popup-blocked-by-browser',
    'auth/cancelled-popup-request'
  ].includes(err.code);
}

export async function signInWithGoogle() {
  if (!auth) {
    console.warn('Tried to sign in before Firebase was initialized.');
    alert('App is still loading. Please try again.');
    return;
  }
  try {
    await signInWithPopup(auth, googleProvider);
  } catch (err) {
    if (err && err.code === 'auth/popup-closed-by-user') return;
    if (shouldFallbackToRedirect(err)) {
      try {
        await signInWithRedirect(auth, googleProvider);
        return;
      } catch (redirectErr) {
        console.error('Redirect fallback failed', redirectErr);
        alert('Google sign-in redirect failed. Please try again.');
        return;
      }
    }
    console.error('Google sign-in failed', err);
    alert('Google sign-in failed. Please try again.');
  }
}

export async function handleSignInRedirectResult() {
  if (!auth) return;
  try {
    const result = await getRedirectResult(auth);
    if (result && result.user) {
      setCurrentUser(result.user);
      return result.user;
    }
  } catch (err) {
    if (err && err.code === 'auth/no-auth-event') return null;
    if (err && err.code === 'auth/redirect-cancelled-by-user') return null;
    console.error('Google redirect sign-in failed', err);
    alert('Google sign-in failed after redirect. Please try again.');
  }
  return null;
}

export function onAuthStateChange(callback) {
  if (!auth) {
    console.warn('Auth not initialized');
    return () => {};
  }
  return onAuthStateChanged(auth, callback);
}

export function getDatabaseRef(path) {
  if (!database) {
    console.warn('Database not initialized');
    return null;
  }
  return ref(database, path);
}

export async function pushData(path, data) {
  const dbRef = getDatabaseRef(path);
  if (!dbRef) return null;
  const newRef = push(dbRef);
  await set(newRef, data);
  return newRef.key;
}

export async function setData(path, data) {
  const dbRef = getDatabaseRef(path);
  if (!dbRef) return;
  await set(dbRef, data);
}

export async function updateData(path, data) {
  const dbRef = getDatabaseRef(path);
  if (!dbRef) return;
  await update(dbRef, data);
}

export async function removeData(path) {
  const dbRef = getDatabaseRef(path);
  if (!dbRef) return;
  await remove(dbRef);
}

export async function getData(path) {
  const dbRef = getDatabaseRef(path);
  if (!dbRef) return null;
  const snapshot = await get(dbRef);
  return snapshot.exists() ? snapshot.val() : null;
}

export function onValueChange(path, callback) {
  const dbRef = getDatabaseRef(path);
  if (!dbRef) return () => {};
  return onValue(dbRef, callback);
}

export function onChildAddedListener(path, callback) {
  const dbRef = getDatabaseRef(path);
  if (!dbRef) return () => {};
  return onChildAdded(dbRef, callback);
}

export function createQuery(path, options = {}) {
  const dbRef = getDatabaseRef(path);
  if (!dbRef) return null;
  
  let q = dbRef;
  if (options.orderBy) {
    q = query(q, orderByChild(options.orderBy));
  }
  if (options.limitToLast) {
    q = query(q, limitToLast(options.limitToLast));
  }
  return q;
}

export {
  ref,
  push,
  set,
  update,
  remove,
  onValue,
  onChildAdded,
  query,
  orderByChild,
  limitToLast,
  get
};
