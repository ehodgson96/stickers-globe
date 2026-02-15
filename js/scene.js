import { CONFIG } from './config.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GlitchPass } from 'three/addons/postprocessing/GlitchPass.js';
import { BloomPass } from 'three/addons/postprocessing/BloomPass.js';
import { OutlinePass } from 'three/addons/postprocessing/OutlinePass.js';
import { RenderPixelatedPass } from 'three/addons/postprocessing/RenderPixelatedPass.js';
import { DotScreenPass } from 'three/addons/postprocessing/DotScreenPass.js';
import { AfterimagePass } from 'three/addons/postprocessing/AfterimagePass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import * as THREE from 'three';

export function createScene(container) {
  const scene = new THREE.Scene();
  
  const camera = new THREE.PerspectiveCamera(
    75,
    container.clientWidth / container.clientHeight,
    0.01,
    1000
  );

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.setClearColor(0x0a0a0a);
  container.appendChild(renderer.domElement);

  const composer = new EffectComposer(renderer);
  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);

  const glitchPass = new GlitchPass(100);
  const effectBloom = new BloomPass(1.2, 25, 4);
  const resolution = new THREE.Vector2(container.clientWidth, container.clientHeight);

  let outlineRoots = [];
  const outlinePass = new OutlinePass(resolution, scene, camera, []);
  outlinePass.edgeThickness = 0.1;
  outlinePass.edgeStrength = 2.0;
  outlinePass.edgeGlow = 0;
  outlinePass.pulsePeriod = 0;
  outlinePass.visibleEdgeColor.set(0xFFFFFF);
  outlinePass.hiddenEdgeColor.set(0xFFFFFF);

  const dotScreenPass = new DotScreenPass(new THREE.Vector2(0, 0), 0.5, 0.9);
  const renderPixelatedPass = new RenderPixelatedPass(2, scene, camera);
  const afterimagePass = new AfterimagePass(0.2);
  const bloomPass = new UnrealBloomPass(resolution, 1, 0, 1);

  const effects = [
    {
      id: 'glitch',
      label: 'Glitch',
      pass: glitchPass,
      enabled: false,
      controls: [
        {
          id: 'wild',
          label: 'Wild',
          type: 'boolean',
          get: () => glitchPass.goWild,
          set: (value) => {
            glitchPass.goWild = Boolean(value);
          }
        }
      ]
    },
    {
      id: 'bloomClassic',
      label: 'Bloom Classic',
      pass: effectBloom,
      enabled: false,
      controls: [
        {
          id: 'strength',
          label: 'Strength',
          type: 'range',
          min: 0,
          max: 3,
          step: 0.01,
          get: () => effectBloom.combineUniforms.strength.value,
          set: (value) => {
            effectBloom.combineUniforms.strength.value = value;
          }
        }
      ]
    },
    {
      id: 'outline',
      label: 'Outline',
      pass: outlinePass,
      enabled: false,
      controls: [
        {
          id: 'strength',
          label: 'Strength',
          type: 'range',
          min: 0,
          max: 12,
          step: 0.1,
          get: () => outlinePass.edgeStrength,
          set: (value) => {
            outlinePass.edgeStrength = value;
          }
        },
        {
          id: 'thickness',
          label: 'Thickness',
          type: 'range',
          min: 0,
          max: 6,
          step: 0.1,
          get: () => outlinePass.edgeThickness,
          set: (value) => {
            outlinePass.edgeThickness = value;
          }
        }
      ]
    },
    {
      id: 'dotScreen',
      label: 'Dot Screen',
      pass: dotScreenPass,
      enabled: false,
      controls: [
        {
          id: 'scale',
          label: 'Scale',
          type: 'range',
          min: 0.1,
          max: 2.5,
          step: 0.01,
          get: () => dotScreenPass.uniforms.scale.value,
          set: (value) => {
            dotScreenPass.uniforms.scale.value = value;
          }
        },
        {
          id: 'angle',
          label: 'Angle',
          type: 'range',
          min: 0,
          max: 3.14,
          step: 0.01,
          get: () => dotScreenPass.uniforms.angle.value,
          set: (value) => {
            dotScreenPass.uniforms.angle.value = value;
          }
        }
      ]
    },
    {
      id: 'pixelate',
      label: 'Pixelate',
      pass: renderPixelatedPass,
      enabled: false,
      controls: [
        {
          id: 'pixelSize',
          label: 'Pixel Size',
          type: 'range',
          min: 0,
          max: 4,
          step: 0.2,
          get: () => renderPixelatedPass.pixelSize,
          set: (value) => {
            renderPixelatedPass.setPixelSize(Math.max(1, Math.round(value)));
          }
        },
        {
          id: 'normalEdge',
          label: 'Normal Edge',
          type: 'range',
          min: 0,
          max: 1,
          step: 0.01,
          get: () => renderPixelatedPass.normalEdgeStrength,
          set: (value) => {
            renderPixelatedPass.normalEdgeStrength = value;
          }
        },
        {
          id: 'depthEdge',
          label: 'Depth Edge',
          type: 'range',
          min: 0,
          max: 1,
          step: 0.01,
          get: () => renderPixelatedPass.depthEdgeStrength,
          set: (value) => {
            renderPixelatedPass.depthEdgeStrength = value;
          }
        }
      ]
    },
    {
      id: 'afterimage',
      label: 'Afterimage',
      pass: afterimagePass,
      enabled: false,
      controls: [
        {
          id: 'damp',
          label: 'Damp',
          type: 'range',
          min: 0,
          max: 0.99,
          step: 0.01,
          get: () => afterimagePass.damp,
          set: (value) => {
            afterimagePass.damp = value;
          }
        }
      ]
    },
    {
      id: 'bloomUnreal',
      label: 'Bloom Unreal',
      pass: bloomPass,
      enabled: true,
      controls: [
        {
          id: 'strength',
          label: 'Strength',
          type: 'range',
          min: 0,
          max: 3,
          step: 0.01,
          get: () => bloomPass.strength,
          set: (value) => {
            bloomPass.strength = value;
          }
        },
        {
          id: 'radius',
          label: 'Radius',
          type: 'range',
          min: 0,
          max: 1,
          step: 0.01,
          get: () => bloomPass.radius,
          set: (value) => {
            bloomPass.radius = value;
          }
        },
        {
          id: 'threshold',
          label: 'Threshold',
          type: 'range',
          min: 0,
          max: 1,
          step: 0.01,
          get: () => bloomPass.threshold,
          set: (value) => {
            bloomPass.threshold = value;
          }
        }
      ]
    }
  ];

  effects.forEach((effect) => {
    effect.pass.enabled = effect.enabled;
    composer.addPass(effect.pass);
  });

  const effectLookup = new Map(effects.map((effect) => [effect.id, effect]));
  let frameCount = 0;

  function rebuildOutlineSelection(force = false) {
    if (!force) {
      frameCount += 1;
      if (frameCount % 30 !== 0) return;
    }

    const selected = [];
    outlineRoots.forEach((root) => {
      if (!root || !root.traverse) return;
      root.traverse((child) => {
        if (!child.isMesh) return;
        if (child.material?.side === THREE.BackSide) return;
        selected.push(child);
      });
    });

    outlinePass.selectedObjects = selected;
  }

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
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setSize(container.clientWidth, container.clientHeight);
    composer.setSize(container.clientWidth, container.clientHeight);
    resolution.set(container.clientWidth, container.clientHeight);
    outlinePass.resolution.set(container.clientWidth, container.clientHeight);
  }

  window.addEventListener('resize', handleResize);

  const postProcessing = {
    effects: effects.map((effect) => ({
      id: effect.id,
      label: effect.label,
      getEnabled: () => effect.pass.enabled,
      setEnabled: (enabled) => {
        effect.pass.enabled = Boolean(enabled);
      },
      controls: effect.controls.map((control) => ({
        id: control.id,
        label: control.label,
        type: control.type,
        min: control.min,
        max: control.max,
        step: control.step,
        get: control.get,
        set: control.set
      }))
    })),
    setEffectEnabled: (id, enabled) => {
      const effect = effectLookup.get(id);
      if (!effect) return;
      effect.pass.enabled = Boolean(enabled);
    },
    setEffectControl: (id, controlId, value) => {
      const effect = effectLookup.get(id);
      if (!effect) return;
      const control = effect.controls.find((candidate) => candidate.id === controlId);
      if (!control) return;
      control.set(value);
    }
  };

  return {
    scene,
    camera,
    renderer,
    orbit,
    velocity,
    updateCamera,
    outlinePass,
    postProcessing,
    setOutlineTargets: (targets) => {
      outlineRoots = Array.isArray(targets) ? targets : [];
      rebuildOutlineSelection(true);
    },
    render: () => {
      outlinePass.visibleEdgeColor.set(0xFFFFFF);
      outlinePass.hiddenEdgeColor.set(0x000000);
      outlinePass.edgeGlow = 0;
      outlinePass.pulsePeriod = 0;
      rebuildOutlineSelection();
      composer.render();
    }
  };
}
