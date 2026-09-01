import { CONFIG } from './config.js';

// Ground-level map view ("Google Earth" dive). Leaflet is lazy-loaded from CDN
// the first time the user dives in, so it costs nothing on initial page load.

const LEAFLET_VERSION = '1.9.4';
const LEAFLET_CSS = `https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/leaflet.css`;
const LEAFLET_JS = `https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/leaflet.js`;

// CARTO's dark_all basemap now requires an API key, so it 404s/placeholders
// on every tile. Esri's "World Dark Gray" is free, keyless, and dark by
// default — no CSS tinting needed to make it readable.
const TILE_URL =
  'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}';
const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.esri.com">Esri</a>, HERE, Garmin, &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

const ENTRY_START_ZOOM = 4;  // zoom level the fly-in starts from
const ENTRY_ZOOM = 9;        // zoom level the fly-in settles at
const EXIT_ZOOM = 3;         // zooming out to (or past) this returns to the globe
const MIN_ZOOM = 3;
const MAX_ZOOM = 16; // Esri World Dark Gray's native max — Leaflet upsamples beyond this

let leafletPromise = null;

function loadLeaflet() {
  if (leafletPromise) return leafletPromise;
  leafletPromise = new Promise((resolve, reject) => {
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = LEAFLET_CSS;
    document.head.appendChild(css);

    const script = document.createElement('script');
    script.src = LEAFLET_JS;
    script.onload = () => resolve(window.L);
    script.onerror = () => {
      leafletPromise = null;
      reject(new Error('Failed to load Leaflet'));
    };
    document.head.appendChild(script);
  });
  return leafletPromise;
}

function stickerImageSrc(sticker) {
  if (!sticker.imageUrl) return null;
  return /^https?:\/\//.test(sticker.imageUrl)
    ? sticker.imageUrl
    : `./assets/stickers/${sticker.imageUrl}`;
}

function buildPopupHtml(sticker) {
  const img = stickerImageSrc(sticker);
  return `
    <div class="map-popup">
      ${img ? `<div class="map-popup-image"><img src="${img}" alt="${sticker.title}" /></div>` : ''}
      <div class="map-popup-title">${sticker.title}</div>
      <div class="map-popup-meta">${sticker.date} &bull; &hearts; ${sticker.likeCount}</div>
      ${sticker.link ? `<a class="map-popup-link" href="${sticker.link}" target="_blank" rel="noopener">OPEN INSTAGRAM &nearr;</a>` : ''}
    </div>`;
}

const FOCUS_ZOOM = 11; // minimum zoom when flying to a selected sticker

export function createMapView(container, stickerData, { onExit, onEnter, onMarkerSelect } = {}) {
  // Overlay DOM
  const overlay = document.createElement('div');
  overlay.id = 'map-view';
  overlay.className = 'map-view hidden';
  overlay.innerHTML = `
    <div id="map-canvas"></div>
    <div class="map-badge">// GROUND VIEW //</div>
    <button id="map-exit" class="map-exit" type="button" title="Back to globe">[ &larr; GLOBE ]</button>
    <div class="map-hint">SCROLL OUT TO RETURN TO ORBIT</div>
  `;
  container.appendChild(overlay);

  let map = null;
  let active = false;
  let entering = false; // guards the exit check during the entry fly-in
  let hideTimer = null;
  const markersByIndex = new Map();
  let highlightedIndex = null;

  function setHighlight(index) {
    if (highlightedIndex !== null) {
      markersByIndex.get(highlightedIndex)?._icon?.classList.remove('map-pin-active');
    }
    highlightedIndex = index;
    if (index !== null) {
      markersByIndex.get(index)?._icon?.classList.add('map-pin-active');
    }
  }

  // Fly the map camera to a sticker's pin, highlight it, and open its popup
  function flyFocus(index) {
    const marker = markersByIndex.get(index);
    if (!marker || !map) return;
    setHighlight(index);
    map.closePopup();
    try {
      map.flyTo(marker.getLatLng(), Math.max(map.getZoom(), FOCUS_ZOOM), {
        duration: 1.3,
        easeLinearity: 0.2
      });
      map.once('moveend', () => {
        if (active) marker.openPopup();
      });
    } catch {
      // Degenerate container size (e.g. hidden tab) breaks flyTo's math —
      // fall back to an instant jump so selection still lands.
      map.setView(marker.getLatLng(), Math.max(map.getZoom(), FOCUS_ZOOM), { animate: false });
      marker.openPopup();
    }
  }

  function buildMap(L) {
    map = L.map(overlay.querySelector('#map-canvas'), {
      center: [0, 0],
      zoom: ENTRY_START_ZOOM,
      minZoom: MIN_ZOOM,
      maxZoom: MAX_ZOOM,
      zoomControl: false,
      attributionControl: true,
      worldCopyJump: true
    });

    L.tileLayer(TILE_URL, {
      attribution: TILE_ATTRIBUTION,
      maxZoom: MAX_ZOOM,
      // Esri's dark-gray tiles stop at zoom 16 natively; keep serving those
      // tiles upscaled past that instead of leaving blank squares
      maxNativeZoom: 16
    }).addTo(map);

    L.control.zoom({ position: 'bottomright' }).addTo(map);

    const pinIcon = L.icon({
      iconUrl: CONFIG.paths.mapPointer,
      iconSize: [34, 34],
      iconAnchor: [17, 0],
      popupAnchor: [0, -60]
    });

    stickerData.forEach((sticker, index) => {
      if (sticker.isUfo || sticker.isMoon) return;
      if (typeof sticker.lat !== 'number' || typeof sticker.lng !== 'number') return;
      const marker = L.marker([sticker.lat, sticker.lng], { icon: pinIcon, title: sticker.title })
        .addTo(map)
        .bindPopup(buildPopupHtml(sticker), {
          maxWidth: 230,
          className: 'map-popup-frame',
          autoPan: false
        });
      marker.on('click', () => {
        onMarkerSelect?.(index);
        flyFocus(index);
      });
      markersByIndex.set(index, marker);
    });

    // Zooming back out to world level returns to the globe
    map.on('zoomend', () => {
      if (!entering && active && map.getZoom() <= EXIT_ZOOM) hide();
    });
  }

  async function show(lat, lng) {
    if (active) return;
    active = true;
    entering = true;
    clearTimeout(hideTimer);

    overlay.classList.remove('hidden');
    // Force a reflow so the opacity transition actually plays
    void overlay.offsetWidth;
    overlay.classList.add('visible');
    onEnter?.();

    let L;
    try {
      L = await loadLeaflet();
    } catch (err) {
      console.error(err);
      hide();
      return;
    }
    if (!map) buildMap(L);

    map.invalidateSize();
    try {
      map.setView([lat, lng], ENTRY_START_ZOOM, { animate: false });
      map.flyTo([lat, lng], ENTRY_ZOOM, { duration: 1.8 });
      map.once('moveend', () => { entering = false; });
    } catch {
      map.setView([lat, lng], ENTRY_ZOOM, { animate: false });
      entering = false;
    }
  }

  function hide() {
    if (!active) return;
    active = false;
    entering = false;
    setHighlight(null);
    map?.closePopup();
    overlay.classList.remove('visible');
    hideTimer = setTimeout(() => overlay.classList.add('hidden'), 750);
    onExit?.();
  }

  overlay.querySelector('#map-exit').addEventListener('click', hide);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && active) hide();
  });

  return {
    show,
    hide,
    isActive: () => active,
    focusSticker: flyFocus
  };
}
