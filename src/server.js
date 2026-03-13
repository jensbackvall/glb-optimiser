import express from 'express';
import multer from 'multer';
import { optimizeGLB, formatBytes } from './optimizer.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 500 * 1024 * 1024 } });
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(join(__dirname, '..', 'public')));
app.use(express.json());

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

  try {
    const startTime = Date.now();
    const outputBuffer = await optimizeGLB(req.file.buffer, options);
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
      'Access-Control-Expose-Headers': 'X-Original-Size, X-Compressed-Size, X-Reduction, X-Processing-Time',
    });

    res.send(outputBuffer);
  } catch (err) {
    console.error(`Failed to optimize ${fileName}:`, err);
    res.status(500).json({ error: 'Optimization failed', message: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`\n  GLB Optimizer running at http://localhost:${PORT}\n`);
});
