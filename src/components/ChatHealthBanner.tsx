import { AlertTriangle, Info, ShieldAlert } from 'lucide-react';
import type { TwitchConnectionInfo } from '../lib/types';

type Tone = 'error' | 'warning' | 'info';

type Problem = {
  tone: Tone;
  title: string;
  text: string;
  action?: { label: string; href: string };
};

const TONES: Record<Tone, string> = {
  error: 'border-rose-500/30 bg-rose-500/10 text-rose-200',
  warning: 'border-amber-500/30 bg-amber-500/10 text-amber-200',
  info: 'border-sky-500/30 bg-sky-500/10 text-sky-200',
};

const SETTINGS_URL = '/app/configuracoes/twitch';

/**
 * Diagnóstico do chat: diz exatamente o que falta para o app receber e enviar
 * mensagens na Twitch, em vez de deixar a tela vazia sem explicação.
 */
function diagnose(info: TwitchConnectionInfo, workspaceId?: string): Problem | null {
  const streamer = info.connections?.streamer ?? null;
  const bot = info.connections?.bot ?? null;
  const reconnect = (type: 'streamer' | 'bot') =>
    `/api/integrations/twitch/start?workspace=${workspaceId ?? ''}&type=${type}`;
  const streamerHas = (scope: string) => Boolean(streamer?.scopes.includes(scope));

  if (!streamer) {
    return {
      tone: 'error',
      title: 'Conta do streamer não conectada',
      text: 'Ela identifica o canal e recebe os eventos da live. Sem ela o chat não é lido.',
      action: { label: 'Conectar conta do streamer', href: reconnect('streamer') },
    };
  }

  if (!bot && !streamerHas('user:read:chat')) {
    return {
      tone: 'error',
      title: 'A conta do streamer ainda não autoriza a leitura do chat',
      text: 'Reconecte a conta do streamer para conceder user:read:chat — sem esse escopo o app não recebe as mensagens do chat.',
      action: { label: 'Reconectar conta do streamer', href: reconnect('streamer') },
    };
  }

  if (bot && !streamerHas('channel:bot')) {
    return {
      tone: 'error',
      title: 'O canal não autorizou o app no chat (channel:bot)',
      text: 'Sem essa autorização a Twitch recusa a leitura do chat e o envio pela conta do bot. Reconecte a conta do streamer.',
      action: { label: 'Reconectar conta do streamer', href: reconnect('streamer') },
    };
  }

  if (bot && bot.status !== 'active') {
    return {
      tone: 'error',
      title: `Conta do bot ${bot.status === 'expired' ? 'expirada' : 'com problema'}`,
      text: 'Reconecte a conta do bot para voltar a ler o chat.',
      action: { label: 'Reconectar conta do bot', href: reconnect('bot') },
    };
  }

  if (bot && bot.missingScopes.length) {
    return {
      tone: 'error',
      title: 'A conta do bot não tem todas as permissões',
      text: `Faltam: ${bot.missingScopes.join(', ')}. Reconecte a conta do bot para conceder.`,
      action: { label: 'Reconectar conta do bot', href: reconnect('bot') },
    };
  }

  if (info.bot?.chat === 'error' && info.bot.detail) {
    return {
      tone: 'warning',
      title: 'A Twitch recusou a assinatura do chat',
      text: info.bot.detail,
      action: { label: 'Abrir configurações da Twitch', href: SETTINGS_URL },
    };
  }

  if (!bot) {
    return {
      tone: 'info',
      title: 'Chat lido pela conta do streamer',
      text: 'Nenhuma conta de bot conectada: a leitura e o envio usam a conta do streamer. Conecte uma conta de bot para responder com outra identidade.',
      action: { label: 'Configurar conta do bot', href: SETTINGS_URL },
    };
  }

  return null;
}

export default function ChatHealthBanner({
  info,
  workspaceId,
}: {
  info: TwitchConnectionInfo | null;
  workspaceId?: string;
}) {
  const problem = info ? diagnose(info, workspaceId) : null;
  if (!problem) return null;
  const Icon = problem.tone === 'info' ? Info : problem.tone === 'warning' ? AlertTriangle : ShieldAlert;

  return (
    <div className={`mb-4 flex flex-wrap items-start gap-2 rounded-xl border px-3.5 py-2.5 text-xs ${TONES[problem.tone]}`}>
      <Icon size={14} className="mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{problem.title}</p>
        <p className="mt-0.5 leading-relaxed opacity-90">{problem.text}</p>
      </div>
      {problem.action ? (
        <a href={problem.action.href} className="shrink-0 font-semibold underline underline-offset-2">
          {problem.action.label}
        </a>
      ) : null}
    </div>
  );
}
