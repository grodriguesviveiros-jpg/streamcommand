import { config } from '../config';

export type EventSubSubscription = {
  type: string;
  version: string;
  condition: Record<string, string>;
  /** Cada assinatura pode usar o token da conta responsável por ela. */
  getToken: () => Promise<string>;
};

type Options = {
  subscriptions: EventSubSubscription[];
  /** Tipos que precisam ser aceitos para a conexão ser considerada pronta. */
  requiredTypes: string[];
  onEvent: (type: string, event: Record<string, unknown>) => void;
  onStatus: (status: 'connected' | 'disconnected' | 'error', detail?: string) => void;
};

/**
 * Conexão EventSub por WebSocket: recebe follows, inscrições, raids, mudanças
 * de estado da live e mensagens do chat sem precisar de URL pública de webhook.
 * As assinaturas de chat usam o token da conta do bot; as do canal usam o token
 * da conta do streamer.
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
    const accepted = new Set<string>();
    const failures: string[] = [];

    for (const subscription of this.opts.subscriptions) {
      try {
        const token = await subscription.getToken();
        const res = await fetch('https://api.twitch.tv/helix/eventsub/subscriptions', {
          method: 'POST',
          headers: {
            'Client-Id': config.twitch.clientId,
            Authorization: `Bearer ${token}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            type: subscription.type,
            version: subscription.version,
            condition: subscription.condition,
            transport: { method: 'websocket', session_id: this.sessionId },
          }),
        });
        if (res.status === 409) {
          // Assinatura já existente para esta sessão.
          accepted.add(subscription.type);
          continue;
        }
        if (!res.ok) {
          const text = await res.text();
          failures.push(`${subscription.type}: ${res.status} ${text.slice(0, 120)}`);
          continue;
        }
        accepted.add(subscription.type);
      } catch (error) {
        failures.push(
          `${subscription.type}: ${error instanceof Error ? error.message.slice(0, 120) : 'falha ao obter token'}`,
        );
      }
    }

    const missing = this.opts.requiredTypes.filter((type) => !accepted.has(type));
    if (!missing.length) {
      this.opts.onStatus(
        'connected',
        failures.length ? `Assinaturas com falha: ${failures.join('; ')}` : undefined,
      );
    } else {
      this.opts.onStatus(
        'error',
        `Assinaturas ausentes (${missing.join(', ')})${failures.length ? `: ${failures.join('; ')}` : ''}`,
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
