import { config } from './config';
import { decryptSecret, encryptSecret } from './crypto';
import { withContext, withWorkspace } from './db';

export type TwitchConnection = {
  id: string;
  workspace_id: string;
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

/** Carrega a conexão Twitch do workspace com os tokens descriptografados. */
export async function getConnection(workspaceId: string): Promise<TwitchConnection | null> {
  return withWorkspace(workspaceId, async (q) => {
    const { rows } = await q<ConnectionRow>('select * from twitch_connections where workspace_id = $1', [workspaceId]);
    const row = rows[0];
    if (!row) return null;
    return {
      ...row,
      access_token: decryptSecret(row.access_token),
      refresh_token: decryptSecret(row.refresh_token),
    };
  });
}

export async function saveConnection(
  workspaceId: string,
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
         (workspace_id, twitch_user_id, login, display_name, avatar_url, broadcaster_type, scopes,
          access_token, refresh_token, expires_at, connected_by, connected_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, now())
       on conflict (workspace_id) do update set
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
    await q(`update workspaces set channel_name = $2, updated_at = now() where id = $1`, [workspaceId, data.login]);
  });
}

export async function deleteConnection(workspaceId: string): Promise<void> {
  await withWorkspace(workspaceId, (q) => q('delete from twitch_connections where workspace_id = $1', [workspaceId]));
}

/** Renova o token do usuário quando estiver perto de expirar (refresh rotativo). */
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
  if (!res.ok) throw new Error(`Twitch refresh falhou (${res.status})`);
  const data = (await res.json()) as { access_token: string; refresh_token: string; expires_in: number };
  const expiresAt = new Date(Date.now() + data.expires_in * 1000);

  await withWorkspace(conn.workspace_id, (q) =>
    q(`update twitch_connections set access_token=$2, refresh_token=$3, expires_at=$4, last_sync_at=now() where workspace_id=$1`, [
      conn.workspace_id,
      encryptSecret(data.access_token),
      encryptSecret(data.refresh_token),
      expiresAt.toISOString(),
    ]),
  );

  conn.access_token = data.access_token;
  conn.refresh_token = data.refresh_token;
  conn.expires_at = expiresAt.toISOString();
  return data.access_token;
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

export async function sendChatMessage(conn: TwitchConnection, token: string, message: string): Promise<void> {
  const res = await fetch('https://api.twitch.tv/helix/chat/messages', {
    method: 'POST',
    headers: {
      'Client-Id': config.twitch.clientId,
      Authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      broadcaster_id: conn.twitch_user_id,
      sender_id: conn.twitch_user_id,
      message: message.slice(0, 500),
    }),
  });
  if (!res.ok) throw new Error(`Envio de mensagem falhou (${res.status}): ${(await res.text()).slice(0, 200)}`);
}

export async function timeoutUser(
  conn: TwitchConnection,
  token: string,
  targetUserId: string,
  durationSeconds: number,
  reason: string,
): Promise<void> {
  const res = await fetch(
    `https://api.twitch.tv/helix/moderation/bans?broadcaster_id=${conn.twitch_user_id}&moderator_id=${conn.twitch_user_id}`,
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
