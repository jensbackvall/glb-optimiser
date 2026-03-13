import { NodeIO } from '@gltf-transform/core';
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
import sharp from 'sharp';

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
      encoder: sharp,
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
