export type ChatMessage = {
  /** ID da mensagem na Twitch (usado para deduplicar entregas do EventSub). */
  messageId?: string;
  userId: string;
  username: string;
  displayName: string;
  color: string | null;
  message: string;
  isMod: boolean;
  isSub: boolean;
  isBroadcaster: boolean;
  badges: string[];
};

type EventSubChatEvent = {
  message_id?: string;
  chatter_user_id?: string;
  chatter_user_login?: string;
  chatter_user_name?: string;
  source_broadcaster_user_id?: string;
  color?: string | null;
  message_type?: string;
  message?: { text?: string };
  badges?: { set_id?: string }[];
};

/**
 * Converte um evento `channel.chat.message` do EventSub na mensagem usada pelo
 * motor do bot. Retorna null para mensagens que não são texto de um espectador
 * do próprio canal (ex.: avisos de "primeira mensagem" e chat compartilhado).
 */
export function chatMessageFromEvent(event: Record<string, unknown>, broadcasterId: string): ChatMessage | null {
  const data = event as EventSubChatEvent;
  if (data.message_type === 'user_intro') return null;
  if (data.source_broadcaster_user_id && data.source_broadcaster_user_id !== broadcasterId) return null;

  const text = data.message?.text;
  if (typeof text !== 'string' || !text.trim()) return null;

  const userId = String(data.chatter_user_id ?? '');
  const username = String(data.chatter_user_login ?? '');
  if (!userId || !username) return null;

  const badges = (data.badges ?? []).map((badge) => String(badge?.set_id ?? '')).filter(Boolean);

  return {
    messageId: data.message_id,
    userId,
    username,
    displayName: String(data.chatter_user_name ?? username),
    color: data.color ? String(data.color) : null,
    message: text,
    isMod: badges.includes('moderator'),
    isSub: badges.includes('subscriber') || badges.includes('founder'),
    isBroadcaster: userId === broadcasterId || badges.includes('broadcaster'),
    badges,
  };
}
