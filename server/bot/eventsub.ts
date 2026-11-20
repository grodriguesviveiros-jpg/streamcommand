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

  private connect(url = 'wss://eventsub.wss.twitch.tv/ws'): void {
    const ws = new WebSocket(url);
    this.ws = ws;

    ws.addEventListener('message', (event) => {
      if (typeof event.data === 'string') {
        this.handle(event.data).catch((error) => console.error('[eventsub]', error));
      }
    });

    ws.addEventListener('close', () => {
      // Só a conexão atual pode mudar o estado: o socket antigo, fechado
      // depois de uma migração da Twitch, não deve abrir outra conexão.
      if (this.ws !== ws) return;
      this.opts.onStatus('disconnected');
      if (!this.closed) {
        this.retries += 1;
        const wait = Math.min(60_000, 3_000 * this.retries);
        this.reconnectTimer = setTimeout(() => this.connect(), wait);
      }
    });

    ws.addEventListener('error', () => {
      if (this.ws === ws) this.opts.onStatus('error', 'Falha na conexão EventSub');
    });
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
        break;
      case 'notification':
        this.opts.onEvent(message.payload.subscription.type, message.payload.event);
        break;
      case 'session_reconnect': {
        // A Twitch pede para migrar para outra conexão; abre a nova antes de
        // fechar a antiga, que já não é mais `this.ws` e não reconecta sozinha.
        const url = message.payload.session.reconnect_url as string;
        const previous = this.ws;
        this.connect(url);
        previous?.close();
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
        type: 'channel.chat.message',
        version: '1',
        condition: { broadcaster_user_id: broadcaster, user_id: broadcaster },
      },
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

    // O bot só está realmente ouvindo o chat quando a assinatura de mensagens
    // é aceita; as demais assinaturas são complementares.
    let chatReady = false;
    const failures: string[] = [];

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
      if (res.status === 409) {
        // Assinatura já existente para esta sessão.
        if (subscription.type === 'channel.chat.message') chatReady = true;
        continue;
      }
      if (!res.ok) {
        const text = await res.text();
        failures.push(`${subscription.type}: ${res.status} ${text.slice(0, 120)}`);
        continue;
      }
      if (subscription.type === 'channel.chat.message') chatReady = true;
    }

    if (chatReady) {
      this.opts.onStatus(
        'connected',
        failures.length ? `Assinaturas com falha: ${failures.join('; ')}` : undefined,
      );
    } else {
      this.opts.onStatus(
        'error',
        `Chat da Twitch indisponível (${failures.join('; ') || 'assinatura de mensagens não criada'})`,
      );
    }
  }

  stop(): void {
    this.closed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
    this.ws = null;
  }
}
