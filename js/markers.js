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

  const pointerTexture = textureLoader.load(CONFIG.paths.mapPointer);

  stickerData.forEach((sticker, index) => {
    if (sticker.isMoon || sticker.isUfo) return; // placed separately on their meshes

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

    // Anchor at the bottom centre so the pin tip sits at the surface point.
    // depthTest: false means the body never clips into the globe regardless of
    // where on the sphere the marker sits relative to the camera.
    sprite.center.set(0.5, 0);
    sprite.renderOrder = 1;
    const baseTilt = (Math.random() - 0.5) * 0.5; // ±~14° random tilt around the tip
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

  // Raycasting for interaction
  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();
  let isDragging = false;
  let touchStartTime = 0;

  // Reused each frame to avoid per-frame allocations
  const _invGlobe = new THREE.Matrix4();
  const _camLocal = new THREE.Vector3();
  const _moonWorldPos = new THREE.Vector3();
  const _camToMoon = new THREE.Vector3();
  const _ufoWorldPos = new THREE.Vector3();
  const _camToUfo = new THREE.Vector3();

  let moonMarker = null; // set when addMoonMarker is called
  let ufoMarker = null;  // set when addUfoMarker is called

  function handleSelection(clientX, clientY, rect) {
    mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);

    // Determine where the ray hits the globe surface so we can reject
    // markers that are on the far (hidden) side of the globe
    const globeHits = raycaster.intersectObject(globe, false);
    const globeDist = globeHits.length > 0 ? globeHits[0].distance : Infinity;

    const intersects = raycaster.intersectObjects(markers, true);
    if (intersects.length === 0) return null;

    const hit = intersects[0];
    // Moon marker lives on the moon, not the globe — skip globe occlusion check
    if (!hit.object.userData.isMoonMarker && hit.distance > globeDist) return null;

    return hit.object.userData.index;
  }

  container.addEventListener('click', (e) => {
    if (isDragging || isFromPopout(e) || isFromSettings(e)) return;
    const rect = container.getBoundingClientRect();
    const index = handleSelection(e.clientX, e.clientY, rect);
    if (index !== null) onMarkerClick(index);
  });

  container.addEventListener('touchstart', () => {
    touchStartTime = Date.now();
  });

  container.addEventListener('touchend', (e) => {
    if (isFromPopout(e) || isFromSettings(e)) return;
    if (Date.now() - touchStartTime > 300 || e.touches.length > 0) return;
    const rect = container.getBoundingClientRect();
    const touch = e.changedTouches[0];
    const index = handleSelection(touch.clientX, touch.clientY, rect);
    if (index !== null) onMarkerClick(index);
  });

  let onMarkerClick = () => {};

  function updateScales(orbitRadius) {
    const factor = orbitRadius / CONFIG.marker.referenceRadius;
    const s = THREE.MathUtils.clamp(
      CONFIG.marker.base * factor,
      CONFIG.marker.min,
      CONFIG.marker.max
    );

    // Transform camera into globe-local space so we can cheaply determine
    // which markers are on the back hemisphere and should be hidden.
    globe.updateMatrixWorld(true);
    _invGlobe.copy(globe.matrixWorld).invert();
    _camLocal.copy(camera.position).applyMatrix4(_invGlobe);

    markers.forEach((m) => {
      if (m.userData.isMoonMarker) return; // handled separately below
      m.scale.set(s, s, 1);
      // m.parent is the spriteContainer; its position is in globe-local space.
      // Positive dot = same hemisphere as camera = visible.
      m.visible = m.parent.position.dot(_camLocal) > 0;
    });

    // Moon marker: smaller scale + ray-sphere occlusion against the globe
    if (moonMarker) {
      const ms = s * 0.55;
      moonMarker.scale.set(ms, ms, 1);

      // globe.updateMatrixWorld(true) was already called above, so world
      // positions of all descendants (including moon mesh children) are current
      moonMarker.getWorldPosition(_moonWorldPos);
      _camToMoon.copy(_moonWorldPos).sub(camera.position);
      const moonDist = _camToMoon.length();
      _camToMoon.divideScalar(moonDist); // normalise in-place (rayDir)

      // Ray–sphere test: globe sphere at world origin, radius 1
      // t² + 2t·b + c = 0  where b = camPos·rayDir, c = |camPos|²−1
      const b = camera.position.dot(_camToMoon);
      const c = camera.position.dot(camera.position) - 1.0;
      const disc = b * b - c;
      if (disc >= 0) {
        const tNear = -b - Math.sqrt(disc); // near intersection distance
        moonMarker.visible = !(tNear > 0 && tNear < moonDist);
      } else {
        moonMarker.visible = true; // ray misses globe
      }
    }

    // UFO marker: same ray-sphere globe occlusion check
    if (ufoMarker) {
      const us = s * 6; // compensate for UFO model's 0.1 scale
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
  }

  function highlightMarker(index) {
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
        transparent: true
      })
    );
    sprite.center.set(0.5, 0);
    sprite.renderOrder = 1;
    // Scale is set each frame by updateScales (55 % of normal marker size)
    sprite.scale.set(CONFIG.marker.base * 0.55, CONFIG.marker.base * 0.55, 1);
    // Place just above the moon's north pole (moon radius = 0.27)
    sprite.position.set(0, 0.285, 0);
    sprite.userData = { index, sticker: stickerEntry, isMoonMarker: true, noFly: true, baseTilt: 0, phase: Math.random() * Math.PI * 2 };
    moonMesh.add(sprite);
    moonMarker = sprite; // store reference for per-frame occlusion check
    markers.push(sprite);
  }

  function addUfoMarker(ufoMesh, stickerEntry, index) {
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
    // UFO model has scale 0.1, so divide the target screen size by 0.1 (×10 on base, ×6 net)
    sprite.scale.set(CONFIG.marker.base * 6, CONFIG.marker.base * 6, 1);
    // y=1 in model space → 0.1 world units above UFO centre
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
  }

  return {
    markers,
    markerGroup,
    updateScales,
    updateSway,
    highlightMarker,
    addMoonMarker,
    addUfoMarker,
    setDragging: (val) => (isDragging = val),
    onSelect: (callback) => (onMarkerClick = callback)
  };
}
