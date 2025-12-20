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
};

export function getSeasonalTheme(now = new Date()) {
  const month = now.getMonth();
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
  const size = 20 + Math.random() * 26;
  const theme = getCurrentTmTheme();
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
