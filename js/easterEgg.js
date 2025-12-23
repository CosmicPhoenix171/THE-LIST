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

// Firework colors for explosions - bright, vibrant colors
const fireworkColors = [
  '#ff3333', '#ff2222', // Bright red
  '#ff9933', '#ffaa00', // Bright orange
  '#ffff33', '#ffff66', // Bright yellow
  '#33ff33', '#66ff66', // Bright green
  '#33ffff', '#66ffff', // Bright cyan
  '#3399ff', '#66aaff', // Bright blue
  '#ff33ff', '#ff66ff', // Bright magenta
  '#ff69b4', '#ff99cc', // Bright pink
  '#ffdd33', '#ffee66', // Bright gold
  '#ffffff', '#ffffcc'  // White/cream
];

// Performance limits
const maxFireworkParticles = 150;
const maxTrailParticles = 80;
const particleMaxLifetime = 3000; // 3 seconds max lifetime
const trailMaxLifetime = 1500; // 1.5 seconds for trails

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

let nightSky = null;
let countdownElement = null;
let countdownInterval = null;

function createNightSky() {
  if (nightSky) return nightSky;
  
  nightSky = document.createElement('div');
  nightSky.id = 'tm-night-sky';
  nightSky.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background: linear-gradient(to bottom, 
      #0a0a1a 0%, 
      #1a1a3a 30%, 
      #2a2a4a 60%, 
      #1a1a2a 100%);
    z-index: 9998;
    pointer-events: none;
    opacity: 0;
    transition: opacity 0.8s ease-in-out;
  `;
  
  // Add twinkling stars
  for (let i = 0; i < 100; i++) {
    const star = document.createElement('div');
    const size = Math.random() * 2 + 1;
    star.style.cssText = `
      position: absolute;
      left: ${Math.random() * 100}%;
      top: ${Math.random() * 70}%;
      width: ${size}px;
      height: ${size}px;
      background: white;
      border-radius: 50%;
      opacity: ${0.3 + Math.random() * 0.7};
      animation: tm-twinkle ${2 + Math.random() * 3}s ease-in-out infinite;
      animation-delay: ${Math.random() * 2}s;
    `;
    nightSky.appendChild(star);
  }
  
  // Add countdown display
  countdownElement = document.createElement('div');
  countdownElement.id = 'tm-countdown';
  countdownElement.style.cssText = `
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    font-family: 'Arial', sans-serif;
    font-size: clamp(2rem, 8vw, 6rem);
    font-weight: bold;
    color: transparent;
    -webkit-text-stroke: 2px #ffd700;
    text-shadow: 
      0 0 20px rgba(255, 215, 0, 0.8),
      0 0 40px rgba(255, 215, 0, 0.6),
      0 0 60px rgba(255, 215, 0, 0.4);
    text-align: center;
    z-index: 1;
    opacity: 0.9;
  `;
  nightSky.appendChild(countdownElement);
  
  // Add sparklers on left and right
  createSparkler(nightSky, 'left');
  createSparkler(nightSky, 'right');
  
  // Start countdown
  updateCountdown();
  countdownInterval = setInterval(updateCountdown, 1000);
  
  // Add CSS animation for twinkling
  if (!document.getElementById('tm-night-sky-styles')) {
    const style = document.createElement('style');
    style.id = 'tm-night-sky-styles';
    style.textContent = `
      @keyframes tm-twinkle {
        0%, 100% { opacity: 0.3; transform: scale(1); }
        50% { opacity: 1; transform: scale(1.2); }
      }
      @keyframes tm-celebrate {
        0%, 100% { transform: translate(-50%, -50%) scale(1); }
        50% { transform: translate(-50%, -50%) scale(1.1); }
      }
      @keyframes tm-sparkle-burst {
        0% { transform: translate(-50%, -50%) scale(0); opacity: 1; }
        100% { transform: translate(-50%, -50%) scale(1); opacity: 0; }
      }
      @keyframes tm-sparkle-glow {
        0%, 100% { opacity: 0.6; filter: blur(0px); }
        50% { opacity: 1; filter: blur(1px); }
      }
    `;
    document.head.appendChild(style);
  }
  
  document.body.appendChild(nightSky);
  
  // Fade in
  requestAnimationFrame(() => {
    nightSky.style.opacity = '0.95';
  });
  
  return nightSky;
}

let sparklerIntervals = [];

function createSparkler(container, side) {
  const sparklerContainer = document.createElement('div');
  sparklerContainer.className = 'tm-sparkler';
  
  // Position close to the countdown text
  const sideOffset = side === 'left' ? 'calc(50% - 280px)' : 'calc(50% + 240px)';
  const rotation = side === 'left' ? 'rotate(-25deg)' : 'rotate(25deg)';
  
  sparklerContainer.style.cssText = `
    position: absolute;
    top: 42%;
    left: ${sideOffset};
    transform: translateY(-50%) ${rotation};
    width: 80px;
    height: 120px;
    z-index: 2;
  `;
  
  // Sparkler stick
  const stick = document.createElement('div');
  stick.style.cssText = `
    position: absolute;
    bottom: 0;
    left: 50%;
    transform: translateX(-50%);
    width: 4px;
    height: 60px;
    background: linear-gradient(to bottom, #888, #555);
    border-radius: 2px;
  `;
  sparklerContainer.appendChild(stick);
  
  // Sparkler tip (glowing core)
  const tip = document.createElement('div');
  tip.style.cssText = `
    position: absolute;
    bottom: 55px;
    left: 50%;
    transform: translateX(-50%);
    width: 8px;
    height: 12px;
    background: radial-gradient(circle, #ffffff 0%, #ffd700 40%, #ff6600 70%, transparent 100%);
    border-radius: 50%;
    box-shadow: 0 0 15px #ffd700, 0 0 30px #ff6600, 0 0 45px #ff3300;
    animation: tm-sparkle-glow 0.2s ease-in-out infinite;
  `;
  sparklerContainer.appendChild(tip);
  
  container.appendChild(sparklerContainer);
  
  // Spawn sparks continuously
  const sparkInterval = setInterval(() => {
    spawnSparklerSparks(sparklerContainer, side);
  }, 50);
  
  sparklerIntervals.push(sparkInterval);
}

function spawnSparklerSparks(container, side) {
  const sparkCount = 2 + Math.floor(Math.random() * 3);
  
  for (let i = 0; i < sparkCount; i++) {
    const spark = document.createElement('div');
    const angle = Math.random() * Math.PI * 2;
    const distance = 20 + Math.random() * 40;
    const size = 2 + Math.random() * 3;
    const duration = 0.3 + Math.random() * 0.4;
    
    const sparkColors = ['#ffffff', '#ffd700', '#ffaa00', '#ff6600', '#ffff66'];
    const color = sparkColors[Math.floor(Math.random() * sparkColors.length)];
    
    const endX = Math.cos(angle) * distance;
    const endY = Math.sin(angle) * distance - 20; // Bias upward
    
    spark.style.cssText = `
      position: absolute;
      left: 50%;
      bottom: 60px;
      width: ${size}px;
      height: ${size}px;
      background: ${color};
      border-radius: 50%;
      box-shadow: 0 0 ${size * 2}px ${color};
      pointer-events: none;
      z-index: 3;
    `;
    
    container.appendChild(spark);
    
    // Animate the spark
    spark.animate([
      { 
        transform: 'translate(-50%, 0) scale(1)', 
        opacity: 1 
      },
      { 
        transform: `translate(calc(-50% + ${endX}px), ${endY}px) scale(0.3)`, 
        opacity: 0 
      }
    ], {
      duration: duration * 1000,
      easing: 'ease-out',
      fill: 'forwards'
    }).onfinish = () => {
      if (spark.parentNode) {
        spark.parentNode.removeChild(spark);
      }
    };
  }
}

function updateCountdown() {
  if (!countdownElement) return;
  
  const now = new Date();
  const currentYear = now.getFullYear();
  
  // Target is midnight on January 1st of next year (or current year if we're before Jan 1)
  let targetYear = currentYear;
  if (now.getMonth() === 0 && now.getDate() <= 7) {
    // We're in early January, target was this year's Jan 1
    targetYear = currentYear;
  } else {
    // Target is next year's Jan 1
    targetYear = currentYear + 1;
  }
  
  const newYear = new Date(targetYear, 0, 1, 0, 0, 0);
  const diff = newYear - now;
  
  if (diff <= 0) {
    // It's New Year!
    countdownElement.innerHTML = '🎉 Happy New Year!!! 🎉';
    countdownElement.style.animation = 'tm-celebrate 0.5s ease-in-out infinite';
    countdownElement.style.color = 'transparent';
    countdownElement.style.webkitTextStroke = '2px #ffffff';
    countdownElement.style.textShadow = `
      0 0 20px rgba(255, 255, 255, 0.9),
      0 0 40px rgba(255, 215, 0, 0.8),
      0 0 60px rgba(255, 100, 100, 0.6),
      0 0 80px rgba(100, 255, 100, 0.4)
    `;
  } else {
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);
    
    if (days > 0) {
      countdownElement.innerHTML = `
        <div style="font-size: 0.4em; margin-bottom: 10px; opacity: 0.8;">Countdown to ${targetYear}</div>
        <div>${days}d ${hours}h ${minutes}m ${seconds}s</div>
      `;
    } else if (hours > 0) {
      countdownElement.innerHTML = `
        <div style="font-size: 0.4em; margin-bottom: 10px; opacity: 0.8;">Countdown to ${targetYear}</div>
        <div>${hours}h ${minutes}m ${seconds}s</div>
      `;
    } else if (minutes > 0) {
      countdownElement.innerHTML = `
        <div style="font-size: 0.4em; margin-bottom: 10px; opacity: 0.8;">Almost there!</div>
        <div>${minutes}m ${seconds}s</div>
      `;
    } else {
      // Final countdown - just seconds!
      countdownElement.innerHTML = `<div style="font-size: 1.5em;">${seconds}</div>`;
      countdownElement.style.color = seconds <= 10 ? '#ff6666' : '#ffd700';
    }
  }
}

function removeNightSky() {
  if (countdownInterval) {
    clearInterval(countdownInterval);
    countdownInterval = null;
  }
  // Clear sparkler intervals
  sparklerIntervals.forEach(interval => clearInterval(interval));
  sparklerIntervals = [];
  
  countdownElement = null;
  
  if (nightSky) {
    nightSky.style.opacity = '0';
    setTimeout(() => {
      if (nightSky && nightSky.parentNode) {
        nightSky.parentNode.removeChild(nightSky);
      }
      nightSky = null;
    }, 800);
  }
}

function ensureLayer() {
  if (layer) return layer;
  layer = document.createElement('div');
  layer.id = 'tm-rain-layer';
  document.body.appendChild(layer);
  
  // Add night sky for fireworks
  const theme = getCurrentTmTheme();
  if (theme && theme.isFirework) {
    createNightSky();
  }
  
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
  // Limit total particles for performance
  if (fireworkParticles.length >= maxFireworkParticles) {
    // Remove oldest particles to make room
    const toRemove = Math.min(20, fireworkParticles.length - maxFireworkParticles + 25);
    for (let i = 0; i < toRemove; i++) {
      const p = fireworkParticles.shift();
      if (p.el && p.el.parentNode) p.el.parentNode.removeChild(p.el);
    }
  }

  const particleCount = 25 + Math.floor(Math.random() * 15);
  const spawnTime = performance.now();
  
  // Color groups for distinct explosions
  const colorGroups = [
    ['#ff3333', '#ff5555', '#ff7777'], // Reds
    ['#ff9933', '#ffaa00', '#ffcc33'], // Oranges
    ['#ffff33', '#ffff66', '#ffffaa'], // Yellows
    ['#33ff33', '#66ff66', '#99ff99'], // Greens
    ['#33ffff', '#66ffff', '#99ffff'], // Cyans
    ['#3399ff', '#66aaff', '#99ccff'], // Blues
    ['#ff33ff', '#ff66ff', '#ff99ff'], // Magentas
    ['#ff69b4', '#ff99cc', '#ffbbdd'], // Pinks
    ['#ffdd33', '#ffee66', '#ffff99'], // Golds
  ];
  
  // Pick a random color group for this explosion
  const selectedGroup = colorGroups[Math.floor(Math.random() * colorGroups.length)];
  // Sometimes pick a second contrasting group
  const secondGroup = colorGroups[Math.floor(Math.random() * colorGroups.length)];
  
  // Randomly choose explosion style
  const explosionStyle = Math.floor(Math.random() * 3);

  for (let i = 0; i < particleCount; i++) {
    const angle = (Math.PI * 2 * i) / particleCount + (Math.random() - 0.5) * 0.3;
    const speed = 3 + Math.random() * 5;
    
    // Different color patterns for variety
    let particleColor;
    switch (explosionStyle) {
      case 0: // Single color group with white sparkles
        particleColor = Math.random() > 0.15 
          ? selectedGroup[Math.floor(Math.random() * selectedGroup.length)]
          : '#ffffff';
        break;
      case 1: // Two contrasting color groups
        const useFirst = Math.random() > 0.5;
        const group = useFirst ? selectedGroup : secondGroup;
        particleColor = group[Math.floor(Math.random() * group.length)];
        break;
      default: // Rainbow - each particle random from all groups
        const randomGroup = colorGroups[Math.floor(Math.random() * colorGroups.length)];
        particleColor = randomGroup[Math.floor(Math.random() * randomGroup.length)];
    }

    const particle = {
      x: x,
      y: y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      size: 6 + Math.random() * 6, // Larger particles
      radius: 2,
      opacity: 1,
      fadeRate: 0.012 + Math.random() * 0.015,
      color: particleColor,
      isParticle: true,
      resting: false,
      supported: false,
      rotation: 0,
      spin: 0,
      spawnTime: spawnTime,
    };

    const el = document.createElement('div');
    el.className = 'tm-sprite tm-particle';
    el.textContent = '●';
    el.style.fontSize = `${particle.size}px`;
    el.style.color = particleColor;
    el.style.textShadow = `0 0 8px ${particleColor}, 0 0 16px ${particleColor}, 0 0 24px ${particleColor}`;
    el.style.opacity = '1';
    layer.appendChild(el);
    particle.el = el;
    fireworkParticles.push(particle);
  }
}

function spawnTrailParticle(x, y, isSparkle) {
  if (!layer) return;

  // Limit trail particles for performance
  if (trailParticles.length >= maxTrailParticles) {
    const p = trailParticles.shift();
    if (p.el && p.el.parentNode) p.el.parentNode.removeChild(p.el);
  }

  const particle = {
    x: x + (Math.random() - 0.5) * 6,
    y: y + (Math.random() - 0.5) * 4,
    vx: (Math.random() - 0.5) * 1.5,
    vy: 0.5 + Math.random() * 1.5, // Drift downward
    size: isSparkle ? 3 + Math.random() * 4 : 6 + Math.random() * 8,
    opacity: isSparkle ? 1 : 0.6 + Math.random() * 0.3,
    fadeRate: isSparkle ? 0.04 + Math.random() * 0.03 : 0.025 + Math.random() * 0.02, // Faster fade
    isSparkle: isSparkle,
    scale: 1,
    spawnTime: performance.now(),
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
  const now = performance.now();
  for (let i = trailParticles.length - 1; i >= 0; i--) {
    const particle = trailParticles[i];

    // Force remove if exceeded max lifetime
    const age = now - particle.spawnTime;
    if (age > trailMaxLifetime) {
      if (particle.el && particle.el.parentNode) {
        particle.el.parentNode.removeChild(particle.el);
      }
      trailParticles.splice(i, 1);
      continue;
    }

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
  const now = performance.now();
  for (let i = fireworkParticles.length - 1; i >= 0; i--) {
    const particle = fireworkParticles[i];

    // Force remove if exceeded max lifetime
    const age = now - particle.spawnTime;
    if (age > particleMaxLifetime) {
      if (particle.el && particle.el.parentNode) {
        particle.el.parentNode.removeChild(particle.el);
      }
      fireworkParticles.splice(i, 1);
      continue;
    }

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
  // Remove night sky
  removeNightSky();
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
