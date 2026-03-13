#!/usr/bin/env node

import { readFileSync, writeFileSync, statSync } from 'fs';
import { basename, extname, resolve } from 'path';
import { optimizeGLB, formatBytes } from './optimizer.js';

const HELP = `
Usage: glb-optimize <input.glb> [output.glb] [options]

Options:
  --texture-format <format>   webp | jpeg | png | avif  (default: webp)
  --texture-size <size>       512 | 1024 | 2048 | 4096  (default: 2048)
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
  const outputPath = positional[1]
    ? resolve(positional[1])
    : inputPath.replace(extname(inputPath), '-optimized.glb');

  console.log(`\nOptimizing: ${basename(inputPath)}`);

  const inputBuffer = readFileSync(inputPath);
  const originalSize = statSync(inputPath).size;

  console.log(`Original size: ${formatBytes(originalSize)}`);
  console.log('Processing...\n');

  const startTime = Date.now();
  const outputBuffer = await optimizeGLB(inputBuffer, options);
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  writeFileSync(outputPath, outputBuffer);

  const compressedSize = outputBuffer.length;
  const reduction = ((1 - compressedSize / originalSize) * 100).toFixed(1);

  console.log(`Compressed size: ${formatBytes(compressedSize)}`);
  console.log(`Reduction: ${reduction}%`);
  console.log(`Time: ${elapsed}s`);
  console.log(`Output: ${outputPath}\n`);
}

main().catch((err) => {
  console.error('Optimization failed:', err.message);
  process.exit(1);
});
