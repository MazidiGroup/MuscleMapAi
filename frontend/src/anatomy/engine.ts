import * as THREE from "three";

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
  /**
   * Frames still owed to the GL surface. The scene is static between gestures and
   * state changes, so we draw ON DEMAND instead of burning a frame 60× a second.
   * Two frames per change covers both buffers of the double-buffered surface.
   */
  private pending = 2;

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
    // expo-gl hands us a drawing buffer that is ALREADY device-scaled, so the
    // renderer's own ratio stays at 1: the effective pixel ratio can never climb
    // past the 2× cap we want on high-density screens.
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

  /**
   * Adopts an already-parsed model (a clone from `modelCache`). The engine never
   * parses the GLB itself, so opening a second 3D surface costs a node-graph
   * clone rather than a full re-parse.
   */
  setModel(root: THREE.Object3D) {
    try {
      this.onLoaded(root);
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

    // The gym-physique inflation is geometry-level work and already ran once in
    // `modelCache`, on the geometry every clone shares.

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
    if (this.pending <= 0) return;
    this.pending--;
    this.renderer.render(this.scene, this.camera);
    if (this.gl.endFrameEXP) this.gl.endFrameEXP();
  };

  /** Requests a redraw. Every state change that can alter a pixel calls this. */
  private markDirty() {
    this.pending = 2;
  }

  private updateCamera() {
    const sinPhi = Math.sin(this.phi);
    const x = this.target.x + this.radius * sinPhi * Math.sin(this.theta);
    const y = this.target.y + this.radius * Math.cos(this.phi);
    const z = this.target.z + this.radius * sinPhi * Math.cos(this.theta);
    this.camera.position.set(x, y, z);
    this.camera.lookAt(this.target);
    this.markDirty();
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
    this.markDirty();
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
    this.markDirty();
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
      // Materials are created per engine, so they are ours to free. GEOMETRY is
      // NOT: it belongs to the cached parse that every viewer clones from, and
      // disposing it here would blank the next 3D surface the user opens.
      this.meshes.forEach((m) => {
        const mat = m.material as THREE.Material | THREE.Material[];
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
        else mat?.dispose?.();
      });
      if (this.model) this.scene.remove(this.model);
      this.scene.clear();
      this.renderer?.dispose?.();
      this.renderer?.forceContextLoss?.();
    } catch {}
    this.meshes = [];
    this.morphMeshes = [];
    this.byName.clear();
    this.model = null;
  }
}
