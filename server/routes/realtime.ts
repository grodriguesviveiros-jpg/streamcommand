import { Router } from 'express';
import { listWorkspaces, requireAuth } from '../auth';
import { subscribe } from '../bus';

const router = Router();

/** Canal SSE com eventos do chat, da Twitch e do bot para os workspaces do usuário. */
router.get('/', requireAuth, async (req, res) => {
  const workspaces = await listWorkspaces(req.user!.id);

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write(`event: ready\ndata: ${JSON.stringify({ workspaces: workspaces.map((w) => w.id) })}\n\n`);

  const unsubscribe = subscribe(
    req.user!.id,
    workspaces.map((w) => w.id),
    res,
  );
  req.on('close', unsubscribe);
});

export default router;
