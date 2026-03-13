# GLB Optimizer

A self-hosted GLB/GLTF 3D model optimizer built on [glTF-Transform](https://github.com/donmccurdy/glTF-Transform). Replicates the full feature set of OptimizeGLB.com with local server-side processing.

## Features

- **Texture compression** — Convert to WebP, JPEG, PNG, or AVIF with configurable max resolution
- **Deduplication** — Remove duplicate accessors, meshes, textures, and materials
- **Prune** — Remove unused/unreferenced resources
- **Draco compression** — KHR_draco_mesh_compression for geometry
- **Mesh simplification** — Reduce triangle count via meshoptimizer with configurable ratio
- **GPU instancing** — EXT_mesh_gpu_instancing for repeated meshes
- **Flatten** — Flatten scene graph hierarchy
- **Join** — Merge compatible primitives to reduce draw calls
- **Weld** — Merge bitwise-identical vertices

## Setup

```bash
npm install
```

## Usage

### Web Dashboard

```bash
npm start
# Open http://localhost:3000
```

### CLI

```bash
# Basic optimization (dedup + prune + WebP textures)
node src/cli.js model.glb

# Custom output path
node src/cli.js model.glb output.glb

# All optimizations enabled
node src/cli.js model.glb --all

# Specific options
node src/cli.js model.glb --draco --simplify --simplify-ratio 0.5 --weld --texture-format avif --texture-size 1024
```

### CLI Options

| Flag | Description | Default |
|---|---|---|
| `--texture-format` | `webp`, `jpeg`, `png`, `avif` | `webp` |
| `--texture-size` | `512`, `1024`, `2048`, `4096` | `2048` |
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
  textureSize: 2048,
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
- [express](https://www.npmjs.com/package/express) — Web server
- [multer](https://www.npmjs.com/package/multer) — File upload handling
