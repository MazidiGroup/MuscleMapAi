// The React Native build consumes Three.js at runtime through expo-three. The
// package version in this release does not expose declarations, so keep the
// narrow surface used by our anatomy renderer typed locally instead of making
// the whole project `any` or adding a second runtime dependency.
declare module "three" {
  export const DoubleSide: number;
  export const SRGBColorSpace: string;

  export class Vector2 {
    constructor(x?: number, y?: number);
  }
  export class Vector3 {
    x: number; y: number; z: number;
    constructor(x?: number, y?: number, z?: number);
    set(x: number, y: number, z: number): this;
    sub(v: Vector3): this;
    copy(v: Vector3): this;
    addScaledVector(v: Vector3, scale: number): this;
  }
  export class Color {
    constructor(value?: string | number);
    clone(): Color;
    copy(value: Color): this;
    lerp(value: Color, alpha: number): this;
    set(value: string | number | Color): this;
    setRGB(r: number, g: number, b: number): this;
    multiplyScalar(value: number): this;
  }
  export class Object3D {
    name: string;
    parent: Object3D | null;
    position: Vector3;
    visible: boolean;
    userData: Record<string, any>;
    clone(recursive?: boolean): Object3D;
    add(...objects: Object3D[]): this;
    remove(...objects: Object3D[]): this;
    clear(): this;
    traverse(callback: (object: Object3D) => void): void;
  }
  export class Material {
    opacity: number;
    transparent: boolean;
    needsUpdate: boolean;
    dispose(): void;
  }
  export class MeshStandardMaterial extends Material {
    color: Color;
    emissive: Color;
    emissiveIntensity: number;
    side: number;
    constructor(parameters?: Record<string, any>);
  }
  export class BufferAttribute {
    count: number;
    needsUpdate: boolean;
    getX(index: number): number;
    getY(index: number): number;
    getZ(index: number): number;
    setXYZ(index: number, x: number, y: number, z: number): this;
  }
  export class BufferGeometry {
    boundingBox: Box3 | null;
    getAttribute(name: string): BufferAttribute | undefined;
    computeVertexNormals(): void;
    computeBoundingBox(): void;
    computeBoundingSphere(): void;
    dispose(): void;
  }
  export class Mesh extends Object3D {
    isMesh: boolean;
    geometry: BufferGeometry;
    material: Material | Material[];
    morphTargetInfluences?: number[];
  }
  export class Scene extends Object3D { background: Color | null; }
  export class PerspectiveCamera extends Object3D {
    fov: number;
    aspect: number;
    matrix: { extractBasis(xAxis: Vector3, yAxis: Vector3, zAxis: Vector3): void };
    constructor(fov?: number, aspect?: number, near?: number, far?: number);
    lookAt(target: Vector3): void;
    updateProjectionMatrix(): void;
  }
  export class Raycaster {
    setFromCamera(coords: Vector2, camera: PerspectiveCamera): void;
    intersectObjects(objects: Object3D[], recursive?: boolean): { object: Object3D }[];
  }
  export class Box3 {
    min: Vector3; max: Vector3;
    setFromObject(object: Object3D): this;
    getCenter(target: Vector3): Vector3;
    getSize(target: Vector3): Vector3;
  }
  export class WebGLRenderer {
    outputColorSpace?: string;
    constructor(parameters?: Record<string, any>);
    setPixelRatio(value: number): void;
    setSize(width: number, height: number, updateStyle?: boolean): void;
    setClearColor(color: string | number, alpha?: number): void;
    render(scene: Scene, camera: PerspectiveCamera): void;
    dispose(): void;
  }
  export class AmbientLight extends Object3D { constructor(color?: number, intensity?: number); }
  export class HemisphereLight extends Object3D { constructor(skyColor?: number, groundColor?: number, intensity?: number); }
  export class DirectionalLight extends Object3D { constructor(color?: number, intensity?: number); }
}

declare module "three/examples/jsm/loaders/GLTFLoader.js" {
  export class GLTFLoader {
    parse(
      data: ArrayBuffer,
      path: string,
      onLoad: (gltf: { scene: import("three").Object3D }) => void,
      onError?: (error: unknown) => void,
    ): void;
  }
}
