import io
p = 'src/anatomy/engine.ts'
s = open(p).read()

def rep(a, b):
    global s
    assert a in s, a[:70]
    s = s.replace(a, b, 1)

OLD_LOAD = """  async loadModel(buffer: ArrayBuffer) {
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
  }"""

NEW_LOAD = """  async loadModel(buffer: ArrayBuffer) {
    try {
      const master = await parseOnce(buffer);
      // clone(true) re-uses the parsed graph AND shares the geometry buffers, so moving
      // between the Muscle Group, Insights and Explorer views never parses 5.3 MB /
      // 237 meshes again -- only the light per-view materials are new.
      this.onLoaded(master.clone(true));
    } catch (e: any) {
      this.cb.onError?.(String(e?.message || e));
    }
  }"""
rep(OLD_LOAD, NEW_LOAD)

rep("""    if (FLAGS.gymPhysique) {
      this.applyGymPhysique();
    }""",
"""    // The physique inflation edits vertex positions, and geometry is SHARED with the
    // cached master -- so it must run exactly once per app session, not once per view.
    if (FLAGS.gymPhysique && !physiqueApplied) {
      physiqueApplied = true;
      this.applyGymPhysique();
    }""")

rep("""  private animate = () => {
    if (!this.running) return;
    requestAnimationFrame(this.animate);
    this.renderer.render(this.scene, this.camera);
    if (this.gl.endFrameEXP) this.gl.endFrameEXP();
  };""",
"""  private animate = () => {
    if (!this.running) return;
    requestAnimationFrame(this.animate);
    // On-demand rendering: the anatomy scene is static unless the user is interacting or
    // a highlight changed, so an idle view costs one cheap callback per frame instead of
    // a full draw of 237 meshes.
    if (!this.needsRender) return;
    this.needsRender = false;
    this.renderer.render(this.scene, this.camera);
    if (this.gl.endFrameEXP) this.gl.endFrameEXP();
  };

  /** Marks the next frame as worth drawing. */
  invalidate() {
    this.needsRender = true;
  }

  /**
   * Suspends the loop entirely while the view is off-screen. A hidden tab keeps its GL
   * context alive, so without this every mounted viewer would keep ticking forever.
   */
  setActive(active: boolean) {
    if (active === this.running) return;
    this.running = active;
    if (active) {
      this.needsRender = true;
      this.animate();
    }
  }""")

rep("  private updateCamera() {", "  private updateCamera() {\n    this.needsRender = true;")
rep("  refresh() {", "  refresh() {\n    this.needsRender = true;")
rep("""        (m.material as THREE.Material).dispose();
        m.geometry.dispose();""",
"""        (m.material as THREE.Material).dispose();
        // Geometry is intentionally NOT disposed: it belongs to the cached master and is
        // shared by every viewer. It is freed with the cache, never with a single view.""")
rep("  private running = true;", "  private running = true;\n  private needsRender = true;")

# module-level cache, inserted before the class declaration
import re
m = re.search(r"^export class ", s, flags=re.M)
assert m
cache = """// ---------- one parsed model for the whole app ----------
// The shipped GLB is pure geometry (237 meshes, no textures), and parsing it is the
// expensive part -- not the download. It is parsed ONCE and every view clones the
// result, so a tab switch costs a graph clone instead of a 5.3 MB re-parse.
let masterRoot: THREE.Object3D | null = null;
let masterPromise: Promise<THREE.Object3D> | null = null;
let physiqueApplied = false;

function parseOnce(buffer: ArrayBuffer): Promise<THREE.Object3D> {
  if (masterRoot) return Promise.resolve(masterRoot);
  if (!masterPromise) {
    masterPromise = new Promise<THREE.Object3D>((resolve, reject) => {
      new GLTFLoader().parse(
        buffer,
        "",
        (gltf) => {
          masterRoot = gltf.scene;
          resolve(masterRoot);
        },
        (err: any) => {
          masterPromise = null;
          reject(err instanceof Error ? err : new Error(String(err?.message || err)));
        },
      );
    });
  }
  return masterPromise;
}

"""
s = s[:m.start()] + cache + s[m.start():]
open(p, 'w').write(s)
print("engine ok")
