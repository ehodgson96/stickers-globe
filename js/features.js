import * as THREE from 'three';

export function createFeatures({ scene, globe, globeSetup }) {

  // ── 3. Atmosphere Glow ─────────────────────────────────────────────────
  // FrontSide sphere at r=1.25 — globe depth-occludes the centre, leaving
  // only the outer halo visible.  The `edge` term fades alpha to zero as
  // the view angle approaches the sphere silhouette, so there is no hard
  // outer ring.
  function makeAtmosphereGlow() {
    const vShader = `
      varying vec3 vNormal;
      varying vec3 vWorldPos;
      void main() {
        vec4 wp   = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        vNormal   = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `;
    const fShader = `
      uniform vec3  uColor;
      uniform float uIntensity;
      uniform float uPower;
      varying vec3  vNormal;
      varying vec3  vWorldPos;
      void main() {
        vec3  viewDir = normalize(cameraPosition - vWorldPos);
        float c       = max(dot(vNormal, viewDir), 0.0);
        // Fade to zero at the outer silhouette (c≈0) so no hard edge
        float edge    = smoothstep(0.0, 0.25, c);
        // Fresnel: bright near limb, transparent at centre
        float glow    = edge * pow(1.0 - c, uPower);
        gl_FragColor  = vec4(uColor, glow * uIntensity);
      }
    `;
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(1.1, 48, 32),
      new THREE.ShaderMaterial({
        vertexShader: vShader,
        fragmentShader: fShader,
        uniforms: {
          uColor:     { value: new THREE.Color(0x3366ff) },
          uIntensity: { value: 0.10 },
          uPower:     { value: 8 }
        },
        side:        THREE.FrontSide,
        transparent: true,
        blending:    THREE.AdditiveBlending,
        depthWrite:  false
      })
    );
    mesh.visible = true;
    globe.add(mesh);

    return {
      id: 'atmosphereGlow',
      label: 'Atmosphere Glow',
      getEnabled: () => mesh.visible,
      setEnabled: (v) => { mesh.visible = Boolean(v); },
      controls: [
        {
          id: 'scale',
          label: 'Scale',
          type: 'range',
          min: 0.84,
          max: 1.6,
          step: 0.01,
          get: () => mesh.scale.x,
          set: (v) => { mesh.scale.setScalar(Number(v)); }
        },
        {
          id: 'intensity',
          label: 'Intensity',
          type: 'range',
          min: 0,
          max: 2,
          step: 0.05,
          get: () => mesh.material.uniforms.uIntensity.value,
          set: (v) => { mesh.material.uniforms.uIntensity.value = Number(v); }
        },
        {
          id: 'power',
          label: 'Tightness',
          type: 'range',
          min: 1,
          max: 10,
          step: 0.5,
          get: () => mesh.material.uniforms.uPower.value,
          set: (v) => { mesh.material.uniforms.uPower.value = Number(v); }
        }
      ],
      _update() {}
    };
  }

  // ── 7. Asteroid Belt ───────────────────────────────────────────────────
  function makeAsteroidBelt() {
    let count    = 50;
    let instMesh = null;
    let angle    = 0;

    function build(n) {
      if (instMesh) {
        scene.remove(instMesh);
        instMesh.geometry.dispose();
        instMesh.material.dispose();
      }
      const geo = new THREE.IcosahedronGeometry(0.008, 0);
      const mat = new THREE.MeshStandardMaterial({
        color: 0x888888, roughness: 1, metalness: 0.2
      });
      instMesh = new THREE.InstancedMesh(geo, mat, n);
      const dummy = new THREE.Object3D();
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + (Math.random() - 0.5) * 0.3;
        const r = 1.65 + Math.random() * 0.25;
        const y = (Math.random() - 0.5) * 0.12;
        dummy.position.set(Math.cos(a) * r, y, Math.sin(a) * r);
        dummy.scale.setScalar(0.5 + Math.random() * 1.0);
        dummy.rotation.set(
          Math.random() * Math.PI * 2,
          Math.random() * Math.PI * 2,
          0
        );
        dummy.updateMatrix();
        instMesh.setMatrixAt(i, dummy.matrix);
      }
      instMesh.instanceMatrix.needsUpdate = true;
      instMesh.visible = true;
      scene.add(instMesh);
    }

    build(count);

    return {
      id: 'asteroidBelt',
      label: 'Asteroid Belt',
      getEnabled: () => instMesh.visible,
      setEnabled: (v) => { instMesh.visible = Boolean(v); },
      controls: [
        {
          id: 'count',
          label: 'Count',
          type: 'range',
          min: 10,
          max: 300,
          step: 10,
          get: () => count,
          set: (v) => { count = Math.round(v); build(count); }
        }
      ],
      _update(_time, dt) {
        if (!instMesh.visible) return;
        angle += dt * 0.05;
        instMesh.rotation.y = angle;
      }
    };
  }

  // ── 8. Parallax Stars ──────────────────────────────────────────────────
  function makeParallaxStars() {
    function buildLayer(n, r, size, brightness) {
      const positions = new Float32Array(n * 3);
      const colors    = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        const theta = Math.random() * Math.PI * 2;
        const phi   = Math.acos(2 * Math.random() - 1);
        positions[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
        positions[i * 3 + 1] = r * Math.cos(phi);
        positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
        const b = brightness * (0.4 + Math.random() * 0.6);
        colors[i * 3]     = b;
        colors[i * 3 + 1] = b;
        colors[i * 3 + 2] = b * (0.8 + Math.random() * 0.2);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geo.setAttribute('color',    new THREE.BufferAttribute(colors,    3));
      const mat = new THREE.PointsMaterial({
        size,
        vertexColors: true,
        transparent: true,
        depthWrite: false,
        sizeAttenuation: false,
        alphaTest: 0.01,
        blending: THREE.AdditiveBlending
      });
      return new THREE.Points(geo, mat);
    }

    const mid   = buildLayer(2000, 62, 1.4, 0.45);
    const close = buildLayer(1000, 40, 2.0, 0.30);
    mid.visible   = true;
    close.visible = true;
    scene.add(mid);
    scene.add(close);

    return {
      id: 'parallaxStars',
      label: 'Parallax Stars',
      getEnabled: () => mid.visible,
      setEnabled: (v) => { mid.visible = close.visible = Boolean(v); },
      controls: [],
      _update() {}
    };
  }

  // ── 9. Shooting Stars ─────────────────────────────────────────────────
  function makeShootingStars() {
    let enabled = true;
    const MAX_ACTIVE = 3;
    let timeSinceLastSpawn = 0;
    let nextSpawnIn = 5 + Math.random() * 5;

    const stars = [];
    for (let i = 0; i < MAX_ACTIVE; i++) {
      const geo = new THREE.BufferGeometry();
      const positions = new Float32Array(6); // 2 vertices * 3 components
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      const mat = new THREE.LineBasicMaterial({
        color: 0xffffff,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      });
      const line = new THREE.Line(geo, mat);
      line.visible = false;
      scene.add(line);
      stars.push({
        line,
        geo,
        mat,
        active: false,
        life: 0,
        maxLife: 1,
        origin: new THREE.Vector3(),
        direction: new THREE.Vector3(),
        speed: 20
      });
    }

    function spawnStar() {
      const inactive = stars.filter(s => !s.active);
      if (inactive.length === 0) return;
      const star = inactive[Math.floor(Math.random() * inactive.length)];

      const u = Math.random();
      const v = Math.random();
      const theta = 2 * Math.PI * u;
      const phi = Math.acos(2 * v - 1);
      const r = 75;
      star.origin.set(
        r * Math.sin(phi) * Math.cos(theta),
        r * Math.cos(phi),
        r * Math.sin(phi) * Math.sin(theta)
      );

      const rand = new THREE.Vector3(
        Math.random() - 0.5,
        Math.random() - 0.5,
        Math.random() - 0.5
      );
      star.direction.crossVectors(star.origin, rand).normalize();

      star.speed = 18 + Math.random() * 14;
      star.maxLife = 0.9 + Math.random() * 0.8;
      star.life = 0;
      star.active = true;
      star.line.visible = true;
    }

    function updateStar(star, dt) {
      star.life += dt;
      const t = star.life / star.maxLife;
      const trailLen = 10;
      const headDist = star.life * star.speed;
      const tailDist = Math.max(0, headDist - trailLen);

      const head = star.origin.clone().addScaledVector(star.direction, headDist);
      const tail = star.origin.clone().addScaledVector(star.direction, tailDist);

      const positions = star.geo.attributes.position.array;
      positions[0] = tail.x;
      positions[1] = tail.y;
      positions[2] = tail.z;
      positions[3] = head.x;
      positions[4] = head.y;
      positions[5] = head.z;
      star.geo.attributes.position.needsUpdate = true;

      star.mat.opacity = Math.sin(t * Math.PI) * 0.8;

      if (star.life >= star.maxLife) {
        star.active = false;
        star.line.visible = false;
      }
    }

    return {
      id: 'shootingStars',
      label: 'Shooting Stars',
      getEnabled: () => enabled,
      setEnabled: (v) => {
        enabled = Boolean(v);
        if (!enabled) {
          stars.forEach(s => {
            s.active = false;
            s.line.visible = false;
          });
        }
      },
      controls: [],
      _update(_time, dt) {
        if (!enabled) return;

        timeSinceLastSpawn += dt;
        if (timeSinceLastSpawn >= nextSpawnIn) {
          spawnStar();
          timeSinceLastSpawn = 0;
          nextSpawnIn = 7 + Math.random() * 10;
        }

        stars.forEach(s => {
          if (s.active) updateStar(s, dt);
        });
      }
    };
  }

  // ── Assemble ──────────────────────────────────────────────────────────
  const features = [
    makeAtmosphereGlow(),
    makeAsteroidBelt(),
    makeParallaxStars(),
    makeShootingStars()
  ];

  return {
    features,
    update(time, dt) {
      features.forEach((f) => { if (f._update) f._update(time, dt); });
    },
    onSelect(index) {
      features.forEach((f) => { if (f._onSelect) f._onSelect(index); });
    }
  };
}
