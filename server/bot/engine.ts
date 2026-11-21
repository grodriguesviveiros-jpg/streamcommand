import { adminPool, withWorkspace } from '../db';
import { publish } from '../bus';
import {
  ensureFreshToken,
  getConnections,
  getLiveStatus,
  sendChatMessage,
  sendWorkspaceChatMessage,
  timeoutUser,
  TwitchAuthError,
  type TwitchConnection,
} from '../twitch';
import { chatMessageFromEvent, type ChatMessage } from './chat';
import { EventSubClient, type EventSubSubscription } from './eventsub';

type CommandRow = {
  id: string;
  name: string;
  response: string;
  cooldown_seconds: number;
  min_role: string;
};

type AutomationRow = {
  id: string;
  name: string;
  trigger_type: string;
  trigger_config: Record<string, unknown>;
  conditions: Record<string, unknown>;
  action_type: string;
  action_config: Record<string, unknown>;
  delay_seconds: number;
  run_count: number;
};

type Status = 'connected' | 'offline' | 'error';

export type BotStatus = {
  chat: Status;
  live: boolean;
  connected: boolean;
  streamer: boolean;
  bot: boolean;
  events: Status;
  chatSender: 'bot' | null;
  detail: string | null;
};

/**
 * Motor do bot de um workspace. Usa DUAS conexões Twitch independentes:
 * - streamer: identifica o canal, recebe eventos (follow, sub, raid, live) e modera;
 * - bot: entra no chat, lê as mensagens e envia respostas, comandos e timers.
 * Sem a conta do bot conectada, o envio fica indisponível e é reportado assim.
 */
export class WorkspaceBot {
  private chatSub: EventSubClient | null = null;
  private eventsSub: EventSubClient | null = null;
  private streamer: TwitchConnection | null = null;
  private bot: TwitchConnection | null = null;
  private started = false;
  private isLive = false;
  private tick: NodeJS.Timeout | null = null;
  private cache: { at: number; commands: CommandRow[]; automations: AutomationRow[] } = {
    at: 0,
    commands: [],
    automations: [],
  };
  private cooldowns = new Map<string, number>();
  private recentMessageIds = new Set<string>();
  private selfSentIds = new Set<string>();
  private chatStatus: Status = 'offline';
  private eventsStatus: Status = 'offline';
  private detail: string | null = null;

  constructor(public workspaceId: string) {}

  async start(): Promise<void> {
    if (this.started) return;
    const { streamer, bot } = await getConnections(this.workspaceId);
    this.streamer = streamer;
    this.bot = bot;
    if (!streamer && !bot) return;

    if (streamer) {
      this.eventsSub = new EventSubClient({
        subscriptions: this.channelSubscriptions(streamer),
        requiredTypes: ['stream.online', 'channel.follow', 'channel.subscribe', 'channel.raid'],
        onEvent: (type, event) => {
          this.onTwitchEvent(type, event).catch((error) => console.error('[bot] eventsub', error));
        },
        onStatus: (status, detail) => {
          this.eventsStatus = status === 'connected' ? 'connected' : status === 'error' ? 'error' : 'offline';
          this.publishStatus(detail);
        },
      });
      this.eventsSub.start();

      const live = await getLiveStatus(streamer, await ensureFreshToken(streamer)).catch(() => null);
      this.isLive = Boolean(live?.live);
    }

    if (streamer && bot) {
      this.chatSub = new EventSubClient({
        subscriptions: this.chatSubscriptions(streamer, bot),
        requiredTypes: ['channel.chat.message'],
        onEvent: (type, event) => {
          this.onTwitchEvent(type, event).catch((error) => console.error('[bot] eventsub', error));
        },
        onStatus: (status, detail) => {
          // "connected" só é publicado quando a assinatura do chat é aceita.
          this.chatStatus = status === 'connected' ? 'connected' : status === 'error' ? 'error' : 'offline';
          this.publishStatus(detail);
        },
      });
      this.chatSub.start();
    } else {
      this.chatStatus = 'offline';
      this.detail = !streamer
        ? 'Conecte a conta do streamer para identificar o canal.'
        : 'Conta do bot não conectada — leitura e envio de chat indisponíveis.';
      this.publishStatus(this.detail);
    }

    this.tick = setInterval(() => {
      this.runTimers().catch(() => undefined);
      this.pollLive().catch(() => undefined);
    }, 20_000);

    this.started = true;
  }

  stop(): void {
    this.chatSub?.stop();
    this.eventsSub?.stop();
    if (this.tick) clearInterval(this.tick);
    this.chatSub = null;
    this.eventsSub = null;
    this.started = false;
    this.chatStatus = 'offline';
    this.eventsStatus = 'offline';
  }

  getStatus(): BotStatus {
    return {
      chat: this.chatStatus,
      live: this.isLive,
      connected: Boolean(this.streamer),
      streamer: Boolean(this.streamer),
      bot: Boolean(this.bot),
      events: this.eventsStatus,
      chatSender: this.bot && this.streamer ? 'bot' : null,
      detail: this.detail,
    };
  }

  private publishStatus(detail?: string): void {
    if (detail !== undefined) this.detail = detail ?? null;
    const at = new Date().toISOString();
    const status = this.getStatus();
    publish(this.workspaceId, { type: 'bot.status', data: { ...status, at } });
    publish(this.workspaceId, { type: 'bot.eventsub', data: { status, detail: this.detail, at } });
  }

  private channelSubscriptions(streamer: TwitchConnection): EventSubSubscription[] {
    const broadcaster = streamer.twitch_user_id;
    const getToken = () => this.streamerToken();
    return [
      {
        type: 'channel.follow',
        version: '2',
        condition: { broadcaster_user_id: broadcaster, moderator_user_id: broadcaster },
        getToken,
      },
      { type: 'channel.subscribe', version: '1', condition: { broadcaster_user_id: broadcaster }, getToken },
      { type: 'channel.raid', version: '1', condition: { to_broadcaster_user_id: broadcaster }, getToken },
      { type: 'stream.online', version: '1', condition: { broadcaster_user_id: broadcaster }, getToken },
      { type: 'stream.offline', version: '1', condition: { broadcaster_user_id: broadcaster }, getToken },
    ];
  }

  private chatSubscriptions(streamer: TwitchConnection, bot: TwitchConnection): EventSubSubscription[] {
    return [
      {
        type: 'channel.chat.message',
        version: '1',
        condition: {
          broadcaster_user_id: streamer.twitch_user_id,
          user_id: bot.twitch_user_id,
        },
        getToken: () => this.botToken(),
      },
    ];
  }

  private async ensureConnections(): Promise<void> {
    if (!this.streamer || !this.bot) {
      const connections = await getConnections(this.workspaceId);
      this.streamer = connections.streamer;
      this.bot = connections.bot;
    }
  }

  private async streamerToken(): Promise<string> {
    if (!this.streamer) throw new TwitchAuthError('streamer', 'Conta do streamer não conectada');
    return ensureFreshToken(this.streamer);
  }

  private async botToken(): Promise<string> {
    if (!this.bot) throw new TwitchAuthError('bot', 'Conta do bot não conectada');
    return ensureFreshToken(this.bot);
  }

  /** Envia uma mensagem no chat pela conta do bot (user:write:chat). */
  async say(text: string): Promise<boolean> {
    try {
      await this.ensureConnections();
      if (!this.bot) {
        console.warn('[bot] envio indisponível: conta do bot não conectada', this.workspaceId);
        return false;
      }
      if (!this.streamer) {
        console.warn('[bot] envio indisponível: conta do streamer não conectada', this.workspaceId);
        return false;
      }
      const messageId = await sendChatMessage(
        this.bot,
        await ensureFreshToken(this.bot),
        this.streamer.twitch_user_id,
        text,
      );
      if (messageId) remember(this.selfSentIds, messageId);
      return true;
    } catch (error) {
      console.error('[bot] envio', this.workspaceId, error instanceof Error ? error.message : error);
      return false;
    }
  }

  private async data(): Promise<{ commands: CommandRow[]; automations: AutomationRow[] }> {
    if (Date.now() - this.cache.at < 15_000) return this.cache;
    const result = await withWorkspace(this.workspaceId, async (q) => {
      const commands = await q<CommandRow>(
        'select id, name, response, cooldown_seconds, min_role from custom_commands where enabled = true',
      );
      const automations = await q<AutomationRow>(
        'select * from automations where enabled = true',
      );
      return { commands: commands.rows, automations: automations.rows };
    });
    this.cache = { at: Date.now(), ...result };
    return this.cache;
  }

  invalidateCache(): void {
    this.cache.at = 0;
  }

  /** Processa uma mensagem recebida do chat (EventSub `channel.chat.message`). */
  async handleChatMessage(message: ChatMessage): Promise<void> {
    if (message.messageId) {
      if (this.recentMessageIds.has(message.messageId)) return;
      remember(this.recentMessageIds, message.messageId);
    }
    const display = message.displayName || message.username;

    await withWorkspace(this.workspaceId, async (q) => {
      await q(
        `insert into chat_messages (workspace_id, twitch_user_id, username, display_color, message, is_mod, is_sub)
         values ($1,$2,$3,$4,$5,$6,$7)`,
        [this.workspaceId, message.userId, display, message.color, message.message, message.isMod, message.isSub],
      );
      await q(
        `delete from chat_messages
          where workspace_id = $1
            and id not in (select id from chat_messages where workspace_id = $1 order by created_at desc limit 400)`,
        [this.workspaceId],
      );
    });

    publish(this.workspaceId, {
      type: 'chat.message',
      data: { ...message, displayName: display, createdAt: new Date().toISOString() },
    });

    // As respostas do bot voltam como evento do EventSub: aparecem no histórico,
    // mas não podem disparar comandos/automações (evita responder a si mesmo).
    if (message.messageId && this.selfSentIds.has(message.messageId)) return;

    const text = message.message.trim();
    if (!text.startsWith('!')) return;

    await this.handleCommand(text, message);
    if (!message.isBroadcaster) {
      await this.handleKeyword(text, message);
      await this.handleGiveaway(text, message);
      await this.handlePoll(text, message);
      await this.handleQueue(text, message);
    }
  }

  private roleAllowed(minRole: string, message: ChatMessage): boolean {
    switch (minRole) {
      case 'subscriber':
        return message.isSub || message.isMod || message.isBroadcaster;
      case 'moderator':
        return message.isMod || message.isBroadcaster;
      case 'broadcaster':
        return message.isBroadcaster;
      default:
        return true;
    }
  }

  private async handleCommand(text: string, message: ChatMessage): Promise<void> {
    const { commands } = await this.data();
    const lower = text.toLowerCase();
    const command = commands.find((c) => {
      const name = `!${c.name.toLowerCase().replace(/^!/, '')}`;
      return lower === name || lower.startsWith(`${name} `);
    });
    if (!command) return;
    if (!this.roleAllowed(command.min_role, message)) return;

    const last = this.cooldowns.get(command.id) ?? 0;
    if (Date.now() - last < command.cooldown_seconds * 1000) return;
    this.cooldowns.set(command.id, Date.now());

    const sent = await this.say(command.response);
    if (!sent) return;
    await withWorkspace(this.workspaceId, (q) =>
      q('update custom_commands set use_count = use_count + 1, last_used_at = now() where id = $1', [command.id]),
    );
  }

  private async handleKeyword(text: string, message: ChatMessage): Promise<void> {
    const { automations } = await this.data();
    const lower = text.toLowerCase();
    for (const automation of automations) {
      if (automation.trigger_type !== 'chat_message') continue;
      const keyword = String(automation.trigger_config.keyword ?? '').toLowerCase().trim();
      if (!keyword) continue;
      const mode = String(automation.trigger_config.match ?? 'contains');
      const matches = mode === 'equals' ? lower === keyword : lower.includes(keyword);
      if (!matches) continue;
      await this.runAutomation(automation, { username: message.displayName, message: text, userId: message.userId });
    }
  }

  private async handleGiveaway(text: string, message: ChatMessage): Promise<void> {
    const giveaways = await withWorkspace(this.workspaceId, (q) =>
      q<{ id: string; keyword: string; title: string }>(
        `select id, keyword, title from giveaways where status = 'open'`,
      ),
    );
    for (const giveaway of giveaways.rows) {
      if (text.toLowerCase() !== giveaway.keyword.toLowerCase()) continue;
      const inserted = await withWorkspace(this.workspaceId, (q) =>
        q(
          `insert into giveaway_entries (workspace_id, giveaway_id, twitch_user_id, username)
           values ($1,$2,$3,$4) on conflict (giveaway_id, twitch_user_id) do nothing`,
          [this.workspaceId, giveaway.id, message.userId, message.displayName],
        ),
      );
      if (inserted.rowCount > 0) {
        await this.say(`${message.displayName}, você está participando de "${giveaway.title}"! 🎉`);
        publish(this.workspaceId, { type: 'giveaway.entry', data: { giveawayId: giveaway.id } });
      }
    }
  }

  private async handlePoll(text: string, message: ChatMessage): Promise<void> {
    const match = text.match(/^!(?:vote|voto)\s+(\d+)$/i);
    if (!match) return;
    const index = Number(match[1]) - 1;
    const polls = await withWorkspace(this.workspaceId, (q) =>
      q<{ id: string; options: { id: string; label: string }[] }>(
        `select id, options from polls where status = 'open' order by created_at desc limit 1`,
      ),
    );
    const poll = polls.rows[0];
    if (!poll) return;
    const option = poll.options[index];
    if (!option) return;
    const inserted = await withWorkspace(this.workspaceId, (q) =>
      q(
        `insert into poll_votes (workspace_id, poll_id, twitch_user_id, username, option_id)
         values ($1,$2,$3,$4,$5) on conflict (poll_id, twitch_user_id) do nothing`,
        [this.workspaceId, poll.id, message.userId, message.displayName, option.id],
      ),
    );
    if (inserted.rowCount > 0) {
      await this.say(`${message.displayName} votou em: ${option.label}`);
      publish(this.workspaceId, { type: 'poll.vote', data: { pollId: poll.id } });
    }
  }

  private async handleQueue(text: string, message: ChatMessage): Promise<void> {
    if (!/^!(fila|queue)$/i.test(text)) return;
    const rows = await withWorkspace(this.workspaceId, (q) =>
      q<{ username: string }>(
        `select username from queue_entries where status = 'waiting' order by position asc, created_at asc limit 3`,
      ),
    );
    if (!rows.rows.length) {
      await this.say('A fila está vazia. Use !entrar para entrar na fila.');
      return;
    }
    await this.say(`Próximos da fila: ${rows.rows.map((r, i) => `${i + 1}. ${r.username}`).join(' | ')}`);
  }

  private async onTwitchEvent(type: string, event: Record<string, unknown>): Promise<void> {
    if (type === 'channel.chat.message') {
      if (!this.streamer) return;
      const message = chatMessageFromEvent(event, this.streamer.twitch_user_id);
      if (message) await this.handleChatMessage(message);
      return;
    }

    publish(this.workspaceId, { type: 'twitch.event', data: { type, event, at: new Date().toISOString() } });

    if (type === 'stream.online') {
      this.isLive = true;
      await withWorkspace(this.workspaceId, (q) =>
        q(
          `insert into stream_sessions (workspace_id, twitch_stream_id, title, game_name, started_at)
           values ($1,$2,$3,$4, now())`,
          [this.workspaceId, String(event.id ?? ''), null, null],
        ),
      );
      await withWorkspace(this.workspaceId, (q) =>
        q(
          `insert into activity_logs (workspace_id, actor_name, action, target, details)
           values ($1,'Twitch','live.iniciada','transmissão',$2)`,
          [this.workspaceId, JSON.stringify({ event })],
        ),
      );
    }

    if (type === 'stream.offline') {
      this.isLive = false;
      await withWorkspace(this.workspaceId, (q) =>
        q(
          `update stream_sessions set ended_at = now()
            where id = (select id from stream_sessions where workspace_id = $1 and ended_at is null
                        order by started_at desc limit 1)`,
          [this.workspaceId],
        ),
      );
    }

    const trigger =
      type === 'channel.follow'
        ? 'follow'
        : type === 'channel.subscribe'
          ? 'subscribe'
          : type === 'channel.raid'
            ? 'raid'
            : null;
    if (!trigger) return;

    const { automations } = await this.data();
    for (const automation of automations) {
      if (automation.trigger_type !== trigger) continue;
      const context = {
        username: String(event.user_name ?? event.from_broadcaster_user_name ?? ''),
        userId: String(event.user_id ?? event.from_broadcaster_user_id ?? ''),
        viewers: Number(event.viewers ?? 0),
      };
      if (trigger === 'raid' && automation.conditions?.min_viewers) {
        if (context.viewers < Number(automation.conditions.min_viewers)) continue;
      }
      await this.runAutomation(automation, context);
    }
  }

  private async runAutomation(
    automation: AutomationRow,
    context: { username?: string; userId?: string; message?: string; viewers?: number },
  ): Promise<void> {
    const execute = async () => {
      const result = await this.executeAction(automation.action_type, automation.action_config, context);
      await withWorkspace(this.workspaceId, async (q) => {
        await q('update automations set run_count = run_count + 1 where id = $1', [automation.id]);
        await q(
          `insert into automation_logs (workspace_id, automation_id, event, action_result, status)
           values ($1,$2,$3,$4,$5)`,
          [this.workspaceId, automation.id, JSON.stringify(context), result.message, result.ok ? 'ok' : 'error'],
        );
      });
      publish(this.workspaceId, { type: 'automation.run', data: { automationId: automation.id } });
    };

    if (automation.delay_seconds > 0) {
      setTimeout(() => {
        execute().catch((error) => console.error('[bot] automation', error));
      }, automation.delay_seconds * 1000);
    } else {
      await execute();
    }
  }

  private async executeAction(
    actionType: string,
    actionConfig: Record<string, unknown>,
    context: { username?: string; userId?: string; message?: string; viewers?: number },
  ): Promise<{ ok: boolean; message: string }> {
    await this.ensureConnections();
    try {
      switch (actionType) {
        case 'chat_message': {
          const template = String(actionConfig.message ?? '');
          const rendered = template
            .replace(/\{user\}/g, context.username ?? '')
            .replace(/\{viewers\}/g, String(context.viewers ?? ''));
          const sent = await this.say(rendered);
          return sent
            ? { ok: true, message: `Mensagem enviada pelo bot: ${rendered.slice(0, 80)}` }
            : { ok: false, message: 'Envio pelo bot indisponível (conta do bot não conectada)' };
        }
        case 'timeout_user': {
          if (!context.userId) return { ok: false, message: 'Sem usuário para moderar' };
          if (!this.streamer) return { ok: false, message: 'Conta do streamer não conectada' };
          const token = await this.streamerToken();
          await timeoutUser(
            this.streamer,
            token,
            context.userId,
            Number(actionConfig.duration ?? 600),
            String(actionConfig.reason ?? 'automação'),
          );
          return { ok: true, message: `Usuário ${context.username} suspenso` };
        }
        case 'add_queue': {
          const last = await withWorkspace(this.workspaceId, (q) =>
            q<{ position: number }>(
              `select coalesce(max(position), 0) as position from queue_entries where workspace_id = $1 and status = 'waiting'`,
              [this.workspaceId],
            ),
          );
          await withWorkspace(this.workspaceId, (q) =>
            q(
              `insert into queue_entries (workspace_id, username, note, position)
               values ($1,$2,'entrou pelo chat',$3)`,
              [this.workspaceId, context.username ?? 'Espectador', Number(last.rows[0]?.position ?? 0) + 1],
            ),
          );
          return { ok: true, message: `${context.username} adicionado à fila` };
        }
        case 'run_command': {
          const name = String(actionConfig.command ?? '').replace(/^!/, '').toLowerCase();
          const { commands } = await this.data();
          const command = commands.find((c) => c.name.toLowerCase() === name);
          if (!command) return { ok: false, message: `Comando !${name} não encontrado` };
          const sent = await this.say(command.response);
          return sent
            ? { ok: true, message: `Comando !${name} executado` }
            : { ok: false, message: 'Envio pelo bot indisponível (conta do bot não conectada)' };
        }
        default:
          return { ok: false, message: `Ação "${actionType}" só roda no aplicativo (OBS/som)` };
      }
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : 'Falha ao executar ação' };
    }
  }

  private async runTimers(): Promise<void> {
    const timers = await withWorkspace(this.workspaceId, (q) =>
      q<{ id: string; message: string; interval_seconds: number; last_sent_at: string | null; only_when_live: boolean }>(
        'select id, message, interval_seconds, last_sent_at, only_when_live from timers where enabled = true',
      ),
    );
    for (const timer of timers.rows) {
      if (timer.only_when_live && !this.isLive) continue;
      const last = timer.last_sent_at ? new Date(timer.last_sent_at).getTime() : 0;
      if (Date.now() - last < timer.interval_seconds * 1000) continue;
      const sent = await this.say(timer.message);
      if (!sent) continue;
      await withWorkspace(this.workspaceId, (q) =>
        q('update timers set last_sent_at = now() where id = $1', [timer.id]),
      );
    }
  }

  private async pollLive(): Promise<void> {
    if (!this.streamer) return;
    const status = await getLiveStatus(this.streamer, await this.streamerToken()).catch(() => null);
    if (!status) return;
    this.isLive = status.live;
    if (status.live) {
      await withWorkspace(this.workspaceId, (q) =>
        q(
          `update stream_sessions set peak_viewers = greatest(peak_viewers, $2)
            where id = (select id from stream_sessions where workspace_id = $1 and ended_at is null
                        order by started_at desc limit 1)`,
          [this.workspaceId, status.viewers],
        ),
      );
    }
    publish(this.workspaceId, { type: 'twitch.live', data: status });
  }
}

/** Mantém um conjunto limitado de IDs recentes (deduplicação do EventSub). */
function remember(set: Set<string>, id: string): void {
  set.add(id);
  if (set.size > 500) {
    const oldest = set.values().next().value;
    if (oldest) set.delete(oldest);
  }
}

const bots = new Map<string, WorkspaceBot>();

export async function startBotEngine(): Promise<void> {
  try {
    const { rows } = await adminPool.query<{ workspace_id: string }>(
      'select distinct workspace_id from twitch_connections',
    );
    for (const row of rows) {
      const bot = new WorkspaceBot(row.workspace_id);
      bots.set(row.workspace_id, bot);
      bot.start().catch((error) => console.error('[bot] start', row.workspace_id, error.message));
    }
    console.log(`[bot] motor iniciado para ${rows.length} workspace(s)`);
  } catch (error) {
    console.error('[bot] falha ao iniciar motor', error);
  }
}

export async function restartBot(workspaceId: string): Promise<void> {
  bots.get(workspaceId)?.stop();
  bots.delete(workspaceId);
  const bot = new WorkspaceBot(workspaceId);
  bots.set(workspaceId, bot);
  await bot.start().catch((error) => console.error('[bot] restart', error.message));
}

export function stopBot(workspaceId: string): void {
  bots.get(workspaceId)?.stop();
  bots.delete(workspaceId);
}

export function botStatus(workspaceId: string): BotStatus {
  return (
    bots.get(workspaceId)?.getStatus() ?? {
      chat: 'offline',
      live: false,
      connected: false,
      streamer: false,
      bot: false,
      events: 'offline',
      chatSender: null,
      detail: null,
    }
  );
}

export function invalidateBotCache(workspaceId: string): void {
  bots.get(workspaceId)?.invalidateCache();
}

/** Envia uma mensagem no chat do workspace pela conta do bot. */
export async function sendWorkspaceMessage(workspaceId: string, message: string): Promise<void> {
  const bot = bots.get(workspaceId);
  if (bot) {
    const ok = await bot.say(message);
    if (!ok) {
      throw new Error('Conta do bot não conectada — o envio de mensagens pelo bot está indisponível.');
    }
    return;
  }
  await sendWorkspaceChatMessage(workspaceId, message);
}
