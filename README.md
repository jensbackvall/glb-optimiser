# 3D and 2D Converter and Optimiser

A self-hosted converter and optimiser for 3D models and 2D images, built on [glTF-Transform](https://github.com/donmccurdy/glTF-Transform), [sharp](https://sharp.pixelplumbing.com/), [assimpjs](https://github.com/kovacsv/assimpjs), and [occt-import-js](https://github.com/kovacsv/occt-import-js).

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

Go to [http://localhost:3000](http://localhost:3000). You can now drag-and-drop 3D model files or images onto the page to convert and optimise them.

To stop the app, press `Ctrl+C` in the terminal.

## Features

### Image Optimisation

Optimise flat images and 360° panoramas directly in the same interface. Drop a JPEG, PNG, or WebP file alongside (or instead of) any 3D files and the **Image Settings** panel will appear automatically.

| Option | Description | Default |
|---|---|---|
| **Format** | Output as WebP, AVIF, JPEG, or PNG | WebP |
| **Quality** | Compression quality 40–100 (WebP/AVIF/JPEG); for **PNG**, maps to indexed palette size (smaller file at lower quality) | 85 |
| **Scale** | Resize by percentage (10–100%) using Lanczos3 resampling | 100% |

**Supported input formats:** JPEG, PNG, WebP

**Live dimension preview** — when a single image is staged, the resize slider shows the exact output dimensions (e.g. `1920 × 1080 → 960 × 540 px`).

**360° panorama detection** — images with a 2:1 aspect ratio are automatically flagged with a 360° badge. A note is shown when the output resolution would fall below the recommended minimum for AR/VR use on smartphones (2048 × 1024).

**Format guidance:**
- **WebP** — best general-purpose choice; 25–40% smaller than JPEG at equal quality
- **AVIF** — smallest files (40–60% smaller than JPEG), slightly slower to encode
- **JPEG** — maximum compatibility; uses mozjpeg encoder for better compression than standard JPEG
- **PNG** — **palette quantisation** (indexed colours) for much smaller files than raw true-colour PNG; quality maps to max palette size (~128–256 colours). Similar idea to compressors such as [TinyPNG](https://tinypng.com/). Use higher quality for photos with subtle gradients.

**Encoder details (closer parity with TinyPNG-style tools):**

- **WebP / AVIF** — `effort: 6` for a better size/encode-time trade-off
- **JPEG** — mozjpeg with **progressive** scan for nicer perceived loading in browsers
- **PNG** — palette mode with adaptive filtering and zlib level 9; quality slider controls how many palette entries are allowed

### Format Conversion (3D)

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

### 3D Model Optimisation

- **Texture compression** — Convert to WebP, JPEG, PNG, or AVIF with configurable max resolution and quality
- **Deduplication** — Remove duplicate accessors, meshes, textures, and materials
- **Prune** — Remove unused/unreferenced resources
- **Quantize** — Compress vertex attributes (positions, normals, UVs) to smaller integer types using `KHR_mesh_quantization`; 50–75% geometry savings with no visible quality loss
- **Meshopt compression** — `EXT_meshopt_compression` via meshoptimizer; includes vertex reordering + quantization for maximum geometry compression (requires MeshoptDecoder in renderer, e.g. Three.js r133+)
- **Draco compression** — `KHR_draco_mesh_compression` for geometry (requires DRACOLoader in renderer); skipped when Meshopt is enabled
- **Mesh simplification** — Reduce triangle count via meshoptimizer with configurable ratio
- **GPU instancing** — EXT_mesh_gpu_instancing for repeated meshes
- **Flatten** — Flatten scene graph hierarchy
- **Join** — Merge compatible primitives to reduce draw calls
- **Weld** — Merge bitwise-identical vertices

### Web Dashboard

- **Drag-and-drop** upload for 3D models (GLB, GLTF, OBJ, FBX, STL, DAE, STEP, IGES, ZIP) and images (JPEG, PNG, WebP)
- **Auto-detection** — dropping an image shows the Image Settings panel; dropping a 3D file shows the 3D Advanced Settings panel; both appear when mixed
- **360° detection** — images with a 2:1 aspect ratio are automatically flagged
- **Queued files** list with per-file type badges, remove, and clear-all controls
- **Standard compression** with safe defaults — no configuration needed
- **Advanced Settings** collapsible panel for full control over all 3D optimisation options
- **Image Settings** collapsible panel for format, quality, and resize options
- **Dark / Light mode** toggle with localStorage persistence
- **Batch processing** with per-file progress, status, and individual download buttons
- **Smart button labels** — shows "Convert & Optimise" for non-GLB files, "Optimise" for GLB and image files

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
| `--texture-quality` | Texture quality 40–100 | `75` |
| `--no-dedup` | Skip duplicate removal | enabled |
| `--no-prune` | Skip unused resource removal | enabled |
| `--quantize` | Quantize vertex data (KHR_mesh_quantization) | off |
| `--draco` | Enable Draco mesh compression | off |
| `--meshopt` | Enable Meshopt compression (includes quantize+reorder) | off |
| `--simplify` | Enable mesh simplification | off |
| `--simplify-ratio` | Target ratio 0-1 | `0.75` |
| `--instance` | Enable GPU mesh instancing | off |
| `--flatten` | Flatten node hierarchy | off |
| `--join` | Join compatible meshes | off |
| `--weld` | Weld duplicate vertices | off |
| `--all` | Enable all optimizations (meshopt, simplify, instance, flatten, join, weld) | off |

### Programmatic API

```javascript
import { optimizeGLB } from './src/optimizer.js';
import { readFileSync, writeFileSync } from 'fs';

const input = readFileSync('model.glb');
const output = await optimizeGLB(input, {
  textureFormat: 'webp',
  textureSize: 1024,
  textureQuality: 75,
  dedup: true,
  prune: true,
  quantize: true,   // or meshopt: true for maximum geometry compression
  meshopt: false,   // set true to enable EXT_meshopt_compression (requires MeshoptDecoder)
  draco: false,     // set true to enable KHR_draco_mesh_compression (ignored when meshopt: true)
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

### Image Optimisation Pipeline

Image files bypass the 3D pipeline entirely and are processed by [sharp](https://sharp.pixelplumbing.com/) (libvips):

1. If `scale < 100%` — resize using **Lanczos3** kernel with `fit: fill` (preserves exact aspect ratio, no cropping or padding)
2. Encode to the chosen format:
   - **WebP** — quality + `effort: 6`
   - **AVIF** — quality + `effort: 6`
   - **JPEG** — mozjpeg, progressive, configurable quality
   - **PNG** — palette quantization (indexed colour); quality maps to palette size (~128–256 colours) for tinier files than uncompressed true-colour PNG
3. Return the optimised image as a download

The same server-side concurrency limiter that protects the 3D pipeline also applies here, so large image batches queue rather than exhaust memory.

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
8. **textureCompress** — Convert, resize and re-encode textures at configurable quality
9. **meshopt** — Apply EXT_meshopt_compression (includes reorder + quantize; takes priority over Draco)
   — **or quantize** — Apply KHR_mesh_quantization only (no special decoder needed)
   — **or draco** — Apply KHR_draco_mesh_compression (skipped when meshopt is enabled)

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
