export type ChatMessage = {
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

type Options = {
  login: string;
  token: string;
  onMessage: (message: ChatMessage) => void;
  onStatus: (status: 'connected' | 'disconnected' | 'error', detail?: string) => void;
};

/** Cliente mínimo do chat da Twitch (IRC sobre WebSocket, com tags). */
export class TwitchIRC {
  private ws: WebSocket | null = null;
  private closed = false;
  private reconnectTimer: NodeJS.Timeout | null = null;
  connected = false;

  constructor(private opts: Options) {}

  start(): void {
    this.closed = false;
    this.connect();
  }

  private connect(): void {
    const channel = this.opts.login.toLowerCase();
    const ws = new WebSocket('wss://irc-ws.chat.twitch.tv:443');
    this.ws = ws;

    ws.addEventListener('open', () => {
      ws.send('CAP REQ :twitch.tv/tags twitch.tv/commands');
      ws.send(`PASS oauth:${this.opts.token}`);
      ws.send(`NICK ${channel}`);
      ws.send(`JOIN #${channel}`);
      this.connected = true;
      this.opts.onStatus('connected');
    });

    ws.addEventListener('message', (event) => {
      if (typeof event.data === 'string') this.handle(event.data);
    });

    ws.addEventListener('close', () => {
      this.connected = false;
      this.opts.onStatus('disconnected');
      if (!this.closed) this.reconnectTimer = setTimeout(() => this.connect(), 6_000);
    });

    ws.addEventListener('error', () => {
      this.opts.onStatus('error', 'Falha na conexão com o chat da Twitch');
    });
  }

  private handle(raw: string): void {
    for (const line of raw.split('\r\n')) {
      if (!line) continue;
      if (line.startsWith('PING')) {
        this.ws?.send('PONG :tmi.twitch.tv');
        continue;
      }
      if (!line.includes('PRIVMSG')) continue;

      const tags: Record<string, string> = {};
      let rest = line;
      if (rest.startsWith('@')) {
        const spaceIdx = rest.indexOf(' ');
        const tagPart = rest.slice(1, spaceIdx);
        rest = rest.slice(spaceIdx + 1);
        for (const pair of tagPart.split(';')) {
          const eq = pair.indexOf('=');
          tags[pair.slice(0, eq)] = pair.slice(eq + 1);
        }
      }

      const match = rest.match(/^:(\w+)![^@]*@[^ ]+ PRIVMSG #[^ ]+ :(.*)$/);
      if (!match) continue;

      const badges = (tags.badges ?? '')
        .split(',')
        .map((b) => b.split('/')[0])
        .filter(Boolean);

      this.opts.onMessage({
        userId: tags['user-id'] ?? '',
        username: match[1],
        displayName: tags['display-name'] || match[1],
        color: tags.color || null,
        message: match[2],
        isMod: tags.mod === '1' || badges.includes('moderator'),
        isSub: tags.subscriber === '1' || badges.includes('subscriber') || badges.includes('founder'),
        isBroadcaster: badges.includes('broadcaster'),
        badges,
      });
    }
  }

  /** Envia uma mensagem no chat (quebrando em linhas de até 480 caracteres). */
  say(text: string): void {
    if (!this.connected || !this.ws) return;
    const channel = this.opts.login.toLowerCase();
    const chunks = text.match(/[\s\S]{1,480}/g) ?? [];
    for (const chunk of chunks) this.ws.send(`PRIVMSG #${channel} :${chunk}`);
  }

  stop(): void {
    this.closed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
    this.ws = null;
    this.connected = false;
  }
}
