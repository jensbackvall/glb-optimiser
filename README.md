# GLB Optimizer

A self-hosted 3D model converter and optimizer built on [glTF-Transform](https://github.com/donmccurdy/glTF-Transform), [assimpjs](https://github.com/kovacsv/assimpjs), and [occt-import-js](https://github.com/kovacsv/occt-import-js).

## Features

### Format Conversion

Convert common 3D formats to GLB automatically before optimization:

| Format | Engine | Notes |
|---|---|---|
| OBJ | assimpjs (WASM) | With materials (.mtl) |
| FBX | assimpjs (WASM) | Including animations |
| STL | assimpjs (WASM) | Mesh-only format |
| DAE (Collada) | assimpjs (WASM) | Open XML format |
| STEP / STP | occt-import-js (OpenCascade WASM) | CAD parametric → triangulated mesh |
| IGES / IGS | occt-import-js (OpenCascade WASM) | CAD parametric → triangulated mesh |

### Optimization

- **Texture compression** — Convert to WebP, JPEG, PNG, or AVIF with configurable max resolution
- **Deduplication** — Remove duplicate accessors, meshes, textures, and materials
- **Prune** — Remove unused/unreferenced resources
- **Draco compression** — KHR_draco_mesh_compression for geometry
- **Mesh simplification** — Reduce triangle count via meshoptimizer with configurable ratio
- **GPU instancing** — EXT_mesh_gpu_instancing for repeated meshes
- **Flatten** — Flatten scene graph hierarchy
- **Join** — Merge compatible primitives to reduce draw calls
- **Weld** — Merge bitwise-identical vertices

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) v18 or later

### Install and run

```bash
git clone https://github.com/jensbackvall/glb-optimiser.git
cd glb-optimiser
npm install
npm start
```

Then open [http://localhost:3000](http://localhost:3000) in your browser.

Drop any supported 3D file (GLB, OBJ, FBX, STL, DAE, STEP, STP, IGES), adjust settings if needed via "Advanced Settings", and click **Compress Model**. Non-GLB formats are automatically converted first. The default compression (dedup + prune + WebP textures at 1024px) is safe for all models including those with animations.

## CLI

```bash
# Optimize a GLB file
node src/cli.js model.glb

# Convert and optimize an OBJ/FBX/STL/STEP file
node src/cli.js model.obj
node src/cli.js model.fbx output.glb
node src/cli.js part.step --all

# Convert only (no optimization)
node src/cli.js model.fbx --convert-only

# All optimizations enabled
node src/cli.js model.glb --all

# Specific options
node src/cli.js model.glb --draco --simplify --simplify-ratio 0.5 --weld --texture-format avif --texture-size 1024
```

### CLI Options

| Flag | Description | Default |
|---|---|---|
| `--convert-only` | Convert to GLB without optimizing | off |
| `--texture-format` | `webp`, `jpeg`, `png`, `avif` | `webp` |
| `--texture-size` | `512`, `1024`, `2048`, `4096` | `1024` |
| `--no-dedup` | Skip duplicate removal | enabled |
| `--no-prune` | Skip unused resource removal | enabled |
| `--draco` | Enable Draco mesh compression | off |
| `--simplify` | Enable mesh simplification | off |
| `--simplify-ratio` | Target ratio 0-1 | `0.75` |
| `--instance` | Enable GPU mesh instancing | off |
| `--flatten` | Flatten node hierarchy | off |
| `--join` | Join compatible meshes | off |
| `--weld` | Weld duplicate vertices | off |
| `--all` | Enable all optimizations | off |

### Programmatic API

```javascript
import { optimizeGLB } from './src/optimizer.js';
import { readFileSync, writeFileSync } from 'fs';

const input = readFileSync('model.glb');
const output = await optimizeGLB(input, {
  textureFormat: 'webp',
  textureSize: 1024,
  dedup: true,
  prune: true,
  draco: true,
  simplify: true,
  simplifyRatio: 0.75,
  weld: true,
  flatten: true,
  join: true,
  instance: true,
});

writeFileSync('model-optimized.glb', output);
```

## How It Works

The optimizer applies transforms in this order (when enabled):

1. **dedup** — Identify and link shared resources
2. **flatten** — Flatten node hierarchy (enables better joining)
3. **join** — Merge compatible primitives
4. **weld** — Merge identical vertices (improves simplification)
5. **simplify** — Reduce geometry via meshoptimizer
6. **instance** — Create GPU instances for shared meshes
7. **prune** — Clean up unreferenced resources
8. **textureCompress** — Convert and resize textures
9. **draco** — Apply Draco mesh compression (deferred to write)

## Dependencies

- [@gltf-transform/core](https://www.npmjs.com/package/@gltf-transform/core) — glTF read/write
- [@gltf-transform/functions](https://www.npmjs.com/package/@gltf-transform/functions) — Optimization transforms
- [@gltf-transform/extensions](https://www.npmjs.com/package/@gltf-transform/extensions) — Khronos extensions (Draco, etc.)
- [sharp](https://www.npmjs.com/package/sharp) — Image processing for texture compression
- [draco3dgltf](https://www.npmjs.com/package/draco3dgltf) — Draco encoder/decoder
- [meshoptimizer](https://www.npmjs.com/package/meshoptimizer) — Mesh simplification
- [assimpjs](https://www.npmjs.com/package/assimpjs) — OBJ/FBX/STL/DAE conversion (Assimp WASM)
- [occt-import-js](https://www.npmjs.com/package/occt-import-js) — STEP/IGES conversion (OpenCascade WASM)
- [express](https://www.npmjs.com/package/express) — Web server
- [multer](https://www.npmjs.com/package/multer) — File upload handling
