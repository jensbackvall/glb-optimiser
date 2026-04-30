import { NodeIO, ImageUtils } from '@gltf-transform/core';
import { KHRONOS_EXTENSIONS, KHRDracoMeshCompression } from '@gltf-transform/extensions';
import {
  dedup,
  prune,
  draco,
  textureCompress,
  simplify,
  instance,
  flatten,
  join,
  weld,
} from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';
import { MeshoptSimplifier } from 'meshoptimizer';
import sharpBase from 'sharp';

const MIN_TEXTURE_DIM = 1;

// ImageUtils only supports JPEG/PNG out of the box. Register WebP so that
// textureCompress can read dimensions for resize/fitWithin on already-WebP models.
ImageUtils.impls['image/webp'] = {
  getSize(buffer) {
    const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    if (view.getUint32(0) !== 0x52494646) return null; // 'RIFF'
    const tag = String.fromCharCode(
      view.getUint8(8), view.getUint8(9), view.getUint8(10), view.getUint8(11)
    );
    if (tag !== 'WEBP') return null;
    const chunkTag = String.fromCharCode(
      view.getUint8(12), view.getUint8(13), view.getUint8(14)
    );
    const byte15 = view.getUint8(15);
    if (chunkTag === 'VP8' && byte15 === 0x20) {
      return [view.getUint16(26, true) & 0x3fff, view.getUint16(28, true) & 0x3fff];
    }
    if (chunkTag === 'VP8' && byte15 === 0x4C) {
      const bits = view.getUint32(21, true);
      return [(bits & 0x3fff) + 1, ((bits >> 14) & 0x3fff) + 1];
    }
    if (chunkTag === 'VP8' && byte15 === 0x58) {
      return [
        1 + (view.getUint8(24) | (view.getUint8(25) << 8) | (view.getUint8(26) << 16)),
        1 + (view.getUint8(27) | (view.getUint8(28) << 8) | (view.getUint8(29) << 16)),
      ];
    }
    return null;
  },
  getChannels() { return 4; },
  getVRAMBytesPerPixel() { return 4; },
};

function safeSharp(input) {
  const inst = sharpBase(input);
  const origResize = inst.resize.bind(inst);
  inst.resize = (width, height, opts) => {
    const w = Math.max(Math.round(width) || MIN_TEXTURE_DIM, MIN_TEXTURE_DIM);
    const h = Math.max(Math.round(height) || MIN_TEXTURE_DIM, MIN_TEXTURE_DIM);
    return origResize(w, h, opts);
  };
  return inst;
}
Object.assign(safeSharp, sharpBase);

const DEFAULT_OPTIONS = {
  textureFormat: 'webp',
  textureSize: 1024,
  dedup: true,
  prune: true,
  draco: false,
  simplify: false,
  simplifyRatio: 0.75,
  simplifyError: 0.001,
  instance: false,
  flatten: false,
  join: false,
  weld: false,
};

export async function createIO() {
  const io = new NodeIO()
    .registerExtensions(KHRONOS_EXTENSIONS)
    .registerDependencies({
      'draco3d.decoder': await draco3d.createDecoderModule(),
      'draco3d.encoder': await draco3d.createEncoderModule(),
    });
  return io;
}

export async function optimizeGLB(inputBuffer, userOptions = {}) {
  const options = { ...DEFAULT_OPTIONS, ...userOptions };
  const io = await createIO();

  const document = await io.readBinary(new Uint8Array(inputBuffer));
  const transforms = [];

  if (options.dedup) {
    transforms.push(dedup());
  }

  if (options.flatten) {
    transforms.push(flatten());
  }

  if (options.join) {
    transforms.push(join());
  }

  if (options.weld) {
    transforms.push(weld());
  }

  if (options.simplify) {
    await MeshoptSimplifier.ready;
    transforms.push(
      simplify({
        simplifier: MeshoptSimplifier,
        ratio: options.simplifyRatio,
        error: options.simplifyError,
      })
    );
  }

  if (options.instance) {
    transforms.push(instance());
  }

  if (options.prune) {
    transforms.push(prune());
  }

  if (options.textureFormat) {
    const textureOptions = {
      encoder: safeSharp,
      targetFormat: options.textureFormat,
      slots: /^(?!normalTexture).*$/,
    };
    if (options.textureSize) {
      textureOptions.resize = [options.textureSize, options.textureSize];
    }
    transforms.push(textureCompress(textureOptions));
  }

  if (options.draco) {
    transforms.push(draco());
  }

  await document.transform(...transforms);

  const outputBuffer = await io.writeBinary(document);
  return Buffer.from(outputBuffer);
}

export function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${units[i]}`;
}
