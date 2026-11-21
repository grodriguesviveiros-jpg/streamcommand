import { useState } from 'react';
import { Bot, Check, Radio } from 'lucide-react';
import { patch } from '../lib/api';
import { useApp } from '../state/AppContext';
import type { TwitchAccount, TwitchAccountType } from '../lib/types';
import { Badge, Card } from './ui';

type Props = {
  preference: TwitchAccountType;
  streamer: TwitchAccount | null;
  bot: TwitchAccount | null;
  onChanged: () => Promise<void>;
};

type Feedback = { tone: 'success' | 'error'; text: string } | null;

const OPTIONS: {
  type: TwitchAccountType;
  title: string;
  description: string;
  accent: string;
  gradient: string;
}[] = [
  {
    type: 'bot',
    title: 'Conta do bot',
    description: 'Respostas e mensagens saem com a identidade do bot.',
    accent: '#22d3ee',
    gradient: 'linear-gradient(135deg, #0891b2, #22d3ee)',
  },
  {
    type: 'streamer',
    title: 'Conta do streamer',
    description: 'Respostas e mensagens saem com a identidade do canal.',
    accent: '#a78bfa',
    gradient: 'linear-gradient(135deg, #6d28d9, #a78bfa)',
  },
];

/**
 * Escolha da conta que envia mensagens no chat (bot ou streamer).
 * A preferência fica no workspace (`preferences.chat_sender`) e vale para o
 * painel, as respostas de comandos e os timers. A leitura do chat continua
 * dependendo da conta do bot.
 */
export default function ChatSenderCard({ preference, streamer, bot, onChanged }: Props) {
  const { can, refresh } = useApp();
  const canManage = can('settings.manage');
  const [saving, setSaving] = useState<TwitchAccountType | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);

  const accounts: Record<TwitchAccountType, TwitchAccount | null> = { streamer, bot };
  const selected = accounts[preference];
  const other = accounts[preference === 'bot' ? 'streamer' : 'bot'];

  const choose = async (type: TwitchAccountType) => {
    if (type === preference || saving) return;
    setSaving(type);
    setFeedback(null);
    try {
      await patch('/workspaces/current', { preferences: { chat_sender: type } });
      await refresh();
      await onChanged();
      setFeedback({
        tone: 'success',
        text:
          type === 'bot'
            ? 'Agora as mensagens do chat são enviadas pela conta do bot.'
            : 'Agora as mensagens do chat são enviadas pela conta do streamer.',
      });
    } catch (error) {
      setFeedback({ tone: 'error', text: error instanceof Error ? error.message : 'Falha ao salvar a escolha.' });
    } finally {
      setSaving(null);
    }
  };

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-white">Quem envia as mensagens no chat</h2>
          <p className="mt-1 max-w-xl text-[11px] leading-relaxed text-mist-400">
            Escolha a conta usada pelo painel, pelas respostas de comandos e pelos timers. A leitura das mensagens do
            chat continua sendo feita pela conta do bot.
          </p>
        </div>
        <Badge tone="primary">enviando como {preference === 'bot' ? 'bot' : 'streamer'}</Badge>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Conta que envia mensagens">
        {OPTIONS.map((option) => {
          const account = accounts[option.type];
          const isSelected = preference === option.type;
          const disabled = !account || !canManage || saving !== null;
          return (
            <button
              key={option.type}
              type="button"
              role="radio"
              aria-checked={isSelected}
              disabled={disabled}
              onClick={() => void choose(option.type)}
              className={`rounded-xl border p-3 text-left transition disabled:cursor-not-allowed ${
                isSelected ? 'bg-white/[0.04]' : 'border-white/[0.08] hover:border-white/20'
              } ${!account ? 'opacity-60' : ''}`}
              style={isSelected ? { borderColor: option.accent } : undefined}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2.5">
                  <span
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-white"
                    style={{ background: option.gradient }}
                  >
                    {option.type === 'bot' ? <Bot size={17} /> : <Radio size={17} />}
                  </span>
                  <span>
                    <span className="block text-xs font-semibold text-white">{option.title}</span>
                    <span className="mt-0.5 block text-[10px] leading-relaxed text-mist-400">
                      {option.description}
                    </span>
                  </span>
                </div>
                <span
                  className="mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full border"
                  style={{
                    borderColor: isSelected ? option.accent : 'rgba(255,255,255,0.25)',
                    background: isSelected ? option.accent : 'transparent',
                  }}
                >
                  {isSelected ? <Check size={10} className="text-black" /> : null}
                </span>
              </div>
              <p className="mt-2 truncate text-[11px] text-mist-300">
                {account ? `@${account.login}` : 'conta não conectada'}
              </p>
            </button>
          );
        })}
      </div>

      {!selected ? (
        <p className="mt-3 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[11px] text-rose-200">
          A conta escolhida não está conectada — o envio fica indisponível até conectar essa conta
          {other ? ' ou trocar a escolha para a outra conta.' : '.'}
        </p>
      ) : preference === 'streamer' && !bot ? (
        <p className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200">
          O envio pela conta do streamer está ativo, mas sem a conta do bot o app não lê o chat — comandos,
          automações e respostas automáticas não são disparados.
        </p>
      ) : null}

      {!canManage ? (
        <p className="mt-3 text-[11px] text-mist-500">Seu cargo não permite alterar esta configuração.</p>
      ) : null}

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
    </Card>
  );
}
