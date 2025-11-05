import { CONFIG } from './config.js';
import { createScene } from './scene.js';
import { createGlobe } from './globe.js';
import { createMarkers } from './markers.js';
import { createUI } from './ui.js';
import { vectorToAngles, animateOrbit } from './utils.js';

async function init() {
  const container = document.getElementById('globe-container');

  // Load sticker data
  let stickerData = [];
  try {
    const response = await fetch(CONFIG.paths.stickersJson);
    stickerData = await response.json();
  } catch (error) {
    console.error('Error loading stickers:', error);
  }

  // Setup loading manager
  const loadingManager = new THREE.LoadingManager();
  const textureLoader = new THREE.TextureLoader(loadingManager);
  const gltfLoader = new THREE.GLTFLoader(loadingManager);

  // Create UI early to control loading overlay
  const sceneSetup = createScene(container);
  const ui = createUI(stickerData, container, sceneSetup.camera, sceneSetup.orbit);

  loadingManager.onStart = () => ui.loading.show();
  loadingManager.onLoad = () => ui.loading.hide();
  loadingManager.onError = (url) => console.error(`Error loading ${url}`);

  // Create globe and markers
  const globeSetup = createGlobe(sceneSetup.scene, textureLoader, gltfLoader);
  const markerSetup = createMarkers(
    globeSetup.globe,
    stickerData,
    textureLoader,
    sceneSetup.camera,
    container
  );

  // Input controls
  setupControls(container, sceneSetup, markerSetup, ui);

  // Selection logic
  let currentAnimation = null;

  function selectSticker(index) {
    ui.sidebar.setActive(index);
    markerSetup.highlightMarker(index);

    const markerContainer = markerSetup.markerGroup.children[index];
    const worldPos = new THREE.Vector3();
    markerContainer.getWorldPosition(worldPos);

    const { theta: targetTheta, phi: targetPhiRaw } = vectorToAngles(worldPos);
    const targetPhi = THREE.MathUtils.clamp(
      targetPhiRaw,
      sceneSetup.orbit.minPhi,
      sceneSetup.orbit.maxPhi
    );

    sceneSetup.orbit.lockedMarker = null;
    if (currentAnimation) currentAnimation.cancel = true;

    currentAnimation = animateOrbit(
      sceneSetup.orbit,
      targetTheta,
      targetPhi,
      () => {
        sceneSetup.updateCamera();
        markerSetup.updateScales(sceneSetup.orbit.radius);
      }
    );

    currentAnimation.then((token) => {
      if (!token.cancel) {
        sceneSetup.orbit.lockedMarker = markerContainer;
        ui.popout.show(index);
      }
    });
  }

  markerSetup.onSelect((index) => {
    selectSticker(index);
    ui.sidebar.scrollTo(index);
  });

  ui.sidebar.onClick((index) => selectSticker(index));

  // Animation loop
  function animate() {
    requestAnimationFrame(animate);

    globeSetup.rotate(0.0005);
    globeSetup.celestial.moon.update();
    globeSetup.celestial.mars.update();
    globeSetup.updateOrbitingModels();

    // Track locked marker
    if (sceneSetup.orbit.lockedMarker) {
      const worldPos = new THREE.Vector3();
      sceneSetup.orbit.lockedMarker.getWorldPosition(worldPos);
      const { theta, phi } = vectorToAngles(worldPos);
      sceneSetup.orbit.theta = theta;
      sceneSetup.orbit.phi = THREE.MathUtils.clamp(
        phi,
        sceneSetup.orbit.minPhi,
        sceneSetup.orbit.maxPhi
      );
      ui.popout.updatePosition();
    }

    // Apply inertia
    if (!sceneSetup.velocity._paused) {
      sceneSetup.orbit.theta += sceneSetup.velocity.theta;
      sceneSetup.orbit.phi += sceneSetup.velocity.phi;
      sceneSetup.orbit.phi = Math.max(
        sceneSetup.orbit.minPhi,
        Math.min(sceneSetup.orbit.maxPhi, sceneSetup.orbit.phi)
      );

      sceneSetup.velocity.theta *= CONFIG.orbit.damping;
      sceneSetup.velocity.phi *= CONFIG.orbit.damping;

      if (Math.abs(sceneSetup.velocity.theta) < 0.00001) sceneSetup.velocity.theta = 0;
      if (Math.abs(sceneSetup.velocity.phi) < 0.00001) sceneSetup.velocity.phi = 0;
    }

    sceneSetup.updateCamera();
    markerSetup.updateScales(sceneSetup.orbit.radius);
    sceneSetup.render();
  }

  animate();
}

function setupControls(container, sceneSetup, markerSetup, ui) {
  let isDragging = false;
  let previousPos = { x: 0, y: 0 };
  let lastMoveTime = 0;
  let touchStartDistance = 0;

  const { orbit, velocity, updateCamera } = sceneSetup;

  function onDragStart() {
    isDragging = true;
    velocity.theta = velocity.phi = 0;
    velocity._paused = true;
    orbit.lockedMarker = null;
    ui.popout.hide();
    markerSetup.setDragging(true);
  }

  function onDragEnd() {
    isDragging = false;
    velocity._paused = false;
    markerSetup.setDragging(false);
  }

  // Mouse
  container.addEventListener('mousedown', (e) => {
    onDragStart();
    previousPos = { x: e.clientX, y: e.clientY };
    lastMoveTime = performance.now();
  });

  container.addEventListener('mousemove', (e) => {
    if (!isDragging) return;

    const now = performance.now();
    const deltaTime = now - lastMoveTime;
    lastMoveTime = now;

    const dx = e.clientX - previousPos.x;
    const dy = e.clientY - previousPos.y;

    orbit.theta -= dx * CONFIG.orbit.dragSensitivity;
    orbit.phi -= dy * CONFIG.orbit.dragSensitivity;
    orbit.phi = Math.max(orbit.minPhi, Math.min(orbit.maxPhi, orbit.phi));

    velocity.theta = (-dx * CONFIG.orbit.dragSensitivity) / Math.max(deltaTime, 16);
    velocity.phi = (-dy * CONFIG.orbit.dragSensitivity) / Math.max(deltaTime, 16);

    updateCamera();
    previousPos = { x: e.clientX, y: e.clientY };
  });

  container.addEventListener('mouseup', onDragEnd);
  container.addEventListener('mouseleave', onDragEnd);

  // Touch
  function getTouchDistance(touches) {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.hypot(dx, dy);
  }

  container.addEventListener('touchstart', (e) => {
    if (e.touches.length === 1) {
      onDragStart();
      previousPos = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      lastMoveTime = performance.now();
    } else if (e.touches.length === 2) {
      touchStartDistance = getTouchDistance(e.touches);
    }
  });

  container.addEventListener('touchmove', (e) => {
    if (e.touches.length === 1 && isDragging) {
      const touch = e.touches[0];
      const now = performance.now();
      const deltaTime = now - lastMoveTime;
      lastMoveTime = now;

      const dx = touch.clientX - previousPos.x;
      const dy = touch.clientY - previousPos.y;

      orbit.theta -= dx * CONFIG.orbit.dragSensitivity;
      orbit.phi -= dy * CONFIG.orbit.dragSensitivity;
      orbit.phi = Math.max(orbit.minPhi, Math.min(orbit.maxPhi, orbit.phi));

      velocity.theta = (-dx * CONFIG.orbit.dragSensitivity) / Math.max(deltaTime, 16);
      velocity.phi = (-dy * CONFIG.orbit.dragSensitivity) / Math.max(deltaTime, 16);

      updateCamera();
      previousPos = { x: touch.clientX, y: touch.clientY };
    } else if (e.touches.length === 2) {
      const newDist = getTouchDistance(e.touches);
      const delta = (touchStartDistance - newDist) * 0.005;
      orbit.radius = Math.max(orbit.minRadius, Math.min(orbit.maxRadius, orbit.radius + delta));
      updateCamera();
      markerSetup.updateScales(orbit.radius);
      touchStartDistance = newDist;
    }
    e.preventDefault();
  });

  container.addEventListener('touchend', onDragEnd);

  // Wheel zoom
  container.addEventListener('wheel', (e) => {
    e.preventDefault();
    orbit.radius = Math.max(
      orbit.minRadius,
      Math.min(orbit.maxRadius, orbit.radius + e.deltaY * 0.0015)
    );
    updateCamera();
    markerSetup.updateScales(orbit.radius);
  }, { passive: false });
}

document.addEventListener('DOMContentLoaded', init);