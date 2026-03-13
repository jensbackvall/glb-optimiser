#!/usr/bin/env node

import { readFileSync, writeFileSync, statSync } from 'fs';
import { basename, extname, resolve } from 'path';
import { optimizeGLB, formatBytes } from './optimizer.js';
import { convertToGLB, needsConversion, isSupported } from './converter.js';

const HELP = `
Usage: glb-optimize <input> [output.glb] [options]

Supported input formats:
  GLB, GLTF, OBJ, FBX, STL, DAE, STEP, STP, IGES

  Non-GLB formats are automatically converted to GLB before optimization.

Options:
  --convert-only              Convert to GLB without optimizing
  --texture-format <format>   webp | jpeg | png | avif  (default: webp)
  --texture-size <size>       512 | 1024 | 2048 | 4096  (default: 1024)
  --no-dedup                  Skip duplicate removal
  --no-prune                  Skip unused resource removal
  --draco                     Enable Draco mesh compression
  --simplify                  Enable mesh simplification
  --simplify-ratio <ratio>    Simplification target ratio 0-1 (default: 0.75)
  --instance                  Enable GPU mesh instancing
  --flatten                   Flatten node hierarchy
  --join                      Join compatible meshes
  --weld                      Weld duplicate vertices
  --all                       Enable all optimizations (draco, simplify, instance, flatten, join, weld)
  -h, --help                  Show this help
`;

function parseArgs(argv) {
  const args = argv.slice(2);
  const options = {};
  const positional = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '-h':
      case '--help':
        console.log(HELP);
        process.exit(0);
      case '--texture-format':
        options.textureFormat = args[++i];
        break;
      case '--texture-size':
        options.textureSize = parseInt(args[++i], 10);
        break;
      case '--no-dedup':
        options.dedup = false;
        break;
      case '--no-prune':
        options.prune = false;
        break;
      case '--draco':
        options.draco = true;
        break;
      case '--simplify':
        options.simplify = true;
        break;
      case '--simplify-ratio':
        options.simplifyRatio = parseFloat(args[++i]);
        break;
      case '--instance':
        options.instance = true;
        break;
      case '--flatten':
        options.flatten = true;
        break;
      case '--join':
        options.join = true;
        break;
      case '--weld':
        options.weld = true;
        break;
      case '--all':
        options.draco = true;
        options.simplify = true;
        options.instance = true;
        options.flatten = true;
        options.join = true;
        options.weld = true;
        break;
      case '--convert-only':
        options.convertOnly = true;
        break;
      default:
        positional.push(arg);
    }
  }

  return { options, positional };
}

async function main() {
  const { options, positional } = parseArgs(process.argv);

  if (positional.length === 0) {
    console.error('Error: No input file specified.');
    console.log(HELP);
    process.exit(1);
  }

  const inputPath = resolve(positional[0]);
  const fileName = basename(inputPath);

  if (!isSupported(fileName)) {
    console.error(`Error: Unsupported format "${extname(inputPath)}".`);
    console.error('Supported: .glb, .gltf, .obj, .fbx, .stl, .dae, .step, .stp, .iges');
    process.exit(1);
  }

  const defaultSuffix = options.convertOnly ? '.glb' : '-optimized.glb';
  const outputPath = positional[1]
    ? resolve(positional[1])
    : inputPath.replace(extname(inputPath), defaultSuffix);

  const inputBuffer = readFileSync(inputPath);
  const originalSize = statSync(inputPath).size;

  console.log(`\nInput: ${fileName}`);
  console.log(`Original size: ${formatBytes(originalSize)}`);

  const startTime = Date.now();
  let glbBuffer = inputBuffer;

  if (needsConversion(fileName)) {
    console.log(`Converting ${extname(fileName).toUpperCase()} → GLB...`);
    glbBuffer = await convertToGLB(inputBuffer, fileName);
    console.log(`Converted: ${formatBytes(glbBuffer.length)}`);
  }

  let outputBuffer;
  if (options.convertOnly) {
    outputBuffer = glbBuffer;
    console.log('Skipping optimization (--convert-only)');
  } else {
    console.log('Optimizing...\n');
    outputBuffer = await optimizeGLB(glbBuffer, options);
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  writeFileSync(outputPath, outputBuffer);

  const compressedSize = outputBuffer.length;
  const reduction = ((1 - compressedSize / originalSize) * 100).toFixed(1);

  console.log(`Output size: ${formatBytes(compressedSize)}`);
  console.log(`Reduction: ${reduction}%`);
  console.log(`Time: ${elapsed}s`);
  console.log(`Output: ${outputPath}\n`);
}

main().catch((err) => {
  console.error('Optimization failed:', err.message);
  process.exit(1);
});
