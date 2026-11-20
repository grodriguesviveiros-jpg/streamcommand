import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

/**
 * Aplica as migrações pendentes usando a conexão administrativa.
 * Idempotente: cada arquivo é aplicado uma única vez (tabela schema_migrations).
 */
async function main() {
  const connectionString = process.env.MIGRATION_DATABASE_URL;
  if (!connectionString) throw new Error('MIGRATION_DATABASE_URL não configurada');

  const client = new pg.Client({ connectionString });
  await client.connect();

  await client.query(
    'create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())',
  );

  const dir = path.join(process.cwd(), 'server', 'migrations');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();

  for (const file of files) {
    const applied = await client.query('select 1 from schema_migrations where name = $1', [file]);
    if (applied.rowCount) continue;

    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
    await client.query('begin');
    try {
      await client.query(`select set_config('app.db_password', $1, true)`, [
        process.env.APP_DB_PASSWORD ?? 'sc_dev_password',
      ]);
      await client.query(sql);
      await client.query('insert into schema_migrations (name) values ($1)', [file]);
      await client.query('commit');
      console.log(`[migrate] aplicada: ${file}`);
    } catch (error) {
      await client.query('rollback');
      console.error(`[migrate] falhou: ${file}`);
      throw error;
    }
  }

  await client.end();
  console.log('[migrate] banco atualizado');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
