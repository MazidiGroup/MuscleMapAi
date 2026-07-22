import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

import { FLAGS } from "@/src/config/featureFlags";

// React Native (Hermes) defines a global `navigator` object but leaves
// `navigator.userAgent` undefined. three.js GLTFLoader does
// `navigator.userAgent.match(...)` for browser detection, which throws
// "cannot read property 'match' of undefined" on device. Provide a safe
// string default so the loader's browser checks no-op. (No effect on web,
// where userAgent is already a real string.)
if (typeof navigator !== "undefined" && navigator.userAgent == null) {
  try {
    (navigator as any).userAgent = "react-native";
  } catch {
    // navigator.userAgent may be a read-only getter on some platforms; ignore.
  }
}

// ---- colour palette (programmatic, no textures) ----
const COL_BONE = new THREE.Color("#E8E1CE");
const COL_MUSCLE = new THREE.Color("#B0473F");
const COL_MUSCLE_DEEP = new THREE.Color("#8C3A36");
const COL_PRIMARY = new THREE.Color("#FF4438");
const COL_SECONDARY = new THREE.Color("#FFB020");
const COL_DIM = new THREE.Color("#3A3D45");
const COL_SELECT = new THREE.Color("#34C7FF");
const GLOW_SELECT = new THREE.Color("#1E9BFF");

type MeshUD = {
  unitName: string;
  ancestors: Set<string>;
  isBone: boolean;
  base: THREE.Color;
};

export type EngineCallbacks = {
  onReady?: () => void;
  onError?: (msg: string) => void;
};

export class AnatomyEngine {
  private gl: any;
  private renderer: any;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private raycaster = new THREE.Raycaster();
  private model: THREE.Object3D | null = null;
  private meshes: THREE.Mesh[] = [];
  private morphMeshes: THREE.Mesh[] = [];
  private byName: Map<string, THREE.Object3D> = new Map();
  private running = true;
  private cb: EngineCallbacks;

  // orbit state
  private target = new THREE.Vector3(0, 0, 0);
  private radius = 4;
  private theta = 0; // azimuth
  private phi = Math.PI / 2; // polar
  private homeRadius = 4;

  // view state
  private mode: "explore" | "workout" | "recovery" = "explore";
  private selected: string | null = null;
  private primary = new Set<string>();
  private secondary = new Set<string>();
  private recoveryMap: Record<string, string> = {};
  private hidden = new Set<string>(); // hidden container names
  private isolate: string | null = null; // container to isolate

  constructor(gl: any, cb: EngineCallbacks = {}) {
    this.gl = gl;
    this.cb = cb;

    const width = gl.drawingBufferWidth;
    const height = gl.drawingBufferHeight;

    // Bind three's WebGLRenderer directly to the expo-gl context via a
    // minimal fake canvas (version-independent, works on web + native).
    const fakeCanvas: any = {
      width,
      height,
      clientWidth: width,
      clientHeight: height,
      style: {},
      addEventListener: () => {},
      removeEventListener: () => {},
      getContext: () => gl,
      setAttribute: () => {},
    };
    this.renderer = new THREE.WebGLRenderer({
      canvas: fakeCanvas,
      context: gl as any,
      antialias: true,
      alpha: false,
    });
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(width, height, false);
    this.renderer.setClearColor(0x070a0f, 1);
    if (this.renderer.outputColorSpace !== undefined) {
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    }

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x070a0f);

    this.camera = new THREE.PerspectiveCamera(42, width / height, 0.01, 5000);

    // lighting rig
    const hemi = new THREE.HemisphereLight(0xdfe9ff, 0x1a1208, 1.0);
    this.scene.add(hemi);
    const key = new THREE.DirectionalLight(0xffffff, 1.6);
    key.position.set(2, 4, 5);
    this.scene.add(key);
    const fill = new THREE.DirectionalLight(0x9fb6ff, 0.7);
    fill.position.set(-4, 1, -3);
    this.scene.add(fill);
    const rim = new THREE.DirectionalLight(0xffffff, 0.8);
    rim.position.set(0, 3, -6);
    this.scene.add(rim);
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.35));

    this.animate();
  }

  async loadModel(buffer: ArrayBuffer) {
    try {
      const loader = new GLTFLoader();
      loader.parse(
        buffer,
        "",
        (gltf) => this.onLoaded(gltf.scene),
        (err: any) => this.cb.onError?.(String(err?.message || err)),
      );
    } catch (e: any) {
      this.cb.onError?.(String(e?.message || e));
    }
  }

  private onLoaded(root: THREE.Object3D) {
    this.model = root;

    // index every named node
    root.traverse((o) => {
      if (o.name) this.byName.set(o.name, o);
    });

    root.traverse((o: any) => {
      if (!o.isMesh) return;
      const mesh = o as THREE.Mesh;

      // gather ancestor names
      const ancestors = new Set<string>();
      let p: THREE.Object3D | null = mesh;
      while (p) {
        if (p.name) ancestors.add(p.name);
        p = p.parent;
      }
      const isBone = ancestors.has("Bones");
      const base = isBone ? COL_BONE.clone() : COL_MUSCLE.clone();

      // give each mesh its own standard material so we can recolour individually
      const mat = new THREE.MeshStandardMaterial({
        color: base.clone(),
        roughness: isBone ? 0.6 : 0.78,
        metalness: 0.02,
        flatShading: false,
      });
      mat.side = THREE.DoubleSide;
      mesh.material = mat;

      const ud: MeshUD = { unitName: mesh.name, ancestors, isBone, base };
      mesh.userData.anat = ud;

      this.meshes.push(mesh);
      if (mesh.morphTargetInfluences && mesh.morphTargetInfluences.length > 0) {
        this.morphMeshes.push(mesh);
      }
    });

    // Give muscles a gym-style physique by inflating major-group meshes along
    // their vertex normals. Runs once at load, before framing/scene add so the
    // updated bounding box is used for the camera fit.
    if (FLAGS.gymPhysique) {
      this.applyGymPhysique();
    }

    // centre + frame
    const box = new THREE.Box3().setFromObject(root);
    const center = new THREE.Vector3();
    box.getCenter(center);
    root.position.sub(center); // move model so its centre sits at origin

    const size = new THREE.Vector3();
    box.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z);
    const fov = (this.camera.fov * Math.PI) / 180;
    this.homeRadius = (maxDim / (2 * Math.tan(fov / 2))) * 1.25;
    this.radius = this.homeRadius;
    this.target.set(0, 0, 0);
    this.theta = 0; // anterior (front) view
    this.phi = Math.PI / 2;

    this.scene.add(root);
    this.updateCamera();
    this.refresh();
    this.cb.onReady?.();
  }

  // ---------- render loop ----------
  private animate = () => {
    if (!this.running) return;
    requestAnimationFrame(this.animate);
    this.renderer.render(this.scene, this.camera);
    if (this.gl.endFrameEXP) this.gl.endFrameEXP();
  };

  private updateCamera() {
    const sinPhi = Math.sin(this.phi);
    const x = this.target.x + this.radius * sinPhi * Math.sin(this.theta);
    const y = this.target.y + this.radius * Math.cos(this.phi);
    const z = this.target.z + this.radius * sinPhi * Math.cos(this.theta);
    this.camera.position.set(x, y, z);
    this.camera.lookAt(this.target);
  }

  // ---------- gestures ----------
  rotate(dx: number, dy: number) {
    this.theta -= dx * 0.01;
    this.phi -= dy * 0.01;
    const eps = 0.05;
    this.phi = Math.max(eps, Math.min(Math.PI - eps, this.phi));
    this.updateCamera();
  }

  zoom(scale: number) {
    this.radius *= scale;
    this.radius = Math.max(this.homeRadius * 0.25, Math.min(this.homeRadius * 3.5, this.radius));
    this.updateCamera();
  }

  pan(dx: number, dy: number) {
    const factor = this.radius * 0.0015;
    const right = new THREE.Vector3();
    const up = new THREE.Vector3();
    this.camera.matrix.extractBasis(right, up, new THREE.Vector3());
    this.target.addScaledVector(right, -dx * factor);
    this.target.addScaledVector(up, dy * factor);
    this.updateCamera();
  }

  resetView() {
    this.isolate = null;
    this.radius = this.homeRadius;
    this.target.set(0, 0, 0);
    this.theta = Math.PI;
    this.phi = Math.PI / 2;
    this.updateCamera();
    this.refresh();
  }

  // ---------- picking ----------
  pick(nx: number, ny: number): string | null {
    if (!this.model) return null;
    this.raycaster.setFromCamera(new THREE.Vector2(nx, ny), this.camera);
    const visibleMeshes = this.meshes.filter((m) => m.visible && this.isShown(m));
    const hits = this.raycaster.intersectObjects(visibleMeshes, false);
    if (hits.length === 0) return null;
    const name = (hits[0].object as THREE.Mesh).name;
    return name || null;
  }

  // ---------- view state setters ----------
  setMode(mode: "explore" | "workout" | "recovery") {
    this.mode = mode;
    this.refresh();
  }

  setRecovery(map: Record<string, string>) {
    this.recoveryMap = map || {};
    this.refresh();
  }

  setSelected(name: string | null) {
    this.selected = name;
    this.refresh();
  }

  setHighlight(primary: string[], secondary: string[]) {
    this.primary = new Set(primary);
    this.secondary = new Set(secondary);
    this.refresh();
  }

  setShrink(t: number) {
    const v = Math.max(0, Math.min(1, t));
    for (const m of this.morphMeshes) {
      const inf = m.morphTargetInfluences!;
      for (let i = 0; i < inf.length; i++) inf[i] = v;
    }
  }

  // ---------- gym physique (bodybuilder-style inflation) ----------
  //
  // For every mesh whose unit name matches one of our known major-group
  // prefixes, displace each vertex along its own vertex normal by a fraction
  // of the mesh's smallest bounding-box half-extent. This "inflates" the
  // muscle uniformly outward: the biceps peak grows, quads swell laterally,
  // shoulders cap up — exactly the way real gym growth reads. Because we edit
  // the base position attribute (not any morph target), the shrink morph and
  // all picking/materials continue to work unchanged.
  //
  // We recompute vertex normals afterwards so lighting stays correct.
  private applyGymPhysique() {
    // Athletic-athlete defaults. Values are a fraction of each mesh's smallest
    // bounding-box half-extent — enough to look lean and trained, not bulky.
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

    const inflatedCount = { n: 0 };
    for (const mesh of this.meshes) {
      const ud = mesh.userData.anat as MeshUD | undefined;
      if (!ud || ud.isBone) continue;
      let factor = 0;
      for (const [re, f] of RULES) {
        if (re.test(ud.unitName)) {
          factor = f;
          break;
        }
      }
      if (factor === 0) continue;
      if (this.inflateMesh(mesh, factor)) inflatedCount.n++;
    }
    // Uncomment to debug in dev
    // console.log(`[gymPhysique] inflated ${inflatedCount.n} muscle meshes`);
  }

  private inflateMesh(mesh: THREE.Mesh, factor: number): boolean {
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

    const p = posAttr.array as Float32Array;
    const n = normAttr.array as Float32Array;
    for (let i = 0; i < posAttr.count; i++) {
      const j = i * 3;
      p[j] += n[j] * delta;
      p[j + 1] += n[j + 1] * delta;
      p[j + 2] += n[j + 2] * delta;
    }
    posAttr.needsUpdate = true;
    geom.computeVertexNormals(); // relight the inflated surface
    geom.computeBoundingBox();
    geom.computeBoundingSphere();
    return true;
  }

  toggleHidden(container: string) {
    if (this.hidden.has(container)) this.hidden.delete(container);
    else this.hidden.add(container);
    this.refresh();
  }

  setHidden(containers: string[]) {
    this.hidden = new Set(containers);
    this.refresh();
  }

  isHidden(container: string) {
    return this.hidden.has(container);
  }

  showAll() {
    this.hidden.clear();
    this.isolate = null;
    this.refresh();
  }

  focusContainer(container: string | null) {
    this.isolate = container;
    this.selected = null;
    if (container && this.byName.has(container)) {
      const node = this.byName.get(container)!;
      const box = new THREE.Box3().setFromObject(node);
      const center = new THREE.Vector3();
      box.getCenter(center);
      const size = new THREE.Vector3();
      box.getSize(size);
      const maxDim = Math.max(size.x, size.y, size.z) || this.homeRadius;
      const fov = (this.camera.fov * Math.PI) / 180;
      this.target.copy(center);
      this.radius = Math.max(this.homeRadius * 0.3, (maxDim / (2 * Math.tan(fov / 2))) * 1.6);
      this.updateCamera();
    } else {
      this.resetView();
      return;
    }
    this.refresh();
  }

  focusUnit(name: string) {
    const node = this.byName.get(name);
    if (!node) return;
    this.selected = name;
    const box = new THREE.Box3().setFromObject(node);
    const center = new THREE.Vector3();
    box.getCenter(center);
    const size = new THREE.Vector3();
    box.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    const fov = (this.camera.fov * Math.PI) / 180;
    this.target.copy(center);
    this.radius = Math.max(this.homeRadius * 0.18, (maxDim / (2 * Math.tan(fov / 2))) * 2.4);
    this.updateCamera();
    this.refresh();
  }

  // is this mesh shown given hidden + isolate filters
  private isShown(m: THREE.Mesh): boolean {
    const ud = m.userData.anat as MeshUD;
    if (!ud) return true;
    for (const h of this.hidden) {
      if (ud.ancestors.has(h)) return false;
    }
    if (this.isolate) {
      if (!ud.ancestors.has(this.isolate)) return false;
    }
    return true;
  }

  // recompute visibility + colour for every mesh
  refresh() {
    for (const m of this.meshes) {
      const ud = m.userData.anat as MeshUD;
      const mat = m.material as THREE.MeshStandardMaterial;
      const shown = this.isShown(m);
      m.visible = shown;
      if (!shown) continue;

      mat.transparent = false;
      mat.opacity = 1;
      mat.emissive.setRGB(0, 0, 0);
      mat.emissiveIntensity = 1;

      if (this.mode === "recovery") {
        if (ud.isBone) {
          mat.color.copy(COL_BONE).multiplyScalar(0.6);
        } else {
          const hex = this.recoveryMap[ud.unitName] || "#2FBF71"; // default = recovered (green)
          mat.color.set(hex);
          mat.emissive.set(hex);
          mat.emissiveIntensity = 0.18;
        }
      } else if (this.mode === "workout") {
        if (this.primary.has(ud.unitName)) {
          mat.color.copy(COL_PRIMARY);
          mat.emissive.copy(COL_PRIMARY);
          mat.emissiveIntensity = 0.28;
        } else if (this.secondary.has(ud.unitName)) {
          mat.color.copy(COL_SECONDARY);
          mat.emissive.copy(COL_SECONDARY);
          mat.emissiveIntensity = 0.16;
        } else if (ud.isBone) {
          mat.color.copy(COL_BONE).multiplyScalar(0.85);
        } else {
          mat.color.copy(COL_DIM);
          mat.transparent = true;
          mat.opacity = 0.5;
        }
      } else {
        // explore mode
        if (this.selected && ud.unitName === this.selected) {
          mat.color.copy(COL_SELECT);
          mat.emissive.copy(GLOW_SELECT);
          mat.emissiveIntensity = 0.55;
        } else {
          mat.color.copy(ud.base);
          if (this.selected && !ud.isBone) {
            mat.color.copy(ud.base).lerp(COL_MUSCLE_DEEP, 0.25);
          }
        }
      }
    }
  }

  dispose() {
    this.running = false;
    try {
      this.meshes.forEach((m) => {
        (m.material as THREE.Material).dispose();
        m.geometry.dispose();
      });
      this.renderer?.dispose?.();
    } catch {}
    this.meshes = [];
    this.morphMeshes = [];
    this.byName.clear();
    this.model = null;
  }
}
