// Anatomy model cache — the GLB is parsed ONCE per app session.
//
// Parsing `ecorche.glb` (237 meshes, ~132k triangles) and inflating its muscle
// meshes is the expensive half of opening a 3D surface. Doing it again for every
// tab — Muscle Groups, Insights, Explore, a lesson, a summary — is what made the
// views feel slow. Here it happens once: the parsed root is kept in module scope
// and every viewer gets a lightweight `clone(true)`, which SHARES the geometry
// (no re-upload of vertex data, no re-inflation) and only duplicates the node
// graph. Materials are replaced per engine anyway, so nothing is shared that a
// viewer is allowed to mutate.

import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

import { FLAGS } from "@/src/config/featureFlags";

let modelPromise: Promise<THREE.Object3D> | null = null;

/**
 * Resolves a per-viewer clone of the shared parsed model. `readBuffer` is only
 * ever called on the first request; a failure clears the cache so a retry can
 * genuinely try again.
 */
export function getAnatomyModel(readBuffer: () => Promise<ArrayBuffer>): Promise<THREE.Object3D> {
  if (!modelPromise) {
    modelPromise = readBuffer()
      .then((buffer) => parseOnce(buffer))
      .catch((e) => {
        modelPromise = null;
        throw e;
      });
  }
  return modelPromise.then((root) => root.clone(true));
}

/** Test/diagnostic hook: forget the parsed model. */
export function resetAnatomyModelCache() {
  modelPromise = null;
}

function parseOnce(buffer: ArrayBuffer): Promise<THREE.Object3D> {
  return new Promise((resolve, reject) => {
    const loader = new GLTFLoader();
    loader.parse(
      buffer,
      "",
      (gltf: any) => {
        const root = gltf.scene;
        // Geometry-level work belongs here: it is shared by every clone, so it
        // must run exactly once (running it twice would compound the inflation).
        if (FLAGS.gymPhysique) applyGymPhysique(root);
        const box = new THREE.Box3().setFromObject(root);
        const center = new THREE.Vector3();
        box.getCenter(center);
        root.position.sub(center);
        resolve(root);
      },
      (err: any) => reject(new Error(String(err?.message || err))),
    );
  });
}

// ---------- gym physique (bodybuilder-style inflation) ----------
//
// For every mesh whose name matches one of our known major-group prefixes,
// displace each vertex along its own vertex normal by a fraction of the mesh's
// smallest bounding-box half-extent. This "inflates" the muscle uniformly
// outward: the biceps peak grows, quads swell laterally, shoulders cap up.
// Because we edit the base position attribute (not any morph target), the shrink
// morph and all picking/materials continue to work unchanged.
const RULES: [RegExp, number][] = [
  [/^Pectoralis_Major/i, 0.08],
  [/^Pectoralis_Minor$/i, 0.06],
  [/^Serratus_Anterior$/i, 0.06],
  [/^Deltoid/i, 0.10],
  [/^Biceps_Brachii$/i, 0.10],
  [/^Brachialis$/i, 0.10],
  [/^Brachioradialis$/i, 0.08],
  [/^Triceps_/i, 0.10],
  [/^Latissimus_Dorsi$/i, 0.09],
  [/^Teres_(Major|Minor)$/i, 0.08],
  [/^Rhomboideus_/i, 0.06],
  [/^Trapezius$/i, 0.07],
  [/^Infraspinatus$/i, 0.05],
  [/^Supraspinatus$/i, 0.04],
  [/^Rectus_Abdominis$/i, 0.06],
  [/^External_Oblique$/i, 0.05],
  [/^Gluteus_Maximus$/i, 0.10],
  [/^Gluteus_(Medius|Minimus)$/i, 0.07],
  [/^Rectus_Femoris$/i, 0.09],
  [/^Vastus_/i, 0.09],
  [/^Biceps_Femoris_/i, 0.09],
  [/^Semi(tendinosus|membranosus)$/i, 0.09],
  [/^Adductor_/i, 0.07],
  [/^Gracilis$/i, 0.05],
  [/^Gastrocnemius/i, 0.10],
  [/^Soleus$/i, 0.09],
  [/^Tibialis_Anterior$/i, 0.06],
  [/^Sternocleidomastoid$/i, 0.06],
  [/^Psoas_Major$/i, 0.05],
];

function isBoneMesh(mesh: THREE.Object3D): boolean {
  let p: THREE.Object3D | null = mesh;
  while (p) {
    if (p.name === "Bones") return true;
    p = p.parent;
  }
  return false;
}

function applyGymPhysique(root: THREE.Object3D) {
  root.traverse((o: any) => {
    if (!o.isMesh) return;
    const mesh = o as THREE.Mesh;
    if (isBoneMesh(mesh)) return;
    let factor = 0;
    for (const [re, f] of RULES) {
      if (re.test(mesh.name)) {
        factor = f;
        break;
      }
    }
    if (factor === 0) return;
    inflateMesh(mesh, factor);
  });
}

function inflateMesh(mesh: THREE.Mesh, factor: number): boolean {
  const geom = mesh.geometry as THREE.BufferGeometry;
  const posAttr = geom.getAttribute("position") as THREE.BufferAttribute | undefined;
  if (!posAttr) return false;

  // Ensure we have per-vertex normals (a few pack meshes ship without them).
  let normAttr = geom.getAttribute("normal") as THREE.BufferAttribute | undefined;
  if (!normAttr) {
    geom.computeVertexNormals();
    normAttr = geom.getAttribute("normal") as THREE.BufferAttribute;
  }

  // Displacement magnitude = factor × min half-extent of the mesh's local AABB.
  geom.computeBoundingBox();
  const bb = geom.boundingBox!;
  const sx = (bb.max.x - bb.min.x) * 0.5;
  const sy = (bb.max.y - bb.min.y) * 0.5;
  const sz = (bb.max.z - bb.min.z) * 0.5;
  const characteristic = Math.min(sx, sy, sz);
  if (!isFinite(characteristic) || characteristic <= 0) return false;
  const delta = characteristic * factor;

  // Read/write through the attribute API, not the raw array: a GLB may store
  // POSITION and NORMAL interleaved in one buffer, where raw `array[i * 3]`
  // indexing would scatter the displacement across neighbouring attributes.
  for (let i = 0; i < posAttr.count; i++) {
    posAttr.setXYZ(
      i,
      posAttr.getX(i) + normAttr.getX(i) * delta,
      posAttr.getY(i) + normAttr.getY(i) * delta,
      posAttr.getZ(i) + normAttr.getZ(i) * delta,
    );
  }
  posAttr.needsUpdate = true;
  geom.computeVertexNormals(); // relight the inflated surface
  geom.computeBoundingBox();
  geom.computeBoundingSphere();
  return true;
}
