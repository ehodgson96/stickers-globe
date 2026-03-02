import { CONFIG } from "./config.js";
import { latLngToVector3 } from "./utils.js";
import * as THREE from 'three';

export function createMarkers(
  globe,
  stickerData,
  textureLoader,
  camera,
  container
) {
  const markerGroup = new THREE.Group();
  const markers = [];
  globe.add(markerGroup);

  // Cluster sprites live in their own globe-child group so their positions
  // are in globe-local space (same as spriteContainers).
  const clusterGroup = new THREE.Group();
  globe.add(clusterGroup);

  const pointerTexture = textureLoader.load(CONFIG.paths.mapPointer);

  stickerData.forEach((sticker, index) => {
    if (sticker.isMoon || sticker.isUfo) return;

    const pos = latLngToVector3(sticker.lat, sticker.lng);
    const spriteContainer = new THREE.Object3D();
    spriteContainer.position.copy(pos.multiplyScalar(1.00));

    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: pointerTexture,
        sizeAttenuation: false,
        depthTest: false,
        transparent: true
      })
    );

    sprite.center.set(0.5, 0);
    sprite.renderOrder = 1;
    const baseTilt = (Math.random() - 0.5) * 0.5;
    sprite.material.rotation = baseTilt;
    sprite.scale.set(CONFIG.marker.base, CONFIG.marker.base, 1);
    sprite.userData = { index, sticker, baseTilt, phase: Math.random() * Math.PI * 2 };

    spriteContainer.add(sprite);
    markerGroup.add(spriteContainer);
    markers.push(sprite);
  });

  function isFromPopout(e) {
    return e.target && e.target.closest && e.target.closest('#sticker-popout');
  }
  function isFromSettings(e) {
    return e.target && e.target.closest && e.target.closest('#settings-panel, #settings-cog');
  }

  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();
  let isDragging = false;
  let touchStartTime = 0;

  // Reused each frame to avoid per-frame allocations
  const _invGlobe  = new THREE.Matrix4();
  const _camLocal  = new THREE.Vector3();
  const _moonWorldPos = new THREE.Vector3();
  const _camToMoon    = new THREE.Vector3();
  const _ufoWorldPos  = new THREE.Vector3();
  const _camToUfo     = new THREE.Vector3();
  const _screenPos    = new THREE.Vector3(); // for NDC projection

  let moonMarker   = null;
  let ufoMarker    = null;
  let selectedIndex = null; // currently highlighted marker index

  // ── Cluster sprites ────────────────────────────────────────────────────
  const clusterPool = [];
  let clusteringEnabled    = true;
  let clusterThresholdBase = 10;  // px at max zoom
  let clusterScaleMult     = 1.5;

  function getClusterSprite(idx) {
    if (clusterPool[idx]) return clusterPool[idx];
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: pointerTexture,
      sizeAttenuation: false,
      depthTest: false,
      transparent: true
    }));
    sprite.center.set(0.5, 0);
    sprite.renderOrder = 2;
    sprite.visible = false;
    sprite.userData = { isCluster: true, baseTilt: 0, phase: Math.random() * Math.PI * 2 };
    clusterGroup.add(sprite);
    clusterPool.push(sprite);
    return sprite;
  }

  // ── Raycasting ─────────────────────────────────────────────────────────
  function handleSelection(clientX, clientY, rect) {
    mouse.x = ((clientX - rect.left) / rect.width)  *  2 - 1;
    mouse.y = -((clientY - rect.top)  / rect.height) *  2 + 1;
    raycaster.setFromCamera(mouse, camera);

    const globeHits = raycaster.intersectObject(globe, false);
    const globeDist = globeHits.length > 0 ? globeHits[0].distance : Infinity;

    const intersects = raycaster.intersectObjects(markers, true);
    if (intersects.length === 0) return null;

    const hit = intersects[0];
    if (!hit.object.userData.isMoonMarker && hit.distance > globeDist) return null;

    return hit.object.userData.index;
  }

  container.addEventListener('click', (e) => {
    if (isDragging || isFromPopout(e) || isFromSettings(e)) return;
    const rect  = container.getBoundingClientRect();
    const index = handleSelection(e.clientX, e.clientY, rect);
    onMarkerClick(index);
  });

  container.addEventListener('touchstart', () => { touchStartTime = Date.now(); });

  container.addEventListener('touchend', (e) => {
    if (isFromPopout(e) || isFromSettings(e)) return;
    if (Date.now() - touchStartTime > 300 || e.touches.length > 0) return;
    const rect  = container.getBoundingClientRect();
    const touch = e.changedTouches[0];
    const index = handleSelection(touch.clientX, touch.clientY, rect);
    onMarkerClick(index);
  });

  let onMarkerClick = () => {};

  // ── updateScales ───────────────────────────────────────────────────────
  function updateScales(orbitRadius) {
    const factor = orbitRadius / CONFIG.marker.referenceRadius;
    const s = THREE.MathUtils.clamp(
      CONFIG.marker.base * factor,
      CONFIG.marker.min,
      CONFIG.marker.max
    );

    globe.updateMatrixWorld(true);
    _invGlobe.copy(globe.matrixWorld).invert();
    _camLocal.copy(camera.position).applyMatrix4(_invGlobe);

    // ── Visibility & scale ───────────────────────────────────────────────
    // For a unit-sphere globe the geometric horizon from the camera is where
    //   dot(surfacePoint, cameraLocal) = 1.0   (exact, regardless of orbit radius)
    // Using 1.05 gives a small buffer so horizon-edge markers don't bleed
    // through the globe face (depthTest is disabled on sprites).
    markers.forEach((m) => {
      if (m.userData.isMoonMarker) return;

      const isSelected = m.userData.index === selectedIndex;
      m.scale.set(s * (isSelected ? 1.5 : 1.0), s * (isSelected ? 1.5 : 1.0), 1);
      m.renderOrder = isSelected ? 3 : 1;
      m.visible = m.parent.position.dot(_camLocal) > 1.05;
    });

    // Moon marker — ray-sphere occlusion against the globe
    if (moonMarker) {
      const ms = s * 0.55;
      moonMarker.scale.set(ms, ms, 1);
      moonMarker.getWorldPosition(_moonWorldPos);
      _camToMoon.copy(_moonWorldPos).sub(camera.position);
      const moonDist = _camToMoon.length();
      _camToMoon.divideScalar(moonDist);
      const b = camera.position.dot(_camToMoon);
      const c = camera.position.dot(camera.position) - 1.0;
      const disc = b * b - c;
      if (disc >= 0) {
        const tNear = -b - Math.sqrt(disc);
        moonMarker.visible = !(tNear > 0 && tNear < moonDist);
      } else {
        moonMarker.visible = true;
      }
    }

    // UFO marker — same ray-sphere occlusion
    if (ufoMarker) {
      const us = s * 6;
      ufoMarker.scale.set(us, us, 1);
      ufoMarker.getWorldPosition(_ufoWorldPos);
      _camToUfo.copy(_ufoWorldPos).sub(camera.position);
      const ufoDist = _camToUfo.length();
      _camToUfo.divideScalar(ufoDist);
      const bu = camera.position.dot(_camToUfo);
      const cu = camera.position.dot(camera.position) - 1.0;
      const discu = bu * bu - cu;
      if (discu >= 0) {
        const tNear = -bu - Math.sqrt(discu);
        ufoMarker.visible = !(tNear > 0 && tNear < ufoDist);
      } else {
        ufoMarker.visible = true;
      }
    }

    // ── Screen-space clustering ──────────────────────────────────────────
    // Hide all cluster sprites; we re-show only what is needed this frame.
    clusterPool.forEach(cs => { cs.visible = false; });

    const W = container.clientWidth;
    const H = container.clientHeight;
    // Threshold scales linearly from 0 (full zoom-in, no clustering) to
    // 80 px (full zoom-out, heavy clustering).  At minimum orbit radius every
    // marker is guaranteed to be shown individually.
    const zoomT  = (orbitRadius - CONFIG.orbit.minRadius) /
                   (CONFIG.orbit.maxRadius - CONFIG.orbit.minRadius);
    const THRESH = clusteringEnabled ? Math.max(0, zoomT * clusterThresholdBase) : 0;

    // Collect screen positions for every currently-visible regular marker
    const pts = [];
    markers.forEach((m) => {
      if (!m.visible || m.userData.isMoonMarker || m.userData.isUfoMarker) return;
      m.parent.getWorldPosition(_screenPos);
      _screenPos.project(camera);
      pts.push({
        marker:    m,
        sx:        (_screenPos.x *  0.5 + 0.5) * W,
        sy:        (-_screenPos.y * 0.5 + 0.5) * H,
        inCluster: false
      });
    });

    // Greedy clustering: first unclaimed point absorbs all neighbours
    const activeClusters = [];
    pts.forEach((pt) => {
      if (pt.inCluster) return;
      const near = pts.filter(o =>
        !o.inCluster && o !== pt &&
        Math.hypot(o.sx - pt.sx, o.sy - pt.sy) < THRESH
      );
      if (near.length === 0) return; // lone marker, leave visible as-is

      const members = [pt, ...near];
      members.forEach(p => { p.inCluster = true; });

      // Centroid in globe-local space (average surface points, re-normalise)
      const centroid = new THREE.Vector3();
      members.forEach(p => centroid.add(p.marker.parent.position));
      centroid.normalize().multiplyScalar(1.001); // just above surface

      const containsSelected = members.some(p => p.marker.userData.index === selectedIndex);
      activeClusters.push({ centroid, count: members.length, containsSelected });
    });

    // Hide individual markers that were merged
    pts.forEach(pt => { if (pt.inCluster) pt.marker.visible = false; });

    // Show / update cluster sprites
    activeClusters.forEach((cl, i) => {
      const cs = getClusterSprite(i);
      cs.position.copy(cl.centroid);
      const cs_s = s * clusterScaleMult * (cl.containsSelected ? 1.5 : 1.0);
      cs.scale.set(cs_s, cs_s, 1);
      cs.material.color.setHex(cl.containsSelected ? 0xe74c3c : 0xffffff);
      cs.renderOrder = cl.containsSelected ? 3 : 2;
      cs.visible = true;
    });
  }

  // ── Public helpers ─────────────────────────────────────────────────────
  function highlightMarker(index) {
    selectedIndex = index;
    markers.forEach((m) => {
      m.material.color.setHex(m.userData.index === index ? 0xe74c3c : 0xffffff);
    });
  }

  function addMoonMarker(moonMesh, stickerEntry, index) {
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: pointerTexture,
        sizeAttenuation: false,
        depthTest: false,
        transparent: true,
        opacity: 0.2
      })
    );
    sprite.center.set(0.5, 0);
    sprite.renderOrder = 1;
    sprite.scale.set(CONFIG.marker.base * 0.55, CONFIG.marker.base * 0.55, 1);
    sprite.position.set(0, 0.285, 0);
    sprite.userData = { index, sticker: stickerEntry, isMoonMarker: true, noFly: true, baseTilt: 0, phase: Math.random() * Math.PI * 2 };
    moonMesh.add(sprite);
    moonMarker = sprite;
    markers.push(sprite);
  }

  function addUfoMarker(ufoMesh, stickerEntry, index) {
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: pointerTexture,
        sizeAttenuation: false,
        depthTest: false,
        transparent: true,
        opacity: 0.2
      })
    );
    sprite.center.set(0.5, 0);
    sprite.renderOrder = 1;
    sprite.scale.set(CONFIG.marker.base * 6, CONFIG.marker.base * 6, 1);
    sprite.position.set(0, 1, 0);
    sprite.userData = { index, sticker: stickerEntry, isUfoMarker: true, noFly: true, baseTilt: 0, phase: Math.random() * Math.PI * 2 };
    ufoMesh.add(sprite);
    ufoMarker = sprite;
    markers.push(sprite);
  }

  function updateSway(time) {
    markers.forEach((m) => {
      const { baseTilt, phase } = m.userData;
      if (baseTilt === undefined) return;
      m.material.rotation = baseTilt + Math.sin(time * 1.5 + phase) * 0.08;
    });
    clusterPool.forEach((cs) => {
      if (!cs.visible) return;
      const { phase } = cs.userData;
      cs.material.rotation = Math.sin(time * 1.5 + phase) * 0.08;
    });
  }

  const markerFeature = {
    id: 'markerClustering',
    label: 'Marker Clustering',
    getEnabled: () => clusteringEnabled,
    setEnabled: (v) => { clusteringEnabled = Boolean(v); },
    controls: [
      {
        id: 'joinDist',
        label: 'Join Distance',
        type: 'range',
        min: 1,
        max: 20,
        step: 1,
        get: () => clusterThresholdBase,
        set: (v) => { clusterThresholdBase = Number(v); }
      },
      {
        id: 'clusterScale',
        label: 'Cluster Scale',
        type: 'range',
        min: 1.0,
        max: 4.0,
        step: 0.1,
        get: () => clusterScaleMult,
        set: (v) => { clusterScaleMult = Number(v); }
      }
    ]
  };

  return {
    markers,
    markerGroup,
    markerFeature,
    updateScales,
    updateSway,
    highlightMarker,
    addMoonMarker,
    addUfoMarker,
    setDragging: (val) => (isDragging = val),
    onSelect: (callback) => (onMarkerClick = callback)
  };
}
