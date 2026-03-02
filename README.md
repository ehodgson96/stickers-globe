# Shroom Sticker Globe

An interactive 3D globe that maps [Shroom Squad](https://www.shroomsquad.co.uk) sticker drops around the world.

**Live:** https://ehodgson96.github.io/stickers-globe/

---

## Overview

Spin a real-time rendered Earth and discover where Shroom Squad stickers have been placed globally. Each pin links back to the original Instagram post with a photo, location, date, and like count.

Built with vanilla JavaScript and Three.js — no build step required.

---

## Features

- **Interactive globe** — drag to orbit, scroll/pinch to zoom, with physics-based inertia
- **Day/night shader** — custom GLSL that blends a day texture with a night city-lights texture based on a sun direction
- **Sticker markers** — click any map pin to fly the camera to that location and open a detail popout
- **Sidebar** — scrollable list of all sticker spots, synced with the globe selection
- **Orbiting objects** — UFO, cow, rocket, satellites, and Hubble Telescope orbit the globe as 3D GLTF models
- **Celestial bodies** — Moon orbits the Earth; Mars orbits in the background
- **Procedural starfield** — 2000-star canvas texture mapped to a background sphere
- **Post-processing effects** (toggled via the SYS MENU):
  | Effect | Controls |
  |---|---|
  | Glitch | Auto mode (1s glitch every 10s), Wild mode |
  | Bloom Classic | Strength |
  | Unreal Bloom *(on by default)* | Strength, Radius, Threshold |
  | Outline | Strength, Thickness |
  | Dot Screen | Scale, Angle |
  | Pixelate | Pixel Size, Normal Edge, Depth Edge |
  | Afterimage | Damp |
- **SYS MENU** — hidden settings panel with live FPS counter and all effect controls
- **Responsive** — full mouse and multi-touch support (single-finger orbit, two-finger pinch zoom)

---

## Project Structure

```
stickersglobe/
├── index.html              # Entry point
├── styles.css              # All styles
├── data/
│   └── Stickers.json       # Sticker data (lat, lng, title, date, image, likes, Instagram link)
├── assets/
│   ├── materials/          # Earth, Moon, Mars, and UI textures
│   ├── models/             # GLTF models (UFO, Cow, Rocket, Satellite, HubbleTelescope)
│   └── stickers/           # Sticker photo images
└── js/
    ├── main.js             # App init, animation loop, input controls
    ├── config.js           # Orbit, marker, and asset path constants
    ├── scene.js            # Three.js renderer, camera, lighting, post-processing
    ├── globe.js            # Globe mesh, GLSL shaders, celestial bodies, orbiting models
    ├── markers.js          # Sticker pin markers and raycasting
    ├── ui.js               # Sidebar, popout, settings panel
    └── utils.js            # Helpers: vectorToAngles, animateOrbit
```

---

## Sticker Data

Stickers are defined in `data/Stickers.json` as an array of objects:

```json
{
  "lat": 52.3652307,
  "lng": 4.8858633,
  "title": "Happy Feeling, Amsterdam",
  "date": "2025-06-08",
  "link": "https://www.instagram.com/p/...",
  "imageUrl": "filename.jpg",
  "likeCount": "13"
}
```

Sticker images are stored in `assets/stickers/`.

---

## Tech Stack

| | |
|---|---|
| Renderer | [Three.js](https://threejs.org/) v0.182.0 (loaded via CDN import map) |
| Post-processing | Three.js `EffectComposer` |
| Models | GLTF via `GLTFLoader` |
| Fonts | VT323 (Google Fonts) |
| Hosting | GitHub Pages |

No bundler, no dependencies to install — open `index.html` in a browser or serve with any static file server.

---

## Running Locally

Because the app fetches `data/Stickers.json` and loads assets, it needs to be served over HTTP (not opened as a `file://` URL).

```bash
# Python
python -m http.server 8080

# Node
npx serve .
```

Then open `http://localhost:8080`.
