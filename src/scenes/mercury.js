// Placeholder scene: replaced by the real implementation.
export default function create(ctx) {
  const { THREE } = ctx;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  camera.position.set(0, 0, 5);
  const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 3), new THREE.MeshBasicMaterial({ color: 0x888888, wireframe: true }));
  scene.add(mesh);
  return {
    id: 'mercury', scene, camera,
    update(dt) { mesh.rotation.y += dt * 0.3; },
    resize(w, h) { camera.aspect = w / h; camera.updateProjectionMatrix(); },
    caption: () => ({ eyebrow: 'mercury', title: 'Placeholder', body: '<p>Scene not built yet.</p>' }),
  };
}
