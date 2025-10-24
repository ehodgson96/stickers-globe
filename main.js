// Load sticker data from JSON file
let stickerData = [];

fetch("./data/stickers.json")
  .then((response) => response.json())
  .then((data) => {
    stickerData = data;
    initializeApp();
  })
  .catch((error) => {
    console.error("Error loading stickers.json:", error);
    stickerData = [];
    initializeApp();
  });

// Show loading overlay
function showLoadingOverlay() {
  const overlay = document.getElementById("loading-overlay");
  if (overlay) overlay.style.display = "flex";
}

// Hide loading overlay
function hideLoadingOverlay() {
  const overlay = document.getElementById("loading-overlay");
  if (overlay) overlay.style.display = "none";
}

function initializeApp() {
  // ===== Shaders (world-space lighting so camera doesn't affect it) =====
  const vertexShader = `
    varying vec2 vUv;
    varying vec3 vNormalWorld;

    void main() {
      vUv = uv;
      vNormalWorld = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `;

  const fragmentShader = `
    uniform sampler2D uDayTexture;
    uniform sampler2D uNightTexture;
    uniform vec3 uSunDirectionWorld;

    varying vec2 vUv;
    varying vec3 vNormalWorld;

    void main() {
      vec3 dayColor = texture2D(uDayTexture, vUv).rgb;
      vec3 nightColor = texture2D(uNightTexture, vUv).rgb;

      float sunIntensity = dot(vNormalWorld, normalize(uSunDirectionWorld));
      float mixFactor = smoothstep(-0.1, 0.1, sunIntensity);

      vec3 color = mix(nightColor, dayColor, mixFactor);
      float spec = pow(max(dot(vNormalWorld, normalize(uSunDirectionWorld)), 0.0), 16.0) * 0.4;
      color += vec3(spec);

      gl_FragColor = vec4(color, 1.0);
    }
  `;

  // ===== Three.js setup =====
  const container = document.getElementById("globe-container");
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(
    75,
    container.clientWidth / container.clientHeight,
    0.01,
    10000
  );
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
  });
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.setClearColor(0x0a0a0a);
  container.appendChild(renderer.domElement);


  // Popout DOM refs
  const popout = document.getElementById("sticker-popout");
  const popoutImage = document.getElementById("popout-image");
  const popoutTitle = document.getElementById("popout-title");
  const popoutDate = document.getElementById("popout-date");
  const popoutLikes = document.getElementById("popout-likes");
  const popoutCoords = document.getElementById("popout-coords");
  const popoutLink = document.getElementById("popout-link");

  // Close button
  popout.querySelector(".popout-close").addEventListener("click", () => {
    hidePopout();
    orbit.lockedMarker = null;
  });

  // ---- ORBIT STATE ----
  const orbit = {
    radius: 2.5,
    theta: 0,
    phi: Math.PI / 2,
    minRadius: 1.1,
    maxRadius: 5.0,
    minPhi: 0.05,
    maxPhi: Math.PI - 0.05,
    lockedMarker: null,
  };

  // Simple animation token to allow cancellation on drag
  let orbitAnim = null; // { cancel: boolean }

  function updateCameraFromOrbit() {
    const x = orbit.radius * Math.sin(orbit.phi) * Math.sin(orbit.theta);
    const y = orbit.radius * Math.cos(orbit.phi);
    const z = orbit.radius * Math.sin(orbit.phi) * Math.cos(orbit.theta);
    camera.position.set(x, y, z);
    camera.lookAt(0, 0, 0);
  }

  // Mobile UI hint
  if ("ontouchstart" in window) {
    const controls = document.querySelector(".controls");
    controls.innerHTML = `
      <p>👆 Drag to orbit</p>
      <p>🤏 Pinch to zoom</p>
      `;
  }

  updateCameraFromOrbit();

  const loadingManager = new THREE.LoadingManager();

  loadingManager.onStart = function () {
    showLoadingOverlay();
  };

  loadingManager.onLoad = function () {
    hideLoadingOverlay();
  };

  loadingManager.onError = function (url) {
    console.error(`Error loading ${url}`);
    showLoadingOverlay();

  };

  // Textures
  const textureLoader = new THREE.TextureLoader(loadingManager);
  const dayTexture = textureLoader.load("./assets/materials/Earth_8k.jpg");
  const nightTexture = textureLoader.load("./assets/materials/Night_8k.jpg");
  dayTexture.colorSpace = THREE.SRGBColorSpace;
  nightTexture.colorSpace = THREE.SRGBColorSpace;

  // Starfield (static)
  function createStarfield() {
    const canvas = document.createElement("canvas");
    canvas.width = 2048;
    canvas.height = 1024;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < 2000; i++) {
      const x = Math.random() * canvas.width;
      const y = Math.random() * canvas.height;
      const b = Math.random();
      const size = b * 1.5;
      ctx.fillStyle = `rgba(255,255,255,${b})`;
      ctx.fillRect(x, y, size, size);
    }
    return new THREE.CanvasTexture(canvas);
  }

  const starfieldGeometry = new THREE.SphereGeometry(100, 64, 64);
  const starfieldTexture = createStarfield();
  const starfieldMaterial = new THREE.MeshBasicMaterial({
    map: starfieldTexture,
    side: THREE.BackSide,
    castShadow: false,
    receiveShadow: false,
  });
  const starfield = new THREE.Mesh(starfieldGeometry, starfieldMaterial);
  scene.add(starfield);

  // Globe
  const globeGeometry = new THREE.SphereGeometry(1, 16, 10);
  const globeMaterial = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      uDayTexture: new THREE.Uniform(dayTexture),
      uNightTexture: new THREE.Uniform(nightTexture),
      uSunDirectionWorld: new THREE.Uniform(
        new THREE.Vector3(-1, 0.5, 0.2).normalize()
      ),
    },
  });
  const globe = new THREE.Mesh(globeGeometry, globeMaterial);
  scene.add(globe);

  // Moon
  const moonGeometry = new THREE.SphereGeometry(0.27, 8, 6);
  const moonTexture = textureLoader.load("./assets/materials/Moon.jpg");
  moonTexture.colorSpace = THREE.SRGBColorSpace;
  const moonMaterial = new THREE.MeshStandardMaterial({
    map: moonTexture,
    roughness: 1,
    metalness: 0,
  });
  const moon = new THREE.Mesh(moonGeometry, moonMaterial);
  moon.position.set(3, 0, 0);
  globe.add(moon);

  // Mars
  const marsGeometry = new THREE.SphereGeometry(2, 8, 6);
  const marsTexture = textureLoader.load("./assets/materials/Mars.jpg");
  marsTexture.colorSpace = THREE.SRGBColorSpace;
  const marsMaterial = new THREE.MeshStandardMaterial({
    map: marsTexture,
    roughness: 1,
    metalness: 0,
  });
  const mars = new THREE.Mesh(marsGeometry, marsMaterial);
  mars.position.set(25, 0, 0);
  scene.add(mars);

  // --- Load custom GLB model to orbit the globe ---
  const gltfLoader = new THREE.GLTFLoader(loadingManager);

  // 🛸 Add UFO
  addOrbitingModel("./assets/UFO.glb", {
    radius: 2,
    speed: 0.0012,
    scale: [0.1, 0.1, 0.1],
    tilt: THREE.MathUtils.degToRad(-25), // orbit in opposite tilted plane
    ySpin: true, // enable Y-axis spin
  });

  addOrbitingModel("./assets/Cow.glb", {
    radius: 1.1,
    speed: 0.0008,
    scale: [0.01, 0.01, 0.01],
    tilt: THREE.MathUtils.degToRad(15), // orbit in opposite tilted plane
    zSpin: true, // enable Z-axis spin
    ySpin: true, // enable Y-axis spin
  });
  addOrbitingModel("./assets/Rocket.glb", {
    radius: 1.8,
    speed: -0.0006,
    scale: [0.002, 0.002, 0.002],
    tilt: THREE.MathUtils.degToRad(30), // orbit in opposite tilted plane
    zSpin: true, // enable Z-axis spin
  });
  addOrbitingModel("./assets/Satellite.glb", {
    radius: 1.4,
    speed: 0.0002,
    scale: [0.003, 0.003, 0.003],
    tilt: THREE.MathUtils.degToRad(5), // orbit in opposite tilted plane
    zSpin: true, // enable Z-axis spin
  });
  addOrbitingModel("./assets/Satellite.glb", {
    radius: 1.3,
    speed: -0.0005,
    scale: [0.003, 0.003, 0.003],
    tilt: THREE.MathUtils.degToRad(28), // orbit in opposite tilted plane
    zSpin: true, // enable Z-axis spin
    ySpin: true, // enable Y-axis spin
  });
  addOrbitingModel("./assets/Satellite.glb", {
    radius: 1.5,
    speed: 0.0003,
    scale: [0.003, 0.003, 0.003],
    tilt: THREE.MathUtils.degToRad(72), // orbit in opposite tilted plane
    zSpin: true, // enable Z-axis spin
  });
  addOrbitingModel("./assets/HubbleTelescope.glb", {
    radius: 1.3,
    speed: 0.0003,
    scale: [0.003, 0.003, 0.003],
    tilt: THREE.MathUtils.degToRad(-40), // orbit in opposite tilted plane
    ySpin: true, // enable Y-axis spin
  });
  function addOrbitingModel(path, options) {
    gltfLoader.load(
      path,
      (gltf) => {
        const model = gltf.scene;
        model.scale.set(...(options.scale || [0.2, 0.2, 0.2]));
        globe.add(model); // attach to globe so it moves with Earth's rotation

        // Store orbit data for animation
        model.userData.orbit = {
          radius: options.radius || 2.5,
          speed: options.speed || 0.001,
          angle: Math.random() * Math.PI * 2,
          tilt: options.tilt || 0, // radians
          zSpin: options.zSpin || false, // whether to spin around Z axis
          ySpin: options.ySpin || false, // whether to spin around Z axis
        };

        // Optional: disable cast/receive shadows
        model.traverse((n) => {
          if (n.isMesh) {
            n.castShadow = false;
            n.receiveShadow = false;
          }
        });

        console.log(`${path} loaded`);
      },
      (xhr) =>
        console.log(`${path}: ${((xhr.loaded / xhr.total) * 100).toFixed(1)}%`),
      (err) => console.error(`Error loading ${path}:`, err)
    );
  }

  // Lighting
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
  scene.add(ambientLight);
  const pointLight = new THREE.PointLight(0xffffff, 0.8);
  pointLight.position.set(5, 3, 5);
  scene.add(pointLight);

  // --- Marker scaling config (relative to zoom) ---
  const markerScale = {
    base: 0.1, // scale at referenceRadius
    min: 0.08, // absolute minimum world-scale
    max: 0.1, // absolute maximum world-scale
    referenceRadius: 2.5, // radius at which base applies (matches initial orbit)
  };

  // Markers
  const markers = [];
  const markerGroup = new THREE.Group();
  globe.add(markerGroup);

  function latLngToVector3(lat, lng) {
    const phi = ((90 - lat) * Math.PI) / 180;
    const theta = ((lng + 180) * Math.PI) / 180;
    const x = -Math.sin(phi) * Math.cos(theta);
    const y = Math.cos(phi);
    const z = Math.sin(phi) * Math.sin(theta);
    return new THREE.Vector3(x, y, z).normalize();
  }

  const pointerTexture = textureLoader.load("./assets/materials/MapPointer.png");

  stickerData.forEach((sticker, index) => {
    const pos = latLngToVector3(sticker.lat, sticker.lng);

    const spriteContainer = new THREE.Object3D();
    spriteContainer.position.copy(pos.multiplyScalar(1.02));

    const spriteMaterial = new THREE.SpriteMaterial({
      map: pointerTexture,
      sizeAttenuation: false,
    });
    const sprite = new THREE.Sprite(spriteMaterial);
    sprite.scale.set(markerScale.base, markerScale.base, 1); // initial; will be updated per-zoom
    sprite.position.y = 0.001;
    sprite.userData = { index, sticker };

    spriteContainer.add(sprite);
    markerGroup.add(spriteContainer);
    markers.push(sprite);
  });

  // ─── Globe marker interaction (select via raycasting) ───────────────
  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();

  function handleMarkerSelection(intersectedSprite) {
    const index = intersectedSprite.userData.index;
    selectSticker(index);

    // Scroll sidebar to the selected sticker
    const listItem = document.querySelectorAll(".sticker-item")[index];
    if (listItem) {
      listItem.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }

  // Mouse click (desktop)
  container.addEventListener("click", (e) => {
    // Ignore if dragging — prevents accidental clicks during orbiting
    if (isDragging) return;

    const rect = container.getBoundingClientRect();
    mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);

    const intersects = raycaster.intersectObjects(markers, true);
    if (intersects.length > 0) {
      handleMarkerSelection(intersects[0].object);
    }
  });

  // Touch tap (mobile)
  let touchStartTime = 0;
  container.addEventListener("touchstart", () => {
    touchStartTime = Date.now();
  });

  container.addEventListener("touchend", (e) => {
    const tapDuration = Date.now() - touchStartTime;
    if (tapDuration > 300 || e.touches.length > 0) return; // ignore long press or multi-touch

    const rect = container.getBoundingClientRect();
    const touch = e.changedTouches[0];
    mouse.x = ((touch.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((touch.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);

    const intersects = raycaster.intersectObjects(markers, true);
    if (intersects.length > 0) {
      handleMarkerSelection(intersects[0].object);
    }
  });

  // --- Scale markers based on orbit.radius with clamped limits ---
  function updateMarkerScales() {
    const factor = orbit.radius / markerScale.referenceRadius; // >1 when zoomed out; <1 when zoomed in
    const s = THREE.MathUtils.clamp(
      markerScale.base * factor,
      markerScale.min,
      markerScale.max
    );
    for (let i = 0; i < markers.length; i++) {
      markers[i].scale.set(s, s, 1);
    }
  }
  // initial scale
  updateMarkerScales();

  // ─── Interaction ────────────────────────────────────────────────
  let isDragging = false;
  let isTouching = false;
  let previousMousePosition = { x: 0, y: 0 };
  let velocity = { theta: 0, phi: 0 };
  let lastMoveTime = 0;
  const dragSensitivity = 0.005;
  const dragSensitivityY = 0.005;
  const damping = 0.95; // inertia decay per frame

  // --- Desktop mouse drag ---
  container.addEventListener("mousedown", (e) => {
    isDragging = true;
    velocity.theta = velocity.phi = 0;
    if (orbitAnim) orbitAnim.cancel = true;
    orbit.lockedMarker = null;
    previousMousePosition = { x: e.clientX, y: e.clientY };
    lastMoveTime = performance.now();
    hidePopout();
  });

  container.addEventListener("mousemove", (e) => {
    if (!isDragging) return;

    const now = performance.now();
    const deltaTime = now - lastMoveTime;
    lastMoveTime = now;

    const dx = e.clientX - previousMousePosition.x;
    const dy = e.clientY - previousMousePosition.y;

    orbit.theta -= dx * dragSensitivity;
    orbit.phi -= dy * dragSensitivityY;
    orbit.phi = Math.max(orbit.minPhi, Math.min(orbit.maxPhi, orbit.phi));

    // record velocity for inertia
    velocity.theta = (-dx * dragSensitivity) / Math.max(deltaTime, 16);
    velocity.phi = (-dy * dragSensitivityY) / Math.max(deltaTime, 16);

    updateCameraFromOrbit();
    previousMousePosition = { x: e.clientX, y: e.clientY };
  });

  container.addEventListener("mouseup", () => (isDragging = false));
  container.addEventListener("mouseleave", () => (isDragging = false));

  // --- Scroll wheel zoom (desktop) ---
  container.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      const zoomFactor = 0.0015;
      orbit.radius = Math.max(
        orbit.minRadius,
        Math.min(orbit.maxRadius, orbit.radius + e.deltaY * zoomFactor)
      );
      updateCameraFromOrbit();
      updateMarkerScales();
    },
    { passive: false }
  );

  // --- Touch controls (mobile) ---
  let touchStartDistance = 0;

  function getTouchDistance(touches) {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.hypot(dx, dy);
  }

  container.addEventListener("touchstart", (e) => {
    if (e.touches.length === 1) {
      isTouching = true;
      isDragging = true;
      velocity.theta = velocity.phi = 0;
      if (orbitAnim) orbitAnim.cancel = true;
      orbit.lockedMarker = null;
      hidePopout();
      previousMousePosition = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
      };
      lastMoveTime = performance.now();
    } else if (e.touches.length === 2) {
      isTouching = false;
      touchStartDistance = getTouchDistance(e.touches);
    }
  });

  container.addEventListener("touchmove", (e) => {
    if (e.touches.length === 1 && isDragging && isTouching) {
      const touch = e.touches[0];
      const now = performance.now();
      const deltaTime = now - lastMoveTime;
      lastMoveTime = now;

      const dx = touch.clientX - previousMousePosition.x;
      const dy = touch.clientY - previousMousePosition.y;

      orbit.theta -= dx * dragSensitivity;
      orbit.phi -= dy * dragSensitivityY;
      orbit.phi = Math.max(orbit.minPhi, Math.min(orbit.maxPhi, orbit.phi));

      // record velocity for inertia
      velocity.theta = (-dx * dragSensitivity) / Math.max(deltaTime, 16);
      velocity.phi = (-dy * dragSensitivityY) / Math.max(deltaTime, 16);

      updateCameraFromOrbit();
      previousMousePosition = { x: touch.clientX, y: touch.clientY };
    } else if (e.touches.length === 2) {
      // Pinch zoom
      const newDist = getTouchDistance(e.touches);
      const zoomFactor = 0.005;
      const delta = (touchStartDistance - newDist) * zoomFactor;
      orbit.radius = Math.max(
        orbit.minRadius,
        Math.min(orbit.maxRadius, orbit.radius + delta)
      );
      updateCameraFromOrbit();
      updateMarkerScales();
      touchStartDistance = newDist;
    }

    e.preventDefault();
  });

  container.addEventListener("touchend", () => {
    isDragging = false;
    isTouching = false;
  });

  // Sidebar
  const stickerList = document.getElementById("sticker-list");
  const stickerCount = document.getElementById("sticker-count");
  stickerCount.textContent = `${stickerData.length} stickers found`;
  stickerData.forEach((sticker, index) => {
    const item = document.createElement("div");
    item.className = "sticker-item";
    item.innerHTML = `
      <div class="sticker-row">
        <div class="sticker-title">${sticker.title}</div>
        </div>
        <div class="sticker-row">
        <div class="sticker-date">${sticker.date}</div>
        </div>
        <div class="sticker-coords">${sticker.lat.toFixed(4)}°, ${sticker.lng.toFixed(4)}°</div>`;
    item.addEventListener("click", (e) => {
      selectSticker(index);
    });
    stickerList.appendChild(item);
  });

  // Utility: vector -> spherical angles
  function vectorToAngles(v) {
    const vn = v.clone().normalize();
    const phi = Math.acos(THREE.MathUtils.clamp(vn.y, -1, 1)); // 0..PI
    const theta = Math.atan2(vn.x, vn.z); // -PI..PI
    return { theta, phi };
  }

  function shortestAngleDelta(a, b) {
    let d = b - a;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    return d;
  }

  function easeInOutQuad(t) {
    return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
  }

  function animateOrbitTo(
    targetTheta,
    targetPhi,
    duration = 700,
    onDone = () => {}
  ) {
    // Cancel any existing animation
    if (orbitAnim) orbitAnim.cancel = true;

    const token = { cancel: false };
    orbitAnim = token;

    const startTheta = orbit.theta;
    const startPhi = orbit.phi;
    const dTheta = shortestAngleDelta(startTheta, targetTheta);
    const dPhi = targetPhi - startPhi;

    const t0 = Date.now();

    function step() {
      if (token.cancel) return;
      const t = Math.min((Date.now() - t0) / duration, 1);
      const e = easeInOutQuad(t);

      orbit.theta = startTheta + dTheta * e;
      orbit.phi = startPhi + dPhi * e;

      updateCameraFromOrbit();
      updateMarkerScales(); // keep scale smooth during fly-to

      if (t < 1) {
        requestAnimationFrame(step);
      } else {
        onDone();
      }
    }
    requestAnimationFrame(step);
  }

  function selectSticker(index) {
    document.querySelectorAll(".sticker-item").forEach((item, i) => {
      item.classList.toggle("active", i === index);
    });

    // Reset colours
    stickerData.forEach((_, i) => {
      const spriteContainer = markerGroup.children[i];
      const sprite = spriteContainer.children[0];
      sprite.material.color.setHex(0xffffff);
    });

    // Highlight selected pin
    const spriteContainer = markerGroup.children[index];
    const sprite = spriteContainer.children[0];
    sprite.material.color.setHex(0xe74c3c);

    // Determine target orbit angles to face the marker
    const worldPos = new THREE.Vector3();
    spriteContainer.getWorldPosition(worldPos);
    const { theta: targetTheta, phi: targetPhiRaw } = vectorToAngles(worldPos);
    const targetPhi = THREE.MathUtils.clamp(
      targetPhiRaw,
      orbit.minPhi,
      orbit.maxPhi
    );

    // During animation: ensure we are not locked (we'll lock after)
    orbit.lockedMarker = null;

    // Animate camera to marker direction, then lock to it
    animateOrbitTo(targetTheta, targetPhi, 700, () => {
      if (orbitAnim && orbitAnim.cancel) return;
      orbit.lockedMarker = spriteContainer;
      showPopout(index);
    });
  }

  let popoutIndex = null;

  function showPopout(index) {
    const s = stickerData[index];
    if (!s) return;

    popoutTitle.textContent = s.title || "Sticker";
    popoutDate.textContent = s.date || "";
    popoutLikes.textContent = s.likeCount ? `${s.likeCount} likes` : "";
    popoutCoords.textContent = `${Number(s.lat).toFixed(4)}°, ${Number(s.lng).toFixed(4)}°`;
    popoutLink.href = s.link || "#";
    popoutImage.src = "./assets/stickers/" + s.imageUrl || "";
    popoutImage.alt = s.title || "Sticker photo";

    popout.classList.remove("hidden");
    // ensure it's measured before adding the open class
    requestAnimationFrame(() => popout.classList.add("open"));

    popoutIndex = index;
    updatePopoutPosition();
  }

  function hidePopout() {
    // run the closing animation first
    popout.classList.remove("open");
    // after the transition duration, hide completely
    setTimeout(() => {
      if (!popout.classList.contains("open")) {
        popout.classList.add("hidden");
      }
    }, 350); // matches CSS transition time
    popoutIndex = null;
  }

  // project marker world position to 2D and offset the popout
  function updatePopoutPosition() {
    if (popoutIndex == null || !orbit.lockedMarker) return;

    const rect = container.getBoundingClientRect();

    const world = new THREE.Vector3();
    orbit.lockedMarker.getWorldPosition(world);

    // project to NDC
    world.project(camera);

    // to pixels within the globe container
    const x = (world.x * 0.5 + 0.5) * rect.width;
    const y = (-world.y * 0.5 + 0.5) * rect.height;

    // offset so it doesn't sit in front of the pin
    const offsetX = 180;   // to the right
    const offsetY = -200;   // slightly up

    let left = x + offsetX;
    let top = y + offsetY;

    // clamp inside container
    const w = popout.offsetWidth || 320;
    const h = popout.offsetHeight || 220;
    left = Math.max(10, Math.min(rect.width - w - 10, left));
    top = Math.max(10, Math.min(rect.height - h - 10, top));

    // apply
    popout.style.left = `${left}px`;
    popout.style.top = `${top}px`;
  }

  // Animation loop
  let moonOrbitAngle = 15;
  const moonOrbitRadius = 3;
  const moonOrbitSpeed = 0.001;

  let marsOrbitAngle = 0;
  const marsOrbitRadius = 25;
  const marsOrbitSpeed = -0.00001;

  function animate() {
    requestAnimationFrame(animate);

    // Gentle Earth spin (optional)
    globe.rotation.y += 0.0005;

    // Orbit the moon around Earth
    moonOrbitAngle += moonOrbitSpeed;
    moon.position.x = Math.cos(moonOrbitAngle) * moonOrbitRadius;
    moon.position.z = Math.sin(moonOrbitAngle) * moonOrbitRadius;
    moon.rotation.y += 0.001;

    // Orbit the mars around Earth
    marsOrbitAngle += marsOrbitSpeed;
    mars.position.x = Math.cos(marsOrbitAngle) * marsOrbitRadius;
    mars.position.z = Math.sin(marsOrbitAngle) * marsOrbitRadius;
    mars.rotation.y += 0.001;

    globe.traverse((obj) => {
      if (obj.userData.orbit) {
        const o = obj.userData.orbit;
        o.angle += o.speed;
        const r = o.radius;

        // Apply tilt
        const tiltMatrix = new THREE.Matrix4().makeRotationX(o.tilt);
        const pos = new THREE.Vector3(
          Math.cos(o.angle) * r,
          0,
          Math.sin(o.angle) * r
        ).applyMatrix4(tiltMatrix);

        obj.position.copy(pos);
        if (o.ySpin) {
          obj.rotation.y += 0.01; // spin
        }
        if (o.zSpin) {
          obj.rotation.z += 0.01;
        }
      }
    });
    // While locked: keep following the marker as Earth spins
    if (orbit.lockedMarker) {
      const worldPos = new THREE.Vector3();
      orbit.lockedMarker.getWorldPosition(worldPos);
      const { theta, phi } = vectorToAngles(worldPos);
      orbit.theta = theta;
      orbit.phi = THREE.MathUtils.clamp(phi, orbit.minPhi, orbit.maxPhi);
      updatePopoutPosition();

    }

    // Apply inertia when not dragging
    if (!isDragging && !isTouching) {
      orbit.theta += velocity.theta;
      orbit.phi += velocity.phi;
      orbit.phi = Math.max(orbit.minPhi, Math.min(orbit.maxPhi, orbit.phi));

      velocity.theta *= damping;
      velocity.phi *= damping;

      // stop tiny floating velocities
      if (Math.abs(velocity.theta) < 0.00001) velocity.theta = 0;
      if (Math.abs(velocity.phi) < 0.00001) velocity.phi = 0;
    }

    updateCameraFromOrbit();
    updateMarkerScales(); // keep marker size in sync every frame
    renderer.render(scene, camera);
  }

  animate();

  // Handle window resize
  window.addEventListener("resize", () => {
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
    updateCameraFromOrbit();
    updateMarkerScales();
  });
}
