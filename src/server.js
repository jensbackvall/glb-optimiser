import express from 'express';
import multer from 'multer';
import sharp from 'sharp';
import { optimizeGLB, inspectGLB, formatBytes } from './optimizer.js';
import { convertToGLB, needsConversion, isSupported, getSupportedExtensions } from './converter.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { mkdirSync } from 'fs';
import { readFile, unlink } from 'fs/promises';
import { tmpdir } from 'os';
import crypto from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));

const UPLOAD_DIR = join(tmpdir(), 'glb-optimizer-uploads');
mkdirSync(UPLOAD_DIR, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) => cb(null, `${crypto.randomUUID()}-${file.originalname}`),
  }),
  limits: { fileSize: 500 * 1024 * 1024 },
});

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(join(__dirname, '..', 'public')));
app.use(express.json());

const MAX_CONCURRENT_JOBS = Math.max(1, parseInt(process.env.MAX_CONCURRENT_JOBS || '1', 10) || 1);
let activeJobs = 0;
const waiters = [];

async function acquireJobSlot() {
  if (activeJobs < MAX_CONCURRENT_JOBS) {
    activeJobs += 1;
    return;
  }
  await new Promise((resolve) => waiters.push(resolve));
  activeJobs += 1;
}

function releaseJobSlot() {
  activeJobs = Math.max(0, activeJobs - 1);
  const next = waiters.shift();
  if (next) next();
}

app.get('/api/formats', (req, res) => {
  res.json({ formats: getSupportedExtensions() });
});

app.post('/api/inspect', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const fileName = req.file.originalname;
  if (!isSupported(fileName)) {
    return res.status(400).json({ error: `Unsupported format.` });
  }

  try {
    await acquireJobSlot();
    const inputBuffer = await readFile(req.file.path);
    let glbBuffer = inputBuffer;
    if (needsConversion(fileName)) {
      glbBuffer = await convertToGLB(inputBuffer, fileName);
    }
    const materials = await inspectGLB(glbBuffer);
    res.json({ materials });
  } catch (err) {
    console.error(`Failed to inspect ${fileName}:`, err);
    res.status(500).json({ error: 'Inspection failed', message: err.message });
  } finally {
    releaseJobSlot();
    if (req.file?.path) {
      try {
        await unlink(req.file.path);
      } catch {
        // best-effort cleanup
      }
    }
  }
});

app.post('/api/optimize', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const options = {};
  try {
    if (req.body.options) {
      Object.assign(options, JSON.parse(req.body.options));
    }
  } catch {
    return res.status(400).json({ error: 'Invalid options JSON' });
  }

  const originalSize = req.file.size;
  const fileName = req.file.originalname;

  if (!isSupported(fileName)) {
    return res.status(400).json({ error: `Unsupported format. Supported: ${getSupportedExtensions().join(', ')}` });
  }

  try {
    await acquireJobSlot();
    const startTime = Date.now();
    const inputBuffer = await readFile(req.file.path);
    let glbBuffer = inputBuffer;
    let converted = false;

    if (needsConversion(fileName)) {
      console.log(`Converting ${fileName} to GLB...`);
      glbBuffer = await convertToGLB(inputBuffer, fileName);
      converted = true;
      console.log(`Conversion done (${formatBytes(glbBuffer.length)})`);
    }

    const outputBuffer = await optimizeGLB(glbBuffer, options);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    const compressedSize = outputBuffer.length;
    const reduction = ((1 - compressedSize / originalSize) * 100).toFixed(1);

    res.set({
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${fileName.replace(/\.\w+$/, '-optimized.glb')}"`,
      'X-Original-Size': originalSize.toString(),
      'X-Compressed-Size': compressedSize.toString(),
      'X-Reduction': reduction,
      'X-Processing-Time': elapsed,
      'X-Converted': converted ? 'true' : 'false',
      'Access-Control-Expose-Headers': 'X-Original-Size, X-Compressed-Size, X-Reduction, X-Processing-Time, X-Converted',
    });

    res.send(outputBuffer);
  } catch (err) {
    console.error(`Failed to process ${fileName}:`, err);
    res.status(500).json({ error: 'Processing failed', message: err.message });
  } finally {
    releaseJobSlot();
    if (req.file?.path) {
      try {
        await unlink(req.file.path);
      } catch {
        // best-effort cleanup
      }
    }
  }
});

function clampImageQuality(quality, fallback = 85) {
  const n = Number.parseInt(String(quality), 10);
  if (Number.isNaN(n)) return fallback;
  return Math.min(100, Math.max(40, n));
}

/** Map UI quality 40–100 to TinyPNG-like palette sizes (fewer colours ⇒ smaller PNG). */
function qualityToPaletteColours(quality) {
  const q = clampImageQuality(quality);
  return Math.round(128 + ((q - 40) / 60) * 128);
}

app.post('/api/optimize-image', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const options = {};
  try {
    if (req.body.options) Object.assign(options, JSON.parse(req.body.options));
  } catch {
    return res.status(400).json({ error: 'Invalid options JSON' });
  }

  const format = (typeof options.format === 'string' ? options.format : 'webp').toLowerCase();
  const quality = clampImageQuality(options.quality, 85);
  const resizePercent = Math.min(100, Math.max(10, Number.parseInt(String(options.resizePercent), 10) || 100));
  const originalSize = req.file.size;
  const fileName = req.file.originalname;

  try {
    await acquireJobSlot();
    const startTime = Date.now();

    let pipeline = sharp(req.file.path);

    if (resizePercent < 100) {
      const meta = await pipeline.metadata();
      const newWidth = Math.max(1, Math.round(meta.width * resizePercent / 100));
      const newHeight = Math.max(1, Math.round(meta.height * resizePercent / 100));
      pipeline = pipeline.resize(newWidth, newHeight, { kernel: 'lanczos3', fit: 'fill' });
    }

    switch (format) {
      case 'avif':
        pipeline = pipeline.avif({ quality, effort: 6 });
        break;
      case 'jpeg':
        pipeline = pipeline.jpeg({ quality, mozjpeg: true, progressive: true });
        break;
      case 'png':
        pipeline = pipeline.png({
          compressionLevel: 9,
          adaptiveFiltering: true,
          palette: true,
          colours: qualityToPaletteColours(quality),
        });
        break;
      default:
        pipeline = pipeline.webp({ quality, effort: 6 });
        break;
    }

    const outputBuffer = await pipeline.toBuffer();
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const compressedSize = outputBuffer.length;
    const reduction = ((1 - compressedSize / originalSize) * 100).toFixed(1);

    const extMap = { webp: '.webp', avif: '.avif', jpeg: '.jpg', png: '.png' };
    const outExt = extMap[format] || '.webp';
    const outName = fileName.replace(/\.[^.]+$/, `-optimized${outExt}`);

    res.set({
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${outName}"`,
      'X-Original-Size': originalSize.toString(),
      'X-Compressed-Size': compressedSize.toString(),
      'X-Reduction': reduction,
      'X-Processing-Time': elapsed,
      'Access-Control-Expose-Headers': 'X-Original-Size, X-Compressed-Size, X-Reduction, X-Processing-Time',
    });

    res.send(outputBuffer);
  } catch (err) {
    console.error(`Failed to optimize image ${fileName}:`, err);
    res.status(500).json({ error: 'Image optimization failed', message: err.message });
  } finally {
    releaseJobSlot();
    if (req.file?.path) {
      try { await unlink(req.file.path); } catch {}
    }
  }
});

app.listen(PORT, () => {
  console.log(`\n  GLB Optimizer running at http://localhost:${PORT}\n`);
});
