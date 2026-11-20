/** Configuração central lida do ambiente (nenhum segredo é escrito no código). */
/** URL pública do app: usada nos redirecionamentos OAuth. */
function resolveAppUrl(): string {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, '');
  const suffix = process.env.BASE44_PUBLIC_HOST_SUFFIX;
  return suffix ? `https://3000-${suffix}` : 'http://localhost:3000';
}

export const config = {
  port: Number(process.env.PORT ?? 4000),
  appUrl: resolveAppUrl(),
  sessionSecret: process.env.SESSION_SECRET ?? 'stream-command-dev-session-secret',
  tokenKey: process.env.TOKEN_ENCRYPTION_KEY ?? '',
  uploadDir: process.env.UPLOAD_DIR ?? '/app/uploads',
  discord: {
    clientId: process.env.DISCORD_CLIENT_ID ?? '',
    clientSecret: process.env.DISCORD_CLIENT_SECRET ?? '',
    redirectUri: process.env.DISCORD_REDIRECT_URI ?? '',
  },
  twitch: {
    clientId: process.env.TWITCH_CLIENT_ID ?? '',
    clientSecret: process.env.TWITCH_CLIENT_SECRET ?? '',
    redirectUri: process.env.TWITCH_REDIRECT_URI ?? '',
  },
};

export const isDiscordConfigured = () =>
  Boolean(config.discord.clientId && config.discord.clientSecret);

export const isTwitchConfigured = () =>
  Boolean(config.twitch.clientId && config.twitch.clientSecret);

export const discordRedirectUri = () =>
  config.discord.redirectUri || `${config.appUrl}/api/auth/discord/callback`;

export const twitchRedirectUri = () =>
  config.twitch.redirectUri || `${config.appUrl}/api/integrations/twitch/callback`;

/** Escopos Twitch usados pelo bot, chat e moderação. */
export const TWITCH_SCOPES = [
  'user:read:email',
  'user:read:chat',
  'user:write:chat',
  'moderator:manage:banned_users',
  'moderator:read:followers',
  'channel:read:subscriptions',
].join(' ');
