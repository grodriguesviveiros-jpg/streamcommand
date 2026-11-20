import pg from 'pg';

export type QueryResult<R> = { rows: R[]; rowCount: number };
export type Query = <R = Record<string, unknown>>(text: string, params?: unknown[]) => Promise<QueryResult<R>>;

export type Context = {
  userId?: string;
  workspaceId?: string;
  discordId?: string;
  discordUsername?: string;
  inviteToken?: string;
};

/** Pool de runtime: conecta com o papel restrito (RLS forçado). */
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 12,
  idleTimeoutMillis: 20_000,
});

/**
 * Executa um bloco dentro de uma transação com o contexto de segurança definido.
 * As políticas de RLS leem app.user_id / app.workspace_id via current_setting.
 */
export async function withContext<T>(ctx: Context, fn: (q: Query) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query(
      `select set_config('app.user_id', $1, true),
              set_config('app.workspace_id', $2, true),
              set_config('app.discord_id', $3, true),
              set_config('app.discord_username', $4, true),
              set_config('app.invite_token', $5, true)`,
      [ctx.userId ?? '', ctx.workspaceId ?? '', ctx.discordId ?? '', ctx.discordUsername ?? '', ctx.inviteToken ?? ''],
    );
    const q: Query = (text, params) => client.query(text, params as never[]) as never;
    const result = await fn(q);
    await client.query('commit');
    return result;
  } catch (error) {
    try {
      await client.query('rollback');
    } catch {
      /* ignore */
    }
    throw error;
  } finally {
    client.release();
  }
}

/** Consulta administrativa (superuser) usada apenas pelo serviço de bot. */
export const adminPool = new pg.Pool({
  connectionString: process.env.MIGRATION_DATABASE_URL,
  max: 4,
});

export async function withWorkspace<T>(workspaceId: string, fn: (q: Query) => Promise<T>): Promise<T> {
  return withContext({ workspaceId }, fn);
}
