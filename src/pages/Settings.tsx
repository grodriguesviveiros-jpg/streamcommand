import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Check, ExternalLink, LogOut, Palette, ShieldCheck, User } from 'lucide-react';
import { get, patch, put } from '../lib/api';
import { useApi, useSubmit } from '../lib/hooks';
import { useApp } from '../state/AppContext';
import type { TwitchConnectionInfo } from '../lib/types';
import { Badge, Button, Card, ColorField, ConfirmButton, ErrorBanner, Field, Input, PageHeader, Select, Spinner, SuccessBanner, Tabs, Toggle } from '../components/ui';
import { formatDateTime } from '../lib/format';
import TwitchAccountCard from '../components/TwitchAccountCard';
import ChatSenderCard from '../components/ChatSenderCard';

const SECTIONS = [
  { value: 'perfil', label: 'Perfil' },
  { value: 'identidade', label: 'Identidade visual' },
  { value: 'twitch', label: 'Twitch' },
  { value: 'obs', label: 'OBS' },
  { value: 'seguranca', label: 'Segurança' },
];

export default function Settings() {
  const { section } = useParams();
  const navigate = useNavigate();
  const { user, workspace, workspaces, refresh, logout, selectWorkspace } = useApp();
  const active = SECTIONS.some((item) => item.value === section) ? section! : 'perfil';

  const [identity, setIdentity] = useState({
    name: '',
    display_name: '',
    logo_url: '',
    primary_color: '#7c3aed',
    secondary_color: '#22d3ee',
  });
  const [obs, setObs] = useState({ host: '127.0.0.1', port: 4455, password: '' });
  const [notifications, setNotifications] = useState(true);
  const [compact, setCompact] = useState(false);
  const submit = useSubmit();
  const twitch = useApi<TwitchConnectionInfo>('/integrations/twitch');

  useEffect(() => {
    if (!workspace) return;
    setIdentity({
      name: workspace.name,
      display_name: workspace.display_name ?? '',
      logo_url: workspace.logo_url ?? '',
      primary_color: workspace.primary_color,
      secondary_color: workspace.secondary_color,
    });
    setNotifications(Boolean(workspace.preferences?.notifications ?? true));
    setCompact(Boolean(workspace.preferences?.compact ?? false));
  }, [workspace]);

  useEffect(() => {
    get<{ host: string; port: number }>('/integrations/obs')
      .then((data) => setObs((prev) => ({ ...prev, host: data.host, port: data.port })))
      .catch(() => undefined);
  }, [workspace?.id]);

  const saveIdentity = async () => {
    await submit.run(async () => {
      await patch('/workspaces/current', {
        ...identity,
        preferences: { notifications, compact },
      });
      await refresh();
    }, 'Configurações salvas.');
  };

  const saveObs = async () => {
    await submit.run(async () => {
      await put('/integrations/obs', obs);
    }, 'Configuração do OBS salva.');
  };

  return (
    <div className="animate-fade-up">
      <PageHeader title="Configurações" subtitle="Perfil, identidade visual, integrações e segurança do workspace." />

      <div className="mb-4">
        <Tabs
          tabs={SECTIONS.map((item) => ({ value: item.value, label: item.label }))}
          value={active}
          onChange={(value) => navigate(`/app/configuracoes/${value}`)}
        />
      </div>

      <ErrorBanner message={submit.error} />
      <SuccessBanner message={submit.message} />

      {active === 'perfil' ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="p-5">
            <div className="flex items-center gap-2">
              <User size={15} style={{ color: 'var(--secondary)' }} />
              <h2 className="text-sm font-semibold text-white">Conta Discord</h2>
            </div>
            <div className="mt-4 flex items-center gap-3">
              {user?.avatar_url ? (
                <img src={user.avatar_url} alt={user.username} className="h-12 w-12 rounded-full border border-white/10" />
              ) : null}
              <div>
                <p className="text-sm font-semibold text-white">{user?.global_name || user?.username}</p>
                <p className="text-[11px] text-mist-400">@{user?.username} · ID {user?.discord_id}</p>
                <p className="text-[10px] text-mist-500">último acesso em {formatDateTime(user?.last_login_at)}</p>
              </div>
            </div>
            <p className="mt-4 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 text-[11px] leading-relaxed text-mist-400">
              O login é feito pelo Discord (OAuth2 com PKCE). O STREAM COMMAND nunca recebe sua senha e guarda apenas o
              identificador, nome, avatar e e-mail do perfil.
            </p>
          </Card>

          <Card className="p-5">
            <h2 className="text-sm font-semibold text-white">Workspaces</h2>
            <p className="mt-1 text-[11px] text-mist-400">Você participa de {workspaces.length} workspace(s).</p>
            <div className="mt-3 space-y-2">
              {workspaces.map((item) => (
                <div key={item.id} className="flex items-center justify-between rounded-xl border border-white/[0.06] px-3 py-2">
                  <div>
                    <p className="text-xs font-medium text-white">{item.name}</p>
                    <p className="text-[10px] text-mist-500">
                      {item.channel_name ? `twitch.tv/${item.channel_name}` : 'Twitch não conectada'} · {item.role}
                    </p>
                  </div>
                  {item.id === workspace?.id ? (
                    <Badge tone="primary">
                      <Check size={11} /> ativo
                    </Badge>
                  ) : (
                    <Button variant="ghost" size="sm" onClick={() => selectWorkspace(item.id)}>
                      usar
                    </Button>
                  )}
                </div>
              ))}
            </div>
            <Link to="/app/equipe" className="btn-secondary mt-4 inline-flex">
              Gerenciar equipe
            </Link>
          </Card>
        </div>
      ) : null}

      {active === 'identidade' ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="p-5">
            <div className="flex items-center gap-2">
              <Palette size={15} style={{ color: 'var(--secondary)' }} />
              <h2 className="text-sm font-semibold text-white">Identidade do canal</h2>
            </div>
            <div className="mt-4 space-y-3">
              <Field label="Nome do workspace">
                <Input value={identity.name} onChange={(event) => setIdentity({ ...identity, name: event.target.value })} />
              </Field>
              <Field label="Nome de exibição">
                <Input
                  value={identity.display_name}
                  onChange={(event) => setIdentity({ ...identity, display_name: event.target.value })}
                  placeholder="Como você quer ser chamado no painel"
                />
              </Field>
              <Field label="URL do logotipo" hint="Use uma imagem pública (png/jpg) ou a URL da sua marca.">
                <Input
                  value={identity.logo_url}
                  onChange={(event) => setIdentity({ ...identity, logo_url: event.target.value })}
                  placeholder="https://…"
                />
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <ColorField
                  label="Cor principal"
                  value={identity.primary_color}
                  onChange={(value) => setIdentity({ ...identity, primary_color: value })}
                />
                <ColorField
                  label="Cor secundária"
                  value={identity.secondary_color}
                  onChange={(value) => setIdentity({ ...identity, secondary_color: value })}
                />
              </div>
              <div className="space-y-2 pt-1">
                <Toggle checked={notifications} onChange={setNotifications} label="Notificações de eventos no painel" />
                <Toggle checked={compact} onChange={setCompact} label="Preferir layout compacto" />
              </div>
              <Button onClick={() => void saveIdentity()} disabled={submit.saving}>
                {submit.saving ? 'Salvando…' : 'Salvar identidade'}
              </Button>
            </div>
          </Card>

          <Card className="p-5">
            <h2 className="text-sm font-semibold text-white">Pré-visualização</h2>
            <p className="mt-1 text-[11px] text-mist-400">As cores são aplicadas em todo o aplicativo ao salvar.</p>
            <div className="mt-4 rounded-2xl border border-white/[0.06] bg-ink-900/60 p-4">
              <div className="flex items-center gap-3">
                {identity.logo_url ? (
                  <img src={identity.logo_url} alt="" className="h-11 w-11 rounded-xl border border-white/10 object-cover" />
                ) : (
                  <div
                    className="h-11 w-11 rounded-xl"
                    style={{ background: `linear-gradient(135deg, ${identity.primary_color}, ${identity.secondary_color})` }}
                  />
                )}
                <div>
                  <p className="text-sm font-semibold text-white">{identity.display_name || identity.name}</p>
                  <p className="text-[11px] text-mist-400">{workspace?.channel_name ? `twitch.tv/${workspace.channel_name}` : 'canal não conectado'}</p>
                </div>
              </div>
              <div className="mt-4 grid gap-2">
                <div
                  className="rounded-xl px-3 py-2 text-xs font-semibold text-white"
                  style={{ background: `linear-gradient(135deg, ${identity.primary_color}, ${identity.secondary_color})` }}
                >
                  Botão principal
                </div>
                <div className="rounded-xl border px-3 py-2 text-xs" style={{ borderColor: identity.secondary_color, color: identity.secondary_color }}>
                  Destaque secundário
                </div>
              </div>
            </div>
          </Card>
        </div>
      ) : null}

      {active === 'twitch' ? (
        <div className="space-y-4">
          <Card className="p-4">
            <p className="text-[11px] leading-relaxed text-mist-300">
              O STREAM COMMAND trabalha com <strong className="text-white">duas contas Twitch independentes</strong> por
              workspace. A conta do <strong className="text-white">streamer</strong> identifica o canal e recebe os
              eventos (follows, inscrições, raids e live). A conta do <strong className="text-white">bot</strong> é uma
              segunda conta, separada, usada para ler o chat. Você escolhe abaixo qual das duas envia as mensagens,
              respostas de comandos e timers. Cada conexão tem seus próprios tokens, escopos e estado.
            </p>
            {twitch.data?.sameAccount ? (
              <p className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200">
                As duas conexões usam a mesma conta Twitch. Para separar as identidades no chat, conecte uma conta
                diferente na conta do bot.
              </p>
            ) : null}
            {twitch.data && !twitch.data.connections?.bot ? (
              <p className="mt-3 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[11px] text-rose-200">
                Conta do bot não conectada: a leitura do chat fica indisponível e o envio pelo bot também. Você pode
                usar a conta do streamer para enviar ou conectar uma conta de bot.
              </p>
            ) : null}
          </Card>

          {twitch.data ? (
            <ChatSenderCard
              preference={twitch.data.chatSender ?? 'bot'}
              streamer={twitch.data.connections?.streamer ?? null}
              bot={twitch.data.connections?.bot ?? null}
              onChanged={() => twitch.reload()}
            />
          ) : null}

          {twitch.loading ? <Spinner /> : null}

          <div className="grid items-start gap-4 lg:grid-cols-2">
            <TwitchAccountCard
              type="streamer"
              account={twitch.data?.connections?.streamer ?? null}
              configured={Boolean(twitch.data?.configured)}
              workspaceId={workspace?.id}
              requiredScopes={twitch.data?.requiredScopes?.streamer ?? []}
              onChanged={() => twitch.reload()}
            />
            <TwitchAccountCard
              type="bot"
              account={twitch.data?.connections?.bot ?? null}
              configured={Boolean(twitch.data?.configured)}
              workspaceId={workspace?.id}
              requiredScopes={twitch.data?.requiredScopes?.bot ?? []}
              onChanged={() => twitch.reload()}
            />
          </div>

          <Card className="p-5">
            <h2 className="text-sm font-semibold text-white">Configuração necessária no Twitch Developer</h2>
            <p className="mt-1 text-[11px] text-mist-400">
              No console da Twitch, cadastre exatamente esta URL de redirecionamento (serve para as duas contas):
            </p>
            <code className="mt-2 block break-all rounded-lg bg-black/30 px-3 py-2 text-[11px] text-mist-200">
              {twitch.data?.redirectUri ?? `${window.location.origin}/api/integrations/twitch/callback`}
            </code>
            <a
              href="https://dev.twitch.tv/console/apps"
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-flex items-center gap-1 text-[11px] text-mist-300 underline-offset-2 hover:underline"
            >
              Abrir Twitch Developer Console <ExternalLink size={11} />
            </a>
            <p className="mt-3 text-[11px] leading-relaxed text-mist-500">
              Cada conta autoriza o aplicativo separadamente no OAuth da Twitch. Tokens ficam criptografados no servidor
              (AES-256-GCM), são renovados por conta e revogados na Twitch ao desconectar. O Client Secret nunca é enviado
              ao navegador.
            </p>
          </Card>
        </div>
      ) : null}

      {active === 'obs' ? (
        <Card className="max-w-xl p-5">
          <h2 className="text-sm font-semibold text-white">Conexão com o OBS Studio</h2>
          <p className="mt-1 text-[11px] leading-relaxed text-mist-400">
            O aplicativo conecta direto no WebSocket local do OBS (Ferramentas → WebSocket do OBS Server). A senha é
            criptografada e usada apenas para abrir a conexão local.
          </p>
          <div className="mt-4 space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Host">
                <Input value={obs.host} onChange={(event) => setObs({ ...obs, host: event.target.value })} />
              </Field>
              <Field label="Porta">
                <Input type="number" value={obs.port} onChange={(event) => setObs({ ...obs, port: Number(event.target.value) })} />
              </Field>
            </div>
            <Field label="Senha" hint="Deixe em branco para manter a senha salva.">
              <Input
                type="password"
                value={obs.password}
                onChange={(event) => setObs({ ...obs, password: event.target.value })}
                autoComplete="off"
              />
            </Field>
            <Button onClick={() => void saveObs()} disabled={submit.saving}>
              Salvar configuração
            </Button>
            <Link to="/app/obs" className="btn-secondary ml-2 inline-flex">
              Abrir controle do OBS
            </Link>
          </div>
        </Card>
      ) : null}

      {active === 'seguranca' ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="p-5">
            <div className="flex items-center gap-2">
              <ShieldCheck size={15} style={{ color: 'var(--secondary)' }} />
              <h2 className="text-sm font-semibold text-white">Como seus dados são protegidos</h2>
            </div>
            <ul className="mt-3 space-y-2 text-[11px] leading-relaxed text-mist-300">
              <li>• Sessão assinada em cookie httpOnly (não acessível por JavaScript).</li>
              <li>• Isolamento por workspace aplicado no banco com Row Level Security forçado.</li>
              <li>• Permissões validadas no servidor em todas as rotas.</li>
              <li>• Tokens da Twitch e senha do OBS criptografados com AES-256-GCM.</li>
              <li>• Nenhum Client Secret é enviado ao navegador.</li>
              <li>• Todas as ações relevantes ficam no histórico com autor e horário.</li>
            </ul>
          </Card>
          <Card className="p-5">
            <h2 className="text-sm font-semibold text-white">Sessão</h2>
            <p className="mt-1 text-[11px] text-mist-400">
              Sessão de {user?.global_name || user?.username}, válida por 30 dias. Encerrar remove o cookie deste
              dispositivo.
            </p>
            <Button variant="danger" className="mt-4" onClick={() => void logout()}>
              <LogOut size={14} /> Encerrar sessão
            </Button>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
