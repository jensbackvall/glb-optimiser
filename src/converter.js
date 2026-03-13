import { createRequire } from 'module';
import { Document, NodeIO } from '@gltf-transform/core';

const require = createRequire(import.meta.url);

const ASSIMP_FORMATS = new Set(['.obj', '.fbx', '.dae', '.stl']);
const OCCT_FORMATS = new Set(['.step', '.stp', '.iges', '.igs']);
const GLB_FORMATS = new Set(['.glb', '.gltf']);
const ALL_CONVERTIBLE = new Set([...ASSIMP_FORMATS, ...OCCT_FORMATS]);
const ALL_SUPPORTED = new Set([...ALL_CONVERTIBLE, ...GLB_FORMATS]);

export function getExtension(filename) {
  const dot = filename.lastIndexOf('.');
  return dot === -1 ? '' : filename.slice(dot).toLowerCase();
}

export function needsConversion(filename) {
  return ALL_CONVERTIBLE.has(getExtension(filename));
}

export function isSupported(filename) {
  return ALL_SUPPORTED.has(getExtension(filename));
}

export function getSupportedExtensions() {
  return [...ALL_SUPPORTED].sort();
}

async function convertWithAssimp(buffer, filename) {
  const assimpjs = require('assimpjs');
  const ajs = await assimpjs();

  const fileList = new ajs.FileList();
  fileList.AddFile(filename, new Uint8Array(buffer));

  const result = ajs.ConvertFileList(fileList, 'glb2');

  if (!result.IsSuccess() || result.FileCount() === 0) {
    throw new Error(`Assimp conversion failed: ${result.GetErrorCode()}`);
  }

  const resultFile = result.GetFile(0);
  const glbData = Buffer.from(resultFile.GetContent());

  fileList.delete();
  return glbData;
}

async function convertWithOCCT(buffer, filename) {
  const occtimportjs = require('occt-import-js');
  const occt = await occtimportjs();

  const ext = getExtension(filename);
  let result;
  if (ext === '.step' || ext === '.stp') {
    result = occt.ReadStepFile(new Uint8Array(buffer), {
      linearUnit: 'millimeter',
      linearDeflectionType: 'bounding_box_ratio',
      linearDeflection: 0.001,
      angularDeflection: 0.5,
    });
  } else {
    result = occt.ReadIgesFile(new Uint8Array(buffer), null);
  }

  if (!result.success) {
    throw new Error('OpenCascade failed to read the CAD file');
  }

  return buildGLBFromOCCTResult(result);
}

async function buildGLBFromOCCTResult(result) {
  const doc = new Document();
  const buf = doc.createBuffer();
  const scene = doc.createScene('Scene');

  function processNode(occtNode, parentNode) {
    const node = doc.createNode(occtNode.name || 'Node');

    if (occtNode.meshes && occtNode.meshes.length > 0) {
      for (const meshIdx of occtNode.meshes) {
        const occtMesh = result.meshes[meshIdx];
        if (!occtMesh) continue;

        const positions = new Float32Array(occtMesh.attributes.position.array);
        const indices = new Uint32Array(occtMesh.index.array);

        const mesh = doc.createMesh(occtMesh.name || `Mesh_${meshIdx}`);
        const prim = doc.createPrimitive();

        const posAccessor = doc.createAccessor(`positions_${meshIdx}`)
          .setType('VEC3')
          .setArray(positions)
          .setBuffer(buf);
        prim.setAttribute('POSITION', posAccessor);

        if (occtMesh.attributes.normal) {
          const normals = new Float32Array(occtMesh.attributes.normal.array);
          const normAccessor = doc.createAccessor(`normals_${meshIdx}`)
            .setType('VEC3')
            .setArray(normals)
            .setBuffer(buf);
          prim.setAttribute('NORMAL', normAccessor);
        }

        const idxAccessor = doc.createAccessor(`indices_${meshIdx}`)
          .setType('SCALAR')
          .setArray(indices)
          .setBuffer(buf);
        prim.setIndices(idxAccessor);

        const mat = doc.createMaterial(occtMesh.name || `Material_${meshIdx}`);
        if (occtMesh.color && occtMesh.color.length >= 3) {
          mat.setBaseColorFactor([
            occtMesh.color[0],
            occtMesh.color[1],
            occtMesh.color[2],
            1.0,
          ]);
        } else {
          mat.setBaseColorFactor([0.8, 0.8, 0.8, 1.0]);
        }
        prim.setMaterial(mat);

        mesh.addPrimitive(prim);
        node.setMesh(mesh);
      }
    }

    if (parentNode) {
      parentNode.addChild(node);
    } else {
      scene.addChild(node);
    }

    if (occtNode.children) {
      for (const child of occtNode.children) {
        processNode(child, node);
      }
    }
  }

  if (result.root) {
    processNode(result.root, null);
  }

  const io = new NodeIO();
  const glbBuffer = await io.writeBinary(doc);
  return Buffer.from(glbBuffer);
}

export async function convertToGLB(buffer, filename) {
  const ext = getExtension(filename);

  if (GLB_FORMATS.has(ext)) {
    return Buffer.from(buffer);
  }

  if (ASSIMP_FORMATS.has(ext)) {
    return convertWithAssimp(buffer, filename);
  }

  if (OCCT_FORMATS.has(ext)) {
    return convertWithOCCT(buffer, filename);
  }

  throw new Error(`Unsupported format: ${ext}`);
}
