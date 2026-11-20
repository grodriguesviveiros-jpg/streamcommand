import { config } from '../config';

type Options = {
  broadcasterId: string;
  getToken: () => Promise<string>;
  onEvent: (type: string, event: Record<string, unknown>) => void;
  onStatus: (status: 'connected' | 'disconnected' | 'error', detail?: string) => void;
};

/**
 * Conexão EventSub por WebSocket: recebe follows, inscrições, raids e
 * mudanças de estado da live sem precisar de URL pública de webhook.
 */
export class EventSubClient {
  private ws: WebSocket | null = null;
  private closed = false;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private sessionId = '';
  private retries = 0;

  constructor(private opts: Options) {}

  start(): void {
    this.closed = false;
    this.connect();
  }

  private connect(): void {
    const ws = new WebSocket('wss://eventsub.wss.twitch.tv/ws');
    this.ws = ws;

    ws.addEventListener('message', (event) => {
      if (typeof event.data === 'string') {
        this.handle(event.data).catch((error) => console.error('[eventsub]', error));
      }
    });

    ws.addEventListener('close', () => {
      this.opts.onStatus('disconnected');
      if (!this.closed) {
        this.retries += 1;
        const wait = Math.min(60_000, 3_000 * this.retries);
        this.reconnectTimer = setTimeout(() => this.connect(), wait);
      }
    });

    ws.addEventListener('error', () => this.opts.onStatus('error', 'Falha na conexão EventSub'));
  }

  private async handle(raw: string): Promise<void> {
    const message = JSON.parse(raw) as {
      metadata: { message_type: string };
      payload: Record<string, any>;
    };

    switch (message.metadata.message_type) {
      case 'session_welcome':
        this.sessionId = message.payload.session.id;
        this.retries = 0;
        await this.subscribeAll();
        this.opts.onStatus('connected');
        break;
      case 'notification':
        this.opts.onEvent(message.payload.subscription.type, message.payload.event);
        break;
      case 'session_reconnect': {
        const url = message.payload.session.reconnect_url as string;
        this.ws?.close();
        const ws = new WebSocket(url);
        this.ws = ws;
        ws.addEventListener('message', (event) => {
          if (typeof event.data === 'string') this.handle(event.data).catch(() => undefined);
        });
        break;
      }
      case 'revocation':
        this.opts.onStatus('error', `Assinatura revogada: ${message.payload.subscription?.type ?? ''}`);
        break;
      default:
        break;
    }
  }

  private async subscribeAll(): Promise<void> {
    const token = await this.opts.getToken();
    const broadcaster = this.opts.broadcasterId;
    const subscriptions = [
      {
        type: 'channel.follow',
        version: '2',
        condition: { broadcaster_user_id: broadcaster, moderator_user_id: broadcaster },
      },
      { type: 'channel.subscribe', version: '1', condition: { broadcaster_user_id: broadcaster } },
      { type: 'channel.raid', version: '1', condition: { to_broadcaster_user_id: broadcaster } },
      { type: 'stream.online', version: '1', condition: { broadcaster_user_id: broadcaster } },
      { type: 'stream.offline', version: '1', condition: { broadcaster_user_id: broadcaster } },
    ];

    for (const subscription of subscriptions) {
      const res = await fetch('https://api.twitch.tv/helix/eventsub/subscriptions', {
        method: 'POST',
        headers: {
          'Client-Id': config.twitch.clientId,
          Authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          ...subscription,
          transport: { method: 'websocket', session_id: this.sessionId },
        }),
      });
      if (res.status === 409) continue; // assinatura já existente
      if (!res.ok) {
        const text = await res.text();
        this.opts.onStatus('error', `${subscription.type}: ${res.status} ${text.slice(0, 160)}`);
      }
    }
  }

  stop(): void {
    this.closed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
    this.ws = null;
  }
}
