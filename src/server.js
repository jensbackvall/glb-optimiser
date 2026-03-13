import express from 'express';
import multer from 'multer';
import { optimizeGLB, formatBytes } from './optimizer.js';
import { convertToGLB, needsConversion, isSupported, getSupportedExtensions } from './converter.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 500 * 1024 * 1024 } });
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(join(__dirname, '..', 'public')));
app.use(express.json());

app.get('/api/formats', (req, res) => {
  res.json({ formats: getSupportedExtensions() });
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
    const startTime = Date.now();
    let glbBuffer = req.file.buffer;
    let converted = false;

    if (needsConversion(fileName)) {
      console.log(`Converting ${fileName} to GLB...`);
      glbBuffer = await convertToGLB(req.file.buffer, fileName);
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
  }
});

app.listen(PORT, () => {
  console.log(`\n  GLB Optimizer running at http://localhost:${PORT}\n`);
});
