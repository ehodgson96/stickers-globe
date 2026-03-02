import { CONFIG } from './config.js';
import * as THREE from 'three';

export function createGlobe(scene, textureLoader, gltfLoader) {
  // Shaders
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

        float nightAmount = 1.0 - clamp(sunIntensity * 5.0 + 0.5, 0.0, 1.0);
      // Extract bright parts (city lights) from night texture
      float cityMask = smoothstep(0.6, 1.0, max(max(nightColor.r, nightColor.g), nightColor.b));
      vec3 cityLights = nightColor * cityMask * nightAmount * 2.0; // 2.0 = boost intensity

      color += cityLights;
      gl_FragColor = vec4(color, 1.0);
    }
  `;

  const sunCoronaVertexShader = `
    varying vec3 vNormal;
    varying vec3 vWorldPos;
    void main() {
      vec4 wp   = modelMatrix * vec4(position, 1.0);
      vWorldPos = wp.xyz;
      vNormal   = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
      gl_Position = projectionMatrix * viewMatrix * wp;
    }
  `;
  const sunCoronaFragmentShader = `
    uniform vec3  uColor;
    uniform float uIntensity;
    uniform float uPower;
    varying vec3  vNormal;
    varying vec3  vWorldPos;
    void main() {
      vec3  viewDir = normalize(cameraPosition - vWorldPos);
      float c       = max(dot(vNormal, viewDir), 0.0);
      float edge    = smoothstep(0.0, 0.25, c);
      float glow    = edge * pow(1.0 - c, uPower);
      gl_FragColor  = vec4(uColor, glow * uIntensity);
    }
  `;

  // Textures
  const dayTexture = textureLoader.load(CONFIG.paths.earthDay);
  const nightTexture = textureLoader.load(CONFIG.paths.earthNight);
  dayTexture.colorSpace = nightTexture.colorSpace = THREE.SRGBColorSpace;

  // Globe mesh
  const geometry = new THREE.SphereGeometry(1, 32, 20);
  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      uDayTexture: new THREE.Uniform(dayTexture),
      uNightTexture: new THREE.Uniform(nightTexture),
      uSunDirectionWorld: new THREE.Uniform(new THREE.Vector3(-1, 0.5, 0.2).normalize())
    }
  });
  const globe = new THREE.Mesh(geometry, material);
  scene.add(globe);

  // Sun — layered gas-ball: 3 semi-transparent spheres sharing the same texture,
  // each rotating on a different axis/speed so their surface patterns slide past
  // each other and give the illusion of turbulent convection.
  const sunPosition = new THREE.Vector3(-8, 3, 2);
  const sunTexture = textureLoader.load(CONFIG.paths.sunMap);
  sunTexture.colorSpace = THREE.SRGBColorSpace;

  const sunLayerDefs = [
    { scale: 1.10,  opacity: 0.90, rx:  0,        ry:  0.0004, rz:  0       },
    { scale: 1.115, opacity: 0.50, rx:  0.00015,  ry: -0.0003, rz:  0.0001  },
    { scale: 1.13,  opacity: 0.25, rx: -0.0001,   ry:  0.00025,rz: -0.00015 },
  ];

  const sunLayers = sunLayerDefs.map(def => {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(def.scale, 28, 18),
      new THREE.MeshBasicMaterial({
        map: sunTexture,
        transparent: true,
        opacity: def.opacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      })
    );
    mesh.position.copy(sunPosition);
    // Start each layer at a random orientation so they don't all show the same face
    mesh.rotation.set(
      Math.random() * Math.PI * 2,
      Math.random() * Math.PI * 2,
      Math.random() * Math.PI * 2
    );
    scene.add(mesh);
    return { mesh, rx: def.rx, ry: def.ry, rz: def.rz };
  });

  const sunGlow = new THREE.Mesh(
    new THREE.SphereGeometry(2, 32, 20),
    new THREE.ShaderMaterial({
      vertexShader: sunCoronaVertexShader,
      fragmentShader: sunCoronaFragmentShader,
      uniforms: {
        uColor:     { value: new THREE.Color(0xff7722) },
        uIntensity: { value: 0.1 },
        uPower:     { value: 4.0 }
      },
      side:        THREE.FrontSide,
      transparent: true,
      blending:    THREE.AdditiveBlending,
      depthWrite:  false
    })
  );
  sunGlow.position.copy(sunPosition);
  scene.add(sunGlow);

  material.uniforms.uSunDirectionWorld.value.copy(sunPosition).normalize();

  // Celestial bodies
  const celestial = {
    moon: createCelestialBody(0.27, CONFIG.paths.moon, textureLoader, 3, 0.001, 15),
    mars: createCelestialBody(2, CONFIG.paths.mars, textureLoader, 25, -0.00001, 0)
  };

  globe.add(celestial.moon.mesh);
  scene.add(celestial.mars.mesh);

  function createCelestialBody(radius, texturePath, loader, orbitRadius, orbitSpeed, startAngle) {
    const geometry = new THREE.SphereGeometry(radius, 8, 6);
    const texture = loader.load(texturePath);
    texture.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.MeshStandardMaterial({ map: texture, roughness: 1, metalness: 0 });
    const mesh = new THREE.Mesh(geometry, material);

    return {
      mesh,
      orbitRadius,
      orbitSpeed,
      angle: startAngle,
      update() {
        this.angle += this.orbitSpeed;
        this.mesh.position.x = Math.cos(this.angle) * this.orbitRadius;
        this.mesh.position.z = Math.sin(this.angle) * this.orbitRadius;
        this.mesh.rotation.y += 0.001;
      },
    };
  }

  // Orbiting models
  let ufoModel = null;

  gltfLoader.load('./assets/models/UFO.glb', (gltf) => {
    const model = gltf.scene;
    model.scale.set(0.1, 0.1, 0.1);
    globe.add(model);
    model.userData.orbit = {
      radius: 2, speed: 0.0012,
      angle: Math.random() * Math.PI * 2,
      tilt: THREE.MathUtils.degToRad(-25),
      zSpin: false, ySpin: true
    };
    model.traverse(n => {
      if (n.isMesh) {
        n.castShadow = n.receiveShadow = false;
        if (n.material && 'emissive' in n.material) {
          n.material.emissive = new THREE.Color(0x1a1a1a);
          n.material.emissiveIntensity = 0.45;
        }
      }
    });
    ufoModel = model;
  });

  const models = [
    { path: './assets/models/Cow.glb', radius: 1.1, speed: 0.0008, scale: [0.01, 0.01, 0.01], tilt: 15, zSpin: true, ySpin: true },
    { path: './assets/models/Rocket.glb', radius: 1.8, speed: -0.0006, scale: [0.002, 0.002, 0.002], tilt: 30, zSpin: true },
    { path: './assets/models/Satellite.glb', radius: 1.4, speed: 0.0002, scale: [0.003, 0.003, 0.003], tilt: 5, zSpin: true },
    { path: './assets/models/Satellite.glb', radius: 1.3, speed: -0.0005, scale: [0.003, 0.003, 0.003], tilt: 28, zSpin: true, ySpin: true },
    { path: './assets/models/Satellite.glb', radius: 1.5, speed: 0.0003, scale: [0.003, 0.003, 0.003], tilt: 72, zSpin: true },
    { path: './assets/models/HubbleTelescope.glb', radius: 1.3, speed: 0.0003, scale: [0.003, 0.003, 0.003], tilt: -40, ySpin: true }
  ];

  models.forEach(opts => {
    gltfLoader.load(opts.path, (gltf) => {
      const model = gltf.scene;
      model.scale.set(...opts.scale);
      globe.add(model);

      model.userData.orbit = {
        radius: opts.radius,
        speed: opts.speed,
        angle: Math.random() * Math.PI * 2,
        tilt: THREE.MathUtils.degToRad(opts.tilt),
        zSpin: opts.zSpin || false,
        ySpin: opts.ySpin || false
      };

      model.traverse(n => {
        if (n.isMesh) {
          n.castShadow = n.receiveShadow = false;
          if (n.material && 'emissive' in n.material) {
            n.material.emissive = new THREE.Color(0x1a1a1a);
            n.material.emissiveIntensity = 0.45;
          }
        }
      });
    });
  });

  function updateOrbitingModels() {
    globe.traverse(obj => {
      if (obj.userData.orbit) {
        const o = obj.userData.orbit;
        o.angle += o.speed;
        const tiltMatrix = new THREE.Matrix4().makeRotationX(o.tilt);
        const pos = new THREE.Vector3(
          Math.cos(o.angle) * o.radius,
          0,
          Math.sin(o.angle) * o.radius
        ).applyMatrix4(tiltMatrix);
        obj.position.copy(pos);
        if (o.ySpin) obj.rotation.y += 0.01;
        if (o.zSpin) obj.rotation.z += 0.01;
      }
    });
  }

  return {
    globe,
    celestial,
    sun: {
      update() {
        sunLayers.forEach(l => {
          l.mesh.rotation.x += l.rx;
          l.mesh.rotation.y += l.ry;
          l.mesh.rotation.z += l.rz;
        });
      }
    },
    sunGlow,
    updateOrbitingModels,
    rotate: (delta) => globe.rotation.y += delta,
    get ufo() { return ufoModel; }
  };
}
