import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { config, isDiscordConfigured, isTwitchConfigured } from '../config';
import {
  buildDiscordAuth,
  clearSessionCookie,
  exchangeDiscordCode,
  listWorkspaces,
  loginOrCreateUser,
  requireAuth,
  setSessionCookie,
  signSession,
} from '../auth';

const router = Router();

/** Estado público das integrações (usado pela tela de login). */
router.get('/status', (_req, res) => {
  res.json({ discordConfigured: isDiscordConfigured(), twitchConfigured: isTwitchConfigured() });
});

/** Inicia o login Discord com PKCE (nenhum segredo vai para o navegador). */
router.get('/discord/start', (_req, res) => {
  if (!isDiscordConfigured()) {
    res.status(503).json({
      error: 'Login Discord não configurado. Defina DISCORD_CLIENT_ID e DISCORD_CLIENT_SECRET.',
    });
    return;
  }
  const { url, cookie } = buildDiscordAuth();
  res.cookie('sc_oauth', cookie, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.appUrl.startsWith('https'),
    maxAge: 10 * 60 * 1000,
    path: '/',
  });
  res.redirect(url);
});

router.get('/discord/callback', async (req, res) => {
  try {
    if (req.query.error) throw new Error(String(req.query.error_description ?? req.query.error));
    const code = String(req.query.code ?? '');
    const state = String(req.query.state ?? '');
    const cookie = (req.cookies as Record<string, string> | undefined)?.sc_oauth;
    if (!cookie || !code) throw new Error('Fluxo de autorização inválido');

    const payload = jwt.verify(cookie, config.sessionSecret) as { state: string; verifier: string };
    if (payload.state !== state) throw new Error('Estado OAuth inválido');

    const profile = await exchangeDiscordCode(code, payload.verifier);
    const user = await loginOrCreateUser(profile);
    setSessionCookie(res, signSession(user));
    res.clearCookie('sc_oauth', { path: '/' });
    res.redirect(`${config.appUrl}/app`);
  } catch (error) {
    const message = encodeURIComponent(error instanceof Error ? error.message : 'Falha no login');
    res.redirect(`${config.appUrl}/?erro=${message}`);
  }
});

router.get('/me', requireAuth, async (req, res) => {
  const workspaces = await listWorkspaces(req.user!.id);
  res.json({
    user: req.user,
    workspaces,
    discordConfigured: isDiscordConfigured(),
    twitchConfigured: isTwitchConfigured(),
    appUrl: config.appUrl,
  });
});

router.post('/logout', (_req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

export default router;
