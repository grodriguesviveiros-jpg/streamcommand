import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { config, isTwitchConfigured, TWITCH_SCOPES, twitchRedirectUri } from '../config';
import { loadWorkspace, requireAuth, requirePermission } from '../auth';
import { withContext } from '../db';
import { decryptSecret, encryptSecret, pkcePair, randomToken } from '../crypto';
import { deleteConnection, ensureFreshToken, getConnection, getFollowerCount, getLiveStatus, saveConnection } from '../twitch';
import { botStatus, restartBot, stopBot } from '../bot/engine';
import { logActivity } from '../activity';
import { permissionsOf } from '../permissions';

const router = Router();
router.use(requireAuth);

/** Resumo da conexão Twitch (nunca devolve tokens). */
router.get('/twitch', loadWorkspace, requirePermission('dashboard.view'), async (req, res) => {
  const connection = await getConnection(req.workspace!.id);
  res.json({
    configured: isTwitchConfigured(),
    redirectUri: twitchRedirectUri(),
    bot: botStatus(req.workspace!.id),
    connection: connection
      ? {
          login: connection.login,
          displayName: connection.display_name,
          avatarUrl: connection.avatar_url,
          broadcasterType: connection.broadcaster_type,
          scopes: connection.scopes,
          connectedAt: connection.connected_at,
          expiresAt: connection.expires_at,
        }
      : null,
  });
});

/** Inicia o OAuth da Twitch para vincular o canal ao workspace ativo. */
router.get('/twitch/start', async (req, res) => {
  if (!isTwitchConfigured()) {
    res.status(503).json({ error: 'Integração Twitch não configurada (TWITCH_CLIENT_ID / TWITCH_CLIENT_SECRET).' });
    return;
  }
  const workspaceId = String(req.query.workspace ?? '');
  const membership = await withContext({ userId: req.user!.id, workspaceId }, async (q) => {
    const { rows } = await q<{ role: string; permissions: string[] }>(
      `select role, permissions from workspace_members where workspace_id = $1 and user_id = $2`,
      [workspaceId, req.user!.id],
    );
    return rows[0];
  });
  if (!membership || !permissionsOf(membership).includes('twitch.manage')) {
    res.status(403).json({ error: 'Sem permissão para conectar a Twitch neste workspace.' });
    return;
  }

  const { verifier, challenge } = pkcePair();
  const state = randomToken(16);
  res.cookie('sc_twitch', jwt.sign({ state, verifier, ws: workspaceId }, config.sessionSecret, { expiresIn: '10m' }), {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.appUrl.startsWith('https'),
    maxAge: 10 * 60 * 1000,
    path: '/',
  });

  const url = new URL('https://id.twitch.tv/oauth2/authorize');
  url.searchParams.set('client_id', config.twitch.clientId);
  url.searchParams.set('redirect_uri', twitchRedirectUri());
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', TWITCH_SCOPES);
  url.searchParams.set('state', state);
  url.searchParams.set('code_challenge', challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  res.redirect(url.toString());
});

router.get('/twitch/callback', async (req, res) => {
  try {
    const code = String(req.query.code ?? '');
    const state = String(req.query.state ?? '');
    const cookie = (req.cookies as Record<string, string> | undefined)?.sc_twitch;
    if (!cookie || !code) throw new Error('Fluxo de autorização inválido');

    const payload = jwt.verify(cookie, config.sessionSecret) as { state: string; verifier: string; ws: string };
    if (payload.state !== state) throw new Error('Estado OAuth inválido');

    const body = new URLSearchParams({
      client_id: config.twitch.clientId,
      client_secret: config.twitch.clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: twitchRedirectUri(),
      code_verifier: payload.verifier,
    });
    const tokenRes = await fetch('https://id.twitch.tv/oauth2/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!tokenRes.ok) throw new Error(`Twitch token: ${tokenRes.status}`);
    const token = (await tokenRes.json()) as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
      scope: string[];
    };

    const userRes = await fetch('https://api.twitch.tv/helix/users', {
      headers: { 'Client-Id': config.twitch.clientId, Authorization: `Bearer ${token.access_token}` },
    });
    if (!userRes.ok) throw new Error(`Twitch user: ${userRes.status}`);
    const users = (await userRes.json()) as {
      data: { id: string; login: string; display_name: string; profile_image_url: string; broadcaster_type: string }[];
    };
    const twitchUser = users.data[0];
    if (!twitchUser) throw new Error('Conta Twitch não retornada');

    await saveConnection(payload.ws, {
      twitchUserId: twitchUser.id,
      login: twitchUser.login,
      displayName: twitchUser.display_name,
      avatarUrl: twitchUser.profile_image_url,
      broadcasterType: twitchUser.broadcaster_type,
      scopes: token.scope ?? [],
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      expiresAt: new Date(Date.now() + token.expires_in * 1000),
      userId: req.user!.id,
    });

    await withContext({ userId: req.user!.id, workspaceId: payload.ws }, (q) =>
      logActivity(q, {
        workspaceId: payload.ws,
        userId: req.user!.id,
        actorName: req.user!.username,
        action: 'twitch.conectado',
        target: twitchUser.login,
      }),
    );

    await restartBot(payload.ws);
    res.clearCookie('sc_twitch', { path: '/' });
    res.redirect(`${config.appUrl}/app/configuracoes/twitch?twitch=connected`);
  } catch (error) {
    const message = encodeURIComponent(error instanceof Error ? error.message : 'Falha na conexão Twitch');
    res.redirect(`${config.appUrl}/app/configuracoes/twitch?erro=${message}`);
  }
});

router.delete('/twitch', loadWorkspace, requirePermission('twitch.manage'), async (req, res) => {
  await deleteConnection(req.workspace!.id);
  stopBot(req.workspace!.id);
  await withContext({ userId: req.user!.id, workspaceId: req.workspace!.id }, (q) =>
    logActivity(q, {
      workspaceId: req.workspace!.id,
      userId: req.user!.id,
      actorName: req.user!.username,
      action: 'twitch.desconectado',
    }),
  );
  res.json({ ok: true });
});

/** Dados reais da live (espectadores, título, jogo, seguidores). */
router.get('/twitch/live', loadWorkspace, requirePermission('dashboard.view'), async (req, res) => {
  const workspaceId = req.workspace!.id;
  const connection = await getConnection(workspaceId);
  if (!connection) {
    res.json({ connected: false, live: false, bot: botStatus(workspaceId) });
    return;
  }
  try {
    const token = await ensureFreshToken(connection);
    const [live, followers] = await Promise.all([
      getLiveStatus(connection, token),
      getFollowerCount(connection, token),
    ]);
    res.json({
      connected: true,
      live: live.live,
      viewers: live.viewers,
      startedAt: live.startedAt,
      title: live.title,
      game: live.game,
      thumbnailUrl: live.thumbnailUrl,
      followers,
      bot: botStatus(workspaceId),
    });
  } catch (error) {
    res.status(502).json({
      connected: true,
      live: false,
      error: error instanceof Error ? error.message : 'Falha ao consultar a Twitch',
      bot: botStatus(workspaceId),
    });
  }
});

/** Configuração local do OBS (a senha fica criptografada e nunca é devolvida). */
router.get('/obs', loadWorkspace, requirePermission('obs.control'), async (req, res) => {
  const rows = await withContext({ userId: req.user!.id, workspaceId: req.workspace!.id }, async (q) =>
    (
      await q<{ host: string; port: number; password_enc: string | null; updated_at: string }>(
        'select host, port, password_enc, updated_at from obs_settings where workspace_id = $1',
        [req.workspace!.id],
      )
    ).rows[0],
  );
  res.json({
    host: rows?.host ?? '127.0.0.1',
    port: rows?.port ?? 4455,
    hasPassword: Boolean(rows?.password_enc),
    updatedAt: rows?.updated_at ?? null,
  });
});

router.put('/obs', loadWorkspace, requirePermission('obs.control'), async (req, res) => {
  const host = String(req.body?.host ?? '127.0.0.1').trim();
  const port = Number(req.body?.port ?? 4455);
  const password = String(req.body?.password ?? '');
  if (!host || !Number.isFinite(port) || port < 1 || port > 65535) {
    res.status(400).json({ error: 'Host ou porta inválidos.' });
    return;
  }
  await withContext({ userId: req.user!.id, workspaceId: req.workspace!.id }, async (q) => {
    await q(
      `insert into obs_settings (workspace_id, host, port, password_enc, updated_at)
       values ($1,$2,$3,$4, now())
       on conflict (workspace_id) do update set
         host = excluded.host, port = excluded.port,
         password_enc = coalesce(excluded.password_enc, obs_settings.password_enc),
         updated_at = now()`,
      [req.workspace!.id, host, port, password ? encryptSecret(password) : null],
    );
    await logActivity(q, {
      workspaceId: req.workspace!.id,
      userId: req.user!.id,
      actorName: req.user!.username,
      action: 'obs.configurado',
      target: `${host}:${port}`,
    });
  });
  res.json({ ok: true });
});

/** Senha do OBS é entregue apenas ao usuário autorizado, para a conexão local. */
router.get('/obs/password', loadWorkspace, requirePermission('obs.control'), async (req, res) => {
  const rows = await withContext({ userId: req.user!.id, workspaceId: req.workspace!.id }, async (q) =>
    (
      await q<{ password_enc: string | null }>('select password_enc from obs_settings where workspace_id = $1', [
        req.workspace!.id,
      ])
    ).rows[0],
  );
  res.json({ password: decryptSecret(rows?.password_enc) });
});

export default router;
