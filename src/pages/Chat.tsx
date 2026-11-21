import { useEffect, useMemo, useRef, useState } from 'react';
import { Ban, Search, Send, WifiOff } from 'lucide-react';
import { useApp } from '../state/AppContext';
import { get, post } from '../lib/api';
import { useApi } from '../lib/hooks';
import type { ChatMessage, TwitchConnectionInfo } from '../lib/types';
import ChatHealthBanner from '../components/ChatHealthBanner';
import { Badge, Button, Card, EmptyState, Field, Input, Modal, PageHeader, Select, Spinner } from '../components/ui';
import { formatDateTime } from '../lib/format';

type HistoryRow = {
  id: string;
  username: string;
  display_color: string | null;
  message: string;
  is_mod: boolean;
  is_sub: boolean;
  created_at: string;
};

type Filter = 'all' | 'subs' | 'mods';

export default function Chat() {
  const { workspace, can, chat, realtimeConnected } = useApp();
  const twitch = useApi<TwitchConnectionInfo>(workspace ? '/integrations/twitch' : null);
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [sending, setSending] = useState(false);
  const [target, setTarget] = useState<ChatMessage | null>(null);
  const [duration, setDuration] = useState('600');
  const [reason, setReason] = useState('moderação');
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    get<{ messages: HistoryRow[] }>('/chat/messages?limit=100')
      .then((data) => {
        if (cancelled) return;
        setHistory(
          data.messages.map((row) => ({
            id: row.id,
            username: row.username,
            displayName: row.username,
            color: row.display_color,
            message: row.message,
            isMod: row.is_mod,
            isSub: row.is_sub,
            createdAt: row.created_at,
          })),
        );
        setError(null);
      })
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : 'Falha ao carregar o chat'))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [workspace?.id]);

  const messages = useMemo(() => {
    const map = new Map<string, ChatMessage>();
    for (const message of [...history, ...chat]) {
      map.set(`${message.createdAt}|${message.username}|${message.message}`, message);
    }
    return [...map.values()]
      .filter((message) => {
        if (filter === 'subs' && !message.isSub) return false;
        if (filter === 'mods' && !message.isMod) return false;
        if (query && !`${message.displayName} ${message.message}`.toLowerCase().includes(query.toLowerCase())) return false;
        return true;
      })
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }, [history, chat, filter, query]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length]);

  const send = async () => {
    const message = draft.trim();
    if (!message) return;
    setSending(true);
    try {
      await post('/chat/send', { message });
      setDraft('');
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao enviar mensagem');
    } finally {
      setSending(false);
    }
  };

  const timeout = async () => {
    if (!target) return;
    try {
      await post('/chat/timeout', {
        userId: target.userId ?? target.username,
        duration: Number(duration),
        reason,
      });
      setTarget(null);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao moderar');
    }
  };

  return (
    <div className="animate-fade-up">
      <PageHeader
        title="Chat ao vivo"
        subtitle="Mensagens em tempo real do canal conectado, com filtros e moderação."
        actions={
          <Badge tone={realtimeConnected ? 'success' : 'warning'}>
            {realtimeConnected ? 'recebendo eventos' : 'reconectando…'}
          </Badge>
        }
      />

      {error ? (
        <div className="mb-4 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3.5 py-2.5 text-xs text-rose-200">
          {error}
        </div>
      ) : null}

      <ChatHealthBanner info={twitch.data} workspaceId={workspace?.id} />

      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        <Card className="flex h-[calc(100vh-230px)] min-h-[420px] flex-col overflow-hidden">
          <div className="panel-head">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-white">#{workspace?.channel_name ?? 'canal'}</span>
              <Badge tone="neutral">{messages.length} mensagens</Badge>
            </div>
            <div className="flex items-center gap-1.5">
              {(['all', 'subs', 'mods'] as Filter[]).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setFilter(value)}
                  className={`chip ${filter === value ? 'chip-active' : ''}`}
                >
                  {value === 'all' ? 'Todas' : value === 'subs' ? 'Inscritos' : 'Mods'}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 space-y-1 overflow-y-auto px-4 py-3">
            {loading ? (
              <Spinner label="Carregando histórico…" />
            ) : messages.length ? (
              messages.map((message, index) => (
                <div
                  key={`${message.createdAt}-${index}`}
                  className="group flex items-start gap-2 rounded-lg px-2 py-1.5 transition hover:bg-white/[0.03]"
                >
                  <div className="min-w-0 flex-1">
                    <span className="text-[11px] text-mist-500">{formatDateTime(message.createdAt)}</span>{' '}
                    {message.isMod ? <Badge tone="success">mod</Badge> : null}{' '}
                    {message.isSub ? <Badge tone="primary">sub</Badge> : null}{' '}
                    <span className="ml-1 text-sm font-semibold" style={{ color: message.color ?? '#cfd7e6' }}>
                      {message.displayName}
                    </span>
                    <span className="ml-1.5 text-sm text-mist-200">{message.message}</span>
                  </div>
                  {can('chat.moderate') ? (
                    <button
                      type="button"
                      onClick={() => setTarget(message)}
                      className="btn-ghost shrink-0 p-1 opacity-0 transition group-hover:opacity-100"
                      aria-label={`Moderar ${message.displayName}`}
                    >
                      <Ban size={13} />
                    </button>
                  ) : null}
                </div>
              ))
            ) : (
              <EmptyState
                icon={<WifiOff size={18} />}
                title="Nenhuma mensagem ainda"
                description="Quando o bot estiver conectado ao canal, as mensagens aparecem aqui automaticamente."
              />
            )}
            <div ref={bottomRef} />
          </div>

          <div className="border-t border-white/[0.06] p-3">
            {can('chat.send') ? (
              <form
                className="flex items-center gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  void send();
                }}
              >
                <Input
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder="Escreva uma mensagem para o chat…"
                  maxLength={480}
                />
                <Button type="submit" disabled={sending || !draft.trim()}>
                  <Send size={15} />
                </Button>
              </form>
            ) : (
              <p className="px-1 py-2 text-xs text-mist-500">Você não tem permissão para enviar mensagens.</p>
            )}
          </div>
        </Card>

        <div className="space-y-4">
          <Card className="p-4">
            <Field label="Buscar no chat">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-3 text-mist-500" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="usuário ou palavra"
                  className="pl-8"
                />
              </div>
            </Field>
            <p className="mt-3 text-[11px] leading-relaxed text-mist-500">
              O histórico exibido vem das mensagens recebidas pelo bot neste workspace. A API da Twitch não fornece
              histórico anterior à conexão.
            </p>
          </Card>

          <Card className="p-4">
            <p className="text-xs font-semibold text-white">Comandos do bot</p>
            <p className="mt-1 text-[11px] leading-relaxed text-mist-400">
              Os comandos personalizados respondem automaticamente no chat. Crie novos em{' '}
              <span className="text-mist-200">Comandos</span>.
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {['!discord', '!redes', '!setup', '!fila'].map((command) => (
                <span key={command} className="chip cursor-default font-mono">
                  {command}
                </span>
              ))}
            </div>
          </Card>
        </div>
      </div>

      <Modal
        open={Boolean(target)}
        onClose={() => setTarget(null)}
        title={`Moderar ${target?.displayName ?? ''}`}
        description="A ação usa o escopo de moderação autorizado na conexão Twitch."
        footer={
          <>
            <Button variant="secondary" onClick={() => setTarget(null)}>
              Cancelar
            </Button>
            <Button variant="danger" onClick={() => void timeout()}>
              Aplicar timeout
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Duração">
            <Select value={duration} onChange={(event) => setDuration(event.target.value)}>
              <option value="60">1 minuto</option>
              <option value="600">10 minutos</option>
              <option value="1800">30 minutos</option>
              <option value="86400">24 horas</option>
            </Select>
          </Field>
          <Field label="Motivo">
            <Input value={reason} onChange={(event) => setReason(event.target.value)} maxLength={100} />
          </Field>
        </div>
      </Modal>
    </div>
  );
}
