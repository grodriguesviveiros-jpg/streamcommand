import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { closePool, withContext } from '../db';
import { getConnection, saveConnection } from '../twitch';

/**
 * Regressão do callback da Twitch: salvar a conexão também atualiza
 * workspaces.channel_name, e o RLS de workspaces só aceita a escrita do dono ou
 * de um membro do workspace ativo (app.workspace_id). Roda contra o banco do
 * Compose usando DATABASE_URL (papel sc_app, RLS forçado).
 */

type Fixture = { userId: string; workspaceId: string };

const createdUsers: string[] = [];

async function createUserAndWorkspace(label: string): Promise<Fixture> {
  const userId = crypto.randomUUID();
  const workspaceId = crypto.randomUUID();
  await withContext({ userId }, async (q) => {
    await q('insert into users (id, discord_id, username) values ($1,$2,$3)', [
      userId,
      `test-${label}-${userId}`,
      `test-${label}`,
    ]);
    await q('insert into workspaces (id, owner_user_id, name) values ($1,$2,$3)', [
      workspaceId,
      userId,
      `Workspace ${label}`,
    ]);
    await q(`select set_config('app.workspace_id', $1, true)`, [workspaceId]);
    await q(
      `insert into workspace_members (workspace_id, user_id, role, permissions, created_by)
       values ($1,$2,'owner','[]'::jsonb,$2)`,
      [workspaceId, userId],
    );
  });
  createdUsers.push(userId);
  return { userId, workspaceId };
}

function connectionData(userId: string, login: string) {
  return {
    twitchUserId: `twitch-${login}`,
    login,
    displayName: login,
    avatarUrl: null,
    broadcasterType: 'affiliate',
    scopes: ['user:read:chat'],
    accessToken: 'access-token',
    refreshToken: 'refresh-token',
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    userId,
  };
}

async function channelName(fixture: Fixture): Promise<string | null> {
  return withContext({ userId: fixture.userId, workspaceId: fixture.workspaceId }, async (q) => {
    const { rows } = await q<{ channel_name: string | null }>('select channel_name from workspaces where id = $1', [
      fixture.workspaceId,
    ]);
    return rows[0]?.channel_name ?? null;
  });
}

after(async () => {
  for (const userId of createdUsers) {
    await withContext({ userId }, (q) => q('delete from users where id = $1', [userId]));
  }
  await closePool();
});

test('dono conecta a Twitch e o canal é gravado no workspace', async () => {
  const owner = await createUserAndWorkspace('owner');

  await saveConnection(owner.workspaceId, 'streamer', connectionData(owner.userId, 'canal-do-dono'));

  const connection = await getConnection(owner.workspaceId);
  assert.equal(connection?.login, 'canal-do-dono');
  assert.equal(await channelName(owner), 'canal-do-dono');
});

test('membro com twitch.manage conclui a conexão sem ser dono', async () => {
  const owner = await createUserAndWorkspace('owner-time');
  const member = await createUserAndWorkspace('membro');

  await withContext({ userId: owner.userId, workspaceId: owner.workspaceId }, (q) =>
    q(
      `insert into workspace_members (workspace_id, user_id, role, permissions, created_by)
       values ($1,$2,'admin',$3,$4)`,
      [owner.workspaceId, member.userId, JSON.stringify(['twitch.manage']), owner.userId],
    ),
  );

  await saveConnection(owner.workspaceId, 'streamer', connectionData(member.userId, 'canal-do-time'));

  assert.equal(await channelName(owner), 'canal-do-time');
  assert.equal((await getConnection(owner.workspaceId))?.login, 'canal-do-time');
});

test('usuário de outro workspace não grava a conexão nem o canal', async () => {
  const owner = await createUserAndWorkspace('owner-isolado');
  const outsider = await createUserAndWorkspace('estranho');

  await assert.rejects(
    () => saveConnection(owner.workspaceId, 'streamer', connectionData(outsider.userId, 'invasor')),
    /row-level security|permission denied/i,
  );

  assert.equal(await getConnection(owner.workspaceId), null);
  assert.equal(await channelName(owner), null);
});
