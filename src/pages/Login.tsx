import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Command, Radio, ShieldCheck, Workflow } from 'lucide-react';
import { get } from '../lib/api';
import { useApp } from '../state/AppContext';

type Status = { discordConfigured: boolean; twitchConfigured: boolean };

export default function Login({ next }: { next?: string }) {
  const { user } = useApp();
  const navigate = useNavigate();
  const [status, setStatus] = useState<Status | null>(null);
  const error = new URLSearchParams(window.location.search).get('erro');

  useEffect(() => {
    get<Status>('/auth/status')
      .then(setStatus)
      .catch(() => setStatus({ discordConfigured: false, twitchConfigured: false }));
  }, []);

  useEffect(() => {
    if (!user) return;
    if (next) {
      navigate(next, { replace: true });
      return;
    }
    navigate('/app', { replace: true });
  }, [user, next, navigate]);

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="grid-lines absolute inset-0 opacity-40" />
      <div className="relative mx-auto grid min-h-screen w-full max-w-6xl items-center gap-10 px-6 py-12 lg:grid-cols-[1.15fr_0.85fr]">
        <section className="animate-fade-up">
          <div className="mb-6 flex items-center gap-3">
            <div
              className="grid h-11 w-11 place-items-center rounded-2xl text-white shadow-glow"
              style={{ background: 'linear-gradient(135deg, var(--primary), var(--secondary))' }}
            >
              <Command size={20} />
            </div>
            <div>
              <p className="text-lg font-bold tracking-[0.14em] text-white">STREAM COMMAND</p>
              <p className="text-[10px] uppercase tracking-[0.32em] text-mist-500">by SmartFountain</p>
            </div>
          </div>

          <h1 className="max-w-xl text-4xl font-semibold leading-tight tracking-tight text-white sm:text-5xl">
            A central de comando da sua <span style={{ color: 'var(--secondary)' }}>live</span>.
          </h1>
          <p className="mt-4 max-w-xl text-sm leading-relaxed text-mist-300">
            Chat, comandos, automações, OBS, sorteios, enquetes, soundboard e estatísticas em um único painel
            profissional. Cada streamer com seu próprio workspace, equipe e permissões — sem misturar dados.
          </p>

          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            {[
              { icon: Radio, title: 'Twitch em tempo real', text: 'Chat, follows, inscrições e raids via EventSub.' },
              { icon: Workflow, title: 'Automação de verdade', text: 'Comandos, timers e gatilhos executados no servidor.' },
              { icon: ShieldCheck, title: 'Isolamento por workspace', text: 'Permissões validadas no backend e no banco (RLS).' },
              { icon: Command, title: 'Equipe com papéis', text: 'Convide moderadores e defina permissões individuais.' },
            ].map((item) => (
              <div key={item.title} className="panel p-4">
                <item.icon size={16} style={{ color: 'var(--secondary)' }} />
                <p className="mt-2 text-sm font-semibold text-white">{item.title}</p>
                <p className="mt-1 text-xs leading-relaxed text-mist-400">{item.text}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="animate-fade-up">
          <div className="panel p-6 sm:p-8">
            <h2 className="text-lg font-semibold text-white">Entrar no painel</h2>
            <p className="mt-1 text-xs text-mist-400">
              Use sua conta Discord. É com ela que identificamos você, seu workspace e sua equipe.
            </p>

            {error ? (
              <div className="mt-4 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3.5 py-2.5 text-xs text-rose-200">
                {error}
              </div>
            ) : null}

            <a
              href="/api/auth/discord/start"
              className="mt-5 flex w-full items-center justify-center gap-2.5 rounded-xl bg-[#5865F2] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#4752c4]"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M20.317 4.369A19.79 19.79 0 0 0 15.432 3c-.21.375-.45.88-.617 1.283a18.27 18.27 0 0 0-5.63 0A12.6 12.6 0 0 0 8.562 3 19.74 19.74 0 0 0 3.677 4.37C.544 9.05-.328 13.61.108 18.106a19.9 19.9 0 0 0 6.073 3.08c.49-.67.926-1.38 1.3-2.126a12.9 12.9 0 0 1-2.05-.99c.172-.126.34-.257.503-.39a14.2 14.2 0 0 0 12.13 0c.164.133.332.264.503.39-.653.39-1.34.722-2.05.99.375.746.81 1.456 1.3 2.126a19.86 19.86 0 0 0 6.074-3.08c.51-5.177-.838-9.674-3.575-13.737ZM8.02 15.331c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.955 2.418-2.157 2.418Zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.946 2.418-2.157 2.418Z" />
              </svg>
              Entrar com Discord
            </a>

            {status && !status.discordConfigured ? (
              <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-3 text-[11px] leading-relaxed text-amber-200">
                <p className="font-semibold">Login Discord ainda não configurado</p>
                <p className="mt-1">
                  Defina <code className="font-mono">DISCORD_CLIENT_ID</code> e{' '}
                  <code className="font-mono">DISCORD_CLIENT_SECRET</code> nos secrets do projeto e reinicie a API.
                  O guia completo está em <code className="font-mono">docs/CONFIGURACAO.md</code>.
                </p>
              </div>
            ) : null}

            <div className="mt-5 flex items-center justify-between rounded-xl border border-white/[0.06] bg-white/[0.02] px-3.5 py-2.5">
              <span className="text-[11px] text-mist-400">Twitch</span>
              <span className="text-[11px] font-medium text-mist-200">
                {status?.twitchConfigured ? 'pronta para conectar' : 'aguardando credenciais'}
              </span>
            </div>

            <p className="mt-5 text-[10px] leading-relaxed text-mist-500">
              Ao entrar você autoriza apenas a leitura do seu perfil básico do Discord (usuário, avatar e e-mail).
              Nenhuma senha é armazenada e o Client Secret nunca chega ao navegador.
            </p>

            <div className="mt-6 flex items-center justify-between border-t border-white/[0.06] pt-4">
              <span className="watermark">SmartFountain</span>
              <span className="flex items-center gap-1 text-[10px] text-mist-500">
                acesso seguro <ArrowRight size={11} />
              </span>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
