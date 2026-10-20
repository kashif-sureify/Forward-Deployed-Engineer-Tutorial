import express from 'express';
import multer from 'multer';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = path.dirname(fileURLToPath(import.meta.url));
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export function createApp(chatService) {
  const app = express();

  // Keep uploads in memory so the image buffer can be sent straight to the model.
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_UPLOAD_BYTES, fieldSize: MAX_UPLOAD_BYTES, files: 1, fields: 1 },
    fileFilter(req, file, callback) {
      if (!file.mimetype.startsWith('image/')) {
        const error = new Error('Please upload an image file.');
        error.status = 400;
        return callback(error);
      }
      callback(null, true);
    },
  });

  // Reject oversized requests before multer starts reading the body.
  function rejectLargeRequests(req, res, next) {
    const size = Number(req.headers['content-length']);
    if (size > MAX_UPLOAD_BYTES) {
      return res.status(413).type('text').send('Maximum request size is 10 MB.');
    }
    next();
  }

  app.use(express.static(path.join(directory, 'public')));

  app.post('/api/chat', rejectLargeRequests, upload.single('image'), async (req, res, next) => {
    if (typeof req.body?.message !== 'string') {
      return res.status(400).type('text').send('The message field is required.');
    }
    try {
      // Headers go out with the first chunk, so a failure before any text still gets a proper error status.
      await chatService.chat(req.body.message, req.file, (text) => {
        if (!res.headersSent) {
          res.set({ 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache' });
        }
        res.write(text);
      });
      res.end();
    } catch (error) {
      if (res.headersSent) {
        // Mid-stream failure: the status is already 200, so abort the connection to signal the client.
        console.error(error);
        return res.destroy(error);
      }
      next(error);
    }
  });

  app.delete('/api/chat', async (req, res, next) => {
    try {
      await chatService.clearHistory();
      res.status(200).end();
    } catch (error) {
      next(error);
    }
  });

  // Express recognises error handlers by their four-argument signature.
  app.use((error, req, res, next) => {
    if (res.headersSent) {
      return next(error);
    }
    if (error instanceof multer.MulterError) {
      const status = error.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
      return res.status(status).type('text').send(
        status === 413 ? 'Maximum image size is 10 MB.' : 'Invalid multipart upload.',
      );
    }
    if (error.status === 400) {
      return res.status(400).type('text').send(error.message);
    }
    // Log the real cause server-side, but avoid exposing credentials or provider internals to the frontend.
    console.error(error);
    res.status(502).type('text').send('Unable to get an AI response. Check your API key and try again.');
  });

  return app;
}
