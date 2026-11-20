import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config, discordRedirectUri } from './config';
import { withContext } from './db';
import { pkcePair, randomToken } from './crypto';
import { ALL_PERMISSIONS, permissionsOf, type Permission } from './permissions';

export type AuthUser = {
  id: string;
  discord_id: string;
  username: string;
  global_name: string | null;
  avatar_url: string | null;
  email: string | null;
  created_at: string;
  last_login_at: string | null;
};

export type WorkspaceContext = {
  id: string;
  name: string;
  channel_name: string | null;
  display_name: string | null;
  logo_url: string | null;
  primary_color: string;
  secondary_color: string;
  preferences: Record<string, unknown>;
  role: string;
  permissions: Permission[];
  isOwner: boolean;
};

export type WorkspaceSummary = Omit<WorkspaceContext, 'isOwner'>;

const SESSION_COOKIE = 'sc_session';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
      workspace?: WorkspaceContext;
    }
  }
}

export function signSession(user: { id: string; discord_id: string }): string {
  return jwt.sign({ sub: user.id, did: user.discord_id }, config.sessionSecret, { expiresIn: '30d' });
}

export function setSessionCookie(res: Response, token: string): void {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.appUrl.startsWith('https'),
    maxAge: 30 * 24 * 60 * 60 * 1000,
    path: '/',
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE, { path: '/' });
}

export function readSession(req: Request): { sub: string; did: string } | null {
  const raw = (req.cookies as Record<string, string> | undefined)?.[SESSION_COOKIE];
  if (!raw) return null;
  try {
    return jwt.verify(raw, config.sessionSecret) as { sub: string; did: string };
  } catch {
    return null;
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const session = readSession(req);
  if (!session) {
    res.status(401).json({ error: 'Sessão expirada. Entre novamente.' });
    return;
  }
  const user = await withContext({ userId: session.sub }, async (q) => {
    const { rows } = await q<AuthUser>('select * from users where id = $1', [session.sub]);
    return rows[0];
  });
  if (!user) {
    res.status(401).json({ error: 'Usuário não encontrado.' });
    return;
  }
  req.user = user;
  next();
}

/** Resolve o workspace ativo a partir do cabeçalho x-workspace-id. */
export async function loadWorkspace(req: Request, res: Response, next: NextFunction): Promise<void> {
  const workspaceId = String(req.header('x-workspace-id') ?? '');
  if (!workspaceId) {
    res.status(400).json({ error: 'Workspace não informado.' });
    return;
  }
  const row = await withContext({ userId: req.user!.id, workspaceId }, async (q) => {
    const { rows } = await q<Record<string, unknown>>(
      `select w.*, m.role, m.permissions
         from workspaces w
         join workspace_members m on m.workspace_id = w.id
        where w.id = $1 and m.user_id = $2`,
      [workspaceId, req.user!.id],
    );
    return rows[0];
  });
  if (!row) {
    res.status(403).json({ error: 'Você não tem acesso a este workspace.' });
    return;
  }
  const role = String(row.role);
  req.workspace = {
    id: String(row.id),
    name: String(row.name),
    channel_name: (row.channel_name as string) ?? null,
    display_name: (row.display_name as string) ?? null,
    logo_url: (row.logo_url as string) ?? null,
    primary_color: String(row.primary_color ?? '#7c3aed'),
    secondary_color: String(row.secondary_color ?? '#22d3ee'),
    preferences: (row.preferences as Record<string, unknown>) ?? {},
    role,
    permissions: permissionsOf({ role, permissions: (row.permissions as string[]) ?? [] }),
    isOwner: role === 'owner',
  };
  next();
}

export function requirePermission(permission: Permission) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.workspace) {
      res.status(400).json({ error: 'Workspace não carregado.' });
      return;
    }
    if (!req.workspace.permissions.includes(permission)) {
      res.status(403).json({ error: `Permissão necessária: ${permission}` });
      return;
    }
    next();
  };
}

/** ---- Discord OAuth2 (PKCE) --------------------------------------------- */
export function buildDiscordAuth(): { url: string; cookie: string } {
  const { verifier, challenge } = pkcePair();
  const state = randomToken(16);
  const url = new URL('https://discord.com/oauth2/authorize');
  url.searchParams.set('client_id', config.discord.clientId);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('redirect_uri', discordRedirectUri());
  url.searchParams.set('scope', 'identify email');
  url.searchParams.set('state', state);
  url.searchParams.set('code_challenge', challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('prompt', 'consent');
  const cookie = jwt.sign({ state, verifier }, config.sessionSecret, { expiresIn: '10m' });
  return { url: url.toString(), cookie };
}

export type DiscordProfile = {
  id: string;
  username: string;
  global_name: string | null;
  avatar: string | null;
  email: string | null;
};

export async function exchangeDiscordCode(code: string, verifier: string): Promise<DiscordProfile> {
  const body = new URLSearchParams({
    client_id: config.discord.clientId,
    client_secret: config.discord.clientSecret,
    grant_type: 'authorization_code',
    code,
    redirect_uri: discordRedirectUri(),
    code_verifier: verifier,
  });
  const tokenRes = await fetch('https://discord.com/api/v10/oauth2/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!tokenRes.ok) throw new Error(`Discord token: ${tokenRes.status} ${(await tokenRes.text()).slice(0, 200)}`);
  const token = (await tokenRes.json()) as { access_token: string };

  const meRes = await fetch('https://discord.com/api/v10/users/@me', {
    headers: { Authorization: `Bearer ${token.access_token}` },
  });
  if (!meRes.ok) throw new Error(`Discord user: ${meRes.status}`);
  const me = (await meRes.json()) as {
    id: string;
    username: string;
    global_name?: string | null;
    avatar?: string | null;
    email?: string | null;
  };
  return {
    id: me.id,
    username: me.username,
    global_name: me.global_name ?? null,
    avatar: me.avatar ? `https://cdn.discordapp.com/avatars/${me.id}/${me.avatar}.png?size=128` : null,
    email: me.email ?? null,
  };
}

/** Cria (ou atualiza) o usuário e garante um workspace próprio. */
export async function loginOrCreateUser(profile: DiscordProfile): Promise<AuthUser> {
  return withContext({ discordId: profile.id }, async (q) => {
    const found = await q<AuthUser>('select * from users where discord_id = $1', [profile.id]);
    if (found.rows[0]) {
      const updated = await q<AuthUser>(
        `update users set username=$2, global_name=$3, avatar_url=$4, email=$5, last_login_at=now()
          where id=$1 returning *`,
        [found.rows[0].id, profile.username, profile.global_name, profile.avatar, profile.email],
      );
      return updated.rows[0];
    }

    const id = crypto.randomUUID();
    await q(`select set_config('app.user_id', $1, true)`, [id]);
    const inserted = await q<AuthUser>(
      `insert into users (id, discord_id, username, global_name, avatar_url, email, last_login_at)
       values ($1,$2,$3,$4,$5,$6, now()) returning *`,
      [id, profile.id, profile.username, profile.global_name, profile.avatar, profile.email],
    );
    const displayName = profile.global_name || profile.username;
    const workspace = await q<{ id: string }>(
      `insert into workspaces (owner_user_id, name, channel_name, display_name)
       values ($1,$2,$3,$4) returning id`,
      [id, `Workspace de ${displayName}`, profile.username.toLowerCase(), displayName],
    );
    await q(`select set_config('app.workspace_id', $1, true)`, [workspace.rows[0].id]);
    await q(
      `insert into workspace_members (workspace_id, user_id, role, permissions, created_by)
       values ($1,$2,'owner',$3,$2)`,
      [workspace.rows[0].id, id, JSON.stringify(ALL_PERMISSIONS)],
    );
    return inserted.rows[0];
  });
}

export async function listWorkspaces(userId: string): Promise<WorkspaceSummary[]> {
  return withContext({ userId }, async (q) => {
    const { rows } = await q<Record<string, unknown>>(
      `select w.id, w.name, w.channel_name, w.display_name, w.logo_url,
              w.primary_color, w.secondary_color, w.preferences, m.role, m.permissions
         from workspaces w
         join workspace_members m on m.workspace_id = w.id and m.user_id = $1
        order by w.created_at asc`,
      [userId],
    );
    return rows.map((row) => ({
      id: String(row.id),
      name: String(row.name),
      channel_name: (row.channel_name as string) ?? null,
      display_name: (row.display_name as string) ?? null,
      logo_url: (row.logo_url as string) ?? null,
      primary_color: String(row.primary_color ?? '#7c3aed'),
      secondary_color: String(row.secondary_color ?? '#22d3ee'),
      preferences: (row.preferences as Record<string, unknown>) ?? {},
      role: String(row.role),
      permissions: permissionsOf({ role: String(row.role), permissions: (row.permissions as string[]) ?? [] }),
    }));
  });
}
