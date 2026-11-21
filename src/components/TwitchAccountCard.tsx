import { useState } from 'react';
import { Bot, Radio, ShieldAlert, ShieldCheck, UserRound } from 'lucide-react';
import { del, get, post } from '../lib/api';
import type { TwitchAccount, TwitchAccountType, TwitchBotPermissions } from '../lib/types';
import { formatDateTime } from '../lib/format';
import { Badge, Button, Card, ConfirmButton } from './ui';

type Props = {
  type: TwitchAccountType;
  account: TwitchAccount | null;
  configured: boolean;
  workspaceId?: string;
  requiredScopes: string[];
  onChanged: () => Promise<void>;
};

const STATUS: Record<TwitchAccount['status'], { label: string; tone: string }> = {
  active: { label: 'conectada', tone: 'success' },
  expired: { label: 'expirada', tone: 'warning' },
  revoked: { label: 'revogada', tone: 'danger' },
  error: { label: 'com erro', tone: 'danger' },
};

type Feedback = { tone: 'success' | 'error'; text: string } | null;

/**
 * Card de UMA conexão Twitch. A mesma estrutura serve às duas contas, mas o
 * visual (cor, ícone e rótulo) deixa explícito que streamer e bot são contas
 * diferentes, com tokens e escopos próprios.
 */
export default function TwitchAccountCard({ type, account, configured, workspaceId, requiredScopes, onChanged }: Props) {
  const isBot = type === 'bot';
  const [busy, setBusy] = useState<'test' | 'disconnect' | 'permissions' | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [permissions, setPermissions] = useState<TwitchBotPermissions | null>(null);

  const accent = isBot ? '#22d3ee' : '#a78bfa';
  const gradient = isBot
    ? 'linear-gradient(135deg, #0891b2, #22d3ee)'
    : 'linear-gradient(135deg, #6d28d9, #a78bfa)';
  const status = account ? STATUS[account.status] : null;
  const connectUrl = `/api/integrations/twitch/start?workspace=${workspaceId ?? ''}&type=${type}`;

  const testConnection = async () => {
    setBusy('test');
    setFeedback(null);
    try {
      const result = await post<{ login: string; scopes: string[]; message: string }>(`/integrations/twitch/${type}/test`);
      setFeedback({ tone: 'success', text: `${result.message} (@${result.login})` });
    } catch (error) {
      setFeedback({ tone: 'error', text: error instanceof Error ? error.message : 'Falha ao testar a conexão.' });
    } finally {
      setBusy(null);
    }
  };

  const checkPermissions = async () => {
    setBusy('permissions');
    setFeedback(null);
    try {
      const result = await get<TwitchBotPermissions>('/integrations/twitch/bot/permissions');
      setPermissions(result);
      if (result.canSend) {
        setFeedback({ tone: 'success', text: 'Permissões completas: o bot pode enviar mensagens no canal.' });
      } else if (!result.channelBot) {
        setFeedback({
          tone: 'error',
          text: 'Falta autorizar o bot no canal: reconecte a conta do streamer para conceder channel:bot.',
        });
      } else if (result.missing.length) {
        setFeedback({ tone: 'error', text: `Escopos ausentes: ${result.missing.join(', ')}` });
      } else {
        setFeedback({ tone: 'error', text: 'Conecte a conta do bot e a conta do streamer para liberar o envio.' });
      }
    } catch (error) {
      setFeedback({ tone: 'error', text: error instanceof Error ? error.message : 'Falha ao verificar permissões.' });
    } finally {
      setBusy(null);
    }
  };

  const disconnect = async () => {
    setBusy('disconnect');
    setFeedback(null);
    try {
      await del(`/integrations/twitch?type=${type}`);
      setPermissions(null);
      await onChanged();
      setFeedback({ tone: 'success', text: isBot ? 'Conta do bot desconectada.' : 'Conta do streamer desconectada.' });
    } catch (error) {
      setFeedback({ tone: 'error', text: error instanceof Error ? error.message : 'Falha ao desconectar.' });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card className="overflow-hidden p-0" >
      <div className="border-l-4 p-5" style={{ borderLeftColor: accent }}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div
              className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-white shadow-glow"
              style={{ background: gradient }}
            >
              {isBot ? <Bot size={19} /> : <Radio size={19} />}
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-mist-500">
                {isBot ? 'Conta 2 · Bot' : 'Conta 1 · Streamer'}
              </p>
              <h2 className="text-sm font-semibold text-white">{isBot ? 'Conta do bot' : 'Conta do streamer'}</h2>
              <p className="mt-1 max-w-sm text-[11px] leading-relaxed text-mist-400">
                {isBot
                  ? 'Conta Twitch separada usada para enviar mensagens, responder comandos e postar timers no chat.'
                  : 'Conta principal do canal: identifica a live, consulta informações e recebe follows, inscrições e raids.'}
              </p>
            </div>
          </div>
          <Badge tone={status?.tone ?? 'neutral'}>{status?.label ?? 'desconectada'}</Badge>
        </div>

        {account ? (
          <div className="mt-4">
            <div className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
              {account.avatarUrl ? (
                <img src={account.avatarUrl} alt="" className="h-12 w-12 rounded-full border border-white/10" />
              ) : (
                <div className="grid h-12 w-12 place-items-center rounded-full bg-white/10">
                  <UserRound size={18} className="text-mist-300" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-white">{account.displayName || account.login}</p>
                <p className="text-[11px] text-mist-400">twitch.tv/{account.login}</p>
                <p className="mt-0.5 font-mono text-[10px] text-mist-500">ID {account.twitchUserId}</p>
              </div>
            </div>

            <p className="mt-3 text-[11px] text-mist-500">
              conectada em {formatDateTime(account.connectedAt)} · token expira em {formatDateTime(account.expiresAt)}
            </p>

            <div className="mt-2 flex flex-wrap gap-1">
              {account.scopes.map((scope) => (
                <span
                  key={scope}
                  className="rounded-md border border-white/10 bg-black/20 px-1.5 py-0.5 font-mono text-[9px] text-mist-400"
                >
                  {scope}
                </span>
              ))}
            </div>

            {account.missingScopes.length ? (
              <p className="mt-3 flex items-start gap-1.5 rounded-lg border border-amber-500/25 bg-amber-500/10 px-2.5 py-2 text-[11px] text-amber-200">
                <ShieldAlert size={13} className="mt-0.5 shrink-0" />
                <span>
                  Escopos ausentes nesta conta: {account.missingScopes.join(', ')}. Reconecte para conceder.
                </span>
              </p>
            ) : null}

            <div className="mt-4 flex flex-wrap gap-2">
              <a href={connectUrl} className="btn-secondary">
                Reconectar
              </a>
              <Button variant="secondary" size="sm" onClick={() => void testConnection()} disabled={busy !== null}>
                {busy === 'test' ? 'Testando…' : 'Testar conexão'}
              </Button>
              {isBot ? (
                <Button variant="secondary" size="sm" onClick={() => void checkPermissions()} disabled={busy !== null}>
                  {busy === 'permissions' ? 'Verificando…' : 'Verificar permissões necessárias'}
                </Button>
              ) : null}
              <ConfirmButton
                className="!px-2.5 !py-1.5 text-xs"
                onConfirm={() => void disconnect()}
                confirmLabel="Confirmar desconexão?"
              >
                Desconectar
              </ConfirmButton>
            </div>

            {isBot ? (
              <p className="mt-3 text-[11px] leading-relaxed text-mist-500">
                O envio pelo bot exige <span className="font-mono text-[10px]">user:write:chat</span> nesta conta e{' '}
                <span className="font-mono text-[10px]">channel:bot</span> autorizado pela conta do streamer.
              </p>
            ) : null}
          </div>
        ) : (
          <div className="mt-4">
            <p className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 text-[11px] leading-relaxed text-mist-400">
              {isBot
                ? 'Sem esta conta, os recursos de envio pelo bot (mensagens automáticas, comandos e timers) ficam indisponíveis. Você pode usar uma conta Twitch diferente da conta do streamer.'
                : 'Conecte a conta principal do canal para liberar dados da live e eventos de follows, inscrições e raids.'}
            </p>
            {configured ? (
              <a href={connectUrl} className="btn-primary mt-3">
                Conectar {isBot ? 'conta do bot' : 'conta do streamer'}
              </a>
            ) : (
              <p className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200">
                Defina TWITCH_CLIENT_ID e TWITCH_CLIENT_SECRET nos secrets do projeto. Veja docs/CONFIGURACAO.md.
              </p>
            )}
          </div>
        )}

        {feedback ? (
          <p
            className={`mt-3 rounded-lg border px-2.5 py-2 text-[11px] ${
              feedback.tone === 'success'
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                : 'border-rose-500/30 bg-rose-500/10 text-rose-200'
            }`}
          >
            {feedback.text}
          </p>
        ) : null}

        {isBot && permissions ? (
          <div className="mt-3 rounded-xl border border-white/[0.06] bg-black/20 p-3">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold text-white">
              <ShieldCheck size={13} style={{ color: accent }} /> Permissões necessárias
            </p>
            <div className="mt-2 space-y-1 text-[10px] text-mist-400">
              {requiredScopes.map((scope) => {
                const granted = permissions.granted.includes(scope);
                return (
                  <p key={scope} className="flex items-center justify-between gap-2">
                    <span className="font-mono">{scope}</span>
                    <span className={granted ? 'text-emerald-300' : 'text-rose-300'}>
                      {granted ? 'concedido' : 'ausente'}
                    </span>
                  </p>
                );
              })}
              <p className="flex items-center justify-between gap-2 border-t border-white/[0.06] pt-1">
                <span className="font-mono">channel:bot (streamer)</span>
                <span className={permissions.channelBot ? 'text-emerald-300' : 'text-rose-300'}>
                  {permissions.channelBot ? 'autorizado' : 'ausente'}
                </span>
              </p>
            </div>
          </div>
        ) : null}
      </div>
    </Card>
  );
}
