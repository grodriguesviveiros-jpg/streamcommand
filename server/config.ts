/** Configuração central lida do ambiente (nenhum segredo é escrito no código). */
/** URL pública do app: usada nos redirecionamentos OAuth. */
function resolveAppUrl(): string {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, '');
  // Render expõe a URL pública do serviço nesta variável.
  if (process.env.RENDER_EXTERNAL_URL) return process.env.RENDER_EXTERNAL_URL.replace(/\/$/, '');
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

/**
 * Escopos da conta do streamer: identidade, eventos do canal, moderação e a
 * autorização `channel:bot` que permite ao aplicativo falar no chat do canal
 * pela conta do bot (Send Chat Message / EventSub de chat).
 * Referência: https://dev.twitch.tv/docs/authentication/scopes/
 */
export const TWITCH_STREAMER_SCOPES = [
  'user:read:email',
  'channel:bot',
  'moderator:read:followers',
  'moderator:manage:banned_users',
  'channel:read:subscriptions',
];

/**
 * Escopos da conta do bot: entrar no chat como bot, ler e enviar mensagens.
 * O envio também depende do `channel:bot` autorizado pelo streamer.
 * Referência: https://dev.twitch.tv/docs/chat/authenticating/
 */
export const TWITCH_BOT_SCOPES = ['user:bot', 'user:read:chat', 'user:write:chat'];

export const TWITCH_SCOPES_BY_TYPE = {
  streamer: TWITCH_STREAMER_SCOPES,
  bot: TWITCH_BOT_SCOPES,
} as const;

export type TwitchAccountType = keyof typeof TWITCH_SCOPES_BY_TYPE;
