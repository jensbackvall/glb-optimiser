# 3D Model Converter & GLB Optimiser

A self-hosted 3D model converter and optimizer built on [glTF-Transform](https://github.com/donmccurdy/glTF-Transform), [assimpjs](https://github.com/kovacsv/assimpjs), and [occt-import-js](https://github.com/kovacsv/occt-import-js).

## How to run this locally

### 1. Install Node.js

Download and install **Node.js** (version 18 or later) from [nodejs.org](https://nodejs.org/). Pick the **LTS** version — the installer is straightforward (just click through the steps).

To check if you already have it, open a terminal and run:

```bash
node --version
```

If you see `v18` or higher, you're good to go.

### 2. Download this project

**Option A — Download as ZIP (easiest):**

1. Go to the GitHub repository page
2. Click the green **Code** button
3. Click **Download ZIP**
4. Unzip the downloaded file to a folder of your choice

**Option B — Clone with git:**

```bash
git clone https://github.com/jensbackvall/glb-optimiser.git
cd glb-optimiser
```

### 3. Open a terminal in the project folder

- **macOS:** Open the **Terminal** app, then type `cd ` (with a space) and drag the project folder into the terminal window. Press Enter.
- **Windows:** Open the project folder in File Explorer, right-click on an empty area, and select **Open in Terminal**.

### 4. Install dependencies

Run this once (and again only if the project is updated):

```bash
npm install
```

This downloads everything the app needs. It may take a minute or two.

### 5. Start the app

```bash
npm start
```

You should see a message saying the server is running.

### 6. Open in your browser

Go to [http://localhost:3000](http://localhost:3000). You can now drag-and-drop 3D files onto the page to convert and optimise them.

To stop the app, press `Ctrl+C` in the terminal.

## Features

### Format Conversion

Convert common 3D formats to GLB automatically before optimization:

| Format | Engine | Notes |
|---|---|---|
| GLTF | NodeIO + unpartition | JSON glTF → binary GLB; merges multiple buffers |
| OBJ | assimpjs (WASM) | With materials (.mtl) |
| FBX | assimpjs (WASM) | Including animations |
| STL | assimpjs (WASM) | Mesh-only format |
| DAE (Collada) | assimpjs (WASM) | Open XML format |
| STEP / STP | occt-import-js (OpenCascade WASM) | CAD parametric → triangulated mesh |
| IGES / IGS | occt-import-js (OpenCascade WASM) | CAD parametric → triangulated mesh |
| ZIP | NodeIO + unpartition | glTF package (.gltf + .bin + textures) → bundled GLB |

**Note:** glTF files with multiple buffers (e.g. embedded base64 data) are automatically merged with `unpartition()` before GLB output. For glTF that references external `.bin` or image files, zip the folder and upload the ZIP.

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

### Web Dashboard

- **Drag-and-drop** upload for all supported formats
- **Queued files** list with per-file remove and clear-all controls
- **Standard compression** with safe defaults — no configuration needed
- **Advanced Settings** collapsible panel for full control over all optimization options
- **Dark / Light mode** toggle with localStorage persistence
- **Batch processing** with per-file progress, status, and individual download buttons
- **Smart button labels** — shows "Convert & Optimise" for non-GLB files, "Optimise" for GLB files

## CLI

```bash
# Optimize a GLB file
node src/cli.js model.glb

# Convert and optimize a GLTF/OBJ/FBX/STL/STEP/ZIP file
node src/cli.js model.gltf
node src/cli.js model.obj
node src/cli.js model.fbx output.glb
node src/cli.js part.step --all
node src/cli.js model.zip

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

### Conversion (non-GLB inputs)

For GLTF, ZIP, OBJ, FBX, STL, DAE, STEP, and IGES files, the converter runs first:

- **GLTF / ZIP** — Read with NodeIO, apply `unpartition()` to merge multiple buffers into one (required for GLB), then write binary GLB
- **OBJ, FBX, STL, DAE** — Convert via assimpjs (WASM) to GLB
- **STEP, STP, IGES** — Tessellate via occt-import-js (OpenCascade WASM), build glTF document, write GLB

### Optimization

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
- [adm-zip](https://www.npmjs.com/package/adm-zip) — ZIP extraction for glTF packages
- [express](https://www.npmjs.com/package/express) — Web server
- [multer](https://www.npmjs.com/package/multer) — File upload handling
