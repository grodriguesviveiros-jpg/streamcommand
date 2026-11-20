import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  Eye,
  Gift,
  ListOrdered,
  MessagesSquare,
  MonitorPlay,
  Radio,
  RefreshCw,
  Terminal,
  Timer,
  TrendingUp,
  Users,
  Volume2,
  Workflow,
  Zap,
} from 'lucide-react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useApp } from '../state/AppContext';
import { useApi } from '../lib/hooks';
import type { Invitation, LiveStatus, StatsOverview } from '../lib/types';
import { Badge, Button, Card, Dot, EmptyState, PageHeader, Spinner, StatCard } from '../components/ui';
import { formatDateTime, formatNumber, liveDuration, timeAgo, TRIGGER_LABELS } from '../lib/format';
import { obs } from '../lib/obs';

export default function Dashboard() {
  const { workspace, can, events } = useApp();
  const stats = useApi<StatsOverview>('/stats/overview?days=30');
  const live = useApi<LiveStatus>('/integrations/twitch/live');
  const invites = useApi<{ invitations: Invitation[] }>('/workspaces/invitations');
  const [obsConnected, setObsConnected] = useState(obs.connected);

  useEffect(() => {
    const timer = setInterval(() => setObsConnected(obs.connected), 2000);
    return () => clearInterval(timer);
  }, []);

  const liveData = live.data;
  const overview = stats.data;
  const chatSeries = useMemo(() => overview?.messages ?? [], [overview]);
  const recentEvents = events.filter((event) => event.type === 'twitch.event').slice(0, 6);

  const refreshAll = () => {
    void stats.reload();
    void live.reload();
    void invites.reload();
  };

  return (
    <div className="animate-fade-up">
      <PageHeader
        title={`Olá, ${workspace?.display_name || workspace?.name || 'streamer'}`}
        subtitle="Visão geral real do seu workspace: conexões, live, chat e automações."
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={refreshAll}>
              <RefreshCw size={14} /> Atualizar
            </Button>
            {can('chat.view') ? (
              <Link to="/app/chat" className="btn-primary">
                <MessagesSquare size={15} /> Abrir chat
              </Link>
            ) : null}
          </>
        }
      />

      {invites.data?.invitations.length ? (
        <Card className="mb-5 border-amber-500/30 bg-amber-500/[0.06] p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <Users size={16} className="mt-0.5 text-amber-300" />
              <div>
                <p className="text-sm font-semibold text-white">Você tem convites pendentes</p>
                <p className="text-xs text-mist-300">
                  {invites.data.invitations
                    .map((invite) => `${invite.workspace_name} (${invite.invited_by ?? 'equipe'})`)
                    .join(' · ')}
                </p>
              </div>
            </div>
            <Link to={`/convite/${invites.data.invitations[0].token}`} className="btn-primary">
              Revisar convite
            </Link>
          </div>
        </Card>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Espectadores agora"
          value={liveData?.live ? formatNumber(liveData.viewers) : '—'}
          hint={liveData?.live ? `No ar há ${liveDuration(liveData.startedAt)}` : liveData?.connected ? 'Live offline' : 'Twitch não conectada'}
          icon={<Eye size={16} />}
        />
        <StatCard
          label="Seguidores"
          value={liveData?.followers != null ? formatNumber(liveData.followers) : '—'}
          hint="Direto da API da Twitch"
          icon={<Users size={16} />}
          tone="secondary"
        />
        <StatCard
          label="Mensagens (30 dias)"
          value={formatNumber(overview?.totals.messages ?? 0)}
          hint={`${overview?.totals.members ?? 0} membro(s) na equipe`}
          icon={<MessagesSquare size={16} />}
        />
        <StatCard
          label="Automações executadas"
          value={formatNumber(overview?.totals.automation_runs ?? 0)}
          hint={`${overview?.totals.commands ?? 0} comandos · ${overview?.totals.timers ?? 0} timers`}
          icon={<Zap size={16} />}
          tone="secondary"
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="overflow-hidden lg:col-span-2">
          <div className="panel-head">
            <div className="flex items-center gap-2">
              <Radio size={15} style={{ color: 'var(--secondary)' }} />
              <h2 className="text-sm font-semibold text-white">Status da transmissão</h2>
            </div>
            {liveData?.live ? <Badge tone="danger">AO VIVO</Badge> : <Badge tone="neutral">offline</Badge>}
          </div>
          <div className="p-5">
            {live.error ? (
              <p className="mb-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                {live.error}
              </p>
            ) : null}
            {live.loading ? (
              <Spinner />
            ) : liveData?.connected ? (
              <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
                <div>
                  <p className="text-lg font-semibold text-white">{liveData.title || 'Sem título definido'}</p>
                  <p className="mt-1 text-xs text-mist-400">
                    {liveData.game || 'Categoria não definida'} · atualizado {timeAgo(new Date().toISOString())}
                  </p>
                  <div className="mt-4 flex flex-wrap gap-4 text-xs text-mist-300">
                    <span className="flex items-center gap-1.5">
                      <Eye size={13} /> {formatNumber(liveData.viewers ?? 0)} espectadores
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Users size={13} /> {formatNumber(liveData.followers ?? 0)} seguidores
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Activity size={13} /> bot: {liveData.bot?.chat === 'connected' ? 'conectado' : liveData.bot?.chat ?? 'offline'}
                    </span>
                  </div>
                </div>
                {liveData.live && liveData.thumbnailUrl ? (
                  <img
                    src={liveData.thumbnailUrl.replace('{width}', '320').replace('{height}', '180')}
                    alt="Prévia da live"
                    className="hidden h-[92px] w-[164px] rounded-xl border border-white/10 object-cover sm:block"
                  />
                ) : null}
              </div>
            ) : (
              <EmptyState
                icon={<Radio size={18} />}
                title="Twitch não conectada"
                description="Conecte sua conta Twitch para receber chat, follows, inscrições e raids em tempo real."
                action={
                  can('twitch.manage') ? (
                    <a href={`/api/integrations/twitch/start?workspace=${workspace?.id}`} className="btn-primary">
                      Conectar Twitch
                    </a>
                  ) : null
                }
              />
            )}
          </div>
        </Card>

        <Card>
          <div className="panel-head">
            <h2 className="text-sm font-semibold text-white">Conexões</h2>
          </div>
          <div className="divide-y divide-white/[0.05]">
            <div className="flex items-center justify-between px-5 py-3.5">
              <div className="flex items-center gap-2.5">
                <Dot tone={liveData?.connected ? 'success' : 'danger'} pulse={Boolean(liveData?.connected)} />
                <div>
                  <p className="text-xs font-semibold text-white">Twitch</p>
                  <p className="text-[11px] text-mist-500">
                    {liveData?.connected ? workspace?.channel_name ?? 'conectada' : 'não conectada'}
                  </p>
                </div>
              </div>
              <Badge tone={liveData?.connected ? 'success' : 'neutral'}>
                {liveData?.connected ? 'ativa' : 'pendente'}
              </Badge>
            </div>
            <div className="flex items-center justify-between px-5 py-3.5">
              <div className="flex items-center gap-2.5">
                <Dot tone={obsConnected ? 'success' : 'warning'} pulse={obsConnected} />
                <div>
                  <p className="text-xs font-semibold text-white">OBS Studio</p>
                  <p className="text-[11px] text-mist-500">{obsConnected ? 'WebSocket local' : 'conecte na página OBS'}</p>
                </div>
              </div>
              {can('obs.control') ? (
                <Link to="/app/obs" className="text-[11px] font-medium text-mist-300 underline-offset-2 hover:underline">
                  abrir
                </Link>
              ) : null}
            </div>
            <div className="flex items-center justify-between px-5 py-3.5">
              <div className="flex items-center gap-2.5">
                <Dot tone={liveData?.bot?.chat === 'connected' ? 'success' : 'neutral'} />
                <div>
                  <p className="text-xs font-semibold text-white">Bot do chat</p>
                  <p className="text-[11px] text-mist-500">comandos, timers e automações</p>
                </div>
              </div>
              <Badge tone={liveData?.bot?.chat === 'connected' ? 'success' : 'neutral'}>
                {liveData?.bot?.chat === 'connected' ? 'online' : 'offline'}
              </Badge>
            </div>
          </div>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="panel-head">
            <h2 className="text-sm font-semibold text-white">Atividade do chat</h2>
            <span className="text-[11px] text-mist-500">mensagens por dia · 30 dias</span>
          </div>
          <div className="h-[240px] px-2 py-4">
            {chatSeries.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chatSeries}>
                  <defs>
                    <linearGradient id="chatGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.6} />
                      <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                  <XAxis dataKey="day" tick={{ fill: '#7f8ba3', fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#7f8ba3', fontSize: 10 }} axisLine={false} tickLine={false} width={28} />
                  <Tooltip
                    contentStyle={{
                      background: '#131824',
                      border: '1px solid rgba(255,255,255,0.08)',
                      borderRadius: 12,
                      fontSize: 12,
                    }}
                    labelStyle={{ color: '#cfd7e6' }}
                  />
                  <Area type="monotone" dataKey="count" name="mensagens" stroke="var(--primary)" strokeWidth={2} fill="url(#chatGradient)" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState
                icon={<MessagesSquare size={18} />}
                title="Sem mensagens registradas"
                description="As mensagens aparecem aqui depois que o bot estiver conectado ao chat."
              />
            )}
          </div>
        </Card>

        <Card>
          <div className="panel-head">
            <h2 className="text-sm font-semibold text-white">Eventos recentes</h2>
          </div>
          <div className="divide-y divide-white/[0.05]">
            {recentEvents.length ? (
              recentEvents.map((event, index) => {
                const payload = event.data as { type?: string; event?: Record<string, unknown> };
                const type = payload.type ?? '';
                const data = payload.event ?? {};
                return (
                  <div key={`${event.at}-${index}`} className="px-5 py-3">
                    <p className="text-xs font-semibold text-white">{TRIGGER_LABELS[type] ?? type}</p>
                    <p className="text-[11px] text-mist-400">
                      {String(data.user_name ?? data.from_broadcaster_user_name ?? '')}
                      {data.viewers ? ` · ${data.viewers} espectadores` : ''}
                    </p>
                    <p className="text-[10px] text-mist-500">{timeAgo(new Date(event.at).toISOString())}</p>
                  </div>
                );
              })
            ) : (
              <EmptyState
                icon={<Activity size={18} />}
                title="Nenhum evento ainda"
                description="Follows, inscrições e raids aparecem aqui em tempo real."
              />
            )}
          </div>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="panel-head">
            <h2 className="text-sm font-semibold text-white">Ações rápidas</h2>
          </div>
          <div className="grid grid-cols-2 gap-2 p-4 sm:grid-cols-3">
            {[
              { to: '/app/chat', label: 'Chat ao vivo', icon: MessagesSquare, permission: 'chat.view' },
              { to: '/app/comandos', label: 'Comandos', icon: Terminal, permission: 'commands.manage' },
              { to: '/app/automacoes', label: 'Automações', icon: Workflow, permission: 'automations.manage' },
              { to: '/app/timers', label: 'Timers', icon: Timer, permission: 'timers.manage' },
              { to: '/app/sorteios', label: 'Sorteios', icon: Gift, permission: 'giveaways.manage' },
              { to: '/app/fila', label: 'Fila', icon: ListOrdered, permission: 'queue.manage' },
              { to: '/app/soundboard', label: 'Soundboard', icon: Volume2, permission: 'soundboard.manage' },
              { to: '/app/obs', label: 'OBS Studio', icon: MonitorPlay, permission: 'obs.control' },
              { to: '/app/estatisticas', label: 'Estatísticas', icon: TrendingUp, permission: 'stats.view' },
            ]
              .filter((action) => can(action.permission))
              .map((action) => (
                <Link
                  key={action.to}
                  to={action.to}
                  className="group flex items-center gap-2.5 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5 text-xs font-medium text-mist-200 transition hover:border-white/15 hover:bg-white/[0.05]"
                >
                  <action.icon size={15} className="text-mist-400 transition group-hover:text-white" />
                  {action.label}
                </Link>
              ))}
          </div>
        </Card>

        <Card>
          <div className="panel-head">
            <h2 className="text-sm font-semibold text-white">Histórico recente</h2>
          </div>
          <div className="max-h-[260px] divide-y divide-white/[0.05] overflow-y-auto">
            {overview?.activity.length ? (
              overview.activity.slice(0, 8).map((item) => (
                <div key={item.id} className="px-5 py-2.5">
                  <p className="text-[11px] font-medium text-mist-200">
                    <span className="text-white">{item.actor_name}</span> · {item.action}
                  </p>
                  <p className="text-[10px] text-mist-500">
                    {item.target ? `${item.target} · ` : ''}
                    {formatDateTime(item.created_at)}
                  </p>
                </div>
              ))
            ) : (
              <EmptyState icon={<Activity size={18} />} title="Sem histórico" description="As ações da equipe ficam registradas aqui." />
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
