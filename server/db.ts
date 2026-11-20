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

/**
 * Conexão de runtime: usa DATABASE_URL quando definida (Compose). Em produção
 * (Render) tenta o papel restrito sc_app derivado da conexão administrativa e,
 * se ele não existir na base, conecta com o próprio usuário do banco — o RLS
 * forçado continua valendo, pois nenhum dos dois é superusuário.
 */
async function resolveRuntimeUrl(): Promise<string | undefined> {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const admin = process.env.MIGRATION_DATABASE_URL;
  const password = process.env.APP_DB_PASSWORD;
  if (!admin || !password) return admin;
  const url = new URL(admin);
  url.username = 'sc_app';
  url.password = password;
  const candidate = url.toString();
  const probe = new pg.Client({ connectionString: candidate });
  try {
    await probe.connect();
    await probe.end();
    return candidate;
  } catch {
    const check = new pg.Client({ connectionString: admin });
    try {
      await check.connect();
      const { rows } = await check.query<{ bypass: boolean }>(
        'select rolsuper or rolbypassrls as bypass from pg_roles where rolname = current_user',
      );
      if (rows[0]?.bypass) {
        console.warn(
          '[db] ATENÇÃO: a conexão do banco ignora RLS (superusuário); o isolamento por workspace não é garantido.',
        );
      } else {
        console.warn('[db] papel sc_app indisponível; usando a conexão do banco com RLS forçado.');
      }
      await check.end();
    } catch {
      /* a conexão principal reporta o erro */
    }
    return admin;
  }
}

/** Pool de runtime: conecta com o papel restrito (RLS forçado). */
let poolPromise: Promise<pg.Pool> | null = null;
function getPool(): Promise<pg.Pool> {
  poolPromise ??= resolveRuntimeUrl().then(
    (connectionString) => new pg.Pool({ connectionString, max: 12, idleTimeoutMillis: 20_000 }),
  );
  return poolPromise;
}

/**
 * Executa um bloco dentro de uma transação com o contexto de segurança definido.
 * As políticas de RLS leem app.user_id / app.workspace_id via current_setting.
 */
export async function withContext<T>(ctx: Context, fn: (q: Query) => Promise<T>): Promise<T> {
  const client = await (await getPool()).connect();
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

/** Fecha o pool de runtime (usado pelos testes para o processo terminar). */
export async function closePool(): Promise<void> {
  if (!poolPromise) return;
  const pool = await poolPromise;
  await pool.end();
  poolPromise = null;
}

/** Consulta administrativa (superuser) usada apenas pelo serviço de bot. */
export const adminPool = new pg.Pool({
  connectionString: process.env.MIGRATION_DATABASE_URL,
  max: 4,
});

export async function withWorkspace<T>(workspaceId: string, fn: (q: Query) => Promise<T>): Promise<T> {
  return withContext({ workspaceId }, fn);
}
