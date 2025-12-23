// Share Module
// Handles sharing media items to Discord and other platforms
import { createEl } from './utils.js';
import { modalRoot } from './dom.js';
import { MEDIA_TYPE_LABELS } from './config.js';
import { getCurrentUser } from './state.js';
import { addItem } from './crud.js';
import { fetchTmdbMetadata, deriveMetadataAssignments } from './metadata.js';
import { getFirebaseDatabase } from './firebase.js';
import { ref, push, set, get } from 'https://www.gstatic.com/firebasejs/9.22.0/firebase-database.js';

// ============================================
// CONSTANTS
// ============================================
const SHARE_WORKER_URL = 'https://share-the-list.cosmicphoenix171.workers.dev/';
const SHARE_BASE_URL = 'https://cosmicphoenix171.github.io/THE-LIST/';
const SHARE_PARAM_PREFIX = 'share_';
const SHARE_CHANNEL_NAME = 'the-list-share-channel';

// ============================================
// BROADCAST CHANNEL FOR TAB COORDINATION
// ============================================
let shareChannel = null;
let isListeningForShares = false;

function initShareChannel() {
  if (shareChannel || typeof BroadcastChannel === 'undefined') return;
  
  try {
    shareChannel = new BroadcastChannel(SHARE_CHANNEL_NAME);
    
    shareChannel.onmessage = (event) => {
      const { type, shareData, senderId } = event.data || {};
      
      if (type === 'SHARE_REQUEST' && senderId !== getTabId()) {
        console.log('[Share] Received share request from another tab');
        // Another tab is asking if we can handle the share
        // Only respond if we're the "main" tab (user is logged in and app is visible)
        if (document.visibilityState === 'visible' && modalRoot && !modalRoot.classList.contains('hidden')) {
          // We'll handle this share
          shareChannel.postMessage({ type: 'SHARE_ACCEPTED', senderId: getTabId() });
          
          // Open the appropriate modal
          setTimeout(() => {
            if (shareData.isCollection && shareData.seriesName) {
              openSharedCollectionModal(shareData);
            } else if (shareData.title) {
              openSharedItemModal(shareData);
            }
          }, 100);
        }
      }
    };
    
    console.log('[Share] BroadcastChannel initialized');
  } catch (err) {
    console.warn('[Share] BroadcastChannel not available:', err);
  }
}

function getTabId() {
  if (!window.__theListTabId) {
    window.__theListTabId = `tab_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  }
  return window.__theListTabId;
}

// Try to delegate share to another open tab, returns true if delegated
function tryDelegateShare(shareData) {
  return new Promise((resolve) => {
    if (!shareChannel) {
      resolve(false);
      return;
    }
    
    let responded = false;
    
    const handleResponse = (event) => {
      if (event.data?.type === 'SHARE_ACCEPTED' && !responded) {
        responded = true;
        console.log('[Share] Another tab accepted the share, closing this tab');
        shareChannel.removeEventListener('message', handleResponse);
        
        // Clear URL params before closing
        const cleanUrl = window.location.origin + window.location.pathname;
        window.history.replaceState({}, document.title, cleanUrl);
        
        // Try to close this tab (works if opened by script)
        window.close();
        
        // If window.close() didn't work (not opened by script), just resolve
        resolve(true);
      }
    };
    
    shareChannel.addEventListener('message', handleResponse);
    
    // Broadcast the share request
    shareChannel.postMessage({ 
      type: 'SHARE_REQUEST', 
      shareData, 
      senderId: getTabId() 
    });
    
    // Wait a short time for response, then handle locally if no response
    setTimeout(() => {
      if (!responded) {
        shareChannel.removeEventListener('message', handleResponse);
        resolve(false);
      }
    }, 300);
  });
}

// Initialize channel when module loads
initShareChannel();

// ============================================
// GENERATE SHARE URL (uses Cloudflare Worker for Discord embeds)
// ============================================
export function generateShareUrl(listType, item) {
  if (!item) return null;
  
  const params = new URLSearchParams();
  params.set('title', item.title || '');
  params.set('type', listType || 'movies');
  
  // Get current user's display name for the share
  const currentUser = getCurrentUser();
  if (currentUser?.displayName) {
    params.set('user', currentUser.displayName);
  }
  
  if (item.year) params.set('year', String(item.year));
  if (item.finishedRating) params.set('rating', String(item.finishedRating));
  if (item.poster) params.set('poster', item.poster);
  if (item.director) params.set('director', item.director);
  if (item.author) params.set('author', item.author);
  if (item.tmdbId) params.set('tmdbId', String(item.tmdbId));
  if (item.imdbId) params.set('imdbId', item.imdbId);
  // Cache-buster so Discord re-scrapes and shows latest OG tags
  params.set('v', Date.now().toString());
  
  return `${SHARE_WORKER_URL}?${params.toString()}`;
}

// ============================================
// SAVE SHARED COLLECTION TO FIREBASE
// ============================================
async function saveSharedCollection(seriesName, entries, primaryItem) {
  const currentUser = getCurrentUser();
  if (!currentUser) {
    console.error('[Share] Cannot save collection - not logged in');
    return null;
  }
  
  const db = getFirebaseDatabase();
  const sharedCollectionsRef = ref(db, `sharedCollections/${currentUser.uid}`);
  const newShareRef = push(sharedCollectionsRef);
  const shareId = newShareRef.key;
  
  // Prepare items for storage (clean up and include essential metadata)
  const items = entries.map(e => {
    const item = e.item || {};
    return {
      listType: e.listType || 'movies',
      title: item.title || '',
      year: item.year || '',
      poster: item.poster || '',
      tmdbId: item.tmdbId || null,
      imdbId: item.imdbId || '',
      seriesName: item.seriesName || seriesName,
      seriesOrder: item.seriesOrder || null,
      seasonNumber: item.seasonNumber ?? null,
      tvEpisodeCount: item.tvEpisodeCount || item.episodeCount || null,
      animeEpisodes: item.animeEpisodes || null,
      runtime: item.runtime || '',
      director: item.director || '',
      plot: item.plot || '',
      genres: item.genres || [],
      imdbType: item.imdbType || '',
    };
  });
  
  const shareData = {
    seriesName,
    sharedBy: currentUser.displayName || currentUser.email || 'Anonymous',
    sharedByUid: currentUser.uid,
    sharedAt: Date.now(),
    poster: primaryItem?.poster || entries[0]?.item?.poster || '',
    itemCount: entries.length,
    items,
  };
  
  try {
    await set(newShareRef, shareData);
    console.log('[Share] Collection saved with ID:', shareId);
    return shareId;
  } catch (err) {
    console.error('[Share] Failed to save collection:', err);
    return null;
  }
}

// ============================================
// FETCH SHARED COLLECTION FROM FIREBASE
// ============================================
export async function fetchSharedCollection(userId, shareId) {
  if (!userId || !shareId) return null;
  
  try {
    const db = getFirebaseDatabase();
    const shareRef = ref(db, `sharedCollections/${userId}/${shareId}`);
    const snapshot = await get(shareRef);
    
    if (snapshot.exists()) {
      return snapshot.val();
    }
    return null;
  } catch (err) {
    console.error('[Share] Failed to fetch collection:', err);
    return null;
  }
}

// ============================================
// GENERATE COLLECTION SHARE URL (async - saves to Firebase first)
// ============================================
export async function generateCollectionShareUrl(seriesName, entries, primaryItem) {
  if (!seriesName || !entries?.length) return null;
  
  const currentUser = getCurrentUser();
  if (!currentUser) {
    console.error('[Share] Cannot share collection - not logged in');
    return null;
  }
  
  // Save collection to Firebase and get share ID
  const shareId = await saveSharedCollection(seriesName, entries, primaryItem);
  if (!shareId) {
    return null;
  }
  
  const params = new URLSearchParams();
  params.set('collection', 'true');
  params.set('series', seriesName);
  params.set('shareId', shareId);
  params.set('uid', currentUser.uid);
  params.set('count', String(entries.length));
  
  if (currentUser.displayName) {
    params.set('user', currentUser.displayName);
  }
  
  // Use the primary item's poster as the collection poster
  if (primaryItem?.poster) {
    params.set('poster', primaryItem.poster);
  }
  
  // Count movies vs seasons/episodes
  const movieCount = entries.filter(e => {
    const type = e.item?.imdbType || e.listType;
    return type === 'movie' || type === 'movies';
  }).length;
  const seasonCount = entries.length - movieCount;
  
  if (movieCount > 0) params.set('movies', String(movieCount));
  if (seasonCount > 0) params.set('seasons', String(seasonCount));
  
  // Calculate total episodes if available
  let totalEpisodes = 0;
  entries.forEach(e => {
    const item = e.item;
    if (item) {
      const eps = item.tvEpisodeCount || item.episodeCount || 
        (Array.isArray(item.episodes) ? item.episodes.length : 0) ||
        item.animeEpisodes || 0;
      totalEpisodes += Number(eps) || 0;
    }
  });
  if (totalEpisodes > 0) params.set('episodes', String(totalEpisodes));
  
  // Get year range
  const years = entries.map(e => Number(e.item?.year)).filter(y => y > 0).sort((a, b) => a - b);
  if (years.length) {
    const minYear = years[0];
    const maxYear = years[years.length - 1];
    params.set('yearRange', minYear === maxYear ? String(minYear) : `${minYear}-${maxYear}`);
  }
  
  // Cache-buster
  params.set('v', Date.now().toString());
  
  return `${SHARE_WORKER_URL}?${params.toString()}`;
}

// ============================================
// BUILD COLLECTION DISCORD MESSAGE
// ============================================
export async function buildCollectionDiscordMessage(seriesName, entries, primaryItem) {
  if (!seriesName || !entries?.length) return '';
  
  const shareUrl = await generateCollectionShareUrl(seriesName, entries, primaryItem);
  
  // Just return the URL for Discord's embed
  return shareUrl || '';
}

// ============================================
// PARSE SHARE URL
// ============================================
export function parseShareUrl(urlString) {
  try {
    const url = new URL(urlString || window.location.href);
    const params = url.searchParams;
    
    // Check if this is a collection share
    const isCollection = params.has(`${SHARE_PARAM_PREFIX}collection`) || params.has('collection');
    if (isCollection) {
      return {
        isCollection: true,
        seriesName: params.get(`${SHARE_PARAM_PREFIX}series`) || params.get('series') || '',
        shareId: params.get(`${SHARE_PARAM_PREFIX}shareId`) || params.get('shareId') || '',
        uid: params.get(`${SHARE_PARAM_PREFIX}uid`) || params.get('uid') || '',
        count: params.get(`${SHARE_PARAM_PREFIX}count`) || params.get('count') || '',
        movies: params.get(`${SHARE_PARAM_PREFIX}movies`) || params.get('movies') || '',
        seasons: params.get(`${SHARE_PARAM_PREFIX}seasons`) || params.get('seasons') || '',
        episodes: params.get(`${SHARE_PARAM_PREFIX}episodes`) || params.get('episodes') || '',
        yearRange: params.get(`${SHARE_PARAM_PREFIX}yearRange`) || params.get('yearRange') || '',
        poster: params.get(`${SHARE_PARAM_PREFIX}poster`) || params.get('poster') || '',
        user: params.get(`${SHARE_PARAM_PREFIX}user`) || params.get('user') || '',
      };
    }
    
    // Check if this is a share URL (accept both prefixed and plain params for resilience)
    const hasPrefixed = params.has(`${SHARE_PARAM_PREFIX}type`) || params.has(`${SHARE_PARAM_PREFIX}title`);
    const hasPlain = params.has('type') || params.has('title');
    if (!hasPrefixed && !hasPlain) return null;
    
    const shareData = {
      isCollection: false,
      listType: params.get(`${SHARE_PARAM_PREFIX}type`) || params.get('type') || 'movies',
      title: params.get(`${SHARE_PARAM_PREFIX}title`) || params.get('title') || '',
      year: params.get(`${SHARE_PARAM_PREFIX}year`) || params.get('year') || '',
      tmdbId: params.get(`${SHARE_PARAM_PREFIX}tmdbId`) || params.get('tmdbId') || '',
      imdbId: params.get(`${SHARE_PARAM_PREFIX}imdbId`) || params.get('imdbId') || '',
      poster: params.get(`${SHARE_PARAM_PREFIX}poster`) || params.get('poster') || '',
      director: params.get(`${SHARE_PARAM_PREFIX}director`) || params.get('director') || '',
      author: params.get(`${SHARE_PARAM_PREFIX}author`) || params.get('author') || '',
      overview: params.get(`${SHARE_PARAM_PREFIX}overview`) || params.get('overview') || '',
      genres: (params.get(`${SHARE_PARAM_PREFIX}genres`) || params.get('genres') || '')
        .split(',')
        .filter(Boolean),
      rating: params.get(`${SHARE_PARAM_PREFIX}rating`) || params.get('rating') || '',
      seriesName: params.get(`${SHARE_PARAM_PREFIX}series`) || params.get('series') || '',
    };
    
    return shareData;
  } catch (err) {
    console.warn('Failed to parse share URL:', err);
    return null;
  }
}

// ============================================
// BUILD DISCORD MESSAGE
// ============================================
export function buildDiscordMessage(listType, item) {
  if (!item) return '';
  
  const typeLabel = MEDIA_TYPE_LABELS[listType] || listType;
  const title = item.title || 'Unknown Title';
  const year = item.year ? ` (${item.year})` : '';
  const creator = item.director || item.author || '';
  const creatorLine = creator ? `\n👤 **${listType === 'books' ? 'Author' : 'Director'}:** ${creator}` : '';
  const rating = item.rating ? `\n⭐ **Rating:** ${item.rating}/10` : '';
  const genres = item.genres?.length ? `\n🎭 **Genres:** ${item.genres.slice(0, 3).join(', ')}` : '';
  const series = item.seriesName ? `\n📚 **Series:** ${item.seriesName}` : '';
  
  const shareUrl = generateShareUrl(listType, item);
  
  // Discord auto-embeds the URL using our Worker's OG tags
  // Just include the URL on its own line for the embed to appear
  const message = `${shareUrl}`;


  return message.trim();
}

// ============================================
// SHARE MODAL
// ============================================
let activeShareModal = null;

export function closeShareModal() {
  if (activeShareModal) {
    activeShareModal.backdrop?.remove();
    document.removeEventListener('keydown', activeShareModal.keyHandler);
    activeShareModal = null;
  }
}

export function openShareModal(listType, item) {
  closeShareModal();
  if (!modalRoot) return;
  
  const backdrop = createEl('div', 'modal-backdrop share-modal-backdrop');
  const modal = createEl('div', 'modal share-modal');
  modal.style.maxWidth = '500px';
  
  // Header
  const header = createEl('div', 'modal-header');
  header.appendChild(createEl('h2', '', { text: 'Share to Discord' }));
  modal.appendChild(header);
  
  // Preview card
  const preview = createEl('div', 'share-preview');
  preview.style.cssText = `
    background: var(--card-bg, #1f1f1f);
    border-radius: 8px;
    padding: 1rem;
    margin-bottom: 1rem;
    display: flex;
    gap: 1rem;
    align-items: flex-start;
  `;
  
  // Poster
  if (item.poster) {
    const posterImg = createEl('img', 'share-preview-poster');
    posterImg.src = item.poster;
    posterImg.alt = item.title || 'Poster';
    posterImg.style.cssText = `
      width: 80px;
      height: 120px;
      object-fit: cover;
      border-radius: 4px;
      flex-shrink: 0;
    `;
    preview.appendChild(posterImg);
  }
  
  // Info
  const info = createEl('div', 'share-preview-info');
  info.style.flex = '1';
  
  const titleEl = createEl('div', 'share-preview-title');
  titleEl.textContent = item.title || 'Unknown Title';
  titleEl.style.cssText = 'font-weight: 600; font-size: 1.1rem; margin-bottom: 0.25rem;';
  info.appendChild(titleEl);
  
  const metaEl = createEl('div', 'share-preview-meta');
  const typeLabel = MEDIA_TYPE_LABELS[listType] || listType;
  metaEl.textContent = `${typeLabel}${item.year ? ` • ${item.year}` : ''}`;
  metaEl.style.cssText = 'color: var(--text-muted, #888); font-size: 0.85rem;';
  info.appendChild(metaEl);
  
  if (item.director || item.author) {
    const creatorEl = createEl('div', 'share-preview-creator');
    creatorEl.textContent = item.director || item.author;
    creatorEl.style.cssText = 'color: var(--text-muted, #888); font-size: 0.85rem; margin-top: 0.25rem;';
    info.appendChild(creatorEl);
  }
  
  preview.appendChild(info);
  modal.appendChild(preview);
  
  // Discord message textarea
  const messageLabel = createEl('label', 'form-label');
  messageLabel.textContent = 'Discord Message:';
  messageLabel.style.cssText = 'display: block; margin-bottom: 0.5rem; font-weight: 500;';
  modal.appendChild(messageLabel);
  
  const discordMessage = buildDiscordMessage(listType, item);
  const textarea = createEl('textarea', 'share-textarea');
  textarea.value = discordMessage;
  textarea.readOnly = true;
  textarea.style.cssText = `
    width: 100%;
    min-height: 180px;
    padding: 0.75rem;
    background: var(--input-bg, #2a2a2a);
    border: 1px solid var(--border, #333);
    border-radius: 6px;
    color: var(--text, #fff);
    font-family: inherit;
    font-size: 0.85rem;
    resize: vertical;
    margin-bottom: 1rem;
  `;
  modal.appendChild(textarea);
  
  // Actions
  const actions = createEl('div', 'share-actions');
  actions.style.cssText = 'display: flex; gap: 0.5rem; justify-content: flex-end;';
  
  // Copy Message button
  const copyMsgBtn = createEl('button', 'btn primary', { text: 'Copy Message' });
  copyMsgBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(discordMessage);
      copyMsgBtn.textContent = 'Copied!';
      copyMsgBtn.classList.add('success');
      setTimeout(() => {
        copyMsgBtn.textContent = 'Copy Message';
        copyMsgBtn.classList.remove('success');
      }, 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
      // Fallback: select text
      textarea.select();
      document.execCommand('copy');
      copyMsgBtn.textContent = 'Copied!';
      setTimeout(() => { copyMsgBtn.textContent = 'Copy Message'; }, 2000);
    }
  });
  actions.appendChild(copyMsgBtn);
  
  // Copy Link button
  const shareUrl = generateShareUrl(listType, item);
  const copyLinkBtn = createEl('button', 'btn secondary', { text: 'Copy Link' });
  copyLinkBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      copyLinkBtn.textContent = 'Copied!';
      setTimeout(() => { copyLinkBtn.textContent = 'Copy Link'; }, 2000);
    } catch (err) {
      console.error('Failed to copy link:', err);
    }
  });
  actions.appendChild(copyLinkBtn);
  
  // Cancel button
  const cancelBtn = createEl('button', 'btn ghost', { text: 'Close' });
  cancelBtn.addEventListener('click', closeShareModal);
  actions.appendChild(cancelBtn);
  
  modal.appendChild(actions);
  
  // Close on backdrop click
  backdrop.addEventListener('click', (ev) => {
    if (ev.target === backdrop) closeShareModal();
  });
  
  // Close on Escape
  const keyHandler = (ev) => {
    if (ev.key === 'Escape') {
      closeShareModal();
      document.removeEventListener('keydown', keyHandler);
    }
  };
  document.addEventListener('keydown', keyHandler);
  
  backdrop.appendChild(modal);
  modalRoot.appendChild(backdrop);
  
  activeShareModal = { backdrop, modal, keyHandler };
}

// ============================================
// OPEN COLLECTION SHARE MODAL
// ============================================
export async function openCollectionShareModal(seriesName, entries, primaryItem) {
  closeShareModal();
  if (!modalRoot || !seriesName || !entries?.length) return;
  
  const backdrop = createEl('div', 'modal-backdrop share-modal-backdrop');
  const modal = createEl('div', 'modal share-modal');
  modal.style.maxWidth = '550px';
  
  // Header
  const header = createEl('div', 'modal-header');
  header.appendChild(createEl('h2', '', { text: 'Share Collection' }));
  modal.appendChild(header);
  
  // Preview card
  const preview = createEl('div', 'share-preview collection-share-preview');
  preview.style.cssText = `
    background: var(--card-bg, #1f1f1f);
    border-radius: 8px;
    padding: 1rem;
    margin-bottom: 1rem;
  `;
  
  // Collection header with poster stack
  const previewHeader = createEl('div', 'share-preview-header');
  previewHeader.style.cssText = 'display: flex; gap: 1rem; align-items: flex-start; margin-bottom: 0.75rem;';
  
  // Show up to 3 posters in a stack
  const posterStack = createEl('div', 'share-poster-stack');
  posterStack.style.cssText = 'position: relative; width: 90px; height: 130px; flex-shrink: 0;';
  
  const posterEntries = entries.filter(e => e.item?.poster).slice(0, 3);
  posterEntries.forEach((entry, idx) => {
    const img = createEl('img');
    img.src = entry.item.poster;
    img.alt = entry.item.title || 'Poster';
    img.style.cssText = `
      position: absolute;
      width: 70px;
      height: 105px;
      object-fit: cover;
      border-radius: 4px;
      border: 2px solid var(--bg, #111);
      left: ${idx * 10}px;
      top: ${idx * 5}px;
      z-index: ${3 - idx};
    `;
    posterStack.appendChild(img);
  });
  previewHeader.appendChild(posterStack);
  
  // Collection info
  const infoDiv = createEl('div', 'share-collection-info');
  infoDiv.style.flex = '1';
  
  const titleEl = createEl('div', 'share-preview-title');
  titleEl.textContent = seriesName;
  titleEl.style.cssText = 'font-weight: 600; font-size: 1.15rem; margin-bottom: 0.35rem;';
  infoDiv.appendChild(titleEl);
  
  // Stats badges
  const statsRow = createEl('div', 'share-collection-stats');
  statsRow.style.cssText = 'display: flex; flex-wrap: wrap; gap: 0.4rem; margin-bottom: 0.5rem;';
  
  const movieCount = entries.filter(e => {
    const type = e.item?.imdbType || e.listType;
    return type === 'movie' || type === 'movies';
  }).length;
  const seasonCount = entries.length - movieCount;
  
  if (movieCount > 0) {
    const movieBadge = createEl('span', 'share-stat-badge');
    movieBadge.textContent = `${movieCount} Movie${movieCount !== 1 ? 's' : ''}`;
    movieBadge.style.cssText = 'background: rgba(245,158,11,0.15); border: 1px solid rgba(245,158,11,0.4); padding: 0.2rem 0.5rem; border-radius: 999px; font-size: 0.75rem; color: #fbbf24;';
    statsRow.appendChild(movieBadge);
  }
  
  if (seasonCount > 0) {
    const seasonBadge = createEl('span', 'share-stat-badge');
    seasonBadge.textContent = `${seasonCount} Season${seasonCount !== 1 ? 's' : ''}`;
    seasonBadge.style.cssText = 'background: rgba(59,130,246,0.15); border: 1px solid rgba(59,130,246,0.4); padding: 0.2rem 0.5rem; border-radius: 999px; font-size: 0.75rem; color: #60a5fa;';
    statsRow.appendChild(seasonBadge);
  }
  
  // Total episodes
  let totalEpisodes = 0;
  entries.forEach(e => {
    const item = e.item;
    if (item) {
      const eps = item.tvEpisodeCount || item.episodeCount || 
        (Array.isArray(item.episodes) ? item.episodes.length : 0) ||
        item.animeEpisodes || 0;
      totalEpisodes += Number(eps) || 0;
    }
  });
  if (totalEpisodes > 0) {
    const epBadge = createEl('span', 'share-stat-badge');
    epBadge.textContent = `${totalEpisodes} Episode${totalEpisodes !== 1 ? 's' : ''}`;
    epBadge.style.cssText = 'background: rgba(16,185,129,0.15); border: 1px solid rgba(16,185,129,0.4); padding: 0.2rem 0.5rem; border-radius: 999px; font-size: 0.75rem; color: #34d399;';
    statsRow.appendChild(epBadge);
  }
  
  infoDiv.appendChild(statsRow);
  
  // Year range
  const years = entries.map(e => Number(e.item?.year)).filter(y => y > 0).sort((a, b) => a - b);
  if (years.length) {
    const minYear = years[0];
    const maxYear = years[years.length - 1];
    const yearText = minYear === maxYear ? String(minYear) : `${minYear} - ${maxYear}`;
    const yearEl = createEl('div', 'share-collection-years');
    yearEl.textContent = yearText;
    yearEl.style.cssText = 'color: var(--text-muted, #888); font-size: 0.85rem;';
    infoDiv.appendChild(yearEl);
  }
  
  previewHeader.appendChild(infoDiv);
  preview.appendChild(previewHeader);
  
  // List of entries
  const entriesList = createEl('div', 'share-entries-list');
  entriesList.style.cssText = 'max-height: 180px; overflow-y: auto; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 0.65rem; margin-top: 0.5rem;';
  
  entries.slice(0, 10).forEach((entry, idx) => {
    const item = entry.item;
    const row = createEl('div', 'share-entry-row');
    row.style.cssText = 'display: flex; align-items: center; gap: 0.5rem; padding: 0.25rem 0; font-size: 0.85rem;';
    
    const num = createEl('span', 'share-entry-num');
    num.textContent = `#${idx + 1}`;
    num.style.cssText = 'color: var(--text-muted, #888); min-width: 28px;';
    row.appendChild(num);
    
    const title = createEl('span', 'share-entry-title');
    title.textContent = item?.title || 'Unknown';
    title.style.cssText = 'flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;';
    row.appendChild(title);
    
    if (item?.year) {
      const year = createEl('span', 'share-entry-year');
      year.textContent = item.year;
      year.style.cssText = 'color: var(--text-muted, #888);';
      row.appendChild(year);
    }
    
    entriesList.appendChild(row);
  });
  
  if (entries.length > 10) {
    const moreRow = createEl('div', 'share-entry-more');
    moreRow.textContent = `+${entries.length - 10} more...`;
    moreRow.style.cssText = 'color: var(--text-muted, #888); font-size: 0.8rem; padding: 0.35rem 0;';
    entriesList.appendChild(moreRow);
  }
  
  preview.appendChild(entriesList);
  modal.appendChild(preview);
  
  // Discord message
  const messageLabel = createEl('label', 'form-label');
  messageLabel.textContent = 'Discord Share Link:';
  messageLabel.style.cssText = 'display: block; margin-bottom: 0.5rem; font-weight: 500;';
  modal.appendChild(messageLabel);
  
  const shareUrl = await generateCollectionShareUrl(seriesName, entries, primaryItem);
  const textarea = createEl('textarea', 'share-textarea');
  textarea.value = shareUrl || 'Failed to generate share link. Please try again.';
  textarea.readOnly = true;
  textarea.style.cssText = `
    width: 100%;
    min-height: 80px;
    padding: 0.75rem;
    background: var(--input-bg, #2a2a2a);
    border: 1px solid var(--border, #333);
    border-radius: 6px;
    color: var(--text, #fff);
    font-family: inherit;
    font-size: 0.85rem;
    resize: vertical;
    margin-bottom: 1rem;
  `;
  modal.appendChild(textarea);
  
  // Actions
  const actions = createEl('div', 'share-actions');
  actions.style.cssText = 'display: flex; gap: 0.5rem; justify-content: flex-end;';
  
  // Copy Link button
  const copyBtn = createEl('button', 'btn primary', { text: 'Copy Link' });
  copyBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      copyBtn.textContent = 'Copied!';
      copyBtn.classList.add('success');
      setTimeout(() => {
        copyBtn.textContent = 'Copy Link';
        copyBtn.classList.remove('success');
      }, 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
      textarea.select();
      document.execCommand('copy');
      copyBtn.textContent = 'Copied!';
      setTimeout(() => { copyBtn.textContent = 'Copy Link'; }, 2000);
    }
  });
  actions.appendChild(copyBtn);
  
  // Close button
  const closeBtn = createEl('button', 'btn ghost', { text: 'Close' });
  closeBtn.addEventListener('click', closeShareModal);
  actions.appendChild(closeBtn);
  
  modal.appendChild(actions);
  
  // Close on backdrop click
  backdrop.addEventListener('click', (ev) => {
    if (ev.target === backdrop) closeShareModal();
  });
  
  // Close on Escape
  const keyHandler = (ev) => {
    if (ev.key === 'Escape') {
      closeShareModal();
      document.removeEventListener('keydown', keyHandler);
    }
  };
  document.addEventListener('keydown', keyHandler);
  
  backdrop.appendChild(modal);
  modalRoot.appendChild(backdrop);
  
  activeShareModal = { backdrop, modal, keyHandler };
}

// ============================================
// SHARED ITEM POPUP (for incoming share links)
// ============================================
let activeSharedItemModal = null;

export function closeSharedItemModal() {
  if (activeSharedItemModal) {
    activeSharedItemModal.backdrop?.remove();
    document.removeEventListener('keydown', activeSharedItemModal.keyHandler);
    activeSharedItemModal = null;
    
    // Clear share params from URL without reloading
    const url = new URL(window.location.href);
    const keysToDelete = [];
    url.searchParams.forEach((_, key) => {
      if (key.startsWith(SHARE_PARAM_PREFIX)) {
        keysToDelete.push(key);
      }
    });
    keysToDelete.forEach(key => url.searchParams.delete(key));
    window.history.replaceState({}, '', url.pathname + (url.searchParams.toString() ? '?' + url.searchParams.toString() : ''));
  }
}

export function openSharedItemModal(shareData) {
  closeSharedItemModal();
  if (!modalRoot || !shareData) return;
  
  const backdrop = createEl('div', 'modal-backdrop shared-item-modal-backdrop');
  const modal = createEl('div', 'modal shared-item-modal');
  modal.style.maxWidth = '450px';
  
  // Header
  const header = createEl('div', 'modal-header');
  header.appendChild(createEl('h2', '', { text: 'Shared Media' }));
  modal.appendChild(header);
  
  // Card preview
  const card = createEl('div', 'shared-item-card');
  card.style.cssText = `
    background: var(--card-bg, #1f1f1f);
    border-radius: 12px;
    overflow: hidden;
    margin-bottom: 1rem;
  `;
  
  // Poster section
  if (shareData.poster) {
    const posterWrapper = createEl('div', 'shared-item-poster-wrapper');
    posterWrapper.style.cssText = `
      width: 100%;
      height: 200px;
      overflow: hidden;
      position: relative;
    `;
    
    const posterImg = createEl('img', 'shared-item-poster');
    posterImg.src = shareData.poster;
    posterImg.alt = shareData.title || 'Poster';
    posterImg.style.cssText = `
      width: 100%;
      height: 100%;
      object-fit: cover;
      filter: blur(8px) brightness(0.5);
    `;
    posterWrapper.appendChild(posterImg);
    
    // Centered poster thumbnail
    const thumbImg = createEl('img', 'shared-item-thumb');
    thumbImg.src = shareData.poster;
    thumbImg.alt = shareData.title || 'Poster';
    thumbImg.style.cssText = `
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      height: 180px;
      width: auto;
      border-radius: 8px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.5);
    `;
    posterWrapper.appendChild(thumbImg);
    
    card.appendChild(posterWrapper);
  }
  
  // Info section
  const info = createEl('div', 'shared-item-info');
  info.style.padding = '1rem';
  
  const title = createEl('h3', 'shared-item-title');
  title.textContent = shareData.title || 'Unknown Title';
  title.style.cssText = 'margin: 0 0 0.5rem; font-size: 1.25rem;';
  info.appendChild(title);
  
  const typeLabel = MEDIA_TYPE_LABELS[shareData.listType] || shareData.listType;
  const meta = createEl('div', 'shared-item-meta');
  meta.style.cssText = 'color: var(--text-muted, #888); font-size: 0.9rem; margin-bottom: 0.5rem;';
  meta.textContent = `${typeLabel}${shareData.year ? ` • ${shareData.year}` : ''}`;
  info.appendChild(meta);
  
  const creator = shareData.director || shareData.author;
  if (creator) {
    const creatorEl = createEl('div', 'shared-item-creator');
    creatorEl.style.cssText = 'color: var(--text-muted, #888); font-size: 0.85rem; margin-bottom: 0.5rem;';
    creatorEl.textContent = `${shareData.listType === 'books' ? 'Author' : 'Director'}: ${creator}`;
    info.appendChild(creatorEl);
  }
  
  if (shareData.genres?.length) {
    const genresEl = createEl('div', 'shared-item-genres');
    genresEl.style.cssText = 'display: flex; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 0.75rem;';
    shareData.genres.forEach(genre => {
      const chip = createEl('span', 'genre-chip');
      chip.textContent = genre;
      chip.style.cssText = `
        background: var(--chip-bg, #333);
        padding: 0.2rem 0.5rem;
        border-radius: 4px;
        font-size: 0.75rem;
      `;
      genresEl.appendChild(chip);
    });
    info.appendChild(genresEl);
  }
  
  if (shareData.overview) {
    const overviewEl = createEl('p', 'shared-item-overview');
    overviewEl.textContent = shareData.overview;
    overviewEl.style.cssText = `
      color: var(--text-muted, #aaa);
      font-size: 0.85rem;
      line-height: 1.5;
      margin: 0;
    `;
    info.appendChild(overviewEl);
  }
  
  card.appendChild(info);
  modal.appendChild(card);
  
  // Actions
  const actions = createEl('div', 'shared-item-actions');
  actions.style.cssText = 'display: flex; gap: 0.5rem; justify-content: flex-end;';
  
  // Add to List button
  const addBtn = createEl('button', 'btn primary', { text: 'Add to My List' });
  addBtn.addEventListener('click', async () => {
    const currentUser = getCurrentUser();
    if (!currentUser) {
      alert('Please sign in to add items to your list.');
      return;
    }
    
    addBtn.disabled = true;
    addBtn.textContent = 'Adding...';
    
    try {
      // Build item data from share data
      let itemData = {
        title: shareData.title,
        year: shareData.year || null,
        poster: shareData.poster || null,
        addedAt: new Date().toISOString(),
      };
      
      if (shareData.listType === 'books') {
        itemData.author = shareData.author || null;
      } else {
        itemData.director = shareData.director || null;
      }
      
      if (shareData.tmdbId) {
        itemData.tmdbId = shareData.tmdbId;
      }
      if (shareData.imdbId) {
        itemData.imdbId = shareData.imdbId;
      }
      if (shareData.seriesName) {
        itemData.seriesName = shareData.seriesName;
      }
      if (shareData.genres?.length) {
        itemData.genres = shareData.genres;
      }
      if (shareData.overview) {
        itemData.overview = shareData.overview;
      }
      
      // Try to fetch full metadata if we have a tmdbId
      if (shareData.tmdbId && shareData.listType !== 'books') {
        try {
          const metadata = await fetchTmdbMetadata(shareData.listType, {
            tmdbId: shareData.tmdbId,
            title: shareData.title,
            year: shareData.year,
          });
          if (metadata) {
            const enriched = deriveMetadataAssignments(metadata, itemData, {
              overwrite: false,
              fallbackTitle: shareData.title,
              fallbackYear: shareData.year,
              listType: shareData.listType,
            });
            itemData = { ...itemData, ...enriched };
          }
        } catch (metaErr) {
          console.warn('Failed to fetch metadata for shared item:', metaErr);
        }
      }
      
      await addItem(shareData.listType, itemData);
      
      addBtn.textContent = 'Added!';
      addBtn.classList.add('success');
      
      setTimeout(() => {
        closeSharedItemModal();
      }, 1500);
      
    } catch (err) {
      console.error('Failed to add shared item:', err);
      addBtn.disabled = false;
      addBtn.textContent = 'Add to My List';
      alert('Failed to add item. Please try again.');
    }
  });
  actions.appendChild(addBtn);
  
  // Close button
  const closeBtn = createEl('button', 'btn ghost', { text: 'Close' });
  closeBtn.addEventListener('click', closeSharedItemModal);
  actions.appendChild(closeBtn);
  
  modal.appendChild(actions);
  
  // Close on backdrop click
  backdrop.addEventListener('click', (ev) => {
    if (ev.target === backdrop) closeSharedItemModal();
  });
  
  // Close on Escape
  const keyHandler = (ev) => {
    if (ev.key === 'Escape') closeSharedItemModal();
  };
  document.addEventListener('keydown', keyHandler);
  
  backdrop.appendChild(modal);
  modalRoot.appendChild(backdrop);
  
  activeSharedItemModal = { backdrop, modal, keyHandler };
}

// ============================================
// SHARED COLLECTION POPUP
// ============================================
export function openSharedCollectionModal(shareData) {
  closeSharedItemModal();
  if (!modalRoot) {
    console.error('[Share] modalRoot not available');
    return;
  }
  
  const backdrop = createEl('div', 'modal-backdrop shared-collection-modal-backdrop');
  const modal = createEl('div', 'modal shared-collection-modal');
  modal.style.maxWidth = '500px';
  
  // Header
  const header = createEl('div', 'modal-header');
  header.appendChild(createEl('h2', '', { text: '📚 Shared Collection' }));
  modal.appendChild(header);
  
  // Collection info
  const content = createEl('div', 'shared-collection-content');
  content.style.cssText = 'padding: 1rem; text-align: center;';
  
  // Poster if available
  if (shareData.poster) {
    const posterImg = createEl('img', 'shared-collection-poster');
    posterImg.src = shareData.poster;
    posterImg.alt = shareData.seriesName;
    posterImg.style.cssText = 'width: 120px; height: 180px; object-fit: cover; border-radius: 8px; margin-bottom: 1rem;';
    content.appendChild(posterImg);
  }
  
  // Title
  const title = createEl('h3', 'shared-collection-title');
  title.textContent = shareData.seriesName;
  title.style.cssText = 'margin: 0 0 0.75rem; font-size: 1.4rem;';
  content.appendChild(title);
  
  // Stats
  const stats = createEl('div', 'shared-collection-stats');
  stats.style.cssText = 'display: flex; flex-wrap: wrap; justify-content: center; gap: 0.5rem; margin-bottom: 0.75rem;';
  
  const movieNum = parseInt(shareData.movies, 10) || 0;
  const seasonNum = parseInt(shareData.seasons, 10) || 0;
  const episodeNum = parseInt(shareData.episodes, 10) || 0;
  
  if (movieNum > 0) {
    const badge = createEl('span', 'collection-stat-badge');
    badge.textContent = `🎬 ${movieNum} Movie${movieNum !== 1 ? 's' : ''}`;
    badge.style.cssText = 'background: rgba(245,158,11,0.15); border: 1px solid rgba(245,158,11,0.4); padding: 0.3rem 0.65rem; border-radius: 999px; font-size: 0.85rem; color: #fbbf24;';
    stats.appendChild(badge);
  }
  
  if (seasonNum > 0) {
    const badge = createEl('span', 'collection-stat-badge');
    badge.textContent = `📺 ${seasonNum} Season${seasonNum !== 1 ? 's' : ''}`;
    badge.style.cssText = 'background: rgba(59,130,246,0.15); border: 1px solid rgba(59,130,246,0.4); padding: 0.3rem 0.65rem; border-radius: 999px; font-size: 0.85rem; color: #60a5fa;';
    stats.appendChild(badge);
  }
  
  if (episodeNum > 0) {
    const badge = createEl('span', 'collection-stat-badge');
    badge.textContent = `📼 ${episodeNum} Episode${episodeNum !== 1 ? 's' : ''}`;
    badge.style.cssText = 'background: rgba(16,185,129,0.15); border: 1px solid rgba(16,185,129,0.4); padding: 0.3rem 0.65rem; border-radius: 999px; font-size: 0.85rem; color: #34d399;';
    stats.appendChild(badge);
  }
  
  content.appendChild(stats);
  
  // Year range
  if (shareData.yearRange) {
    const yearEl = createEl('div', 'shared-collection-years');
    yearEl.textContent = `📅 ${shareData.yearRange}`;
    yearEl.style.cssText = 'color: var(--text-muted, #888); font-size: 0.9rem; margin-bottom: 0.5rem;';
    content.appendChild(yearEl);
  }
  
  // Shared by
  if (shareData.user) {
    const userEl = createEl('div', 'shared-collection-user');
    userEl.textContent = `Shared by ${shareData.user}`;
    userEl.style.cssText = 'color: var(--text-muted, #888); font-size: 0.85rem; margin-top: 0.5rem;';
    content.appendChild(userEl);
  }
  
  // Info message
  const infoEl = createEl('div', 'shared-collection-info');
  infoEl.style.cssText = 'color: var(--text-muted, #666); font-size: 0.8rem; margin-top: 1rem; padding: 0.75rem; background: rgba(255,255,255,0.05); border-radius: 8px;';
  
  // Check if we have Firebase data to fetch
  const hasFirebaseData = shareData.shareId && shareData.uid;
  const isLoggedIn = !!getCurrentUser();
  
  if (hasFirebaseData && isLoggedIn) {
    infoEl.textContent = 'Click "Add Collection" to add all items from this collection to your list.';
  } else if (hasFirebaseData && !isLoggedIn) {
    infoEl.textContent = 'Sign in to add this collection to your list.';
  } else {
    infoEl.textContent = 'This is a collection preview. Search for individual titles to add them to your list.';
  }
  content.appendChild(infoEl);
  
  modal.appendChild(content);
  
  // Actions
  const actions = createEl('div', 'modal-actions');
  actions.style.cssText = 'display: flex; justify-content: center; gap: 0.75rem; padding: 1rem;';
  
  // Add Collection button (only if we have Firebase data and user is logged in)
  if (hasFirebaseData && isLoggedIn) {
    const addBtn = createEl('button', 'btn primary', { text: '➕ Add Collection' });
    addBtn.style.cssText = 'background: linear-gradient(135deg, #10b981, #059669); border: none;';
    addBtn.addEventListener('click', async () => {
      addBtn.disabled = true;
      addBtn.textContent = '⏳ Adding...';
      
      try {
        const collectionData = await fetchSharedCollection(shareData.uid, shareData.shareId);
        if (!collectionData || !collectionData.items || collectionData.items.length === 0) {
          alert('Could not fetch collection data. The share link may have expired.');
          addBtn.textContent = '❌ Failed';
          return;
        }
        
        let added = 0;
        let errors = 0;
        
        for (const item of collectionData.items) {
          try {
            // Prepare item for adding
            const itemData = {
              title: item.title || '',
              year: item.year || '',
              poster: item.poster || '',
              tmdbId: item.tmdbId || null,
              imdbId: item.imdbId || '',
              seriesName: item.seriesName || '',
              seriesOrder: item.seriesOrder || null,
              seasonNumber: item.seasonNumber ?? null,
              tvEpisodeCount: item.tvEpisodeCount || null,
              animeEpisodes: item.animeEpisodes || null,
              runtime: item.runtime || '',
              director: item.director || '',
              plot: item.plot || '',
              genres: item.genres || [],
              imdbType: item.imdbType || '',
              createdAt: Date.now(),
              updatedAt: Date.now(),
            };
            
            // Filter out null/undefined values
            Object.keys(itemData).forEach(key => {
              if (itemData[key] === null || itemData[key] === undefined || itemData[key] === '') {
                delete itemData[key];
              }
            });
            
            // Determine list type
            const listType = item.listType || 'movies';
            await addItem(listType, itemData);
            added++;
          } catch (err) {
            console.error('[Share] Failed to add item:', item.title, err);
            errors++;
          }
        }
        
        addBtn.textContent = `✅ Added ${added} items`;
        addBtn.style.background = '#10b981';
        
        if (errors > 0) {
          addBtn.textContent += ` (${errors} failed)`;
        }
        
        // Close modal after a brief delay
        setTimeout(() => closeSharedItemModal(), 1500);
        
      } catch (err) {
        console.error('[Share] Error adding collection:', err);
        addBtn.textContent = '❌ Error';
        alert('Failed to add collection. Please try again.');
      }
    });
    actions.appendChild(addBtn);
  }
  
  const closeBtn = createEl('button', 'btn', { text: 'Close' });
  if (!hasFirebaseData || !isLoggedIn) {
    closeBtn.className = 'btn primary';
    closeBtn.textContent = 'Got it!';
  }
  closeBtn.addEventListener('click', closeSharedItemModal);
  actions.appendChild(closeBtn);
  
  modal.appendChild(actions);
  
  // Close on backdrop click
  backdrop.addEventListener('click', (ev) => {
    if (ev.target === backdrop) closeSharedItemModal();
  });
  
  // Close on Escape
  const keyHandler = (ev) => {
    if (ev.key === 'Escape') closeSharedItemModal();
  };
  document.addEventListener('keydown', keyHandler);
  
  backdrop.appendChild(modal);
  modalRoot.appendChild(backdrop);
  
  // Clear share params from URL
  const cleanUrl = window.location.origin + window.location.pathname;
  window.history.replaceState({}, document.title, cleanUrl);
  
  activeSharedItemModal = { backdrop, modal, keyHandler };
}

// ============================================
// CHECK FOR INCOMING SHARE ON PAGE LOAD
// ============================================
export async function checkForIncomingShare() {
  console.log('[Share] Checking for incoming share, URL:', window.location.href);
  const shareData = parseShareUrl();
  console.log('[Share] Parsed share data:', shareData);
  
  if (!shareData) {
    console.log('[Share] No valid share data found');
    return false;
  }
  
  // Try to delegate to another open tab first
  const delegated = await tryDelegateShare(shareData);
  if (delegated) {
    console.log('[Share] Share delegated to another tab');
    return true;
  }
  
  // Handle collection shares
  if (shareData.isCollection && shareData.seriesName) {
    console.log('[Share] Found collection share:', shareData.seriesName);
    setTimeout(() => {
      openSharedCollectionModal(shareData);
    }, 500);
    return true;
  }
  
  // Handle single item shares
  if (shareData.title) {
    console.log('[Share] Found share with title:', shareData.title);
    // Small delay to ensure the page is ready
    setTimeout(() => {
      console.log('[Share] Opening shared item modal, modalRoot:', modalRoot);
      openSharedItemModal(shareData);
    }, 500);
    return true;
  }
  
  console.log('[Share] No valid share data found');
  return false;
}

// ============================================
// EXPORTS
// ============================================
export default {
  generateShareUrl,
  parseShareUrl,
  buildDiscordMessage,
  openShareModal,
  closeShareModal,
  openSharedItemModal,
  closeSharedItemModal,
  checkForIncomingShare,
};
