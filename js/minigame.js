import * as THREE from 'three';
import { clone as skeletonClone } from 'three/addons/utils/SkeletonUtils.js';

export function createMinigame({ globe, getUfo, getCow, audio }) {
  const UFO_RADIUS    = 2;
  const ACCEL         = 0.003;
  const MAX_VEL       = 0.028;
  const DAMP          = 0.86;
  const BEAM_RANGE    = 0.40;  // radians (~23°)
  const BEAM_CHARGE   = 1.6;   // seconds to trigger abduction
  const ABDUCT_TIME   = 0.75;  // seconds for fly-up animation
  const GAME_SECS     = 45;
  const MAX_COWS      = 10;
  const COW_SPEED     = 0.1;  // radians/sec walk speed
  const COW_SURFACE_R =1; // distance from globe centre — increase to raise cows off the surface

  let active      = false;
  let _onEnd      = null;
  let gameTheta   = 0;
  let gamePhi     = Math.PI / 2;
  let velTheta    = 0;
  let velPhi      = 0;
  let timeLeft    = GAME_SECS;
  let score       = 0;
  let beamCharge  = 0;
  let abductingCow   = null;
  let abductProgress = 0;
  let gameUfoZSpin   = 0;
  let _savedUfoPos   = null;
  let _savedUfoQuat  = null;
  const abductOrigPos    = new THREE.Vector3();
  const abductTargetPos  = new THREE.Vector3();

  // Live cow objects — { model, theta, phi, dTheta, dPhi, dirTimer }
  const cowObjects = [];

  const keys = { left: false, right: false, up: false, down: false, beam: false };

  // ── Tractor beam cone ────────────────────────────────────────────────────
  // ConeGeometry: tip at +Y (top), base at -Y (bottom).
  // We want tip at UFO (outward) and base spreading toward globe surface.
  // So rotate +Y axis to point outward (away from globe centre).
  const beamGeo = new THREE.ConeGeometry(1, 1, 16, 1, true);
  const beamMat = new THREE.MeshBasicMaterial({
    color: 0xffff44,
    transparent: true,
    opacity: 0.30,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  const beam = new THREE.Mesh(beamGeo, beamMat);
  beam.visible = false;
  globe.add(beam);

  // ── DOM refs ─────────────────────────────────────────────────────────────
  const hud        = document.getElementById('mg-hud');
  const hudScore   = document.getElementById('mg-score');
  const hudTime    = document.getElementById('mg-time');
  const gameOverEl = document.getElementById('mg-gameover');
  const finalScore = document.getElementById('mg-final-score');

  // ── Helpers ──────────────────────────────────────────────────────────────
  function angularDist(a, b) {
    const dot = a.clone().normalize().dot(b.clone().normalize());
    return Math.acos(Math.max(-1, Math.min(1, dot)));
  }

  function placeCowModel(cowObj) {
    const { theta, phi } = cowObj;
    const nx = Math.sin(phi) * Math.sin(theta);
    const ny = Math.cos(phi);
    const nz = Math.sin(phi) * Math.cos(theta);
    cowObj.model.position.set(COW_SURFACE_R * nx, COW_SURFACE_R * ny, COW_SURFACE_R * nz);
    // Stand the cow on the surface (local Y aligns with outward normal)
    cowObj.model.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(nx, ny, nz)
    );
  }

  function randomVelocity() {
    const angle = Math.random() * Math.PI * 2;
    const spd   = COW_SPEED * (0.5 + Math.random() * 0.8);
    return { dTheta: Math.cos(angle) * spd, dPhi: Math.sin(angle) * spd * 0.5 };
  }

  function respawnCow(cowObj) {
    cowObj.theta = Math.random() * Math.PI * 2;
    cowObj.phi   = Math.PI * 0.25 + Math.random() * Math.PI * 0.5;
    const v = randomVelocity();
    cowObj.dTheta    = v.dTheta;
    cowObj.dPhi      = v.dPhi;
    cowObj.dirTimer  = 2 + Math.random() * 4;
    cowObj.model.visible = true;
    placeCowModel(cowObj);
  }

  let _origCowScale = null;

  function applyGlow(model) {
    model.traverse(n => {
      if (n.isMesh && n.material && 'emissive' in n.material) {
        n.userData._origMat = n.material;
        n.material = n.material.clone();
        n.material.emissive.set(0x00ff66);
        n.material.emissiveIntensity = 0.1;
      }
    });
  }

  function removeGlow(model) {
    model.traverse(n => {
      if (n.isMesh && n.userData._origMat) {
        n.material.dispose();
        n.material = n.userData._origMat;
        delete n.userData._origMat;
      }
    });
  }

  function initCows() {
    const baseCow = getCow();
    if (!baseCow) return;

    // Capture original scale once (before we ever double it)
    if (!_origCowScale) _origCowScale = baseCow.scale.clone();

    // Remove previous clones
    cowObjects.forEach(c => { if (c.model !== baseCow) globe.remove(c.model); });
    cowObjects.length = 0;

    for (let i = 0; i < MAX_COWS; i++) {
      let model;
      if (i === 0) {
        model = baseCow;
      } else {
        // skeletonClone gives each copy its own independent skeleton,
        // which is required for SkinnedMesh models (plain .clone() shares
        // bone transforms so all copies render at the same position).
        model = skeletonClone(baseCow);
        globe.add(model);
      }
      model.scale.copy(_origCowScale).multiplyScalar(2);
      applyGlow(model);

      const cowObj = { model, theta: 0, phi: Math.PI / 2, dTheta: 0, dPhi: 0, dirTimer: 0 };
      cowObjects.push(cowObj);
      respawnCow(cowObj);
    }
  }

  function cleanupCows() {
    const baseCow = getCow();
    cowObjects.forEach(c => {
      if (c.model !== baseCow) {
        globe.remove(c.model);
      } else {
        removeGlow(c.model);
        c.model.visible = true;
        if (_origCowScale) c.model.scale.copy(_origCowScale);
      }
    });
    cowObjects.length = 0;
  }

  function updateCows(dt) {
    cowObjects.forEach(cow => {
      if (!cow.model.visible || cow === abductingCow) return;
      cow.dirTimer -= dt;
      if (cow.dirTimer <= 0) {
        const v = randomVelocity();
        cow.dTheta   = v.dTheta;
        cow.dPhi     = v.dPhi;
        cow.dirTimer = 2 + Math.random() * 4;
      }
      cow.theta += cow.dTheta * dt;
      cow.phi    = THREE.MathUtils.clamp(cow.phi + cow.dPhi * dt, Math.PI * 0.15, Math.PI * 0.85);
      placeCowModel(cow);
    });
  }

  function updateBeamMesh(ufo) {
    if (!beam.visible) return;
    const ufoPos  = ufo.position;
    const R       = ufoPos.length();
    const coneLen = Math.max(0.1, R - 1.02);
    const outward = ufoPos.clone().normalize(); // points away from globe (toward space)

    // Centre cone halfway between UFO and globe surface
    beam.position.copy(ufoPos).addScaledVector(outward, -coneLen * 0.5);
    beam.scale.set(coneLen * 0.22, coneLen, coneLen * 0.22);
    // Rotate so +Y (tip) points outward — tip sits at UFO, base spreads toward surface
    beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), outward);
  }

  // ── Keyboard ──────────────────────────────────────────────────────────────
  function onKeyDown(e) {
    if (!active) return;
    const managed = ['ArrowLeft','ArrowRight','ArrowUp','ArrowDown',' ','a','d','w','s','A','D','W','S'];
    if (managed.includes(e.key)) e.preventDefault();
    if (e.key === 'ArrowLeft'  || e.key === 'a' || e.key === 'A') keys.left  = true;
    if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') keys.right = true;
    if (e.key === 'ArrowUp'    || e.key === 'w' || e.key === 'W') keys.up    = true;
    if (e.key === 'ArrowDown'  || e.key === 's' || e.key === 'S') keys.down  = true;
    if (e.key === ' ')      keys.beam = true;
    if (e.key === 'Escape') stop();
  }

  function onKeyUp(e) {
    if (e.key === 'ArrowLeft'  || e.key === 'a' || e.key === 'A') keys.left  = false;
    if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') keys.right = false;
    if (e.key === 'ArrowUp'    || e.key === 'w' || e.key === 'W') keys.up    = false;
    if (e.key === 'ArrowDown'  || e.key === 's' || e.key === 'S') keys.down  = false;
    if (e.key === ' ') keys.beam = false;
  }

  // ── Public API ────────────────────────────────────────────────────────────
  function start() {
    const ufo = getUfo();
    if (!ufo) { console.warn('Minigame: UFO model not ready'); return; }

    _savedUfoPos  = ufo.position.clone();
    _savedUfoQuat = ufo.quaternion.clone();
    gameUfoZSpin  = 0;

    active         = true;
    score          = 0;
    timeLeft       = GAME_SECS;
    beamCharge     = 0;
    abductingCow   = null;
    abductProgress = 0;
    Object.keys(keys).forEach(k => { keys[k] = false; });

    const p = ufo.position;
    const R = p.length() || UFO_RADIUS;
    gameTheta = Math.atan2(p.x, p.z);
    gamePhi   = Math.acos(THREE.MathUtils.clamp(p.y / R, -1, 1));
    velTheta  = velPhi = 0;

    initCows();

    if (hud)        hud.classList.remove('hidden');
    if (gameOverEl) gameOverEl.classList.add('hidden');

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup',   onKeyUp);
  }

  function restoreUfo() {
    const ufo = getUfo();
    if (!ufo || !_savedUfoPos) return;
    ufo.position.copy(_savedUfoPos);
    ufo.quaternion.copy(_savedUfoQuat);
  }

  function endGame() {
    active = false;
    beam.visible = false;
    audio?.stopBeam?.();
    restoreUfo();
    cleanupCows();
    if (hud) hud.classList.add('hidden');
    if (gameOverEl) {
      gameOverEl.classList.remove('hidden');
      if (finalScore) finalScore.textContent = score;
    }
    document.removeEventListener('keydown', onKeyDown);
    document.removeEventListener('keyup',   onKeyUp);
    Object.keys(keys).forEach(k => { keys[k] = false; });
    audio?.playGameOver?.();
    _onEnd?.();
  }

  function stop() {
    if (gameOverEl) gameOverEl.classList.add('hidden');
    if (!active) {
      _onEnd?.();
      return;
    }
    active = false;
    beam.visible = false;
    audio?.stopBeam?.();
    restoreUfo();
    cleanupCows();
    if (hud) hud.classList.add('hidden');
    document.removeEventListener('keydown', onKeyDown);
    document.removeEventListener('keyup',   onKeyUp);
    Object.keys(keys).forEach(k => { keys[k] = false; });
    _onEnd?.();
  }

  document.getElementById('mg-restart')?.addEventListener('click', () => {
    if (gameOverEl) gameOverEl.classList.add('hidden');
    start();
  });
  document.getElementById('mg-quit')?.addEventListener('click', stop);
  document.getElementById('mg-exit')?.addEventListener('click', stop);

  // ── Per-frame update ──────────────────────────────────────────────────────
  function update(dt) {
    if (!active) return;
    const ufo = getUfo();
    if (!ufo) return;

    // Timer
    timeLeft -= dt;
    if (timeLeft <= 0) { timeLeft = 0; endGame(); return; }
    if (hudTime)  hudTime.textContent  = Math.ceil(timeLeft);
    if (hudScore) hudScore.textContent = score;

    // UFO movement with momentum
    if (keys.left)  velTheta -= ACCEL;
    if (keys.right) velTheta += ACCEL;
    if (keys.up)    velPhi   -= ACCEL;
    if (keys.down)  velPhi   += ACCEL;
    velTheta *= DAMP;
    velPhi   *= DAMP;
    velTheta  = THREE.MathUtils.clamp(velTheta, -MAX_VEL, MAX_VEL);
    velPhi    = THREE.MathUtils.clamp(velPhi,   -MAX_VEL, MAX_VEL);
    gameTheta += velTheta;
    gamePhi    = THREE.MathUtils.clamp(gamePhi + velPhi, 0.18, Math.PI - 0.18);

    ufo.position.set(
      UFO_RADIUS * Math.sin(gamePhi) * Math.sin(gameTheta),
      UFO_RADIUS * Math.cos(gamePhi),
      UFO_RADIUS * Math.sin(gamePhi) * Math.cos(gameTheta)
    );
    // Orient UFO: bottom faces globe, with a continuous z-axis roll for visual flair
    gameUfoZSpin += dt * 1.2;
    const _outward = ufo.position.clone().normalize();
    const _qAlign  = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), _outward);
    const _qSpin   = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), gameUfoZSpin);
    ufo.quaternion.copy(_qAlign).multiply(_qSpin);

    // Abduction fly-up animation
    if (abductingCow) {
      abductProgress += dt / ABDUCT_TIME;
      abductingCow.model.position.lerpVectors(abductOrigPos, abductTargetPos, Math.min(1, abductProgress));
      if (abductProgress >= 1) {
        score++;
        if (hudScore) hudScore.textContent = score;
        audio?.playAbduct?.();
        respawnCow(abductingCow);
        abductingCow = null;
        beamCharge   = 0;
      }
      beam.visible = true;
      beamMat.color.setHex(0x44ff44);
      updateBeamMesh(ufo);
      return;
    }

    // Walk all cows
    updateCows(dt);

    // Beam logic — target the nearest cow in range
    const beaming = keys.beam;
    let targetCow  = null;
    let targetDist = Infinity;

    cowObjects.forEach(cow => {
      if (!cow.model.visible) return;
      const d = angularDist(ufo.position, cow.model.position);
      if (d < BEAM_RANGE && d < targetDist) {
        targetDist = d;
        targetCow  = cow;
      }
    });

    const inRange = targetCow !== null;

    const prevBeamVisible = beam.visible;

    if (beaming && inRange) {
      beamCharge += dt;
      beam.visible = true;
      beamMat.color.setHex(0x44ff44);
      beamMat.opacity = 0.35 + 0.15 * Math.sin(beamCharge * 10);

      if (beamCharge >= BEAM_CHARGE) {
        abductingCow   = targetCow;
        abductProgress = 0;
        abductOrigPos.copy(targetCow.model.position);
        abductTargetPos.copy(ufo.position).multiplyScalar(0.85);
      }
    } else if (beaming) {
      beamCharge   = Math.max(0, beamCharge - dt * 3);
      beam.visible = true;
      beamMat.color.setHex(0xffff44);
      beamMat.opacity = 0.28;
    } else {
      beamCharge   = 0;
      beam.visible = false;
    }

    if (beam.visible && !prevBeamVisible) audio?.startBeam?.();
    if (!beam.visible && prevBeamVisible) audio?.stopBeam?.();

    updateBeamMesh(ufo);
  }

  return { start, stop, isActive: () => active, update, onEnd: (cb) => { _onEnd = cb; } };
}
