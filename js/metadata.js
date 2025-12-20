import { 
  TMDB_API_KEY, 
  TMDB_API_BASE_URL, 
  TMDB_IMAGE_BASE_URL,
  ANIME_KEYWORD_REGEX,
  GOOGLE_BOOKS_API_KEY,
  GOOGLE_BOOKS_API_URL,
  TMDB_KEYWORD_DISCOVER_PAGE_LIMIT,
  TMDB_KEYWORD_DISCOVER_MAX_RESULTS,
  METADATA_SCHEMA_VERSION
} from './config.js';
import { normalizeTitleKey, extractPrimaryYear, sanitizeYear, parseActorsList, buildTrailerUrl } from './utils.js';

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

function hasMeaningfulValue(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

export function deriveMetadataAssignments(metadata, existing = {}, options = {}) {
  if (!metadata) return {};
  const {
    overwrite = false,
    fallbackTitle = existing.title || '',
    fallbackYear = existing.year || '',
    alwaysAssign = [],
    listType: targetListType = '',
  } = options;
  const updates = {};
  const forceKeys = new Set(['metadataVersion', ...(Array.isArray(alwaysAssign) ? alwaysAssign : [])]);

  const setField = (key, value) => {
    if (value === undefined || value === null) return;
    if (typeof value === 'string' && value.trim() === '') return;
    if (Array.isArray(value) && value.length === 0) return;
    if (!overwrite && !forceKeys.has(key) && hasMeaningfulValue(existing[key])) return;
    updates[key] = value;
  };

  const apiYear = metadata.Year && metadata.Year !== 'N/A' ? extractPrimaryYear(metadata.Year) : '';
  setField('year', apiYear);

  const directorFromApi = metadata.Director && metadata.Director !== 'N/A' ? metadata.Director : '';
  setField('director', directorFromApi);

  const authorFromApi = metadata.Author && metadata.Author !== 'N/A' ? metadata.Author : '';
  setField('author', authorFromApi);

  const imdbIdValue = metadata.imdbID && metadata.imdbID !== 'N/A' ? metadata.imdbID : '';
  setField('imdbId', imdbIdValue);
  if (imdbIdValue) {
    setField('imdbUrl', `https://www.imdb.com/title/${imdbIdValue}/`);
  }

  const rating = metadata.imdbRating && metadata.imdbRating !== 'N/A' ? metadata.imdbRating : '';
  setField('imdbRating', rating);

  const runtime = metadata.Runtime && metadata.Runtime !== 'N/A' ? metadata.Runtime : '';
  setField('runtime', runtime);

  const poster = metadata.Poster && metadata.Poster !== 'N/A' ? metadata.Poster : '';
  setField('poster', poster);

  const plot = metadata.Plot && metadata.Plot !== 'N/A' ? metadata.Plot : '';
  setField('plot', plot);

  const typeValue = metadata.Type && metadata.Type !== 'N/A' ? metadata.Type : '';
  setField('imdbType', typeValue);

  const metascore = metadata.Metascore && metadata.Metascore !== 'N/A' ? metadata.Metascore : '';
  setField('metascore', metascore);

  const actors = parseActorsList(metadata.Actors);
  if (actors.length) {
    setField('actors', actors);
  }

  const originalLanguage = metadata.OriginalLanguage && metadata.OriginalLanguage !== 'N/A' ? metadata.OriginalLanguage : '';
  setField('originalLanguage', originalLanguage);

  const originalLanguageIso = metadata.OriginalLanguageIso && metadata.OriginalLanguageIso !== 'N/A'
    ? metadata.OriginalLanguageIso
    : '';
  setField('originalLanguageIso', originalLanguageIso);

  const budgetValue = metadata.Budget && metadata.Budget !== 'N/A' ? metadata.Budget : '';
  setField('budget', budgetValue);

  const revenueValue = metadata.Revenue && metadata.Revenue !== 'N/A' ? metadata.Revenue : '';
  setField('revenue', revenueValue);

  if (metadata.TvSeasonCount !== undefined && metadata.TvSeasonCount !== null) {
    setField('tvSeasonCount', metadata.TvSeasonCount);
  }
  if (metadata.TvEpisodeCount !== undefined && metadata.TvEpisodeCount !== null) {
    setField('tvEpisodeCount', metadata.TvEpisodeCount);
  }
  if (metadata.TvEpisodeRuntime !== undefined && metadata.TvEpisodeRuntime !== null) {
    setField('tvEpisodeRuntime', metadata.TvEpisodeRuntime);
  }
  if (metadata.TvStatus) {
    setField('tvStatus', metadata.TvStatus);
  }
  if (Array.isArray(metadata.TvSeasonSummaries) && metadata.TvSeasonSummaries.length) {
    setField('tvSeasonSummaries', metadata.TvSeasonSummaries);
  }

  if (targetListType === 'tvShows') {
    const badgeSource = {
      tvSeasonCount: updates.tvSeasonCount ?? existing.tvSeasonCount,
      tvEpisodeCount: updates.tvEpisodeCount ?? existing.tvEpisodeCount,
      tvEpisodeRuntime: updates.tvEpisodeRuntime ?? existing.tvEpisodeRuntime,
      tvStatus: updates.tvStatus ?? existing.tvStatus,
      runtime: updates.runtime ?? existing.runtime,
      tvSeasonSummaries: updates.tvSeasonSummaries ?? existing.tvSeasonSummaries,
    };
    const tvBadges = computeTvBadgeStrings(badgeSource);
    if (tvBadges.length) {
      setField('cachedTvBadges', tvBadges);
    }
  }

  if (metadata.AnimeEpisodes !== undefined && metadata.AnimeEpisodes !== null) {
    setField('animeEpisodes', metadata.AnimeEpisodes);
  }
  if (metadata.AnimeDuration !== undefined && metadata.AnimeDuration !== null) {
    setField('animeDuration', metadata.AnimeDuration);
  }
  if (metadata.AnimeFormat) {
    setField('animeFormat', metadata.AnimeFormat);
  }
  if (metadata.AnimeStatus) {
    setField('animeStatus', metadata.AnimeStatus);
  }
  if (Array.isArray(metadata.AnimeGenres) && metadata.AnimeGenres.length) {
    setField('animeGenres', metadata.AnimeGenres);
  }
  if (Array.isArray(metadata.Genres) && metadata.Genres.length) {
    setField('genres', metadata.Genres);
  }
  if (metadata.AniListUrl) {
    setField('aniListUrl', metadata.AniListUrl);
  }
  if (metadata.AniListId) {
    setField('aniListId', metadata.AniListId);
  }
  if (Array.isArray(metadata.Keywords) && metadata.Keywords.length) {
    setField('keywords', metadata.Keywords);
  }
  if (metadata.HasAnimeKeyword) {
    setField('hasAnimeKeyword', true);
  }

  const tmdbIdValue = metadata.TmdbID && metadata.TmdbID !== 'N/A' ? metadata.TmdbID : (metadata.TmdbId || '');
  setField('tmdbId', tmdbIdValue);

  if (metadata.PageCount !== undefined && metadata.PageCount !== null && metadata.PageCount !== '') {
    setField('pageCount', metadata.PageCount);
  }
  if (Array.isArray(metadata.Categories) && metadata.Categories.length) {
    setField('bookCategories', metadata.Categories);
  }
  if (metadata.Publisher) {
    setField('publisher', metadata.Publisher);
  }
  if (metadata.PreviewLink) {
    setField('previewLink', metadata.PreviewLink);
  }
  if (metadata.GoogleBooksId) {
    setField('googleBooksId', metadata.GoogleBooksId);
  }
  if (metadata.GoogleBooksUrl) {
    setField('googleBooksUrl', metadata.GoogleBooksUrl);
  }
  if (metadata.AverageRating) {
    setField('averageRating', metadata.AverageRating);
  }
  if (metadata.isbn) {
    setField('isbn', metadata.isbn);
  }

  const effectiveTitle = (metadata.Title && metadata.Title !== 'N/A') ? metadata.Title : fallbackTitle;
  const effectiveYear = apiYear || fallbackYear;
  if (effectiveTitle) {
    const trailerUrl = buildTrailerUrl(effectiveTitle, effectiveYear);
    setField('trailerUrl', trailerUrl);
  }

  setField('metadataVersion', METADATA_SCHEMA_VERSION);

  return updates;
}

function getTvSeasonCount(item) {
  if (!item) return 0;
  const direct = Number(item.tvSeasonCount);
  if (Number.isFinite(direct) && direct > 0) return direct;
  if (Array.isArray(item.tvSeasonSummaries)) {
    return item.tvSeasonSummaries.filter(s => s && s.seasonNumber !== undefined).length;
  }
  return 0;
}

function getTvEpisodeCount(item) {
  if (!item) return 0;
  const direct = Number(item.tvEpisodeCount);
  if (Number.isFinite(direct) && direct > 0) return direct;
  if (Array.isArray(item.tvSeasonSummaries)) {
    return item.tvSeasonSummaries.reduce((total, s) => {
      const count = Number(s?.episodeCount);
      return Number.isFinite(count) && count > 0 ? total + count : total;
    }, 0);
  }
  return 0;
}

function formatTvRuntimeLabel(item) {
  if (!item) return '';
  const runtime = Number(item.tvEpisodeRuntime);
  if (Number.isFinite(runtime) && runtime > 0) return `${runtime} min/ep`;
  if (typeof item.runtime === 'string') {
    const match = item.runtime.match(/(\d+)\s*min/);
    if (match) {
      const value = Number(match[1]);
      if (Number.isFinite(value)) {
        return item.runtime.includes('/ep') ? `${value} min/ep` : `${value} min`;
      }
    }
  }
  return '';
}

export function computeTvBadgeStrings(source, context = {}) {
  if (!source) return [];
  const chips = [];
  const seasonCount = getTvSeasonCount(source);
  if (seasonCount > 0) chips.push(`${seasonCount} season${seasonCount === 1 ? '' : 's'}`);
  const episodeCount = getTvEpisodeCount(source);
  if (episodeCount > 0) chips.push(`${episodeCount} episode${episodeCount === 1 ? '' : 's'}`);
  const runtimeLabel = formatTvRuntimeLabel(source);
  if (runtimeLabel && context.isExpanded !== false) chips.push(runtimeLabel);
  return chips;
}

export async function getTmdbCollectionInfo(title, year, imdbId) {
  if (!TMDB_API_KEY) return null;
  const q = encodeURIComponent(title);
  let searchUrl = `https://api.themoviedb.org/3/search/movie?api_key=${TMDB_API_KEY}&query=${q}`;
  if (year && String(year).length === 4) searchUrl += `&year=${year}`;
  let searchData;
  try {
    const resp = await fetch(searchUrl);
    searchData = await resp.json();
  } catch (e) {
    return null;
  }
  if (!searchData || !Array.isArray(searchData.results) || !searchData.results.length) return null;
  const normTitle = title.trim().toLowerCase();
  const pick = searchData.results.reduce((best, cur) => {
    const curTitle = (cur.title || cur.original_title || '').toLowerCase();
    const titleScore = curTitle === normTitle ? 3 : curTitle.includes(normTitle) ? 2 : 1;
    const yearScore = year && cur.release_date && cur.release_date.startsWith(year) ? 2 : 0;
    const total = titleScore + yearScore;
    return total > (best._score || 0) ? Object.assign(cur, { _score: total }) : best;
  }, {});
  if (!pick || !pick.id) return null;
  let detail;
  try {
    const detailResp = await fetch(`https://api.themoviedb.org/3/movie/${pick.id}?api_key=${TMDB_API_KEY}`);
    detail = await detailResp.json();
  } catch (e) {
    return null;
  }
  if (!detail || !detail.belongs_to_collection || !detail.belongs_to_collection.id) return null;
  const collId = detail.belongs_to_collection.id;
  let collData;
  try {
    const collResp = await fetch(`https://api.themoviedb.org/3/collection/${collId}?api_key=${TMDB_API_KEY}`);
    collData = await collResp.json();
  } catch (e) {
    return null;
  }
  if (!collData || !Array.isArray(collData.parts) || collData.parts.length < 2) return null;
  const parts = collData.parts.map(p => ({
    id: p.id,
    tmdbId: p.id,
    title: p.title || p.original_title || '',
    year: p.release_date ? p.release_date.slice(0, 4) : '',
    imdbId: p.imdb_id || '',
  })).filter(p => p.title);
  parts.sort((a, b) => {
    const yA = parseInt(a.year, 10) || 9999;
    const yB = parseInt(b.year, 10) || 9999;
    if (yA !== yB) return yA - yB;
    return a.title.toLowerCase().localeCompare(b.title.toLowerCase());
  });
  const matchIdx = parts.findIndex(p => {
    if (imdbId && p.imdbId && imdbId === p.imdbId) return true;
    const pNorm = p.title.toLowerCase();
    return pNorm === normTitle || pNorm.includes(normTitle);
  });
  return {
    collectionName: detail.belongs_to_collection.name,
    parts: parts.map((p, i) => ({ ...p, order: i + 1, matchesCurrent: i === matchIdx }))
  };
}

export async function searchTmdbKeyword(query) {
  if (!query || !query.trim()) return null;
  try {
    const payload = await tmdbFetch('/search/keyword', { query: query.trim(), page: 1 });
    const results = Array.isArray(payload?.results) ? payload.results : [];
    if (!results.length) return null;
    const normalizedQuery = normalizeTitleKey(query);
    const best = results.reduce((winner, keyword) => {
      if (!keyword || !keyword.id || !keyword.name) return winner;
      const normalizedName = normalizeTitleKey(keyword.name);
      const popularity = Number(keyword.popularity) || 0;
      const exact = normalizedName === normalizedQuery;
      const score = (exact ? 1000 : 0) + popularity;
      if (!winner || score > winner.score) return { id: keyword.id, name: keyword.name, score };
      return winner;
    }, null);
    return best ? { id: best.id, name: best.name } : null;
  } catch (err) {
    console.warn('TMDb keyword search failed', err);
    return null;
  }
}

export async function discoverTmdbKeywordEntries(keywordId, mediaType, pageLimit = TMDB_KEYWORD_DISCOVER_PAGE_LIMIT) {
  if (!keywordId) return [];
  const entries = [];
  for (let page = 1; page <= pageLimit; page++) {
    try {
      const payload = await tmdbFetch(`/discover/${mediaType}`, {
        with_keywords: keywordId,
        include_adult: 'false',
        language: 'en-US',
        sort_by: 'popularity.desc',
        page,
      });
      if (Array.isArray(payload?.results)) {
        payload.results.forEach(result => {
          const entry = formatTmdbFranchiseEntry(result, mediaType);
          if (entry) entries.push(entry);
        });
      }
      if (!payload || page >= payload.total_pages || entries.length >= TMDB_KEYWORD_DISCOVER_MAX_RESULTS) break;
    } catch (err) {
      console.warn('TMDb keyword discover failed', mediaType, keywordId, err);
      break;
    }
  }
  return entries;
}

export async function fetchTmdbKeywordFranchiseEntries(keywordId) {
  if (!keywordId) return [];
  const [movies, tvShows] = await Promise.all([
    discoverTmdbKeywordEntries(keywordId, 'movie'),
    discoverTmdbKeywordEntries(keywordId, 'tv'),
  ]);
  const combined = [...movies, ...tvShows];
  const map = new Map();
  combined.forEach(entry => {
    if (!entry || !entry.id || !entry.mediaType) return;
    const key = `${entry.mediaType}:${entry.id}`;
    if (!map.has(key)) map.set(key, entry);
  });
  return Array.from(map.values()).slice(0, TMDB_KEYWORD_DISCOVER_MAX_RESULTS);
}

async function fetchGoogleBooksVolumeById(volumeId) {
  if (!volumeId) return null;
  const params = GOOGLE_BOOKS_API_KEY ? `?key=${GOOGLE_BOOKS_API_KEY}` : '';
  try {
    const resp = await fetch(`${GOOGLE_BOOKS_API_URL}/volumes/${volumeId}${params}`);
    if (resp.ok) return await resp.json();
  } catch (err) {
    console.warn('Google Books volume fetch failed', err);
  }
  return null;
}

function mapGoogleVolumeToMetadata(volume) {
  if (!volume || !volume.volumeInfo) return null;
  const info = volume.volumeInfo;
  const identifiers = Array.isArray(info.industryIdentifiers) ? info.industryIdentifiers : [];
  const isbn13 = identifiers.find(id => id.type === 'ISBN_13')?.identifier || '';
  const isbn10 = identifiers.find(id => id.type === 'ISBN_10')?.identifier || '';
  const isbn = isbn13 || isbn10 || '';
  const authors = Array.isArray(info.authors) ? info.authors : [];
  const categories = Array.isArray(info.categories) ? info.categories : [];
  const imageLinks = info.imageLinks || {};
  const thumbnail = imageLinks.thumbnail || imageLinks.smallThumbnail || '';
  return {
    Title: info.title || '',
    Author: authors.join(', '),
    Year: info.publishedDate ? extractPrimaryYear(info.publishedDate) : '',
    Plot: info.description || '',
    Poster: thumbnail ? thumbnail.replace('http:', 'https:') : '',
    PageCount: info.pageCount || '',
    Categories: categories,
    Publisher: info.publisher || '',
    PreviewLink: info.previewLink || '',
    GoogleBooksId: volume.id || '',
    GoogleBooksUrl: info.infoLink || '',
    AverageRating: info.averageRating || '',
    isbn,
  };
}

export async function fetchGoogleBooksMetadata(lookup = {}) {
  if (!lookup) return null;
  const { volumeId, title, author, isbn } = lookup;
  let volume = null;
  if (volumeId) {
    volume = await fetchGoogleBooksVolumeById(volumeId);
  }
  if (!volume) {
    const terms = [];
    if (isbn) terms.push(`isbn:${isbn}`);
    if (title) terms.push(title);
    if (author) terms.push(`inauthor:${author}`);
    const query = terms.join(' ');
    const params = new URLSearchParams({
      q: query || title || author || '',
      printType: 'books',
      maxResults: '5',
    });
    if (GOOGLE_BOOKS_API_KEY) params.set('key', GOOGLE_BOOKS_API_KEY);
    try {
      const resp = await fetch(`${GOOGLE_BOOKS_API_URL}/volumes?${params.toString()}`);
      if (resp.ok) {
        const json = await resp.json();
        if (json && Array.isArray(json.items) && json.items.length) {
          volume = json.items[0];
        }
      }
    } catch (err) {
      console.warn('Google Books metadata search failed', err);
    }
  }
  if (!volume) return null;
  return mapGoogleVolumeToMetadata(volume);
}

export function ensureTvSeriesDefaults(listType, item) {
  if (listType !== 'tvShows' || !item) return;
  const title = (item.title || '').trim();
  if (title && !item.seriesName) item.seriesName = title;
  if (item.seriesOrder === undefined || item.seriesOrder === null) item.seriesOrder = 1;
}

