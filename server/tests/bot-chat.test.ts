import test, { after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { closePool, withContext } from '../db';
import { deleteConnection, getConnections, saveConnection } from '../twitch';
import { WorkspaceBot } from '../bot/engine';
import { chatMessageFromEvent } from '../bot/chat';
import { EventSubClient } from '../bot/eventsub';

/**
 * Regressão do chat do bot: a leitura vem do EventSub (`channel.chat.message`)
 * e a resposta pela API de chat (Helix). Os tokens do canal trazem
 * user:read:chat / user:write:chat — o IRC antigo exigia chat:read/chat:edit e
 * recusava a autenticação, então o bot nunca lia nem respondia.
 */

type Fixture = { userId: string; workspaceId: string };

const createdUsers: string[] = [];
const originalFetch = globalThis.fetch;
const BROADCASTER_ID = 'twitch-bot-chat';
const BOT_ID = 'twitch-bot-account';

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

async function connectChannel(fixture: Fixture): Promise<void> {
  // Duas conexões independentes: o streamer recebe eventos e o bot fala no chat.
  await saveConnection(fixture.workspaceId, 'streamer', {
    twitchUserId: BROADCASTER_ID,
    login: 'canal-do-teste',
    displayName: 'Canal do teste',
    avatarUrl: null,
    broadcasterType: 'affiliate',
    scopes: ['channel:bot', 'moderator:read:followers'],
    accessToken: 'streamer-access-token',
    refreshToken: 'streamer-refresh-token',
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    userId: fixture.userId,
  });
  await saveConnection(fixture.workspaceId, 'bot', {
    twitchUserId: BOT_ID,
    login: 'bot-do-teste',
    displayName: 'Bot do teste',
    avatarUrl: null,
    broadcasterType: '',
    scopes: ['user:bot', 'user:read:chat', 'user:write:chat'],
    accessToken: 'bot-access-token',
    refreshToken: 'bot-refresh-token',
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    userId: fixture.userId,
  });
}

function stubFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>): void {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    return handler(url, init);
  }) as typeof fetch;
}

function eventPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    broadcaster_user_id: BROADCASTER_ID,
    broadcaster_user_login: 'canal-do-teste',
    chatter_user_id: 'viewer-1',
    chatter_user_login: 'viewer',
    chatter_user_name: 'Viewer',
    message_id: 'msg-1',
    message_type: 'text',
    color: '#1e90ff',
    message: { text: '!discord' },
    badges: [{ set_id: 'subscriber', id: '1' }],
    ...overrides,
  };
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

test('mapeia mensagem do EventSub com autor, cor e badges', () => {
  const message = chatMessageFromEvent(eventPayload(), BROADCASTER_ID);

  assert.ok(message);
  assert.equal(message.messageId, 'msg-1');
  assert.equal(message.userId, 'viewer-1');
  assert.equal(message.displayName, 'Viewer');
  assert.equal(message.color, '#1e90ff');
  assert.equal(message.message, '!discord');
  assert.equal(message.isSub, true);
  assert.equal(message.isBroadcaster, false);

  assert.equal(chatMessageFromEvent(eventPayload({ message_type: 'user_intro' }), BROADCASTER_ID), null);
  assert.equal(
    chatMessageFromEvent(eventPayload({ source_broadcaster_user_id: 'outro-canal' }), BROADCASTER_ID),
    null,
  );
});

test('bot lê a mensagem, grava no histórico e responde o comando no chat', async () => {
  const fixture = await createWorkspace('bot-chat');
  await connectChannel(fixture);
  await withContext({ userId: fixture.userId, workspaceId: fixture.workspaceId }, (q) =>
    q(
      `insert into custom_commands (workspace_id, name, response, cooldown_seconds, min_role, enabled, created_by)
       values ($1,'discord',$2,0,'everyone',true,$3)`,
      [fixture.workspaceId, '!discord https://discord.gg/stream', fixture.userId],
    ),
  );

  const sends: { url: string; body: Record<string, unknown> }[] = [];
  stubFetch((url, init) => {
    sends.push({ url, body: init?.body ? JSON.parse(String(init.body)) : {} });
    return new Response(JSON.stringify({ data: [{ message_id: 'sent-1', is_sent: true }] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  });

  const bot = new WorkspaceBot(fixture.workspaceId);
  const message = chatMessageFromEvent(eventPayload(), BROADCASTER_ID);
  assert.ok(message);
  await bot.handleChatMessage(message);

  assert.equal(sends.length, 1);
  assert.match(sends[0].url, /\/helix\/chat\/messages$/);
  assert.deepEqual(sends[0].body, {
    broadcaster_id: BROADCASTER_ID,
    sender_id: BOT_ID,
    message: '!discord https://discord.gg/stream',
  });

  const history = await withContext({ userId: fixture.userId, workspaceId: fixture.workspaceId }, async (q) =>
    (await q<{ message: string }>('select message from chat_messages order by created_at asc')).rows,
  );
  assert.deepEqual(
    history.map((row) => row.message),
    ['!discord'],
  );

  const command = await withContext({ userId: fixture.userId, workspaceId: fixture.workspaceId }, async (q) =>
    (await q<{ use_count: number }>('select use_count from custom_commands where workspace_id = $1', [
      fixture.workspaceId,
    ])).rows[0],
  );
  assert.equal(command.use_count, 1);

  // A própria resposta volta pelo EventSub: entra no histórico, mas não pode
  // disparar o comando outra vez (loop).
  const echo = chatMessageFromEvent(
    eventPayload({
      chatter_user_id: BROADCASTER_ID,
      chatter_user_login: 'canal-do-teste',
      chatter_user_name: 'Canal do teste',
      message_id: 'sent-1',
      message: { text: '!discord https://discord.gg/stream' },
      badges: [{ set_id: 'broadcaster', id: '1' }],
    }),
    BROADCASTER_ID,
  );
  assert.ok(echo);
  await bot.handleChatMessage(echo);

  assert.equal(sends.length, 1, 'a resposta do bot não deve acionar o comando novamente');
});

test('não conta o comando quando a Twitch recusa a mensagem', async () => {
  const fixture = await createWorkspace('bot-chat-recusado');
  await connectChannel(fixture);
  await withContext({ userId: fixture.userId, workspaceId: fixture.workspaceId }, (q) =>
    q(
      `insert into custom_commands (workspace_id, name, response, cooldown_seconds, min_role, enabled, created_by)
       values ($1,'discord',$2,0,'everyone',true,$3)`,
      [fixture.workspaceId, '!discord https://discord.gg/stream', fixture.userId],
    ),
  );

  stubFetch(
    () =>
      new Response(
        JSON.stringify({
          data: [{ message_id: 'sent-drop', is_sent: false, drop_reason: { message: 'duplicate message' } }],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
  );

  const bot = new WorkspaceBot(fixture.workspaceId);
  const message = chatMessageFromEvent(eventPayload(), BROADCASTER_ID);
  assert.ok(message);
  await bot.handleChatMessage(message);

  const command = await withContext({ userId: fixture.userId, workspaceId: fixture.workspaceId }, async (q) =>
    (await q<{ use_count: number }>('select use_count from custom_commands where workspace_id = $1', [
      fixture.workspaceId,
    ])).rows[0],
  );
  assert.equal(command.use_count, 0);
});

test('só marca o bot como conectado quando a assinatura do chat é aceita', async () => {
  async function statusAfterSubscribe(
    failChat: boolean,
  ): Promise<{ status: string; detail?: string; bodies: Record<string, any>[] }> {
    const bodies: Record<string, any>[] = [];
    stubFetch((_url, init) => {
      const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, any>) : {};
      bodies.push(body);
      if (body.type === 'channel.chat.message' && failChat) {
        return new Response('{"message":"Missing scope: user:read:chat"}', { status: 403 });
      }
      return new Response('{}', { status: 202 });
    });

    const statuses: { status: string; detail?: string }[] = [];
    const client = new EventSubClient({
      subscriptions: [
        {
          type: 'channel.chat.message',
          version: '1',
          condition: { broadcaster_user_id: BROADCASTER_ID, user_id: BOT_ID },
          getToken: async () => 'access-token',
        },
      ],
      requiredTypes: ['channel.chat.message'],
      onEvent: () => undefined,
      onStatus: (status, detail) => statuses.push({ status, detail }),
    });
    await (client as unknown as { handle(raw: string): Promise<void> }).handle(
      JSON.stringify({
        metadata: { message_type: 'session_welcome' },
        payload: { session: { id: 'session-1' } },
      }),
    );
    assert.equal(statuses.length, 1);
    return { ...statuses[0], bodies };
  }

  const failed = await statusAfterSubscribe(true);
  assert.equal(failed.status, 'error');
  assert.match(failed.detail ?? '', /channel\.chat\.message/);

  const connected = await statusAfterSubscribe(false);
  assert.equal(connected.status, 'connected');
  const chatSubscription = connected.bodies.find((body) => body.type === 'channel.chat.message');
  assert.deepEqual(chatSubscription?.condition, {
    broadcaster_user_id: BROADCASTER_ID,
    user_id: BOT_ID,
  });
});

test('sem conta de bot, o chat é lido pela própria conta do streamer', async () => {
  const fixture = await createWorkspace('bot-chat-streamer-only');
  await connectChannel(fixture);
  await deleteConnection(fixture.workspaceId, 'bot');
  const streamerToken = (await getConnections(fixture.workspaceId)).streamer?.access_token;

  const subscriptions: { body: Record<string, any>; authorization: string }[] = [];
  stubFetch((url, init) => {
    if (url.includes('/eventsub/subscriptions')) {
      subscriptions.push({
        body: init?.body ? (JSON.parse(String(init.body)) as Record<string, any>) : {},
        authorization: new Headers(init?.headers).get('authorization') ?? '',
      });
      return new Response('{}', { status: 202 });
    }
    return new Response(JSON.stringify({ data: [] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  });

  const sockets: FakeWebSocket[] = [];
  const originalWebSocket = globalThis.WebSocket;
  globalThis.WebSocket = class extends FakeWebSocket {
    constructor(url: string) {
      super(url);
      sockets.push(this);
    }
  } as unknown as typeof WebSocket;

  try {
    const bot = new WorkspaceBot(fixture.workspaceId);
    await bot.start();
    // Dois clientes EventSub: eventos do canal e chat.
    assert.equal(sockets.length, 2);
    for (const socket of sockets) {
      socket.emit(
        'message',
        JSON.stringify({
          metadata: { message_type: 'session_welcome' },
          payload: { session: { id: 'session-1' } },
        }),
      );
    }

    const chatSubscription = await waitForSubscription(subscriptions, 'channel.chat.message');
    assert.deepEqual(chatSubscription.body.condition, {
      broadcaster_user_id: BROADCASTER_ID,
      user_id: BROADCASTER_ID,
    });
    assert.equal(chatSubscription.authorization, `Bearer ${streamerToken}`);

    const status = bot.getStatus();
    assert.equal(status.streamer, true);
    assert.equal(status.bot, false);
    assert.equal(status.chatSender, 'streamer');
    bot.stop();
  } finally {
    globalThis.WebSocket = originalWebSocket;
  }
});

/** WebSocket falso: só entrega mensagens do EventSub para o cliente. */
class FakeWebSocket {
  private listeners = new Map<string, ((event: { data?: string }) => void)[]>();

  constructor(public url: string) {}

  addEventListener(type: string, listener: (event: { data?: string }) => void): void {
    const list = this.listeners.get(type) ?? [];
    list.push(listener);
    this.listeners.set(type, list);
  }

  emit(type: string, data?: string): void {
    for (const listener of this.listeners.get(type) ?? []) listener({ data });
  }

  close(): void {
    this.emit('close');
  }
}

async function waitForSubscription(
  subscriptions: { body: Record<string, any>; authorization: string }[],
  type: string,
): Promise<{ body: Record<string, any>; authorization: string }> {
  for (let attempt = 0; attempt < 50; attempt++) {
    const found = subscriptions.find((item) => item.body.type === type);
    if (found) return found;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`assinatura ${type} não foi criada`);
}
