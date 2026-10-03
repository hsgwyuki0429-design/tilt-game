/*
 * Bundle the part of three.js the renderer uses into one classic script,
 * src/vendor/three.js, exposing a global THREE.
 *
 *   node tools/build-three.mjs
 *
 * The game has no build step and must still open straight off disk, where
 * ES modules are refused; so the WebGL library is vendored as a plain script.
 * Only what src/render.js names is exported, which keeps the file small.
 */
import { build } from 'esbuild';
import { readFileSync } from 'fs';

const version = JSON.parse(readFileSync(new URL('../node_modules/three/package.json', import.meta.url))).version;
const names = [
  'WebGLRenderer', 'Scene', 'PerspectiveCamera', 'Group', 'Mesh', 'InstancedMesh', 'Object3D',
  'BufferGeometry', 'BufferAttribute', 'Float32BufferAttribute', 'InstancedBufferAttribute',
  'PlaneGeometry', 'CircleGeometry', 'CylinderGeometry', 'ConeGeometry', 'SphereGeometry', 'BoxGeometry',
  'ExtrudeGeometry', 'Shape', 'Path', 'ShapeGeometry', 'RingGeometry', 'TetrahedronGeometry',
  'IcosahedronGeometry', 'OctahedronGeometry', 'TorusGeometry', 'LatheGeometry', 'CapsuleGeometry',
  'MeshStandardMaterial', 'MeshPhysicalMaterial', 'MeshBasicMaterial', 'MeshLambertMaterial',
  'ShadowMaterial', 'ShaderMaterial', 'SpriteMaterial', 'Sprite',
  'HemisphereLight', 'DirectionalLight', 'AmbientLight', 'PointLight',
  'CanvasTexture', 'Texture', 'DataTexture', 'PMREMGenerator',
  'Color', 'Vector2', 'Vector3', 'Vector4', 'Matrix4', 'Quaternion', 'Euler', 'MathUtils', 'Box3', 'Sphere',
  'SRGBColorSpace', 'LinearSRGBColorSpace', 'PCFSoftShadowMap', 'PCFShadowMap', 'VSMShadowMap',
  'NeutralToneMapping', 'ACESFilmicToneMapping', 'AgXToneMapping', 'NoToneMapping',
  'AdditiveBlending', 'NormalBlending', 'MultiplyBlending', 'DoubleSide', 'FrontSide', 'BackSide',
  'RepeatWrapping', 'ClampToEdgeWrapping', 'MirroredRepeatWrapping', 'LinearFilter',
  'LinearMipmapLinearFilter', 'EquirectangularReflectionMapping', 'NearestFilter', 'RGBAFormat', 'UnsignedByteType', 'FloatType', 'HalfFloatType',
  'Raycaster', 'REVISION'
];
const entry = `export { ${names.join(', ')} } from 'three';
export { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
export { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
export { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
`;
await build({
  stdin: { contents: entry, resolveDir: new URL('..', import.meta.url).pathname, loader: 'js' },
  bundle: true, minify: true, format: 'iife', globalName: 'THREE', target: ['es2018'],
  legalComments: 'none',
  banner: { js: `/* three.js r${version.split('.')[1]} (MIT, https://threejs.org) — bundled by tools/build-three.mjs */` },
  outfile: new URL('../src/vendor/three.js', import.meta.url).pathname
});
console.log('wrote src/vendor/three.js from three ' + version);
