// Camera moves across huge scale ranges: the target moves linearly, the view direction
// slerps, and the distance interpolates in log space (km -> cm feels like a smooth zoom).

export function createCameraTween(THREE, camera, controls) {
  let job = null;
  const ease = t => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
  return {
    go(position, target, duration = 1.6) {
      const fromT = controls.target.clone();
      const fromOff = camera.position.clone().sub(fromT);
      const toT = target.clone();
      const toOff = position.clone().sub(toT);
      job = {
        t: 0, duration, fromT, toT,
        fromD: Math.max(1e-9, fromOff.length()), toD: Math.max(1e-9, toOff.length()),
        fromQ: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), fromOff.normalize()),
        toQ: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), toOff.normalize()),
      };
    },
    get busy() { return !!job; },
    cancel() { job = null; },
    tick(dt) {
      if (!job) return;
      job.t = Math.min(1, job.t + dt / job.duration);
      const k = ease(job.t);
      const q = job.fromQ.clone().slerp(job.toQ, k);
      const dir = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
      const d = Math.exp(Math.log(job.fromD) + (Math.log(job.toD) - Math.log(job.fromD)) * k);
      controls.target.lerpVectors(job.fromT, job.toT, k);
      camera.position.copy(controls.target).addScaledVector(dir, d);
      if (job.t >= 1) job = null;
    },
  };
}
