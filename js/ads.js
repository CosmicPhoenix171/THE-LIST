const adImages = [
  'ads/ad1.png',
  'ads/ad2.png',
  'ads/ad3.png',
  'ads/ad4.png',
  'ads/ad5.png',
  'ads/ad6.png',
  'ads/ad7.png',
];

let adCycleInterval = null;

export function getAdImages() {
  return adImages;
}

export function cycleRandomAd() {
  if (!adImages.length) return;
  const randomAdSrc = adImages[Math.floor(Math.random() * adImages.length)];
  document.querySelectorAll('.fake-ad-image').forEach(img => {
    img.src = randomAdSrc;
  });
}

export function initializeRandomAds(intervalMs = 60000) {
  cycleRandomAd();
  if (adCycleInterval) {
    clearInterval(adCycleInterval);
  }
  adCycleInterval = setInterval(cycleRandomAd, intervalMs);
}

export function stopAdCycle() {
  if (adCycleInterval) {
    clearInterval(adCycleInterval);
    adCycleInterval = null;
  }
}
