// Shrinks assets/models/ecorche.glb WITHOUT touching anything the renderer draws.
//
// The engine builds its own MeshStandardMaterial for every mesh and the file ships
// no textures, so UV sets and vertex colours are dead weight on device: they are
// uploaded to the GPU and parsed on every launch but can never affect a pixel.
// Positions, normals and all morph targets are kept at full float precision, so
// geometry fidelity is unchanged.
//
// Run from /app/frontend:  node scripts/optimizeAnatomyModel.mjs
// Requires @gltf-transform/core + /functions (dev-time only, not an app dependency).

import fs from "node:fs";
import { NodeIO, VertexLayout } from "@gltf-transform/core";
import { dedup, prune } from "@gltf-transform/functions";

const SRC = "assets/models/ecorche.glb";

// SEPARATE keeps one bufferView per attribute, exactly as the source file did.
// The interleaved default is valid glTF but changes how three exposes the data.
const io = new NodeIO().setVertexLayout(VertexLayout.SEPARATE);
const before = fs.statSync(SRC).size;
const doc = await io.read(SRC);

let dropped = 0;
for (const mesh of doc.getRoot().listMeshes()) {
  for (const prim of mesh.listPrimitives()) {
    for (const name of prim.listSemantics()) {
      if (name.startsWith("TEXCOORD_") || name.startsWith("COLOR_")) {
        prim.setAttribute(name, null);
        dropped++;
      }
    }
  }
}

await doc.transform(dedup(), prune());
await io.write(SRC, doc);

const after = fs.statSync(SRC).size;
console.log(`dropped ${dropped} attribute sets`);
console.log(`before ${(before / 1048576).toFixed(2)} MB → after ${(after / 1048576).toFixed(2)} MB (${Math.round((1 - after / before) * 100)}% smaller)`);
