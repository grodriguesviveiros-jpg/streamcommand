import { useState } from 'react';
import { Activity, CalendarRange, Eye, MessagesSquare, TrendingUp, Users, Zap } from 'lucide-react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useApi } from '../lib/hooks';
import type { StatsOverview } from '../lib/types';
import { Badge, Card, EmptyState, PageHeader, Spinner, StatCard, Tabs } from '../components/ui';
import { formatDateTime, formatDuration, formatNumber, timeAgo } from '../lib/format';

export default function Stats() {
  const [days, setDays] = useState('30');
  const { data, loading, error } = useApi<StatsOverview>(`/stats/overview?days=${days}`);

  const peak = data?.sessions.reduce((max, session) => Math.max(max, session.peak_viewers ?? 0), 0) ?? 0;
  const totalSessions = data?.sessions.length ?? 0;
  const totalMessages = data?.messages.reduce((sum, day) => sum + day.count, 0) ?? 0;
  const totalHours =
    data?.sessions.reduce((sum, session) => {
      if (!session.ended_at) return sum;
      return sum + (new Date(session.ended_at).getTime() - new Date(session.started_at).getTime()) / 3_600_000;
    }, 0) ?? 0;

  return (
    <div className="animate-fade-up">
      <PageHeader
        title="Estatísticas e histórico"
        subtitle="Dados reais coletados pelo bot: sessões de live, chat, comandos e ações da equipe."
        actions={
          <Tabs
            tabs={[
              { value: '7', label: '7 dias' },
              { value: '30', label: '30 dias' },
              { value: '90', label: '90 dias' },
            ]}
            value={days}
            onChange={setDays}
          />
        }
      />

      {error ? (
        <div className="mb-4 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3.5 py-2.5 text-xs text-rose-200">{error}</div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Pico de espectadores"
          value={formatNumber(peak)}
          hint={`${totalSessions} sessão(ões) registradas`}
          icon={<Eye size={16} />}
        />
        <StatCard
          label="Horas transmitidas"
          value={totalHours ? `${totalHours.toFixed(1)} h` : '—'}
          hint="Somatório das sessões encerradas"
          icon={<CalendarRange size={16} />}
          tone="secondary"
        />
        <StatCard
          label="Mensagens no período"
          value={formatNumber(totalMessages)}
          hint={`${data?.totals.members ?? 0} membro(s) na equipe`}
          icon={<MessagesSquare size={16} />}
        />
        <StatCard
          label="Seguidores"
          value={data?.live?.followers != null ? formatNumber(data.live.followers) : '—'}
          hint={data?.twitchConnected ? 'Total atual do canal' : 'Conecte a Twitch'}
          icon={<Users size={16} />}
          tone="secondary"
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="panel-head">
            <h2 className="text-sm font-semibold text-white">Mensagens por dia</h2>
            <Badge tone="neutral">{days} dias</Badge>
          </div>
          <div className="h-[260px] px-2 py-4">
            {loading ? (
              <Spinner />
            ) : data?.messages.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.messages}>
                  <defs>
                    <linearGradient id="statsGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--secondary)" stopOpacity={0.55} />
                      <stop offset="100%" stopColor="var(--secondary)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                  <XAxis dataKey="day" tick={{ fill: '#7f8ba3', fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#7f8ba3', fontSize: 10 }} axisLine={false} tickLine={false} width={30} />
                  <Tooltip
                    contentStyle={{ background: '#131824', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, fontSize: 12 }}
                  />
                  <Area type="monotone" dataKey="count" name="mensagens" stroke="var(--secondary)" strokeWidth={2} fill="url(#statsGradient)" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState icon={<Activity size={18} />} title="Sem dados no período" description="As mensagens do chat alimentam este gráfico." />
            )}
          </div>
        </Card>

        <Card>
          <div className="panel-head">
            <h2 className="text-sm font-semibold text-white">Comandos mais usados</h2>
          </div>
          <div className="p-4">
            {data?.commands.length ? (
              <div className="space-y-2.5">
                {data.commands.map((command) => {
                  const max = Math.max(...data.commands.map((item) => item.use_count), 1);
                  return (
                    <div key={command.id}>
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-mono text-mist-200">!{command.name}</span>
                        <span className="text-mist-400">{command.use_count}</span>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${(command.use_count / max) * 100}%`, background: 'var(--primary)' }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-mist-500">Nenhum uso registrado ainda.</p>
            )}
          </div>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <div className="panel-head">
            <h2 className="text-sm font-semibold text-white">Sessões de transmissão</h2>
            <TrendingUp size={15} className="text-mist-500" />
          </div>
          {data?.sessions.length ? (
            <div className="max-h-[320px] overflow-y-auto">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-ink-850/95 text-[10px] uppercase tracking-wider text-mist-500">
                  <tr>
                    <th className="px-4 py-2">Início</th>
                    <th className="px-4 py-2">Duração</th>
                    <th className="px-4 py-2">Pico</th>
                    <th className="px-4 py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.sessions.map((session) => (
                    <tr key={session.id} className="table-row">
                      <td className="px-4 py-2 text-mist-200">{formatDateTime(session.started_at)}</td>
                      <td className="px-4 py-2 text-mist-400">
                        {session.ended_at
                          ? formatDuration((new Date(session.ended_at).getTime() - new Date(session.started_at).getTime()) / 1000)
                          : 'em andamento'}
                      </td>
                      <td className="px-4 py-2 text-mist-400">{session.peak_viewers}</td>
                      <td className="px-4 py-2">
                        <Badge tone={session.ended_at ? 'neutral' : 'success'}>{session.ended_at ? 'encerrada' : 'no ar'}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              icon={<Zap size={18} />}
              title="Nenhuma sessão registrada"
              description="As sessões são criadas automaticamente quando o EventSub detecta o início da live."
            />
          )}
        </Card>

        <Card>
          <div className="panel-head">
            <h2 className="text-sm font-semibold text-white">Histórico da equipe</h2>
          </div>
          <div className="max-h-[320px] divide-y divide-white/[0.05] overflow-y-auto">
            {data?.activity.length ? (
              data.activity.map((item) => (
                <div key={item.id} className="flex items-start justify-between gap-3 px-4 py-2.5">
                  <div>
                    <p className="text-[11px] text-mist-200">
                      <span className="font-semibold text-white">{item.actor_name}</span> · {item.action}
                    </p>
                    {item.target ? <p className="text-[10px] text-mist-500">{item.target}</p> : null}
                  </div>
                  <span className="shrink-0 text-[10px] text-mist-500">{timeAgo(item.created_at)}</span>
                </div>
              ))
            ) : (
              <EmptyState icon={<Activity size={18} />} title="Sem atividades" description="Ações da equipe aparecem aqui com autor e horário." />
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
