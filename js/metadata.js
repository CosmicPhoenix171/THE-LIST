import { 
  TMDB_API_KEY, 
  TMDB_API_BASE_URL, 
  TMDB_IMAGE_BASE_URL,
  ANIME_KEYWORD_REGEX
} from './config.js';
import { normalizeTitleKey, extractPrimaryYear } from './utils.js';

export async function tmdbFetch(path, params = {}) {
  if (!TMDB_API_KEY) {
    console.warn('TMDb API key missing');
    throw new Error('TMDb API key missing');
  }
  const url = new URL(`${TMDB_API_BASE_URL}${path}`);
  url.searchParams.set('api_key', TMDB_API_KEY);
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    url.searchParams.set(key, value);
  });
  const resp = await fetch(url.toString());
  if (!resp.ok) {
    const err = new Error(`TMDb request failed (${resp.status})`);
    err.status = resp.status;
    try {
      err.payload = await resp.json();
    } catch (_) {
      err.body = await resp.text();
    }
    throw err;
  }
  return await resp.json();
}

export async function fetchTmdbMetadata(listType, { title, year, imdbId, tmdbId }) {
  if (!TMDB_API_KEY) return null;
  const mediaType = listType === 'movies' ? 'movie' : 'tv';
  let detail = null;
  if (tmdbId) {
    detail = await fetchTmdbDetail(mediaType, tmdbId);
  }
  if (!detail) {
    const pick = await findTmdbCandidate({ mediaType, title, year, imdbId });
    if (!pick) return null;
    detail = await fetchTmdbDetail(mediaType, pick.id);
  }
  if (!detail) return null;
  return mapTmdbDetailToMetadata(detail, mediaType);
}

export async function findTmdbCandidate({ mediaType, title, year, imdbId }) {
  if (imdbId) {
    try {
      const findResp = await fetch(`https://api.themoviedb.org/3/find/${imdbId}?api_key=${TMDB_API_KEY}&external_source=imdb_id`);
      if (findResp.ok) {
        const payload = await findResp.json();
        const bucket = mediaType === 'movie' ? payload.movie_results : payload.tv_results;
        if (Array.isArray(bucket) && bucket.length) {
          return bucket[0];
        }
      }
    } catch (err) {
      console.warn('TMDb lookup by IMDb failed', err);
    }
  }

  if (!title) return null;
  try {
    const searchParams = new URLSearchParams({ api_key: TMDB_API_KEY, query: title, include_adult: 'false' });
    if (year) {
      const yearKey = mediaType === 'movie' ? 'year' : 'first_air_date_year';
      searchParams.set(yearKey, year);
    }
    const searchResp = await fetch(`https://api.themoviedb.org/3/search/${mediaType}?${searchParams.toString()}`);
    if (!searchResp.ok) return null;
    const searchJson = await searchResp.json();
    if (!searchJson || !Array.isArray(searchJson.results) || !searchJson.results.length) return null;

    const normalizedYear = year ? String(year) : '';
    const match = normalizedYear
      ? searchJson.results.find(entry => {
          const dateField = mediaType === 'movie' ? entry.release_date : entry.first_air_date;
          return dateField && dateField.startsWith(normalizedYear);
        }) || searchJson.results[0]
      : searchJson.results[0];
    return match || null;
  } catch (err) {
    console.warn('TMDb search failed', err);
    return null;
  }
}

export async function fetchTmdbDetail(mediaType, id) {
  try {
    const appendParams = ['credits', 'external_ids', 'keywords'];
    const detailResp = await fetch(`https://api.themoviedb.org/3/${mediaType}/${id}?api_key=${TMDB_API_KEY}&append_to_response=${appendParams.join(',')}`);
    if (!detailResp.ok) return null;
    return await detailResp.json();
  } catch (err) {
    console.warn('TMDb detail fetch failed', err);
    return null;
  }
}

export function mapTmdbDetailToMetadata(detail, mediaType) {
  if (!detail) return null;
  const poster = detail.poster_path ? `https://image.tmdb.org/t/p/w500${detail.poster_path}` : '';
  const releaseDate = mediaType === 'movie' ? detail.release_date : detail.first_air_date;
  const genreNames = Array.isArray(detail.genres)
    ? detail.genres.map(entry => (entry && typeof entry.name === 'string') ? entry.name.trim() : '').filter(Boolean)
    : [];
  const keywordSource = mediaType === 'movie'
    ? detail.keywords?.keywords
    : detail.keywords?.results;
  const keywordNames = Array.isArray(keywordSource)
    ? keywordSource.map(entry => (entry && typeof entry.name === 'string') ? entry.name.trim() : '').filter(Boolean)
    : [];
  const hasAnimeKeyword = keywordNames.some(name => ANIME_KEYWORD_REGEX.test(name));
  const runtimeMinutes = mediaType === 'movie'
    ? detail.runtime
    : (Array.isArray(detail.episode_run_time) && detail.episode_run_time.length ? detail.episode_run_time[0] : null);
  const normalizedRuntime = typeof runtimeMinutes === 'number' && Number.isFinite(runtimeMinutes)
    ? runtimeMinutes
    : null;
  const runtimeLabel = normalizedRuntime
    ? `${normalizedRuntime} min${mediaType === 'tv' ? '/ep' : ''}`
    : '';
  const crew = Array.isArray(detail.credits?.crew) ? detail.credits.crew : [];
  const directorCrew = crew.find(member => member && member.job === 'Director');
  const director = directorCrew?.name
    || (Array.isArray(detail.created_by) ? detail.created_by.map(c => c && c.name).filter(Boolean).join(', ') : '')
    || '';
  const cast = Array.isArray(detail.credits?.cast) ? detail.credits.cast.slice(0, 12).map(actor => actor && actor.name).filter(Boolean) : [];
  const imdbId = detail.imdb_id || detail.external_ids?.imdb_id || '';
  const rating = typeof detail.vote_average === 'number' && detail.vote_average > 0 ? detail.vote_average.toFixed(1) : '';
  const budget = formatCurrencyShort(detail.budget);
  const revenue = formatCurrencyShort(detail.revenue);
  const originalLanguage = resolveLanguageName(detail.original_language, detail.spoken_languages);
  const tmdbId = detail.id || '';
  const tvSeasonCount = mediaType === 'tv'
    ? (Number(detail.number_of_seasons) || (Array.isArray(detail.seasons) ? detail.seasons.length : 0))
    : null;
  const tvEpisodeCount = mediaType === 'tv' ? Number(detail.number_of_episodes) || null : null;
  const tvStatus = mediaType === 'tv' ? (detail.status || '') : '';
  const tvEpisodeRuntime = mediaType === 'tv' ? normalizedRuntime : null;
  const tvSeasonSummaries = mediaType === 'tv' && Array.isArray(detail.seasons)
    ? detail.seasons
        .filter(season => season && typeof season.season_number === 'number')
        .map(season => ({
          seasonNumber: season.season_number,
          episodeCount: typeof season.episode_count === 'number' ? season.episode_count : null,
          title: season.name || `Season ${season.season_number}`,
          year: extractPrimaryYear(season.air_date || ''),
          airDate: season.air_date || '',
        }))
    : [];

  return {
    Title: detail.title || detail.name || '',
    Year: releaseDate ? String(releaseDate).slice(0, 4) : '',
    Director: director,
    Runtime: runtimeLabel,
    Poster: poster || 'N/A',
    Plot: detail.overview || '',
    imdbID: imdbId,
    imdbRating: rating,
    Actors: cast.join(', '),
    Type: mediaType === 'movie' ? 'movie' : 'series',
    Budget: budget,
    Revenue: revenue,
    OriginalLanguage: originalLanguage,
    OriginalLanguageIso: detail.original_language || '',
    TmdbID: tmdbId,
    TvSeasonCount: tvSeasonCount,
    TvEpisodeCount: tvEpisodeCount,
    TvEpisodeRuntime: tvEpisodeRuntime,
    TvStatus: tvStatus,
    TvSeasonSummaries: tvSeasonSummaries,
    Genres: genreNames,
    Keywords: keywordNames,
    HasAnimeKeyword: hasAnimeKeyword,
  };
}

export async function fetchTmdbSuggestions(listType, query) {
  if (!TMDB_API_KEY || !query || !query.trim()) return [];
  const mediaType = listType === 'movies' ? 'movie' : 'tv';
  try {
    const searchParams = new URLSearchParams({
      api_key: TMDB_API_KEY,
      query: query.trim(),
      include_adult: 'false',
    });
    const url = `https://api.themoviedb.org/3/search/${mediaType}?${searchParams.toString()}`;
    const resp = await fetch(url);
    if (!resp.ok) return [];
    const json = await resp.json();
    if (!json || !Array.isArray(json.results)) return [];
    return json.results.slice(0, 10).map(item => {
      const title = mediaType === 'movie' ? item.title : item.name;
      const date = mediaType === 'movie' ? item.release_date : item.first_air_date;
      const year = date ? date.slice(0, 4) : '';
      return {
        id: item.id,
        title: title || '',
        year,
        poster: item.poster_path ? `${TMDB_IMAGE_BASE_URL}${item.poster_path}` : '',
      };
    });
  } catch (err) {
    console.warn('TMDb suggestions fetch failed', err);
    return [];
  }
}

export async function fetchTmdbActorSuggestions(query) {
  if (!TMDB_API_KEY || !query || !query.trim()) return [];
  try {
    const searchParams = new URLSearchParams({
      api_key: TMDB_API_KEY,
      query: query.trim(),
      include_adult: 'false',
    });
    const url = `https://api.themoviedb.org/3/search/person?${searchParams.toString()}`;
    const resp = await fetch(url);
    if (!resp.ok) return [];
    const json = await resp.json();
    if (!json || !Array.isArray(json.results)) return [];
    return json.results.slice(0, 10).map(person => ({
      id: person.id,
      name: person.name || '',
      profilePath: person.profile_path ? `${TMDB_IMAGE_BASE_URL}${person.profile_path}` : '',
    }));
  } catch (err) {
    console.warn('TMDb actor suggestions fetch failed', err);
    return [];
  }
}

export async function searchTmdbAcrossMedia(query) {
  if (!query || !query.trim()) return { movieMatches: [], tvMatches: [] };
  const params = {
    query: query.trim(),
    include_adult: 'false',
    language: 'en-US',
  };
  const [movieResp, tvResp] = await Promise.allSettled([
    tmdbFetch('/search/movie', params),
    tmdbFetch('/search/tv', params),
  ]);
  const movieMatches = movieResp.status === 'fulfilled' && Array.isArray(movieResp.value?.results)
    ? movieResp.value.results
    : [];
  const tvMatches = tvResp.status === 'fulfilled' && Array.isArray(tvResp.value?.results)
    ? tvResp.value.results
    : [];
  return { movieMatches, tvMatches };
}

export async function fetchTmdbFranchiseDetails(mediaType, id) {
  if (!id) return null;
  const append = 'credits,external_ids,recommendations,similar';
  try {
    return await tmdbFetch(`/${mediaType}/${id}`, { append_to_response: append });
  } catch (err) {
    console.warn('TMDb franchise details fetch failed', err);
    return null;
  }
}

export async function fetchTmdbCollectionMovies(collectionId) {
  if (!collectionId) return [];
  try {
    const data = await tmdbFetch(`/collection/${collectionId}`);
    if (!data || !Array.isArray(data.parts)) return [];
    return data.parts.map(item => formatTmdbFranchiseEntry(item, 'movie', { relation: 'collection' })).filter(Boolean);
  } catch (err) {
    console.warn('TMDb collection fetch failed', err);
    return [];
  }
}

export function formatTmdbFranchiseEntry(item, mediaType, extras = {}) {
  if (!item) return null;
  const title = mediaType === 'tv'
    ? (item.name || item.original_name || item.title || item.original_title)
    : (item.title || item.original_title || item.name || item.original_name);
  if (!title) return null;
  const year = extractPrimaryYear(item.release_date || item.first_air_date || '');
  const poster = item.poster_path ? `${TMDB_IMAGE_BASE_URL}${item.poster_path}` : '';
  return {
    id: item.id,
    mediaType,
    title,
    year,
    poster,
    releaseDate: item.release_date || item.first_air_date || '',
    overview: item.overview || '',
    popularity: Number(item.popularity) || 0,
    voteAverage: Number(item.vote_average) || 0,
    ...extras,
  };
}

export function pickBestTmdbSearchResult(results, query, mediaType) {
  if (!Array.isArray(results) || !results.length) return null;
  const normalizedQuery = normalizeTitleKey(query);
  return results.reduce((best, entry) => {
    if (!entry) return best;
    const title = mediaType === 'tv'
      ? (entry.name || entry.original_name || '')
      : (entry.title || entry.original_title || '');
    if (!title) return best;
    const normalizedTitle = normalizeTitleKey(title);
    const popularity = Number(entry.popularity) || 0;
    const voteAverage = Number(entry.vote_average) || 0;
    const exactMatch = normalizedTitle === normalizedQuery;
    const score = (exactMatch ? 1000 : 0) + popularity * 3 + voteAverage;
    if (!best || score > best.__score) {
      best = { ...entry, __score: score };
    }
    return best;
  }, null);
}

export function collectRecommendationEntries(details, mediaType) {
  if (!details) return [];
  const buckets = [];
  const pushEntries = (source, relation) => {
    if (!source || !Array.isArray(source.results)) return;
    source.results.forEach(item => {
      const entry = formatTmdbFranchiseEntry(item, mediaType, {
        relation,
        relationSourceId: details.id,
      });
      if (entry) buckets.push(entry);
    });
  };
  pushEntries(details.recommendations, 'recommendation');
  pushEntries(details.similar, 'similar');
  return buckets;
}

function formatCurrencyShort(value) {
  if (!value || typeof value !== 'number' || value <= 0) return '';
  if (value >= 1e9) return `$${(value / 1e9).toFixed(1)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
  if (value >= 1e3) return `$${(value / 1e3).toFixed(0)}K`;
  return `$${value}`;
}

function resolveLanguageName(isoCode, spokenLanguages) {
  if (!isoCode) return '';
  if (Array.isArray(spokenLanguages)) {
    const match = spokenLanguages.find(lang => lang && lang.iso_639_1 === isoCode);
    if (match && match.english_name) return match.english_name;
  }
  const commonLanguages = {
    en: 'English',
    es: 'Spanish',
    fr: 'French',
    de: 'German',
    it: 'Italian',
    pt: 'Portuguese',
    ja: 'Japanese',
    ko: 'Korean',
    zh: 'Chinese',
    ru: 'Russian',
    ar: 'Arabic',
    hi: 'Hindi',
  };
  return commonLanguages[isoCode] || isoCode.toUpperCase();
}
