import { Router } from 'express';
import { loadWorkspace, requireAuth } from '../auth';
import { withContext } from '../db';
import { ensureFreshToken, getConnection, getFollowerCount, getLiveStatus } from '../twitch';

const router = Router();
router.use(requireAuth, loadWorkspace);

/** Estatísticas reais do workspace: chat, sessões, equipe e integrações. */
router.get('/overview', async (req, res) => {
  if (!req.workspace!.permissions.includes('stats.view') && !req.workspace!.permissions.includes('dashboard.view')) {
    res.status(403).json({ error: 'Permissão necessária: stats.view' });
    return;
  }
  const days = Math.min(365, Math.max(1, Number(req.query.days ?? 30)));
  const workspaceId = req.workspace!.id;

  const data = await withContext({ userId: req.user!.id, workspaceId }, async (q) => {
    const messages = await q<{ day: string; count: number }>(
      `select to_char(date_trunc('day', created_at), 'YYYY-MM-DD') as day, count(*)::int as count
         from chat_messages
        where workspace_id = $1 and created_at > now() - ($2::int || ' days')::interval
        group by 1 order by 1`,
      [workspaceId, days],
    );
    const sessions = await q<Record<string, unknown>>(
      `select id, title, game_name, started_at, ended_at, peak_viewers, avg_viewers, follower_gain
         from stream_sessions
        where workspace_id = $1 and started_at > now() - ($2::int || ' days')::interval
        order by started_at desc limit 60`,
      [workspaceId, days],
    );
    const activity = await q<Record<string, unknown>>(
      `select a.id, a.actor_name, a.action, a.target, a.details, a.created_at
         from activity_logs a
        where a.workspace_id = $1
        order by a.created_at desc limit 40`,
      [workspaceId],
    );
    const commands = await q<{ id: string; name: string; use_count: number }>(
      `select id, name, use_count from custom_commands where workspace_id = $1 order by use_count desc limit 8`,
      [workspaceId],
    );
    const totals = await q<Record<string, number>>(
      `select
         (select count(*)::int from custom_commands where workspace_id = $1) as commands,
         (select count(*)::int from automations where workspace_id = $1) as automations,
         (select count(*)::int from timers where workspace_id = $1) as timers,
         (select count(*)::int from chat_messages where workspace_id = $1) as messages,
         (select count(*)::int from workspace_members where workspace_id = $1) as members,
         (select coalesce(sum(run_count),0)::int from automations where workspace_id = $1) as automation_runs`,
      [workspaceId],
    );
    return {
      messages: messages.rows,
      sessions: sessions.rows,
      activity: activity.rows,
      commands: commands.rows,
      totals: totals.rows[0],
    };
  });

  const connection = await getConnection(workspaceId);
  let live: Record<string, unknown> | null = null;
  if (connection) {
    try {
      const token = await ensureFreshToken(connection);
      const [status, followers] = await Promise.all([getLiveStatus(connection, token), getFollowerCount(connection, token)]);
      live = { ...status, followers };
    } catch {
      live = null;
    }
  }

  res.json({ days, ...data, live, twitchConnected: Boolean(connection) });
});

export default router;
