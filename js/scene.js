import { CONFIG } from './config.js';

export function createScene(container) {
  const scene = new THREE.Scene();
  
  const camera = new THREE.PerspectiveCamera(
    75,
    container.clientWidth / container.clientHeight,
    0.01,
    1000
  );

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.setClearColor(0x0a0a0a);
  container.appendChild(renderer.domElement);

  // Orbit state
  const orbit = {
    radius: CONFIG.orbit.radius,
    theta: 0,
    phi: Math.PI / 2,
    minRadius: CONFIG.orbit.minRadius,
    maxRadius: CONFIG.orbit.maxRadius,
    minPhi: CONFIG.orbit.minPhi,
    maxPhi: CONFIG.orbit.maxPhi,
    lockedMarker: null
  };

  const velocity = { theta: 0, phi: 0 };

  function updateCamera() {
    const x = orbit.radius * Math.sin(orbit.phi) * Math.sin(orbit.theta);
    const y = orbit.radius * Math.cos(orbit.phi);
    const z = orbit.radius * Math.sin(orbit.phi) * Math.cos(orbit.theta);
    camera.position.set(x, y, z);
    camera.lookAt(0, 0, 0);
  }

  updateCamera();

  // Lighting
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
  const pointLight = new THREE.PointLight(0xffffff, 0.8);
  pointLight.position.set(5, 3, 5);
  scene.add(ambientLight, pointLight);

  // Starfield
  const starfield = createStarfield();
  scene.add(starfield);

  function createStarfield() {
    const canvas = document.createElement('canvas');
    canvas.width = 2048;
    canvas.height = 1024;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    for (let i = 0; i < 2000; i++) {
      const x = Math.random() * canvas.width;
      const y = Math.random() * canvas.height;
      const b = Math.random();
      ctx.fillStyle = `rgba(255,255,255,${b})`;
      ctx.fillRect(x, y, b * 1.5, b * 1.5);
    }

    const texture = new THREE.CanvasTexture(canvas);
    const geometry = new THREE.SphereGeometry(100, 64, 64);
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      side: THREE.BackSide
    });

    return new THREE.Mesh(geometry, material);
  }

  function handleResize() {
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
  }

  window.addEventListener('resize', handleResize);

  return {
    scene,
    camera,
    renderer,
    orbit,
    velocity,
    updateCamera,
    render: () => renderer.render(scene, camera)
  };
}