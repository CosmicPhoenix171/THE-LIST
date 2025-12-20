import { TMDB_API_KEY, TMDB_IMAGE_BASE_URL, AUTOCOMPLETE_LISTS, GOOGLE_BOOKS_API_KEY, GOOGLE_BOOKS_API_URL } from './config.js';
import { debounce, extractPrimaryYear } from './utils.js';
import { fetchTmdbMetadata, fetchGoogleBooksMetadata } from './metadata.js';

const suggestionForms = new Set();
let globalSuggestionClickBound = false;

export function getSuggestionForms() {
  return suggestionForms;
}

export function hideTitleSuggestions(form) {
  if (!form) return;
  if (form.__suggestionsEl) {
    form.__suggestionsEl.classList.remove('visible');
    form.__suggestionsEl.innerHTML = '';
  }
  if (form.__actorSuggestionsEl) {
    form.__actorSuggestionsEl.classList.remove('visible');
    form.__actorSuggestionsEl.innerHTML = '';
  }
}

export function renderTitleSuggestions(container, suggestions, onSelect) {
  container.innerHTML = '';
  if (!suggestions || suggestions.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = 'No matches found';
    container.appendChild(empty);
    return;
  }

  const provider = suggestions[0] && suggestions[0].source;
  if (provider === 'tmdb') {
    const note = document.createElement('div');
    note.className = 'suggestions-note';
    note.textContent = 'Suggestions powered by TMDb.';
    container.appendChild(note);
  } else if (provider === 'googleBooks') {
    const note = document.createElement('div');
    note.className = 'suggestions-note';
    note.textContent = 'Suggestions powered by Google Books.';
    container.appendChild(note);
  }

  suggestions.forEach(suggestion => {
    const button = document.createElement('button');
    button.type = 'button';
    const label = document.createElement('span');
    label.textContent = suggestion.title || '(no title)';
    button.appendChild(label);
    if (suggestion.year) {
      const year = document.createElement('span');
      year.className = 'year';
      year.textContent = suggestion.year;
      button.appendChild(year);
    }
    button.addEventListener('click', () => onSelect && onSelect(suggestion));
    container.appendChild(button);
  });
}

export async function fetchTmdbSuggestions(listType, query) {
  if (!TMDB_API_KEY) return [];
  const mediaType = listType === 'movies' ? 'movie' : 'tv';
  const params = new URLSearchParams({
    api_key: TMDB_API_KEY,
    query,
    include_adult: 'false',
    language: 'en-US'
  });
  const merged = [];
  const seenIds = new Set();
  try {
    for (let page = 1; page <= 3; page++) {
      params.set('page', String(page));
      const resp = await fetch(`https://api.themoviedb.org/3/search/${mediaType}?${params.toString()}`);
      if (!resp.ok) {
        if (page === 1) return [];
        break;
      }
      const json = await resp.json();
      if (!json || !Array.isArray(json.results) || !json.results.length) {
        if (page === 1) return [];
        break;
      }
      json.results.forEach(entry => {
        if (!entry || !entry.id || seenIds.has(entry.id)) return;
        seenIds.add(entry.id);
        merged.push(entry);
      });
      if (json.total_pages && page >= json.total_pages) break;
    }
    return merged.map(entry => ({
      title: entry.title || entry.name || '',
      year: extractPrimaryYear(entry.release_date || entry.first_air_date || ''),
      imdbID: '',
      type: mediaType,
      tmdbId: entry.id,
      source: 'tmdb',
    })).filter(suggestion => suggestion.title);
  } catch (err) {
    console.warn('TMDb suggestion lookup failed', err);
    return [];
  }
}

export async function fetchGoogleBooksSuggestions(query) {
  if (!query || query.length < 2) return [];
  const params = new URLSearchParams({
    q: query,
    printType: 'books',
    maxResults: '10',
  });
  if (GOOGLE_BOOKS_API_KEY) params.set('key', GOOGLE_BOOKS_API_KEY);
  try {
    const resp = await fetch(`${GOOGLE_BOOKS_API_URL}/volumes?${params.toString()}`);
    if (!resp.ok) return [];
    const json = await resp.json();
    if (!json || !Array.isArray(json.items)) return [];
    return json.items.map(item => {
      const info = item.volumeInfo || {};
      const identifiers = Array.isArray(info.industryIdentifiers) ? info.industryIdentifiers : [];
      const isbn = identifiers.find(id => id.type === 'ISBN_13')?.identifier 
                || identifiers.find(id => id.type === 'ISBN_10')?.identifier 
                || '';
      return {
        title: info.title || '',
        year: extractPrimaryYear(info.publishedDate || ''),
        author: Array.isArray(info.authors) ? info.authors.join(', ') : '',
        googleBooksId: item.id || '',
        isbn,
        source: 'googleBooks',
      };
    }).filter(s => s.title);
  } catch (err) {
    console.warn('Google Books suggestion lookup failed', err);
    return [];
  }
}

export async function fetchTmdbActorSuggestions(query) {
  if (!TMDB_API_KEY) return [];
  const params = new URLSearchParams({
    api_key: TMDB_API_KEY,
    query,
    include_adult: 'false',
    language: 'en-US'
  });
  try {
    const resp = await fetch(`https://api.themoviedb.org/3/search/person?${params.toString()}`);
    if (!resp.ok) return [];
    const json = await resp.json();
    if (!json || !Array.isArray(json.results)) return [];
    return json.results.map(person => ({
      name: person.name,
      id: person.id,
      profile_path: person.profile_path,
      known_for: person.known_for
    }));
  } catch (err) {
    console.warn('TMDb actor search failed', err);
    return [];
  }
}

export async function fetchTmdbActorCredits(personId, listType) {
  if (!TMDB_API_KEY) return [];
  const endpoint = listType === 'movies' ? 'movie_credits' : 'tv_credits';
  try {
    const resp = await fetch(`https://api.themoviedb.org/3/person/${personId}/${endpoint}?api_key=${TMDB_API_KEY}&language=en-US`);
    if (!resp.ok) return [];
    const json = await resp.json();
    const cast = json.cast || [];
    return cast.map(entry => ({
      title: entry.title || entry.name,
      year: extractPrimaryYear(entry.release_date || entry.first_air_date || ''),
      tmdbId: entry.id,
      poster: entry.poster_path ? `${TMDB_IMAGE_BASE_URL}${entry.poster_path}` : null,
      overview: entry.overview,
      character: entry.character
    }));
  } catch (err) {
    console.warn('TMDb actor credits failed', err);
    return [];
  }
}

export function renderActorSuggestions(container, suggestions, onSelect) {
  container.innerHTML = '';
  container.classList.add('visible');
  if (!suggestions || suggestions.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = 'No actors found';
    container.appendChild(empty);
    return;
  }

  const note = document.createElement('div');
  note.className = 'suggestions-note';
  note.textContent = 'Actors powered by TMDb.';
  container.appendChild(note);

  suggestions.forEach(suggestion => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'suggestion-item actor-suggestion';
    
    if (suggestion.profile_path) {
        const img = document.createElement('img');
        img.src = `${TMDB_IMAGE_BASE_URL}${suggestion.profile_path}`;
        img.alt = '';
        img.style.width = '30px';
        img.style.height = '45px';
        img.style.objectFit = 'cover';
        img.style.marginRight = '10px';
        img.style.borderRadius = '4px';
        button.appendChild(img);
    }
    
    const label = document.createElement('span');
    label.textContent = suggestion.name;
    button.appendChild(label);
    
    button.style.display = 'flex';
    button.style.alignItems = 'center';
    button.style.textAlign = 'left';
    
    button.addEventListener('click', () => onSelect && onSelect(suggestion));
    container.appendChild(button);
  });
}

export function setupActorAutocomplete(form, listType, callbacks = {}) {
  const { buildRelatedSuggestionsModal } = callbacks;
  
  const actorGroup = form.querySelector('.actor-group');
  if (!actorGroup) return;
  const actorInput = actorGroup.querySelector('input[name="actor"]');
  const suggestionsEl = actorGroup.querySelector('[data-role="actor-suggestions"]');
  if (!actorInput || !suggestionsEl) return;

  form.__actorSuggestionsEl = suggestionsEl;
  suggestionForms.add(form);

  let lastFetchToken = 0;
  const performSearch = debounce(async (query) => {
    const currentToken = ++lastFetchToken;
    const results = await fetchTmdbActorSuggestions(query);
    if (currentToken !== lastFetchToken) return;
    
    renderActorSuggestions(suggestionsEl, results, async (person) => {
      actorInput.value = person.name;
      suggestionsEl.innerHTML = '';
      suggestionsEl.classList.remove('visible');
      
      const credits = await fetchTmdbActorCredits(person.id, listType);
      const entries = credits.map(c => ({
        title: c.title,
        poster: c.poster,
        tmdbId: c.tmdbId,
        year: c.year,
        relation: 'actor-credit',
        character: c.character
      }));
      
      if (typeof buildRelatedSuggestionsModal === 'function') {
        buildRelatedSuggestionsModal({
          sourceListType: listType,
          currentItem: { title: person.name },
          entries: entries
        });
      }
    });
  }, 300);

  actorInput.addEventListener('input', () => {
    const val = actorInput.value.trim();
    if (val.length < 2) {
      suggestionsEl.innerHTML = '';
      suggestionsEl.classList.remove('visible');
      return;
    }
    performSearch(val);
  });
}

export function setupFormAutocomplete(form, listType, callbacks = {}) {
  if (!form) return;
  const wrapper = form.querySelector('.input-suggest');
  const titleInput = wrapper ? wrapper.querySelector('input[name="title"]') : null;
  const suggestionsEl = wrapper ? wrapper.querySelector('[data-role="title-suggestions"]') : null;
  form.__suggestionsEl = suggestionsEl || null;
  if (!titleInput || !suggestionsEl) return;

  if (!AUTOCOMPLETE_LISTS.has(listType)) {
    return;
  }

  const useGoogleBooks = listType === 'books';
  const yearInput = form.querySelector('input[name="year"]');
  const creatorInput = form.querySelector(listType === 'books' ? 'input[name="author"]' : 'input[name="director"]');
  const preview = form.querySelector('[data-role="movie-details-preview"]');

  suggestionForms.add(form);

  const clearFormMetadata = () => {
    form.__selectedMetadata = null;
    delete form.dataset.selectedImdbId;
    delete form.dataset.selectedTmdbId;
    delete form.dataset.selectedGoogleBookId;
    delete form.dataset.selectedGoogleIsbn;
    if (preview) preview.classList.add('hidden');
  };

  const updatePreview = (detail) => {
    if (!preview || !detail) return;
    preview.classList.remove('hidden');
    
    const posterEl = preview.querySelector('[data-role="movie-details-poster"]');
    if (posterEl) {
      posterEl.innerHTML = detail.Poster && detail.Poster !== 'N/A'
        ? `<img src="${detail.Poster}" alt="Poster for ${detail.Title || ''}" />`
        : '';
    }
    
    const yearEl = preview.querySelector('[data-role="movie-details-year"]');
    if (yearEl) {
      yearEl.textContent = (yearInput && yearInput.value) ? '' : (detail.Year ? `Year: ${detail.Year}` : '');
    }
    
    const directorEl = preview.querySelector('[data-role="movie-details-director"]');
    if (directorEl) {
      const directorLabel = listType === 'books' ? 'Author' : 'Director';
      const directorValue = listType === 'books' ? detail.Author : detail.Director;
      directorEl.textContent = (creatorInput && creatorInput.value) ? '' : (directorValue ? `${directorLabel}: ${directorValue}` : '');
    }
    
    const genresEl = preview.querySelector('[data-role="movie-details-genres"]');
    if (genresEl) {
      const genres = detail.Genres || detail.Categories || [];
      genresEl.textContent = genres.length ? `Genres: ${genres.join(', ')}` : '';
    }
    
    const descEl = preview.querySelector('[data-role="movie-details-description"]');
    if (descEl) descEl.textContent = detail.Plot || '';
  };

  let lastFetchToken = 0;
  const performSearch = debounce(async (query) => {
    const currentToken = ++lastFetchToken;
    
    const results = useGoogleBooks
      ? await fetchGoogleBooksSuggestions(query)
      : await fetchTmdbSuggestions(listType, query);
    
    if (currentToken !== lastFetchToken) return;
    
    suggestionsEl.classList.add('visible');
    renderTitleSuggestions(suggestionsEl, results, async (suggestion) => {
      titleInput.value = suggestion.title || '';
      const suggestionYear = extractPrimaryYear(suggestion.year);
      if (yearInput && suggestionYear) {
        yearInput.value = suggestionYear;
      }
      
      clearFormMetadata();
      
      // Store selection IDs for later metadata fetch
      if (useGoogleBooks) {
        if (suggestion.googleBooksId) form.dataset.selectedGoogleBookId = suggestion.googleBooksId;
        if (suggestion.isbn) form.dataset.selectedGoogleIsbn = suggestion.isbn;
        
        // Fetch and apply Google Books metadata
        try {
          const detail = await fetchGoogleBooksMetadata({
            volumeId: suggestion.googleBooksId,
            title: suggestion.title,
            author: suggestion.author,
            isbn: suggestion.isbn,
          });
          if (detail) {
            form.__selectedMetadata = detail;
            if (yearInput && detail.Year) {
              const detailYear = extractPrimaryYear(detail.Year);
              if (detailYear) yearInput.value = detailYear;
            }
            if (creatorInput && !creatorInput.value && detail.Author) {
              creatorInput.value = detail.Author;
            }
            updatePreview(detail);
          }
        } catch (err) {
          console.warn('Unable to prefill Google Books metadata', err);
        }
      } else {
        // TMDB flow
        if (suggestion.imdbID) form.dataset.selectedImdbId = suggestion.imdbID;
        if (suggestion.tmdbId) form.dataset.selectedTmdbId = suggestion.tmdbId;
        
        if (TMDB_API_KEY && suggestion.tmdbId) {
          try {
            const detail = await fetchTmdbMetadata(listType, {
              title: suggestion.title,
              year: suggestionYear,
              imdbId: suggestion.imdbID,
              tmdbId: suggestion.tmdbId,
            });
            if (detail) {
              form.__selectedMetadata = detail;
              if (yearInput && detail.Year) {
                const detailYear = extractPrimaryYear(detail.Year);
                if (detailYear) yearInput.value = detailYear;
              }
              if (creatorInput && !creatorInput.value && detail.Director && detail.Director !== 'N/A') {
                creatorInput.value = detail.Director;
              }
              updatePreview(detail);
            }
          } catch (err) {
            console.warn('Unable to prefill TMDB metadata', err);
          }
        }
      }
      
      if (!form.__selectedMetadata && preview) {
        preview.classList.add('hidden');
      }
      
      hideTitleSuggestions(form);
      titleInput.focus();
    });
  }, 260);

  titleInput.addEventListener('input', () => {
    const query = titleInput.value.trim();
    
    if (query.length === 0) {
      clearFormMetadata();
      if (yearInput) yearInput.value = '';
      if (creatorInput) creatorInput.value = '';
      hideTitleSuggestions(form);
      return;
    }
    
    clearFormMetadata();
    
    if (query.length < 3) {
      lastFetchToken++;
      hideTitleSuggestions(form);
      return;
    }
    performSearch(query);
  });
  
  titleInput.addEventListener('focus', () => {
    if (suggestionsEl.children.length > 0) {
      suggestionsEl.classList.add('visible');
    }
  });
  
  titleInput.addEventListener('blur', () => {
    setTimeout(() => hideTitleSuggestions(form), 150);
  });
  
  titleInput.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') {
      hideTitleSuggestions(form);
    }
  });
}

export function teardownFormAutocomplete(form) {
  if (!form) return;
  hideTitleSuggestions(form);
  suggestionForms.delete(form);
}

export function initGlobalSuggestionClickHandler() {
  if (globalSuggestionClickBound) return;
  globalSuggestionClickBound = true;
  
  document.addEventListener('click', (event) => {
    suggestionForms.forEach(form => {
      if (!form.contains(event.target)) {
        hideTitleSuggestions(form);
      }
    });
  });
}
