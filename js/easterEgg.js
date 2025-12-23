// TM Easter Egg - Falling ™ sprites with physics
// Click the ™ symbol to trigger falling sprites, click again to boost intensity

const sprites = [];
let running = false;
let spawnTimer = null;
let rafId = null;
let layer = null;
let intensityMultiplier = 1;

const pointerState = {
  x: 0,
  y: 0,
  vx: 0,
  vy: 0,
  active: false,
  lastX: 0,
  lastY: 0,
  lastTime: 0,
};

let pointerListenersAttached = false;

// Physics constants
const gravity = 0.32;
const bounce = 0.68;
const friction = 0.995;
const settleThreshold = 0.12;
const wakeSpeed = 0.35;
const supportAngleThreshold = 0.5;
const supportDistanceEpsilon = 0.75;
const spawnMinDelay = 320;
const spawnMaxDelay = 900;
const collisionIterations = 4;
const maxVerticalSpeed = 24;
const maxHorizontalSpeed = 12;
const pointerRadius = 48;
const pointerPushStrength = 1.65;
const pointerVelocityInfluence = 0.28;
const pointerVelocityDecay = 0.86;
const pointerActivityWindow = 220;

// Seasonal themes
const seasonThemes = {
  winter: {
    text: '❄',
    color: '#c3e8ff',
    glow: '0 0 18px rgba(195,232,255,0.85)',
  },
  halloween: {
    text: '🎃',
    color: '#ffb347',
    glow: '0 0 18px rgba(255,138,0,0.85)',
  },
  newYear: {
    text: '🎆',
    color: '#ffd700',
    glow: '0 0 18px rgba(255,215,0,0.85)',
    isFirework: true,
  },
};

// Firework colors for explosions
const fireworkColors = [
  '#ff0000', '#ff6600', '#ffff00', '#00ff00',
  '#00ffff', '#0066ff', '#ff00ff', '#ff1493',
  '#ffd700', '#ffffff'
];

// Firework particles array
let fireworkParticles = [];

// Trail particles (smoke and sparkles)
let trailParticles = [];

export function getSeasonalTheme(now = new Date()) {
  const month = now.getMonth();
  const day = now.getDate();
  // New Year's: December 26 - January 7
  if ((month === 11 && day >= 20) || (month === 0 && day <= 7)) return seasonThemes.newYear;
  if (month === 11) return seasonThemes.winter;
  if (month === 9) return seasonThemes.halloween;
  return null;
}

export function getCurrentTmTheme() {
  return getSeasonalTheme();
}

function ensureLayer() {
  if (layer) return layer;
  layer = document.createElement('div');
  layer.id = 'tm-rain-layer';
  document.body.appendChild(layer);
  attachPointerListeners();
  return layer;
}

function attachPointerListeners() {
  if (pointerListenersAttached) return;
  pointerListenersAttached = true;
  const passiveOpts = { passive: true };
  window.addEventListener('pointermove', handlePointerMove, passiveOpts);
  window.addEventListener('pointerdown', handlePointerMove, passiveOpts);
  window.addEventListener('pointerup', handlePointerIdle, passiveOpts);
  window.addEventListener('pointerleave', handlePointerIdle, passiveOpts);
  window.addEventListener('pointercancel', handlePointerIdle, passiveOpts);
  window.addEventListener('blur', handlePointerIdle);
}

function handlePointerMove(event) {
  const { clientX, clientY } = event;
  const now = performance.now();
  if (pointerState.active && pointerState.lastTime) {
    const dt = Math.max(now - pointerState.lastTime, 8);
    const normalization = 16 / dt;
    pointerState.vx = (clientX - pointerState.lastX) * normalization;
    pointerState.vy = (clientY - pointerState.lastY) * normalization;
  } else {
    pointerState.vx = 0;
    pointerState.vy = 0;
  }
  pointerState.active = true;
  pointerState.x = clientX;
  pointerState.y = clientY;
  pointerState.lastX = clientX;
  pointerState.lastY = clientY;
  pointerState.lastTime = now;
}

function handlePointerIdle() {
  pointerState.active = false;
  pointerState.vx = 0;
  pointerState.vy = 0;
}

export function bindTriggers() {
  document.querySelectorAll('.tm').forEach(node => {
    if (node.dataset.tmEggBound === 'true') return;
    node.dataset.tmEggBound = 'true';
    node.classList.add('tm-clickable');
    node.addEventListener('click', handleTmClick);
  });
}

function handleTmClick() {
  if (!running) {
    start();
  } else {
    boostIntensity();
  }
}

function start() {
  if (running) return;
  running = true;
  intensityMultiplier = 1;
  ensureLayer();
  spawnBurst(4 * intensityMultiplier);
  scheduleNextSpawn();
  tick();
}

function boostIntensity() {
  intensityMultiplier *= 2;
  spawnBurst(Math.max(4, Math.round(intensityMultiplier * 2)));
  if (spawnTimer) {
    clearTimeout(spawnTimer);
    scheduleNextSpawn();
  }
}

function scheduleNextSpawn() {
  const delayScale = Math.max(1, intensityMultiplier);
  const minDelay = Math.max(50, spawnMinDelay / delayScale);
  const maxDelay = Math.max(minDelay + 10, spawnMaxDelay / delayScale);
  spawnTimer = setTimeout(() => {
    const batch = Math.max(1, Math.round(intensityMultiplier));
    spawnBurst(batch);
    scheduleNextSpawn();
  }, minDelay + Math.random() * (maxDelay - minDelay));
}

function spawnBurst(count) {
  for (let i = 0; i < count; i++) {
    spawnSprite();
  }
}

function spawnSprite() {
  if (!layer) ensureLayer();
  const theme = getCurrentTmTheme();

  // Special handling for fireworks
  if (theme && theme.isFirework) {
    spawnFirework();
    return;
  }

  const size = 20 + Math.random() * 26;
  const sprite = {
    size,
    radius: size / 2,
    x: Math.random() * (window.innerWidth - size) + size / 2,
    y: -size - Math.random() * 40,
    vx: (Math.random() - 0.5) * 1.4,
    vy: Math.random() * -1.5,
    rotation: Math.random() * 360,
    spin: (Math.random() - 0.5) * 120,
    resting: false,
    supported: false,
  };
  const el = document.createElement('div');
  el.className = 'tm-sprite';
  el.textContent = theme && theme.text ? theme.text : '™';
  el.style.fontSize = `${size}px`;
  if (theme) {
    el.classList.add('tm-themed');
    if (theme.color) el.style.color = theme.color;
    if (theme.glow) el.style.textShadow = theme.glow;
  }
  el.style.setProperty('--tm-spin', `${sprite.spin}deg`);
  layer.appendChild(el);
  sprite.el = el;
  sprites.push(sprite);
  syncSprite(sprite);
}

function spawnFirework() {
  if (!layer) ensureLayer();

  const startX = Math.random() * (window.innerWidth - 100) + 50;
  const startY = window.innerHeight;
  const targetY = window.innerHeight * (0.2 + Math.random() * 0.4);

  const rocket = {
    x: startX,
    y: startY,
    vx: (Math.random() - 0.5) * 2,
    vy: -(8 + Math.random() * 4),
    targetY: targetY,
    size: 8,
    radius: 4,
    isRocket: true,
    resting: false,
    supported: false,
    rotation: 0,
    spin: 0,
  };

  const el = document.createElement('div');
  el.className = 'tm-sprite tm-rocket';
  el.textContent = '✦';
  el.style.fontSize = '12px';
  el.style.color = '#ffd700';
  el.style.textShadow = '0 0 10px #ffd700, 0 0 20px #ff6600';
  layer.appendChild(el);
  rocket.el = el;
  sprites.push(rocket);
  syncSprite(rocket);
}

function createExplosion(x, y) {
  const particleCount = 30 + Math.floor(Math.random() * 20);
  const color = fireworkColors[Math.floor(Math.random() * fireworkColors.length)];
  const secondaryColor = fireworkColors[Math.floor(Math.random() * fireworkColors.length)];

  for (let i = 0; i < particleCount; i++) {
    const angle = (Math.PI * 2 * i) / particleCount + (Math.random() - 0.5) * 0.3;
    const speed = 3 + Math.random() * 5;
    const particleColor = Math.random() > 0.5 ? color : secondaryColor;

    const particle = {
      x: x,
      y: y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      size: 4 + Math.random() * 4,
      radius: 2,
      opacity: 1,
      fadeRate: 0.008 + Math.random() * 0.012,
      color: particleColor,
      isParticle: true,
      resting: false,
      supported: false,
      rotation: 0,
      spin: 0,
    };

    const el = document.createElement('div');
    el.className = 'tm-sprite tm-particle';
    el.textContent = '●';
    el.style.fontSize = `${particle.size}px`;
    el.style.color = particleColor;
    el.style.textShadow = `0 0 6px ${particleColor}, 0 0 12px ${particleColor}`;
    el.style.opacity = '1';
    layer.appendChild(el);
    particle.el = el;
    fireworkParticles.push(particle);
  }
}

function spawnTrailParticle(x, y, isSparkle) {
  if (!layer) return;

  const particle = {
    x: x + (Math.random() - 0.5) * 6,
    y: y + (Math.random() - 0.5) * 4,
    vx: (Math.random() - 0.5) * 1.5,
    vy: 0.5 + Math.random() * 1.5, // Drift downward
    size: isSparkle ? 3 + Math.random() * 4 : 6 + Math.random() * 8,
    opacity: isSparkle ? 1 : 0.6 + Math.random() * 0.3,
    fadeRate: isSparkle ? 0.025 + Math.random() * 0.02 : 0.015 + Math.random() * 0.01,
    isSparkle: isSparkle,
    scale: 1,
  };

  const el = document.createElement('div');
  el.className = 'tm-sprite tm-trail';
  
  if (isSparkle) {
    // Sparkle particle
    const sparkleChars = ['✦', '✧', '★', '·', '•'];
    el.textContent = sparkleChars[Math.floor(Math.random() * sparkleChars.length)];
    const sparkleColors = ['#ffd700', '#ffaa00', '#ffffff', '#ffff99'];
    const color = sparkleColors[Math.floor(Math.random() * sparkleColors.length)];
    el.style.color = color;
    el.style.textShadow = `0 0 4px ${color}, 0 0 8px ${color}`;
  } else {
    // Smoke particle
    el.textContent = '●';
    const smokeColors = ['#888888', '#999999', '#aaaaaa', '#777777'];
    el.style.color = smokeColors[Math.floor(Math.random() * smokeColors.length)];
    el.style.textShadow = '0 0 8px rgba(100,100,100,0.5)';
  }
  
  el.style.fontSize = `${particle.size}px`;
  el.style.opacity = particle.opacity;
  el.style.left = `${particle.x}px`;
  el.style.top = `${particle.y}px`;
  el.style.transform = 'translate(-50%, -50%)';
  layer.appendChild(el);
  particle.el = el;
  trailParticles.push(particle);
}

function updateTrailParticles() {
  for (let i = trailParticles.length - 1; i >= 0; i--) {
    const particle = trailParticles[i];

    particle.x += particle.vx;
    particle.y += particle.vy;
    particle.opacity -= particle.fadeRate;
    
    // Smoke expands as it fades
    if (!particle.isSparkle) {
      particle.scale += 0.02;
    }

    if (particle.opacity <= 0) {
      if (particle.el && particle.el.parentNode) {
        particle.el.parentNode.removeChild(particle.el);
      }
      trailParticles.splice(i, 1);
    } else {
      particle.el.style.opacity = particle.opacity;
      particle.el.style.left = `${particle.x}px`;
      particle.el.style.top = `${particle.y}px`;
      if (!particle.isSparkle) {
        particle.el.style.transform = `translate(-50%, -50%) scale(${particle.scale})`;
      }
    }
  }
}

function updateFireworks() {
  // Update trail particles
  updateTrailParticles();

  // Update rockets
  for (let i = sprites.length - 1; i >= 0; i--) {
    const sprite = sprites[i];
    if (sprite.isRocket) {
      // Spawn trail particles behind the rocket
      if (Math.random() < 0.7) {
        spawnTrailParticle(sprite.x, sprite.y + 5, false); // Smoke
      }
      if (Math.random() < 0.5) {
        spawnTrailParticle(sprite.x, sprite.y + 3, true); // Sparkle
      }

      sprite.vy += 0.05; // Slight gravity
      sprite.x += sprite.vx;
      sprite.y += sprite.vy;

      // Check if reached target height or started falling
      if (sprite.y <= sprite.targetY || sprite.vy > 0) {
        createExplosion(sprite.x, sprite.y);
        if (sprite.el && sprite.el.parentNode) {
          sprite.el.parentNode.removeChild(sprite.el);
        }
        sprites.splice(i, 1);
      } else {
        syncSprite(sprite);
      }
    }
  }

  // Update explosion particles
  for (let i = fireworkParticles.length - 1; i >= 0; i--) {
    const particle = fireworkParticles[i];

    particle.vy += 0.15; // Gravity
    particle.vx *= 0.98; // Air resistance
    particle.vy *= 0.98;
    particle.x += particle.vx;
    particle.y += particle.vy;
    particle.opacity -= particle.fadeRate;

    if (particle.opacity <= 0) {
      if (particle.el && particle.el.parentNode) {
        particle.el.parentNode.removeChild(particle.el);
      }
      fireworkParticles.splice(i, 1);
    } else {
      particle.el.style.opacity = particle.opacity;
      particle.el.style.left = `${particle.x}px`;
      particle.el.style.top = `${particle.y}px`;
    }
  }
}

function syncSprite(sprite) {
  if (!sprite.el) return;
  sprite.el.style.left = `${sprite.x}px`;
  sprite.el.style.top = `${sprite.y}px`;
  sprite.el.style.transform = `translate(-50%, -50%) rotate(${sprite.rotation}deg)`;
}

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function applyPointerInteractions() {
  if (!pointerState.active) return;
  const now = performance.now();
  if (!pointerState.lastTime || (now - pointerState.lastTime) > pointerActivityWindow) return;
  sprites.forEach(sprite => {
    const dx = sprite.x - pointerState.x;
    const dy = sprite.y - pointerState.y;
    const dist = Math.hypot(dx, dy) || 0.0001;
    const effectiveRadius = pointerRadius + sprite.radius;
    if (dist > effectiveRadius) return;
    const nx = dx / dist;
    const ny = dy / dist;
    const overlap = effectiveRadius - dist;
    const pushStrength = (overlap / effectiveRadius) * pointerPushStrength;
    sprite.x += nx * overlap;
    sprite.y += ny * overlap;
    sprite.vx += nx * pushStrength + pointerState.vx * pointerVelocityInfluence;
    sprite.vy += ny * pushStrength + pointerState.vy * pointerVelocityInfluence;
    sprite.resting = false;
  });
}

function resolveCollisions() {
  let resolvedAny = false;
  for (let i = 0; i < sprites.length; i++) {
    for (let j = i + 1; j < sprites.length; j++) {
      const a = sprites[i];
      const b = sprites[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.hypot(dx, dy) || 0.0001;
      const minDist = a.radius + b.radius;
      const nx = dx / dist;
      const ny = dy / dist;
      if (Math.abs(ny) > supportAngleThreshold && dist - minDist <= supportDistanceEpsilon) {
        if (ny > 0) a.supported = true;
        if (ny < 0) b.supported = true;
      }
      if (dist >= minDist) continue;
      resolvedAny = true;
      const overlap = (minDist - dist) / 2;
      a.x -= nx * overlap;
      a.y -= ny * overlap;
      b.x += nx * overlap;
      b.y += ny * overlap;
      const relVelX = b.vx - a.vx;
      const relVelY = b.vy - a.vy;
      const velAlongNormal = relVelX * nx + relVelY * ny;
      if (velAlongNormal > 0) continue;
      const restitution = 0.65;
      const impulse = -(1 + restitution) * velAlongNormal / 2;
      const impulseX = impulse * nx;
      const impulseY = impulse * ny;
      a.vx -= impulseX;
      a.vy -= impulseY;
      b.vx += impulseX;
      b.vy += impulseY;
      if (Math.abs(a.vx) > wakeSpeed || Math.abs(a.vy) > wakeSpeed) a.resting = false;
      if (Math.abs(b.vx) > wakeSpeed || Math.abs(b.vy) > wakeSpeed) b.resting = false;
      if (ny > supportAngleThreshold) a.supported = true;
      if (ny < -supportAngleThreshold) b.supported = true;
    }
  }
  return resolvedAny;
}

function tick() {
  rafId = requestAnimationFrame(tick);
  const width = window.innerWidth;
  const height = window.innerHeight;

  const theme = getCurrentTmTheme();

  // Handle firework updates
  if (theme && theme.isFirework) {
    updateFireworks();
    // Still sync non-rocket sprites
    sprites.filter(s => !s.isRocket).forEach(syncSprite);
    return;
  }

  sprites.forEach(sprite => {
    sprite.supported = false;
    if (!sprite.resting) {
      sprite.vy += gravity;
      sprite.vx *= friction;
      sprite.vx = clamp(sprite.vx, -maxHorizontalSpeed, maxHorizontalSpeed);
      sprite.vy = clamp(sprite.vy, -maxVerticalSpeed, maxVerticalSpeed);
      sprite.x += sprite.vx;
      sprite.y += sprite.vy;
    }
    sprite.rotation = (sprite.rotation + sprite.spin * 0.016) % 360;
    const radius = sprite.radius;
    if (sprite.x - radius < 0) {
      sprite.x = radius;
      sprite.vx *= -bounce;
    } else if (sprite.x + radius > width) {
      sprite.x = width - radius;
      sprite.vx *= -bounce;
    }
    if (sprite.y + radius > height) {
      sprite.y = height - radius;
      if (!sprite.resting) sprite.vy *= -bounce;
      sprite.supported = true;
    }
  });
  applyPointerInteractions();
  pointerState.vx *= pointerVelocityDecay;
  pointerState.vy *= pointerVelocityDecay;
  if (Math.abs(pointerState.vx) < 0.01) pointerState.vx = 0;
  if (Math.abs(pointerState.vy) < 0.01) pointerState.vy = 0;
  for (let iter = 0; iter < collisionIterations; iter++) {
    if (!resolveCollisions()) break;
  }
  sprites.forEach(sprite => {
    const settledVertically = Math.abs(sprite.vy) < settleThreshold;
    const settledHorizontally = Math.abs(sprite.vx) < settleThreshold;
    if (sprite.supported && settledVertically && settledHorizontally) {
      sprite.vx = 0;
      sprite.vy = 0;
      sprite.resting = true;
    } else if (!sprite.supported && sprite.resting) {
      sprite.resting = false;
    }
  });
  sprites.forEach(syncSprite);
}

export function stop() {
  running = false;
  if (spawnTimer) {
    clearTimeout(spawnTimer);
    spawnTimer = null;
  }
  if (rafId) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
}

export function clear() {
  stop();
  sprites.forEach(sprite => {
    if (sprite.el && sprite.el.parentNode) {
      sprite.el.parentNode.removeChild(sprite.el);
    }
  });
  sprites.length = 0;
  // Also clear firework particles
  fireworkParticles.forEach(particle => {
    if (particle.el && particle.el.parentNode) {
      particle.el.parentNode.removeChild(particle.el);
    }
  });
  fireworkParticles.length = 0;
  // Clear trail particles
  trailParticles.forEach(particle => {
    if (particle.el && particle.el.parentNode) {
      particle.el.parentNode.removeChild(particle.el);
    }
  });
  trailParticles.length = 0;
  if (layer && layer.parentNode) {
    layer.parentNode.removeChild(layer);
    layer = null;
  }
}

export function isRunning() {
  return running;
}

export default {
  bindTriggers,
  getSeasonalTheme,
  getCurrentTmTheme,
  stop,
  clear,
  isRunning,
};
