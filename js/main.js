import * as config from './config.js';
import * as state from './state.js';
import * as utils from './utils.js';
import * as dom from './dom.js';
import * as firebase from './firebase.js';
import * as notifications from './notifications.js';
import * as lists from './lists.js';
import * as cards from './cards.js';
import * as modals from './modals.js';
import * as metadata from './metadata.js';
import * as autocomplete from './autocomplete.js';
import * as wheel from './wheel.js';
import * as franchise from './franchise.js';
import * as ads from './ads.js';
import { 
  VirtualScroller, 
  ensureVirtualListController, 
  destroyVirtualListController,
  ensureUnifiedVirtualizer,
  destroyUnifiedVirtualizer
} from './virtualScroller.js';

export {
  config,
  state,
  utils,
  dom,
  firebase,
  notifications,
  lists,
  cards,
  modals,
  metadata,
  autocomplete,
  wheel,
  franchise,
  ads,
  VirtualScroller,
  ensureVirtualListController,
  destroyVirtualListController,
  ensureUnifiedVirtualizer,
  destroyUnifiedVirtualizer
};

export function initApp() {
  firebase.initializeFirebase();
  
  if (dom.googleSigninBtn) {
    dom.googleSigninBtn.addEventListener('click', () => firebase.signInWithGoogle());
  }
  
  if (dom.signOutBtn) {
    dom.signOutBtn.addEventListener('click', () => firebase.signOut());
  }
  
  notifications.initNotificationBell();
  autocomplete.initGlobalSuggestionClickHandler();
  franchise.setupFranchiseSort();
  
  wheel.setupWheelModal({
    onSpin: (source) => {
      console.log('Wheel spin requested for:', source);
    },
    closeAddModal: modals.closeAddModal
  });
  
  firebase.onAuthStateChange((user) => {
    if (user) {
      state.setCurrentUser(user);
      showAppForUser(user);
    } else {
      state.setCurrentUser(null);
      showLogin();
    }
  });
  
  firebase.handleSignInRedirectResult();
  
  initBackToTop();
  ads.initializeRandomAds();
  
  console.info('[THE-LIST] App initialized with modular architecture');
}

function showLogin() {
  if (dom.loginScreen) dom.loginScreen.classList.remove('hidden');
  if (dom.appRoot) dom.appRoot.classList.add('hidden');
  state.setIntroPlayed(false);
  state.safeStorageRemove(config.INTRO_SESSION_KEY);
}

function showAppForUser(user) {
  if (dom.loginScreen) dom.loginScreen.classList.add('hidden');
  if (dom.appRoot) dom.appRoot.classList.remove('hidden');
  if (dom.userNameEl) {
    dom.userNameEl.textContent = user.displayName || user.email || 'You';
  }
}

function initBackToTop() {
  if (!dom.backToTopBtn) return;
  
  dom.backToTopBtn.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
  
  const updateVisibility = () => {
    const scrollTop = window.scrollY || document.documentElement.scrollTop || 0;
    const show = scrollTop > 400;
    dom.backToTopBtn.classList.toggle('visible', show);
  };
  
  window.addEventListener('scroll', updateVisibility, { passive: true });
  updateVisibility();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
