import { config } from './config';
import { decryptSecret, encryptSecret } from './crypto';
import { withContext, withWorkspace } from './db';

export type TwitchConnectionType = 'streamer' | 'bot';
export type TwitchConnectionStatus = 'active' | 'expired' | 'revoked' | 'error';

export type TwitchConnection = {
  id: string;
  workspace_id: string;
  connection_type: TwitchConnectionType;
  status: TwitchConnectionStatus;
  twitch_user_id: string;
  login: string;
  display_name: string | null;
  avatar_url: string | null;
  broadcaster_type: string | null;
  scopes: string[];
  access_token: string;
  refresh_token: string;
  expires_at: string;
  connected_at: string;
};

type ConnectionRow = Omit<TwitchConnection, 'access_token' | 'refresh_token'> & {
  access_token: string;
  refresh_token: string;
};

/** Erro de autenticação de uma conexão específica (token expirado/revogado). */
export class TwitchAuthError extends Error {
  constructor(
    public connectionType: TwitchConnectionType,
    message: string,
  ) {
    super(message);
    this.name = 'TwitchAuthError';
  }
}

/** Erro de operação que depende de uma conta conectada (ex.: bot ausente). */
export class TwitchNotConnectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TwitchNotConnectedError';
  }
}

export const twitchAccountLabel = (type: TwitchConnectionType): string =>
  type === 'bot' ? 'do bot' : 'do streamer';

function decryptRow(row: ConnectionRow): TwitchConnection {
  return {
    ...row,
    access_token: decryptSecret(row.access_token),
    refresh_token: decryptSecret(row.refresh_token),
  };
}

/** Carrega uma conexão do workspace (streamer ou bot) com os tokens abertos. */
export async function getConnection(
  workspaceId: string,
  type: TwitchConnectionType = 'streamer',
): Promise<TwitchConnection | null> {
  return withWorkspace(workspaceId, async (q) => {
    const { rows } = await q<ConnectionRow>(
      'select * from twitch_connections where workspace_id = $1 and connection_type = $2',
      [workspaceId, type],
    );
    return rows[0] ? decryptRow(rows[0]) : null;
  });
}

/** Carrega as duas conexões do workspace de uma vez. */
export async function getConnections(
  workspaceId: string,
): Promise<{ streamer: TwitchConnection | null; bot: TwitchConnection | null }> {
  const rows = await withWorkspace(workspaceId, async (q) =>
    (
      await q<ConnectionRow>('select * from twitch_connections where workspace_id = $1', [workspaceId])
    ).rows,
  );
  const find = (type: TwitchConnectionType) => {
    const row = rows.find((item) => item.connection_type === type);
    return row ? decryptRow(row) : null;
  };
  return { streamer: find('streamer'), bot: find('bot') };
}

export async function saveConnection(
  workspaceId: string,
  type: TwitchConnectionType,
  data: {
    twitchUserId: string;
    login: string;
    displayName: string | null;
    avatarUrl: string | null;
    broadcasterType: string | null;
    scopes: string[];
    accessToken: string;
    refreshToken: string;
    expiresAt: Date;
    userId: string;
  },
): Promise<void> {
  // O update em workspaces exige app.user_id: a política de RLS valida que quem
  // escreve é o dono (ou um membro) do workspace ativo.
  await withContext({ userId: data.userId, workspaceId }, async (q) => {
    await q(
      `insert into twitch_connections
         (workspace_id, connection_type, status, twitch_user_id, login, display_name, avatar_url,
          broadcaster_type, scopes, access_token, refresh_token, expires_at, connected_by, connected_at)
       values ($1,$2,'active',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12, now())
       on conflict (workspace_id, connection_type) do update set
         status = 'active',
         twitch_user_id = excluded.twitch_user_id,
         login = excluded.login,
         display_name = excluded.display_name,
         avatar_url = excluded.avatar_url,
         broadcaster_type = excluded.broadcaster_type,
         scopes = excluded.scopes,
         access_token = excluded.access_token,
         refresh_token = excluded.refresh_token,
         expires_at = excluded.expires_at,
         connected_by = excluded.connected_by,
         connected_at = now()`,
      [
        workspaceId,
        type,
        data.twitchUserId,
        data.login,
        data.displayName,
        data.avatarUrl,
        data.broadcasterType,
        data.scopes,
        encryptSecret(data.accessToken),
        encryptSecret(data.refreshToken),
        data.expiresAt.toISOString(),
        data.userId,
      ],
    );
    // Só a conta do streamer identifica o canal do workspace.
    if (type === 'streamer') {
      await q(`update workspaces set channel_name = $2, updated_at = now() where id = $1`, [
        workspaceId,
        data.login,
      ]);
    }
  });
}

export async function deleteConnection(workspaceId: string, type: TwitchConnectionType): Promise<void> {
  await withWorkspace(workspaceId, (q) =>
    q('delete from twitch_connections where workspace_id = $1 and connection_type = $2', [workspaceId, type]),
  );
}

export async function setConnectionStatus(
  workspaceId: string,
  type: TwitchConnectionType,
  status: TwitchConnectionStatus,
): Promise<void> {
  await withWorkspace(workspaceId, (q) =>
    q('update twitch_connections set status = $3 where workspace_id = $1 and connection_type = $2', [
      workspaceId,
      type,
      status,
    ]),
  );
}

/** Renova o token de UMA conexão quando estiver perto de expirar (refresh rotativo). */
export async function ensureFreshToken(conn: TwitchConnection): Promise<string> {
  if (new Date(conn.expires_at).getTime() > Date.now() + 120_000) return conn.access_token;

  const body = new URLSearchParams({
    client_id: config.twitch.clientId,
    client_secret: config.twitch.clientSecret,
    grant_type: 'refresh_token',
    refresh_token: conn.refresh_token,
  });
  const res = await fetch('https://id.twitch.tv/oauth2/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    if (res.status === 400 || res.status === 401) {
      await setConnectionStatus(conn.workspace_id, conn.connection_type, 'expired').catch(() => undefined);
      conn.status = 'expired';
      throw new TwitchAuthError(
        conn.connection_type,
        `A conexão ${twitchAccountLabel(conn.connection_type)} expirou. Reconecte a conta Twitch.`,
      );
    }
    throw new Error(
      `Twitch refresh falhou (${res.status})${text ? `: ${text.slice(0, 160)}` : ''}`,
    );
  }
  const data = (await res.json()) as { access_token: string; refresh_token: string; expires_in: number };
  const expiresAt = new Date(Date.now() + data.expires_in * 1000);

  await withWorkspace(conn.workspace_id, (q) =>
    q(
      `update twitch_connections
          set access_token=$3, refresh_token=$4, expires_at=$5, status='active', last_sync_at=now()
        where workspace_id=$1 and connection_type=$2`,
      [
        conn.workspace_id,
        conn.connection_type,
        encryptSecret(data.access_token),
        encryptSecret(data.refresh_token),
        expiresAt.toISOString(),
      ],
    ),
  );

  conn.access_token = data.access_token;
  conn.refresh_token = data.refresh_token;
  conn.expires_at = expiresAt.toISOString();
  conn.status = 'active';
  return data.access_token;
}

/** Revoga um token na Twitch (mecanismo oficial). Falha não bloqueia o logout local. */
export async function revokeToken(token: string): Promise<void> {
  if (!token) return;
  const body = new URLSearchParams({ client_id: config.twitch.clientId, token });
  await fetch('https://id.twitch.tv/oauth2/revoke', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  }).catch(() => undefined);
}

export type TwitchTokenValidation = {
  clientId: string;
  login: string | null;
  userId: string | null;
  scopes: string[];
  expiresIn: number;
};

/** Consulta o /validate oficial: identidade, escopos e validade do token. */
export async function validateToken(token: string): Promise<TwitchTokenValidation> {
  const res = await fetch('https://id.twitch.tv/oauth2/validate', {
    headers: { Authorization: `OAuth ${token}` },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Token inválido na Twitch (${res.status})${text ? `: ${text.slice(0, 120)}` : ''}`);
  }
  const data = (await res.json()) as {
    client_id: string;
    login: string | null;
    user_id: string | null;
    scopes: string[];
    expires_in: number;
  };
  return {
    clientId: data.client_id,
    login: data.login,
    userId: data.user_id,
    scopes: data.scopes ?? [],
    expiresIn: data.expires_in,
  };
}

type HelixResponse<T> = { data: T[]; total?: number; pagination?: { cursor?: string } };

export async function helix<T>(
  path: string,
  token: string,
  params?: Record<string, string | undefined>,
): Promise<HelixResponse<T>> {
  const url = new URL(`https://api.twitch.tv/helix${path}`);
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value !== undefined && value !== '') url.searchParams.set(key, value);
  }
  const res = await fetch(url, {
    headers: { 'Client-Id': config.twitch.clientId, Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Twitch API ${res.status} em ${path}: ${text.slice(0, 240)}`);
  }
  return (await res.json()) as HelixResponse<T>;
}

export type LiveStatus = {
  live: boolean;
  viewers: number;
  startedAt: string | null;
  title: string | null;
  game: string | null;
  thumbnailUrl: string | null;
};

export async function getLiveStatus(conn: TwitchConnection, token: string): Promise<LiveStatus> {
  const streams = await helix<{
    viewer_count: number;
    started_at: string;
    title: string;
    game_name: string;
    thumbnail_url: string;
  }>('/streams', token, { user_id: conn.twitch_user_id });
  const stream = streams.data[0];
  if (stream) {
    return {
      live: true,
      viewers: stream.viewer_count,
      startedAt: stream.started_at,
      title: stream.title,
      game: stream.game_name,
      thumbnailUrl: stream.thumbnail_url,
    };
  }
  try {
    const channel = await helix<{ title: string; game_name: string }>('/channels', token, {
      broadcaster_id: conn.twitch_user_id,
    });
    return {
      live: false,
      viewers: 0,
      startedAt: null,
      title: channel.data[0]?.title ?? null,
      game: channel.data[0]?.game_name ?? null,
      thumbnailUrl: null,
    };
  } catch {
    return { live: false, viewers: 0, startedAt: null, title: null, game: null, thumbnailUrl: null };
  }
}

export async function getFollowerCount(conn: TwitchConnection, token: string): Promise<number | null> {
  try {
    const res = await helix<{ total: number }>('/channels/followers', token, {
      broadcaster_id: conn.twitch_user_id,
      moderator_id: conn.twitch_user_id,
      first: '1',
    });
    return res.total ?? null;
  } catch {
    return null;
  }
}

/**
 * Envia uma mensagem no chat do canal com a conta remetente escolhida.
 * O token precisa ter `user:write:chat`; quando quem envia não é o canal, o
 * canal também precisa ter autorizado o app com `channel:bot` (ou o remetente
 * ser moderador).
 */
export async function sendChatMessage(
  sender: TwitchConnection,
  token: string,
  broadcasterId: string,
  message: string,
): Promise<string | null> {
  const res = await fetch('https://api.twitch.tv/helix/chat/messages', {
    method: 'POST',
    headers: {
      'Client-Id': config.twitch.clientId,
      Authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      broadcaster_id: broadcasterId,
      sender_id: sender.twitch_user_id,
      message: message.slice(0, 500),
    }),
  });
  if (!res.ok) throw new Error(`Envio de mensagem falhou (${res.status}): ${(await res.text()).slice(0, 200)}`);
  const body = (await res.json().catch(() => null)) as {
    data?: { message_id?: string; is_sent?: boolean; drop_reason?: { message?: string } }[];
  } | null;
  const entry = body?.data?.[0];
  if (entry && entry.is_sent === false) {
    throw new Error(`Envio recusado pela Twitch: ${entry.drop_reason?.message ?? 'motivo não informado'}`);
  }
  return entry?.message_id ?? null;
}

/** Conta que envia mensagens no chat, conforme a escolha do workspace. */
export async function getChatSenderPreference(workspaceId: string): Promise<TwitchConnectionType> {
  const rows = await withWorkspace(workspaceId, (q) =>
    q<{ preferences: Record<string, unknown> | null }>('select preferences from workspaces where id = $1', [
      workspaceId,
    ]),
  );
  return rows.rows[0]?.preferences?.chat_sender === 'streamer' ? 'streamer' : 'bot';
}

export type ChatSender = {
  type: TwitchConnectionType;
  connection: TwitchConnection;
  token: string;
  broadcasterId: string;
};

/**
 * Escolhe a conta que envia mensagens no chat. A preferência do workspace
 * (`preferences.chat_sender`) é respeitada: se a conta escolhida não estiver
 * conectada, a operação falha com uma mensagem clara em vez de usar a outra.
 */
export async function resolveChatSender(
  workspaceId: string,
  connections?: { streamer: TwitchConnection | null; bot: TwitchConnection | null },
): Promise<ChatSender> {
  const { streamer, bot } = connections ?? (await getConnections(workspaceId));
  if (!streamer) {
    throw new TwitchNotConnectedError('Conecte a conta do streamer para identificar o canal.');
  }
  const type = await getChatSenderPreference(workspaceId);
  const connection = type === 'streamer' ? streamer : bot;
  if (!connection) {
    throw new TwitchNotConnectedError(
      type === 'bot'
        ? 'Conta do bot não conectada — escolha a conta do streamer em Configurações → Twitch ou conecte o bot.'
        : 'Conta do streamer não conectada — escolha a conta do bot ou reconecte o streamer.',
    );
  }
  if (type === 'streamer' && !connection.scopes.includes('user:write:chat')) {
    throw new TwitchNotConnectedError(
      'A conta do streamer ainda não autorizou o envio de mensagens (user:write:chat). Reconecte a conta em Configurações → Twitch.',
    );
  }
  return {
    type,
    connection,
    token: await ensureFreshToken(connection),
    broadcasterId: streamer.twitch_user_id,
  };
}

/**
 * Envia no chat do workspace pela conta escolhida (bot ou streamer). Sem a
 * conta escolhida conectada (ou sem o canal do streamer) a operação falha com
 * uma mensagem clara — nunca finge que o envio funciona.
 */
export async function sendWorkspaceChatMessage(workspaceId: string, message: string): Promise<string | null> {
  const sender = await resolveChatSender(workspaceId);
  return sendChatMessage(sender.connection, sender.token, sender.broadcasterId, message);
}

/** Moderação sempre usa a conta do streamer (dona do canal). */
export async function timeoutUser(
  streamer: TwitchConnection,
  token: string,
  targetUserId: string,
  durationSeconds: number,
  reason: string,
): Promise<void> {
  const res = await fetch(
    `https://api.twitch.tv/helix/moderation/bans?broadcaster_id=${streamer.twitch_user_id}&moderator_id=${streamer.twitch_user_id}`,
    {
      method: 'POST',
      headers: {
        'Client-Id': config.twitch.clientId,
        Authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ data: { user_id: targetUserId, duration: durationSeconds, reason } }),
    },
  );
  if (!res.ok) throw new Error(`Moderação falhou (${res.status}): ${(await res.text()).slice(0, 200)}`);
}

/** Token de aplicativo (Client Credentials) para consultas públicas. */
let appToken: { token: string; expiresAt: number } | null = null;

export async function getAppToken(): Promise<string> {
  if (appToken && appToken.expiresAt > Date.now() + 60_000) return appToken.token;
  const body = new URLSearchParams({
    client_id: config.twitch.clientId,
    client_secret: config.twitch.clientSecret,
    grant_type: 'client_credentials',
  });
  const res = await fetch('https://id.twitch.tv/oauth2/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) throw new Error('Não foi possível obter token de aplicativo da Twitch');
  const data = (await res.json()) as { access_token: string; expires_in: number };
  appToken = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return data.access_token;
}
