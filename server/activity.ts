import type { Query } from './db';

/** Registra uma ação no histórico do workspace, identificando quem executou. */
export async function logActivity(
  q: Query,
  entry: {
    workspaceId: string;
    userId?: string | null;
    actorName?: string;
    action: string;
    target?: string | null;
    details?: Record<string, unknown>;
  },
): Promise<void> {
  await q(
    `insert into activity_logs (workspace_id, user_id, actor_name, action, target, details)
     values ($1,$2,$3,$4,$5,$6)`,
    [
      entry.workspaceId,
      entry.userId ?? null,
      entry.actorName ?? 'Sistema',
      entry.action,
      entry.target ?? null,
      JSON.stringify(entry.details ?? {}),
    ],
  );
}
