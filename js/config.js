// ============================================================================
// FILE: js/config.js
// ============================================================================
export const CONFIG = {
  orbit: {
    radius: 2.5,
    minRadius: 1.1,
    maxRadius: 5.0,
    minPhi: 0.05,
    maxPhi: Math.PI - 0.05,
    dragSensitivity: 0.005,
    damping: 0.95
  },
  marker: {
    base: 0.1,
    min: 0.08,
    max: 0.1,
    referenceRadius: 2.5
  },
  paths: {
    stickersJson: './data/stickers.json',
    earthDay: './assets/materials/Earth_8k.jpg',
    earthNight: './assets/materials/Night_8k.jpg',
    moon: './assets/materials/Moon.jpg',
    mars: './assets/materials/Mars.jpg',
    mapPointer: './assets/materials/MapPointer.png'
  }
};

