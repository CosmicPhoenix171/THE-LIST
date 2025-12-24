// Library Statistics Module
import { PRIMARY_LIST_TYPES, RUNTIME_THRESHOLDS, RUNTIME_PILL_UNITS } from './config.js';
import { listCaches, finishedCaches, getLibraryFullyLoaded, getDisplayCacheMap } from './state.js';
import { libraryStatsSummaryEl } from './dom.js';
import { createEl } from './utils.js';

// State
let realisticTimeMode = false;

// ============================================
// NUMBER FORMATTING
// ============================================
export function formatLibraryStatNumber(value) {
  const num = Number(value) || 0;
  return num.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

// ============================================
// RUNTIME PARSING & FORMATTING
// ============================================
export function parseRuntimeMinutes(value) {
  if (!value) return 0;
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, value);
  const text = String(value).toLowerCase();
  let minutes = 0;
  const hourMatch = text.match(/(\d+(?:\.\d+)?)\s*h/);
  if (hourMatch) {
    minutes += Math.round(parseFloat(hourMatch[1]) * 60);
  }
  const minuteMatch = text.match(/(\d+)\s*m/);
  if (minuteMatch) {
    minutes += parseInt(minuteMatch[1], 10);
  }
  if (!hourMatch && !minuteMatch) {
    const fallbackMatch = text.match(/(\d{2,3})/);
    if (fallbackMatch) {
      minutes += parseInt(fallbackMatch[1], 10);
    }
  }
  return Number.isFinite(minutes) && minutes > 0 ? minutes : 0;
}

export function formatRuntimeDuration(totalMinutes) {
  if (!totalMinutes || totalMinutes <= 0) return '';
  const breakdown = breakdownDurationMinutes(totalMinutes);
  const parts = [];
  if (breakdown.years) parts.push(`${breakdown.years}y`);
  if (breakdown.months) parts.push(`${breakdown.months}mth`);
  if (breakdown.days) parts.push(`${breakdown.days}d`);
  if (breakdown.hours) parts.push(`${breakdown.hours}h`);
  if (breakdown.minutes) parts.push(`${breakdown.minutes}m`);
  return parts.join(' ');
}

export function formatRuntimeDurationDetailed(totalMinutes, forceShow = {}) {
  if ((!totalMinutes || totalMinutes <= 0) && Object.keys(forceShow).length === 0) return '';
  const breakdown = breakdownDurationMinutes(totalMinutes);

  const parts = [];
  const hasYears = breakdown.years > 0 || forceShow.years;
  const hasMonths = breakdown.months > 0 || forceShow.months;
  const hasDays = breakdown.days > 0 || forceShow.days;
  const hasHours = breakdown.hours > 0 || forceShow.hours;
  const hasMinutes = true;
  
  if (hasYears) parts.push(formatDurationUnit(breakdown.years, 'year', true));
  if (hasMonths) parts.push(formatDurationUnit(breakdown.months, 'month', true));
  if (hasDays) parts.push(formatDurationUnit(breakdown.days, 'day', true));
  if (hasHours) parts.push(formatDurationUnit(breakdown.hours, 'hour', true));
  if (hasMinutes) parts.push(formatDurationUnit(breakdown.minutes, 'minute', true));
  
  if (!parts.length) {
    return 'Less than a minute';
  }
  
  return parts.map(p => `<span class="runtime-part">${p}</span>`).join(', ');
}

function formatDurationUnit(value, unitLabel, keepZero = false) {
  const amount = Math.floor(value);
  if (!amount && !keepZero) return '';
  
  if (amount === 0) {
    return `00 ${unitLabel}s`;
  }
  
  const formattedAmount = amount < 10 
    ? `<span style="opacity: 0;">0</span>${amount}` 
    : `${amount}`;
  return `${formattedAmount} ${unitLabel}${amount === 1 ? '' : 's'}`;
}

export function breakdownDurationMinutes(totalMinutes) {
  const minutesPerHour = 60;
  const minutesPerDay = minutesPerHour * 24;
  const minutesPerMonth = minutesPerDay * 28;
  const minutesPerYear = minutesPerMonth * 13;
  let remaining = Math.max(0, Math.floor(totalMinutes));
  const years = Math.floor(remaining / minutesPerYear);
  remaining -= years * minutesPerYear;
  const months = Math.floor(remaining / minutesPerMonth);
  remaining -= months * minutesPerMonth;
  const days = Math.floor(remaining / minutesPerDay);
  remaining -= days * minutesPerDay;
  const hours = Math.floor(remaining / minutesPerHour);
  remaining -= hours * minutesPerHour;
  const minutes = remaining;
  return { years, months, days, hours, minutes };
}

// ============================================
// RUNTIME THRESHOLD & PILL DISPLAY
// ============================================
export function getRuntimeThresholdClass(totalMinutes) {
  if (totalMinutes < RUNTIME_THRESHOLDS.MINUTES.max) return 'runtime-minutes';
  if (totalMinutes < RUNTIME_THRESHOLDS.HOURS.max) return 'runtime-hours';
  if (totalMinutes < RUNTIME_THRESHOLDS.DAYS.max) return 'runtime-days';
  if (totalMinutes < RUNTIME_THRESHOLDS.MONTHS.max) return 'runtime-months';
  return 'runtime-years';
}

export function createRuntimePillValueMap() {
  return {
    minutes: 0,
    hours: 0,
    days: 0,
    months: 0,
    years: 0,
  };
}

function formatRuntimePillNumber(value) {
  const amount = Math.max(0, Math.floor(value));
  if (amount === 0) {
    return '00';
  }
  if (amount < 10) {
    return `<span class="runtime-pill-leading-zero">0</span>${amount}`;
  }
  return amount.toString().padStart(2, '0');
}

export function getRuntimeUnitBreakdown(totalMinutes) {
  const minutesPerHour = 60;
  const hoursPerDay = realisticTimeMode ? 7 : 24;
  const minutesPerDay = minutesPerHour * hoursPerDay;
  const minutesPerMonth = minutesPerDay * 28;
  const minutesPerYear = minutesPerMonth * 13;
  let remaining = Math.max(0, Math.floor(totalMinutes));
  const years = Math.floor(remaining / minutesPerYear);
  remaining -= years * minutesPerYear;
  const months = Math.floor(remaining / minutesPerMonth);
  remaining -= months * minutesPerMonth;
  const days = Math.floor(remaining / minutesPerDay);
  remaining -= days * minutesPerDay;
  const hours = Math.floor(remaining / minutesPerHour);
  remaining -= hours * minutesPerHour;
  const minutes = remaining;
  return { minutes, hours, days, months, years };
}

export function renderRuntimePillsDisplay(valueMap = createRuntimePillValueMap(), visibilityMap = {}, activeUnit = null) {
  const pills = [...RUNTIME_PILL_UNITS].reverse().map(({ key, label }) => {
    const isVisible = key === 'minutes' || Boolean(visibilityMap[key]);
    if (!isVisible) return '';
    const isActive = activeUnit === key;
    const valueMarkup = formatRuntimePillNumber(valueMap[key] || 0);
    return `
      <span class="runtime-pill runtime-pill-${key} is-visible${isActive ? ' is-active' : ''}">
        <span class="runtime-pill-value">${valueMarkup}</span>
        <span class="runtime-pill-label">${label}</span>
      </span>
    `;
  }).filter(Boolean).join('');
  return `<span class="runtime-pill-row">${pills}</span>`;
}

// ============================================
// RUNTIME ANIMATION
// ============================================
export function animateRuntimeProgression(chipElement, finalMinutes) {
  if (!chipElement || finalMinutes <= 0) return;
  
  const valueEl = chipElement.querySelector('.library-stat-value');
  if (!valueEl) return;
  
  const TARGET_SECTION_DURATION_MS = 5000;
  const FPS = 60;
  const FRAMES_PER_SECTION = (TARGET_SECTION_DURATION_MS / 1000) * FPS;
  const finalUnitValues = getRuntimeUnitBreakdown(finalMinutes);
  
  const hoursPerDay = realisticTimeMode ? 7 : 24;
  const minutesPerDay = 60 * hoursPerDay;
  const minutesPerMonth = minutesPerDay * 28;
  const minutesPerYear = minutesPerMonth * 13;

  const definitions = [
    { unit: 'minutes', threshold: 0, divisor: 1, max: 60, className: 'runtime-minutes' },
    { unit: 'hours', threshold: 60, divisor: 60, max: hoursPerDay, className: 'runtime-hours' },
    { unit: 'days', threshold: minutesPerDay, divisor: minutesPerDay, max: 28, className: 'runtime-days' },
    { unit: 'months', threshold: minutesPerMonth, divisor: minutesPerMonth, max: 13, className: 'runtime-months' },
    { unit: 'years', threshold: minutesPerYear, divisor: minutesPerYear, max: Infinity, className: 'runtime-years' }
  ];

  const sequence = [];
  let stageStartMinutes = 0;
  for (let i = 0; i < definitions.length; i++) {
    const def = definitions[i];
    if (finalMinutes < def.threshold && i !== 0) break;
    const nextDef = definitions[i + 1];
    const isLastStage = !nextDef || finalMinutes < nextDef.threshold;
    const plannedRange = isLastStage
      ? Math.max(finalMinutes - stageStartMinutes, 0)
      : def.max * def.divisor;
    const stageEndMinutes = stageStartMinutes + plannedRange;
    const rangeMinutes = stageEndMinutes - stageStartMinutes;
    sequence.push({
      unit: def.unit,
      className: def.className,
      startMinutes: stageStartMinutes,
      endMinutes: stageEndMinutes,
      rangeMinutes,
      finalValue: finalUnitValues[def.unit] || 0,
    });
    stageStartMinutes = stageEndMinutes;
    if (isLastStage) break;
  }

  if (!sequence.length) {
    valueEl.innerHTML = renderRuntimePillsDisplay(finalUnitValues, { minutes: true });
    return;
  }
  
  let activeStageIndex = 0;
  let currentFrame = 0;

  function updateFrame() {
    if (activeStageIndex >= sequence.length) {
      const visibilityMap = sequence.reduce((acc, stage) => {
        acc[stage.unit] = true;
        return acc;
      }, {});
      valueEl.innerHTML = renderRuntimePillsDisplay(finalUnitValues, visibilityMap);
      definitions.forEach(d => chipElement.classList.remove(d.className));
      chipElement.classList.add(getRuntimeThresholdClass(finalMinutes));
      return;
    }
    
    const stage = sequence[activeStageIndex];
    if (stage.rangeMinutes <= 0) {
      activeStageIndex++;
      requestAnimationFrame(updateFrame);
      return;
    }

    currentFrame++;
    const progress = Math.min(currentFrame / FRAMES_PER_SECTION, 1);
    const currentTotalMinutes = stage.startMinutes + (stage.rangeMinutes * progress);
    const displayValues = getRuntimeUnitBreakdown(currentTotalMinutes);
    const visibilityMap = {};
    for (let i = 0; i <= activeStageIndex; i++) {
      visibilityMap[sequence[i].unit] = true;
    }

    definitions.forEach(d => chipElement.classList.remove(d.className));
    chipElement.classList.add(stage.className);

    valueEl.innerHTML = renderRuntimePillsDisplay(displayValues, visibilityMap, stage.unit);

    if (progress >= 1) {
      activeStageIndex++;
      currentFrame = 0;
    }

    requestAnimationFrame(updateFrame);
  }
  
  setTimeout(() => requestAnimationFrame(updateFrame), 300);
}

// ============================================
// STAT CHIP BUILDING
// ============================================
export function buildLibraryStatChip(label, value, options = {}) {
  const { modifier = '' } = options;
  const chip = createEl('span', modifier ? `library-stat-chip ${modifier}` : 'library-stat-chip');
  const valueEl = createEl('span', 'library-stat-value', { text: value });
  const labelEl = createEl('span', 'library-stat-label', { text: label });
  chip.appendChild(valueEl);
  chip.appendChild(labelEl);
  return chip;
}

// ============================================
// RUNTIME ESTIMATORS
// ============================================
export function estimateMovieRuntimeMinutes(item) {
  if (!item) return 0;
  const candidates = [item.runtimeMinutes, item.runtime, item.Runtime, item.duration];
  for (const value of candidates) {
    const minutes = parseRuntimeMinutes(value);
    if (minutes > 0) {
      return minutes;
    }
  }
  return 0;
}

export function estimateTvEpisodeRuntimeMinutes(item) {
  if (!item) return 0;
  const candidates = [item.tvEpisodeRuntime, item.tvRuntime, item.runtime];
  for (const value of candidates) {
    const minutes = parseRuntimeMinutes(value);
    if (minutes > 0) {
      return minutes;
    }
  }
  return 0;
}

export function getAnimeEpisodeCount(item) {
  if (!item) return 0;
  const count = Number(item.animeEpisodes || item.episodes || item.totalEpisodes);
  return Number.isFinite(count) && count > 0 ? count : 0;
}

export function estimateAnimeEpisodeRuntimeMinutes(item) {
  if (!item) return 0;
  const candidates = [item.animeDuration, item.duration, item.runtime];
  for (const value of candidates) {
    const minutes = parseRuntimeMinutes(value);
    if (minutes > 0) {
      return minutes;
    }
  }
  return 0;
}

export function isAnimeMovieEntry(item) {
  if (!item) return false;
  const format = String(item.animeFormat || item.format || '').trim().toUpperCase();
  return format === 'MOVIE' || format === 'FILM';
}

export function getTvEpisodeCount(item) {
  if (!item) return 0;
  const direct = Number(item.tvEpisodeCount);
  if (Number.isFinite(direct) && direct > 0) {
    return direct;
  }
  if (Array.isArray(item.tvSeasonSummaries)) {
    return item.tvSeasonSummaries.reduce((total, season) => {
      const count = Number(season?.episodeCount);
      return Number.isFinite(count) && count > 0 ? total + count : total;
    }, 0);
  }
  return 0;
}

// ============================================
// PARSE ACTORS (for cast counts)
// ============================================
function parseActorsList(raw) {
  if (!raw || raw === 'N/A') return [];
  const unique = new Set();
  String(raw)
    .split(',')
    .map(part => part.trim())
    .filter(Boolean)
    .forEach(name => {
      if (!unique.has(name)) unique.add(name);
    });
  return Array.from(unique).slice(0, 12);
}

// ============================================
// COMPUTE LIBRARY STATS
// ============================================
export function computeLibraryRuntimeStats() {
  const cacheMap = getDisplayCacheMap();
  const stats = {
    hasAnyData: PRIMARY_LIST_TYPES.some(type => cacheMap[type] !== undefined),
    movieCount: 0,
    episodeCount: 0,
    totalMinutes: 0,
    minutesByType: {
      movies: 0,
      tvShows: 0,
      anime: 0,
      books: 0
    },
    genreCounts: {},
    castCounts: {}
  };
  if (!stats.hasAnyData) {
    return stats;
  }

  const countItemGenres = (item) => {
    const genres = new Set();
    const add = (g) => {
      if (typeof g === 'string') {
        g.split(',').forEach(p => {
          const clean = p.trim();
          if (clean) genres.add(clean);
        });
      }
    };
    
    if (Array.isArray(item.genres)) item.genres.forEach(add);
    else if (item.genres) add(item.genres);
    
    if (Array.isArray(item.animeGenres)) item.animeGenres.forEach(add);
    else if (item.animeGenres) add(item.animeGenres);

    genres.forEach(g => {
      stats.genreCounts[g] = (stats.genreCounts[g] || 0) + 1;
    });
  };

  // Track which TV series we've already counted genres for (to avoid counting split seasons multiple times)
  const countedTvSeriesGenres = new Set();

  const countItemGenresOncePerSeries = (item, listType) => {
    // Only apply the "once per series" rule for TV shows with split seasons
    // Movies always count separately, even if they're part of the same franchise
    const isSplitTvSeason = listType === 'tvShows' && item.splitFromId && item.seasonNumber !== undefined;
    if (isSplitTvSeason) {
      const seriesKey = item.seriesName || item.tmdbId || item.splitFromId;
      if (countedTvSeriesGenres.has(seriesKey)) {
        return; // Already counted this TV series
      }
      countedTvSeriesGenres.add(seriesKey);
    }
    
    countItemGenres(item);
  };

  const countItemCast = (item) => {
    if (!item.actors) return;
    const actors = new Set();
    const list = Array.isArray(item.actors)
      ? item.actors.filter(Boolean).map(name => String(name).trim()).filter(Boolean)
      : parseActorsList(item.actors);
    
    list.forEach(name => actors.add(name));
    actors.forEach(name => {
      stats.castCounts[name] = (stats.castCounts[name] || 0) + 1;
    });
  };

  // Track which TV series we've already counted cast for (to avoid counting split seasons multiple times)
  // Only applies to TV shows - movies in the same franchise still count separately
  const countedTvSeriesCast = new Set();

  const countItemCastOncePerSeries = (item, listType) => {
    if (!item.actors) return;
    
    // Only apply the "once per series" rule for TV shows with split seasons
    // Movies always count separately, even if they're part of the same franchise
    const isSplitTvSeason = listType === 'tvShows' && item.splitFromId && item.seasonNumber !== undefined;
    if (isSplitTvSeason) {
      const seriesKey = item.seriesName || item.tmdbId || item.splitFromId;
      if (countedTvSeriesCast.has(seriesKey)) {
        return; // Already counted this TV series
      }
      countedTvSeriesCast.add(seriesKey);
    }
    
    countItemCast(item);
  };

  // Count genres and cast from all caches
  const allSources = [listCaches, finishedCaches];
  allSources.forEach(source => {
    PRIMARY_LIST_TYPES.forEach(type => {
      if (source[type]) {
        Object.values(source[type]).forEach(item => {
          if (item) {
            countItemGenresOncePerSeries(item, type);
            countItemCastOncePerSeries(item, type);
          }
        });
      }
    });
  });

  // Movies
  Object.values(cacheMap.movies || {}).forEach(item => {
    if (!item) return;
    stats.movieCount += 1;
    
    const minutes = estimateMovieRuntimeMinutes(item);
    if (minutes > 0) {
      stats.totalMinutes += minutes;
      stats.minutesByType.movies += minutes;
    }
  });

  // TV Shows
  Object.values(cacheMap.tvShows || {}).forEach(item => {
    if (!item) return;
    
    const episodes = getTvEpisodeCount(item);
    if (episodes > 0) {
      stats.episodeCount += episodes;
      const runtimePerEpisode = estimateTvEpisodeRuntimeMinutes(item);
      if (runtimePerEpisode > 0) {
        const total = runtimePerEpisode * episodes;
        stats.totalMinutes += total;
        stats.minutesByType.tvShows += total;
      }
    }
  });

  // Anime
  Object.values(cacheMap.anime || {}).forEach(item => {
    if (!item) return;
    
    const episodes = getAnimeEpisodeCount(item);
    if (episodes > 0) {
      stats.episodeCount += episodes;
    }
    const runtimePerEpisode = estimateAnimeEpisodeRuntimeMinutes(item);
    if (runtimePerEpisode > 0) {
      const multiplier = episodes > 0 ? episodes : (isAnimeMovieEntry(item) ? 1 : 0);
      if (multiplier > 0) {
        const total = runtimePerEpisode * multiplier;
        stats.totalMinutes += total;
        stats.minutesByType.anime += total;
      }
    }
  });

  return stats;
}

// ============================================
// UPDATE LIBRARY RUNTIME STATS (UI)
// ============================================
export function updateLibraryRuntimeStats() {
  const targetEl = document.getElementById('side-stats-panel') || libraryStatsSummaryEl;
  if (!targetEl) return;
  
  const stats = computeLibraryRuntimeStats();
  if (!stats.hasAnyData || !getLibraryFullyLoaded()) {
    if (targetEl === libraryStatsSummaryEl) {
      targetEl.textContent = 'Totals update once your lists load.';
      targetEl.classList.remove('has-data');
    } else {
      targetEl.innerHTML = '<div class="small" style="text-align:center; color:var(--text-500)">Loading stats...</div>';
    }
    return;
  }
  
  if (targetEl === libraryStatsSummaryEl) {
    targetEl.classList.add('has-data');
  }
  targetEl.innerHTML = '';
  
  const movieLabel = stats.movieCount === 1 ? 'Movie' : 'Movies';
  const episodeLabel = stats.episodeCount === 1 ? 'Episode' : 'Episodes';
  const runtimePlaceholder = renderRuntimePillsDisplay();

  const movieChip = buildLibraryStatChip(movieLabel, formatLibraryStatNumber(stats.movieCount), { modifier: 'stat-movies' });
  const episodeChip = buildLibraryStatChip(episodeLabel, formatLibraryStatNumber(stats.episodeCount), { modifier: 'stat-episodes' });
  const runtimeChip = buildLibraryStatChip('Finish Time', '', { 
    modifier: 'runtime runtime-minutes' 
  });
  
  // Add realistic time toggle
  const labelEl = runtimeChip.querySelector('.library-stat-label');
  if (labelEl) {
    labelEl.innerHTML = '';
    const labelText = createEl('span', '', { text: 'Finish Time' });
    const toggleLabel = createEl('label', 'realistic-time-toggle');
    toggleLabel.title = 'Realistic time to finish';
    const checkbox = createEl('input', '', { attrs: { type: 'checkbox' } });
    checkbox.checked = realisticTimeMode;
    checkbox.addEventListener('change', (e) => {
      realisticTimeMode = e.target.checked;
      updateLibraryRuntimeStats();
    });
    const toggleText = createEl('span', '', { text: 'Realistic' });
    toggleLabel.appendChild(checkbox);
    toggleLabel.appendChild(toggleText);
    
    const headerRow = createEl('div', 'stat-header-row');
    headerRow.appendChild(labelText);
    headerRow.appendChild(toggleLabel);
    labelEl.appendChild(headerRow);
  }

  const runtimeValueEl = runtimeChip.querySelector('.library-stat-value');
  if (runtimeValueEl) {
    runtimeValueEl.innerHTML = runtimePlaceholder;
  }

  const countRow = createEl('div', 'stats-count-row');
  countRow.appendChild(movieChip);
  countRow.appendChild(episodeChip);
  targetEl.appendChild(countRow);
  
  targetEl.appendChild(runtimeChip);

  if (stats.totalMinutes > 0) {
    animateRuntimeProgression(runtimeChip, stats.totalMinutes);
  } else {
    const valueEl = runtimeChip.querySelector('.library-stat-value');
    if (valueEl) valueEl.textContent = 'Runtime info unavailable';
  }

  // Top Genres
  const topGenres = Object.entries(stats.genreCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);

  if (topGenres.length > 0) {
    const genreContainer = createEl('div', 'library-stat-chip genre-stats-container');
    genreContainer.style.flexDirection = 'column';
    genreContainer.style.alignItems = 'stretch';
    genreContainer.style.gap = '0.5rem';
    genreContainer.style.marginTop = '0.5rem';
    genreContainer.style.padding = '0.75rem';
    
    const header = createEl('div', 'stat-header-row', { text: 'Top Genres' });
    header.style.justifyContent = 'center';
    header.style.fontSize = '0.85rem';
    header.style.color = 'var(--text-300)';
    header.style.fontWeight = '600';
    header.style.marginBottom = '0.25rem';
    header.style.textTransform = 'uppercase';
    header.style.letterSpacing = '0.05em';
    genreContainer.appendChild(header);

    const list = createEl('div', 'genre-stats-list');
    list.style.display = 'flex';
    list.style.flexWrap = 'wrap';
    list.style.gap = '0.4rem';
    list.style.justifyContent = 'center';

    topGenres.forEach(([genre, count]) => {
      const pill = createEl('div', 'genre-stat-pill');
      pill.style.background = 'rgba(255,255,255,0.06)';
      pill.style.border = '1px solid rgba(255,255,255,0.1)';
      pill.style.borderRadius = '20px';
      pill.style.padding = '0.25rem 0.6rem';
      pill.style.fontSize = '0.75rem';
      pill.style.color = 'var(--text-300)';
      pill.style.display = 'flex';
      pill.style.alignItems = 'center';
      pill.style.gap = '0.35rem';
      pill.style.transition = 'all 0.2s ease';
      
      pill.onmouseenter = () => {
        pill.style.background = 'rgba(255,255,255,0.12)';
        pill.style.borderColor = 'var(--primary-300)';
        pill.style.color = 'var(--text-100)';
      };
      pill.onmouseleave = () => {
        pill.style.background = 'rgba(255,255,255,0.06)';
        pill.style.borderColor = 'rgba(255,255,255,0.1)';
        pill.style.color = 'var(--text-300)';
      };

      const nameSpan = createEl('span', '', { text: genre });
      const countSpan = createEl('span', '', { text: formatLibraryStatNumber(count) });
      countSpan.style.color = 'var(--text-100)';
      countSpan.style.fontWeight = '600';
      countSpan.style.opacity = '0.9';
      
      pill.appendChild(nameSpan);
      pill.appendChild(countSpan);
      list.appendChild(pill);
    });

    genreContainer.appendChild(list);
    targetEl.appendChild(genreContainer);
  }

  // Top Cast
  const topCast = Object.entries(stats.castCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);

  if (topCast.length > 0) {
    const castContainer = createEl('div', 'library-stat-chip cast-stats-container');
    castContainer.style.flexDirection = 'column';
    castContainer.style.alignItems = 'stretch';
    castContainer.style.gap = '0.5rem';
    castContainer.style.marginTop = '0.5rem';
    castContainer.style.padding = '0.75rem';
    
    const header = createEl('div', 'stat-header-row', { text: 'Top Cast' });
    header.style.justifyContent = 'center';
    header.style.fontSize = '0.85rem';
    header.style.color = 'var(--text-300)';
    header.style.fontWeight = '600';
    header.style.marginBottom = '0.25rem';
    header.style.textTransform = 'uppercase';
    header.style.letterSpacing = '0.05em';
    castContainer.appendChild(header);

    const list = createEl('div', 'cast-stats-list');
    list.style.display = 'flex';
    list.style.flexWrap = 'wrap';
    list.style.gap = '0.4rem';
    list.style.justifyContent = 'center';

    topCast.forEach(([actor, count]) => {
      const pill = createEl('div', 'cast-stat-pill');
      pill.style.background = 'rgba(255,255,255,0.06)';
      pill.style.border = '1px solid rgba(255,255,255,0.1)';
      pill.style.borderRadius = '20px';
      pill.style.padding = '0.25rem 0.6rem';
      pill.style.fontSize = '0.75rem';
      pill.style.color = 'var(--text-300)';
      pill.style.display = 'flex';
      pill.style.alignItems = 'center';
      pill.style.gap = '0.35rem';
      pill.style.transition = 'all 0.2s ease';
      
      pill.onmouseenter = () => {
        pill.style.background = 'rgba(255,255,255,0.12)';
        pill.style.borderColor = 'var(--primary-300)';
        pill.style.color = 'var(--text-100)';
      };
      pill.onmouseleave = () => {
        pill.style.background = 'rgba(255,255,255,0.06)';
        pill.style.borderColor = 'rgba(255,255,255,0.1)';
        pill.style.color = 'var(--text-300)';
      };

      const nameSpan = createEl('span', '', { text: actor });
      const countSpan = createEl('span', '', { text: formatLibraryStatNumber(count) });
      countSpan.style.color = 'var(--text-100)';
      countSpan.style.fontWeight = '600';
      countSpan.style.opacity = '0.9';
      
      pill.appendChild(nameSpan);
      pill.appendChild(countSpan);
      list.appendChild(pill);
    });

    castContainer.appendChild(list);
    targetEl.appendChild(castContainer);
  }

  // Accessibility
  const runtimeSummaryText = stats.totalMinutes > 0
    ? (formatRuntimeDuration(stats.totalMinutes) || 'Runtime info unavailable')
    : 'Runtime info unavailable';
  const spokenSummary = `${stats.movieCount} ${movieLabel}, ${stats.episodeCount} ${episodeLabel}, ${runtimeSummaryText}`;
  if (libraryStatsSummaryEl) {
    libraryStatsSummaryEl.setAttribute('aria-label', spokenSummary);
  }
}

// ============================================
// REALISTIC MODE GETTER/SETTER
// ============================================
export function isRealisticTimeMode() {
  return realisticTimeMode;
}

export function setRealisticTimeMode(value) {
  realisticTimeMode = Boolean(value);
}
