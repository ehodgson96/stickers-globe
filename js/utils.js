export function latLngToVector3(lat, lng) {
  const phi = ((90 - lat) * Math.PI) / 180;
  const theta = ((lng + 180) * Math.PI) / 180;
  const x = -Math.sin(phi) * Math.cos(theta);
  const y = Math.cos(phi);
  const z = Math.sin(phi) * Math.sin(theta);
  return new THREE.Vector3(x, y, z).normalize();
}

export function vectorToAngles(v) {
  const vn = v.clone().normalize();
  const phi = Math.acos(THREE.MathUtils.clamp(vn.y, -1, 1));
  const theta = Math.atan2(vn.x, vn.z);
  return { theta, phi };
}

export function shortestAngleDelta(a, b) {
  let d = b - a;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
}

export function easeInOutQuad(t) {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

export function animateOrbit(orbit, targetTheta, targetPhi, updateCallback, duration = 700) {
  return new Promise((resolve) => {
    const token = { cancel: false };
    const startTheta = orbit.theta;
    const startPhi = orbit.phi;
    const dTheta = shortestAngleDelta(startTheta, targetTheta);
    const dPhi = targetPhi - startPhi;
    const t0 = Date.now();

    function step() {
      if (token.cancel) return resolve(token);
      const t = Math.min((Date.now() - t0) / duration, 1);
      const e = easeInOutQuad(t);

      orbit.theta = startTheta + dTheta * e;
      orbit.phi = startPhi + dPhi * e;
      updateCallback();

      if (t < 1) requestAnimationFrame(step);
      else resolve(token);
    }
    
    requestAnimationFrame(step);
    return token;
  });
}
