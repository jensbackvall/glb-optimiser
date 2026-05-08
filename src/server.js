import express from 'express';
import multer from 'multer';
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

app.listen(PORT, () => {
  console.log(`\n  GLB Optimizer running at http://localhost:${PORT}\n`);
});
