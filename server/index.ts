import fs from 'node:fs';
import express, { type NextFunction, type Request, type Response } from 'express';
import cookieParser from 'cookie-parser';
import { config } from './config';
import authRoutes from './routes/auth';
import workspaceRoutes from './routes/workspaces';
import integrationRoutes from './routes/integrations';
import chatRoutes from './routes/chat';
import resourceRoutes from './routes/resources';
import statsRoutes from './routes/stats';
import realtimeRoutes from './routes/realtime';
import { requireAuth } from './auth';
import { applyAsyncGuard } from './async-router';
import { startBotEngine } from './bot/engine';

const app = express();
app.set('trust proxy', true);
app.disable('x-powered-by');
app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'stream-command-api', ts: new Date().toISOString() });
});

app.use('/api/auth', applyAsyncGuard(authRoutes));
app.use('/api/workspaces', applyAsyncGuard(workspaceRoutes));
app.use('/api/integrations', applyAsyncGuard(integrationRoutes));
app.use('/api/chat', applyAsyncGuard(chatRoutes));
app.use('/api/data', applyAsyncGuard(resourceRoutes));
app.use('/api/stats', applyAsyncGuard(statsRoutes));
app.use('/api/realtime', applyAsyncGuard(realtimeRoutes));

/** Arquivos de áudio do soundboard exigem sessão válida. */
fs.mkdirSync(config.uploadDir, { recursive: true });
app.use('/uploads', requireAuth, express.static(config.uploadDir, { maxAge: '1h', fallthrough: false }));

app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Rota não encontrada.' });
});

app.use((error: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[api]', error.message);
  if (res.headersSent) return;
  const isInput = /áudio|audio|uuid|inválid/i.test(error.message);
  res.status(isInput ? 400 : 500).json({
    error: isInput ? error.message : 'Erro interno no servidor. Tente novamente.',
  });
});

process.on('unhandledRejection', (reason) => {
  console.error('[api] unhandledRejection', reason instanceof Error ? reason.message : reason);
});
process.on('uncaughtException', (error) => {
  console.error('[api] uncaughtException', error.message);
});

app.listen(config.port, '0.0.0.0', () => {
  console.log(`[api] STREAM COMMAND API ouvindo em :${config.port}`);
  startBotEngine().catch((error) => console.error('[api] bot engine', error));
});
