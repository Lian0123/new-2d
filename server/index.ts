import cors from 'cors';
import express, { type ErrorRequestHandler } from 'express';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EXPORT_LIMITS, ExportValidationError, exportProject, type ExportOptions } from './export.js';

export type ServerOptions = ExportOptions;

export function createApp(options: ServerOptions = {}) {
  const rootDirectory = options.rootDirectory ?? process.cwd();
  const app = express();
  app.disable('x-powered-by');
  app.use(cors({ origin: /^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/ }));
  app.use(express.json({ limit: EXPORT_LIMITS.jsonBytes, strict: true }));

  app.get('/api/health', (_request, response) => {
    response.json({ ok: true, app: 'mio-2d', version: 1 });
  });

  app.post('/api/export', async (request, response, next) => {
    try {
      if (!request.body || typeof request.body !== 'object' || !('project' in request.body)) {
        throw new ExportValidationError('Request must contain a project object.');
      }
      const result = await exportProject(request.body.project, { rootDirectory, runtime: options.runtime });
      response.set({
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${result.filename}"`,
        'Content-Length': String(result.buffer.length),
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'no-store',
      });
      response.send(result.buffer);
    } catch (error) {
      next(error);
    }
  });

  app.use('/api', (_request, response) => response.status(404).json({ error: 'API endpoint not found.' }));
  app.use(express.static(path.join(rootDirectory, 'public'), { dotfiles: 'deny' }));
  const distDirectory = path.join(rootDirectory, 'dist');
  if (existsSync(path.join(distDirectory, 'index.html'))) {
    app.use(express.static(distDirectory, { dotfiles: 'deny' }));
    app.use((request, response, next) => {
      if (request.method === 'GET' && request.accepts('html') && !path.extname(request.path)) {
        response.sendFile(path.join(distDirectory, 'index.html'));
      } else next();
    });
  }

  const handleError: ErrorRequestHandler = (error, _request, response, _next) => {
    if (error instanceof ExportValidationError) {
      response.status(400).json({ error: error.message });
    } else if (error?.type === 'entity.too.large') {
      response.status(413).json({ error: 'Project payload exceeds the 48 MiB limit.' });
    } else if (error?.type === 'entity.parse.failed') {
      response.status(400).json({ error: 'Request contains malformed JSON.' });
    } else {
      console.error('[mio-2d] Export failed:', error);
      response.status(500).json({ error: 'Unable to build the web package. Please check the server log.' });
    }
  };
  app.use(handleError);
  return app;
}

const launchedDirectly = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (launchedDirectly) {
  const port = Number(process.env.PORT ?? 4311);
  const host = process.env.HOST ?? '127.0.0.1';
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be an integer between 1 and 65535.');
  createApp().listen(port, host, () => {
    console.log(`Mio 2D server ready at http://${host}:${port}`);
  });
}
