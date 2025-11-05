import { CONFIG } from "./config.js";
import { latLngToVector3 } from "./utils.js";

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
    const pos = latLngToVector3(sticker.lat, sticker.lng);
    const spriteContainer = new THREE.Object3D();
    spriteContainer.position.copy(pos);

    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: pointerTexture,
        sizeAttenuation: false,
      })
    );

    sprite.scale.set(CONFIG.marker.base, CONFIG.marker.base, 1);
    sprite.position.y = 0.001;
    sprite.userData = { index, sticker };

    spriteContainer.add(sprite);
    markerGroup.add(spriteContainer);
    markers.push(sprite);
  });

  function isFromPopout(e) {
    return e.target && e.target.closest && e.target.closest("#sticker-popout");
  }

  // Raycasting for interaction
  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();
  let isDragging = false;
  let touchStartTime = 0;

  function handleSelection(clientX, clientY, rect) {
    mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(markers, true);
    return intersects.length > 0 ? intersects[0].object.userData.index : null;
  }

  container.addEventListener("click", (e) => {
    if (isDragging || isFromPopout(e)) return;
    const rect = container.getBoundingClientRect();
    const index = handleSelection(e.clientX, e.clientY, rect);
    if (index !== null) onMarkerClick(index);
  });

  container.addEventListener("touchstart", () => (touchStartTime = Date.now()));

  container.addEventListener("touchend", (e) => {
    if (isFromPopout(e)) return; // <— new
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
    markers.forEach((m) => m.scale.set(s, s, 1));
  }

  function highlightMarker(index) {
    markers.forEach((m, i) => {
      m.material.color.setHex(i === index ? 0xe74c3c : 0xffffff);
    });
  }

  return {
    markers,
    markerGroup,
    updateScales,
    highlightMarker,
    setDragging: (val) => (isDragging = val),
    onSelect: (callback) => (onMarkerClick = callback),
  };
}
