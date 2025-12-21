// Share Module
// Handles sharing media items to Discord and other platforms
import { createEl } from './utils.js';
import { modalRoot } from './dom.js';
import { MEDIA_TYPE_LABELS } from './config.js';
import { getCurrentUser } from './state.js';
import { addItem } from './crud.js';
import { fetchTmdbMetadata, deriveMetadataAssignments } from './metadata.js';

// ============================================
// CONSTANTS
// ============================================
const SHARE_BASE_URL = 'https://cosmicphoenix171.github.io/THE-LIST/';
const SHARE_PARAM_PREFIX = 'share_';

// ============================================
// GENERATE SHARE URL
// ============================================
export function generateShareUrl(listType, item) {
  if (!item) return null;
  
  const params = new URLSearchParams();
  params.set(`${SHARE_PARAM_PREFIX}type`, listType || '');
  params.set(`${SHARE_PARAM_PREFIX}title`, item.title || '');
  
  if (item.year) params.set(`${SHARE_PARAM_PREFIX}year`, String(item.year));
  if (item.tmdbId) params.set(`${SHARE_PARAM_PREFIX}tmdbId`, String(item.tmdbId));
  if (item.imdbId) params.set(`${SHARE_PARAM_PREFIX}imdbId`, item.imdbId);
  if (item.poster) params.set(`${SHARE_PARAM_PREFIX}poster`, item.poster);
  if (item.director) params.set(`${SHARE_PARAM_PREFIX}director`, item.director);
  if (item.author) params.set(`${SHARE_PARAM_PREFIX}author`, item.author);
  if (item.overview) {
    // Truncate overview to keep URL reasonable
    const shortOverview = item.overview.length > 150 
      ? item.overview.substring(0, 147) + '...' 
      : item.overview;
    params.set(`${SHARE_PARAM_PREFIX}overview`, shortOverview);
  }
  if (item.genres && Array.isArray(item.genres)) {
    params.set(`${SHARE_PARAM_PREFIX}genres`, item.genres.slice(0, 3).join(','));
  }
  if (item.rating) params.set(`${SHARE_PARAM_PREFIX}rating`, String(item.rating));
  if (item.seriesName) params.set(`${SHARE_PARAM_PREFIX}series`, item.seriesName);
  
  return `${SHARE_BASE_URL}?${params.toString()}`;
}

// ============================================
// PARSE SHARE URL
// ============================================
export function parseShareUrl(urlString) {
  try {
    const url = new URL(urlString || window.location.href);
    const params = url.searchParams;
    
    // Check if this is a share URL
    if (!params.has(`${SHARE_PARAM_PREFIX}type`) && !params.has(`${SHARE_PARAM_PREFIX}title`)) {
      return null;
    }
    
    const shareData = {
      listType: params.get(`${SHARE_PARAM_PREFIX}type`) || 'movies',
      title: params.get(`${SHARE_PARAM_PREFIX}title`) || '',
      year: params.get(`${SHARE_PARAM_PREFIX}year`) || '',
      tmdbId: params.get(`${SHARE_PARAM_PREFIX}tmdbId`) || '',
      imdbId: params.get(`${SHARE_PARAM_PREFIX}imdbId`) || '',
      poster: params.get(`${SHARE_PARAM_PREFIX}poster`) || '',
      director: params.get(`${SHARE_PARAM_PREFIX}director`) || '',
      author: params.get(`${SHARE_PARAM_PREFIX}author`) || '',
      overview: params.get(`${SHARE_PARAM_PREFIX}overview`) || '',
      genres: params.get(`${SHARE_PARAM_PREFIX}genres`)?.split(',').filter(Boolean) || [],
      rating: params.get(`${SHARE_PARAM_PREFIX}rating`) || '',
      seriesName: params.get(`${SHARE_PARAM_PREFIX}series`) || '',
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
  
  const message = `🎬 **${title}**${year}
📺 **Type:** ${typeLabel}${creatorLine}${rating}${genres}${series}

${item.overview ? `> ${item.overview.substring(0, 200)}${item.overview.length > 200 ? '...' : ''}` : ''}

🔗 **Add to your list:** ${shareUrl}`;

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
// CHECK FOR INCOMING SHARE ON PAGE LOAD
// ============================================
export function checkForIncomingShare() {
  const shareData = parseShareUrl();
  if (shareData && shareData.title) {
    // Small delay to ensure the page is ready
    setTimeout(() => {
      openSharedItemModal(shareData);
    }, 500);
    return true;
  }
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
