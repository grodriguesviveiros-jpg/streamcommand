import { Router } from 'express';
import { loadWorkspace, requireAuth, requirePermission } from '../auth';
import { withContext } from '../db';
import { ensureFreshToken, getConnection, sendChatMessage, timeoutUser } from '../twitch';
import { logActivity } from '../activity';

const router = Router();
router.use(requireAuth, loadWorkspace);

router.get('/messages', requirePermission('chat.view'), async (req, res) => {
  const limit = Math.min(200, Math.max(1, Number(req.query.limit ?? 100)));
  const rows = await withContext({ userId: req.user!.id, workspaceId: req.workspace!.id }, async (q) =>
    (
      await q(
        `select id, username, display_color, message, is_mod, is_sub, created_at
           from chat_messages where workspace_id = $1
          order by created_at desc limit $2`,
        [req.workspace!.id, limit],
      )
    ).rows,
  );
  res.json({ messages: rows.reverse() });
});

router.post('/send', requirePermission('chat.send'), async (req, res) => {
  const message = String(req.body?.message ?? '').trim();
  if (!message) {
    res.status(400).json({ error: 'Mensagem vazia.' });
    return;
  }
  const connection = await getConnection(req.workspace!.id);
  if (!connection) {
    res.status(400).json({ error: 'Conecte a Twitch para enviar mensagens no chat.' });
    return;
  }
  try {
    const token = await ensureFreshToken(connection);
    await sendChatMessage(connection, token, message);
    await withContext({ userId: req.user!.id, workspaceId: req.workspace!.id }, (q) =>
      logActivity(q, {
        workspaceId: req.workspace!.id,
        userId: req.user!.id,
        actorName: req.user!.username,
        action: 'chat.mensagem_enviada',
        target: message.slice(0, 80),
      }),
    );
    res.json({ ok: true });
  } catch (error) {
    res.status(502).json({ error: error instanceof Error ? error.message : 'Falha ao enviar mensagem' });
  }
});

router.post('/timeout', requirePermission('chat.moderate'), async (req, res) => {
  const userId = String(req.body?.userId ?? '');
  const duration = Math.max(1, Math.min(1_209_600, Number(req.body?.duration ?? 600)));
  const reason = String(req.body?.reason ?? 'moderação');
  if (!userId) {
    res.status(400).json({ error: 'Usuário não informado.' });
    return;
  }
  const connection = await getConnection(req.workspace!.id);
  if (!connection) {
    res.status(400).json({ error: 'Conecte a Twitch para moderar o chat.' });
    return;
  }
  try {
    const token = await ensureFreshToken(connection);
    await timeoutUser(connection, token, userId, duration, reason);
    await withContext({ userId: req.user!.id, workspaceId: req.workspace!.id }, (q) =>
      logActivity(q, {
        workspaceId: req.workspace!.id,
        userId: req.user!.id,
        actorName: req.user!.username,
        action: 'chat.timeout',
        target: userId,
        details: { duration, reason },
      }),
    );
    res.json({ ok: true });
  } catch (error) {
    res.status(502).json({ error: error instanceof Error ? error.message : 'Falha ao moderar' });
  }
});

export default router;
