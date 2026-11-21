import test, { after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { closePool, withContext } from '../db';
import {
  deleteConnection,
  ensureFreshToken,
  getConnection,
  getConnections,
  saveConnection,
  sendWorkspaceChatMessage,
  TwitchAuthError,
} from '../twitch';

/**
 * Arquitetura de duas contas Twitch por workspace:
 * streamer (canal/eventos) e bot (chat). Cada conexão tem identidade, tokens,
 * escopos e estado próprios; desconectar uma não afeta a outra.
 */

type Fixture = { userId: string; workspaceId: string };

const createdUsers: string[] = [];
const originalFetch = globalThis.fetch;
const STREAMER_ID = 'twitch-streamer-1';
const BOT_ID = 'twitch-bot-1';

async function createWorkspace(label: string): Promise<Fixture> {
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

async function connect(
  fixture: Fixture,
  type: 'streamer' | 'bot',
  overrides: Partial<{ login: string; userId: string; accessToken: string; expiresAt: Date }> = {},
): Promise<void> {
  const isBot = type === 'bot';
  await saveConnection(fixture.workspaceId, type, {
    twitchUserId: isBot ? BOT_ID : STREAMER_ID,
    login: overrides.login ?? (isBot ? 'bot-do-canal' : 'canal-do-streamer'),
    displayName: isBot ? 'Bot do canal' : 'Canal do streamer',
    avatarUrl: null,
    broadcasterType: isBot ? '' : 'affiliate',
    scopes: isBot
      ? ['user:bot', 'user:read:chat', 'user:write:chat']
      : ['channel:bot', 'user:write:chat', 'moderator:read:followers'],
    accessToken: overrides.accessToken ?? `${type}-access`,
    refreshToken: `${type}-refresh`,
    expiresAt: overrides.expiresAt ?? new Date(Date.now() + 60 * 60 * 1000),
    userId: overrides.userId ?? fixture.userId,
  });
}

function stubFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>): void {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    return handler(url, init);
  }) as typeof fetch;
}

afterEach(() => {
  globalThis.fetch = originalFetch;
});

after(async () => {
  for (const userId of createdUsers) {
    await withContext({ userId }, (q) => q('delete from users where id = $1', [userId]));
  }
  await closePool();
});

test('1. conecta apenas o streamer', async () => {
  const fixture = await createWorkspace('so-streamer');
  await connect(fixture, 'streamer');

  const connections = await getConnections(fixture.workspaceId);
  assert.equal(connections.streamer?.login, 'canal-do-streamer');
  assert.equal(connections.streamer?.status, 'active');
  assert.equal(connections.bot, null);
});

test('2. conecta apenas o bot: guardado, mas envio depende do canal do streamer', async () => {
  const fixture = await createWorkspace('so-bot');
  await connect(fixture, 'bot');

  const connections = await getConnections(fixture.workspaceId);
  assert.equal(connections.streamer, null);
  assert.equal(connections.bot?.twitch_user_id, BOT_ID);
  assert.deepEqual(connections.bot?.scopes, ['user:bot', 'user:read:chat', 'user:write:chat']);

  await assert.rejects(
    () => sendWorkspaceChatMessage(fixture.workspaceId, 'oi'),
    /conta do streamer/i,
  );
});

test('3. conecta duas contas diferentes com identidades independentes', async () => {
  const fixture = await createWorkspace('duas-contas');
  await connect(fixture, 'streamer');
  await connect(fixture, 'bot');

  const connections = await getConnections(fixture.workspaceId);
  assert.equal(connections.streamer?.twitch_user_id, STREAMER_ID);
  assert.equal(connections.bot?.twitch_user_id, BOT_ID);
  assert.notEqual(connections.streamer?.id, connections.bot?.id);
  assert.equal(connections.streamer?.access_token, 'streamer-access');
  assert.equal(connections.bot?.access_token, 'bot-access');
});

test('4. envia mensagem pela conta do bot no canal do streamer', async () => {
  const fixture = await createWorkspace('envio-bot');
  await connect(fixture, 'streamer');
  await connect(fixture, 'bot');

  const calls: { url: string; authorization: string; body: Record<string, unknown> }[] = [];
  stubFetch((url, init) => {
    const headers = new Headers(init?.headers);
    calls.push({
      url,
      authorization: headers.get('authorization') ?? '',
      body: init?.body ? JSON.parse(String(init.body)) : {},
    });
    return new Response(JSON.stringify({ data: [{ message_id: 'msg-bot', is_sent: true }] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  });

  const messageId = await sendWorkspaceChatMessage(fixture.workspaceId, 'mensagem do bot');
  assert.equal(messageId, 'msg-bot');
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/helix\/chat\/messages$/);
  assert.equal(calls[0].authorization, 'Bearer bot-access');
  assert.deepEqual(calls[0].body, {
    broadcaster_id: STREAMER_ID,
    sender_id: BOT_ID,
    message: 'mensagem do bot',
  });

  // Sem conta de bot, a conta do streamer é a única disponível e envia por ela.
  await deleteConnection(fixture.workspaceId, 'bot');
  calls.length = 0;
  const fallbackId = await sendWorkspaceChatMessage(fixture.workspaceId, 'sem bot');
  assert.equal(fallbackId, 'msg-bot');
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].body, {
    broadcaster_id: STREAMER_ID,
    sender_id: STREAMER_ID,
    message: 'sem bot',
  });
});

test('5. desconectar o bot mantém o streamer conectado', async () => {
  const fixture = await createWorkspace('desconecta-bot');
  await connect(fixture, 'streamer');
  await connect(fixture, 'bot');

  await deleteConnection(fixture.workspaceId, 'bot');

  const connections = await getConnections(fixture.workspaceId);
  assert.equal(connections.bot, null);
  assert.equal(connections.streamer?.login, 'canal-do-streamer');
});

test('6. desconectar o streamer mantém o bot conectado', async () => {
  const fixture = await createWorkspace('desconecta-streamer');
  await connect(fixture, 'streamer');
  await connect(fixture, 'bot');

  await deleteConnection(fixture.workspaceId, 'streamer');

  const connections = await getConnections(fixture.workspaceId);
  assert.equal(connections.streamer, null);
  assert.equal(connections.bot?.login, 'bot-do-canal');
});

test('7. renova os tokens de cada conta independentemente', async () => {
  const fixture = await createWorkspace('refresh-independente');
  const past = new Date(Date.now() - 60_000);
  await connect(fixture, 'streamer', { expiresAt: past });
  await connect(fixture, 'bot', { expiresAt: past });

  const refreshTokens: string[] = [];
  stubFetch((url, init) => {
    assert.match(url, /\/oauth2\/token$/);
    const body = new URLSearchParams(String(init?.body ?? ''));
    refreshTokens.push(body.get('refresh_token') ?? '');
    const type = body.get('refresh_token') === 'bot-refresh' ? 'bot' : 'streamer';
    return new Response(
      JSON.stringify({
        access_token: `renovado-${type}-access`,
        refresh_token: `renovado-${type}-refresh`,
        expires_in: 3600,
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  });

  const before = await getConnections(fixture.workspaceId);
  assert.ok(before.streamer && before.bot);

  assert.equal(await ensureFreshToken(before.streamer), 'renovado-streamer-access');
  const afterStreamer = await getConnections(fixture.workspaceId);
  assert.equal(afterStreamer.streamer?.access_token, 'renovado-streamer-access');
  assert.equal(afterStreamer.bot?.access_token, 'bot-access', 'o token do bot não pode ser tocado');

  assert.equal(await ensureFreshToken(afterStreamer.bot!), 'renovado-bot-access');
  const afterBot = await getConnections(fixture.workspaceId);
  assert.equal(afterBot.bot?.access_token, 'renovado-bot-access');
  assert.equal(afterBot.streamer?.access_token, 'renovado-streamer-access');

  assert.deepEqual(refreshTokens.sort(), ['bot-refresh', 'streamer-refresh']);
});

test('8. conexão expirada é marcada e informa reconexão', async () => {
  const fixture = await createWorkspace('conexao-expirada');
  await connect(fixture, 'bot', { expiresAt: new Date(Date.now() - 60_000) });

  stubFetch(
    () =>
      new Response(JSON.stringify({ status: 400, message: 'Invalid refresh token' }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      }),
  );

  const connection = await getConnection(fixture.workspaceId, 'bot');
  assert.ok(connection);
  await assert.rejects(() => ensureFreshToken(connection), (error: unknown) => {
    assert.ok(error instanceof TwitchAuthError);
    assert.equal(error.connectionType, 'bot');
    return true;
  });

  const stored = await getConnection(fixture.workspaceId, 'bot');
  assert.equal(stored?.status, 'expired');
  assert.equal(stored?.access_token, 'bot-access', 'o token antigo permanece até reconectar');
});

test('9. envia pela conta do streamer quando o workspace escolhe essa conta', async () => {
  const fixture = await createWorkspace('envio-streamer');
  await connect(fixture, 'streamer');
  await connect(fixture, 'bot');

  await withContext({ userId: fixture.userId, workspaceId: fixture.workspaceId }, (q) =>
    q(`update workspaces set preferences = preferences || '{"chat_sender":"streamer"}'::jsonb where id = $1`, [
      fixture.workspaceId,
    ]),
  );

  const calls: { body: Record<string, unknown> }[] = [];
  stubFetch((url, init) => {
    calls.push({ body: init?.body ? JSON.parse(String(init.body)) : {} });
    return new Response(JSON.stringify({ data: [{ message_id: 'msg-streamer', is_sent: true }] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  });

  const messageId = await sendWorkspaceChatMessage(fixture.workspaceId, 'mensagem do streamer');
  assert.equal(messageId, 'msg-streamer');
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].body, {
    broadcaster_id: STREAMER_ID,
    sender_id: STREAMER_ID,
    message: 'mensagem do streamer',
  });

  // A escolha é respeitada: sem a conta do streamer o envio falha mesmo com bot conectado.
  await deleteConnection(fixture.workspaceId, 'streamer');
  await assert.rejects(
    () => sendWorkspaceChatMessage(fixture.workspaceId, 'sem streamer'),
    /conta do streamer/i,
  );
});
