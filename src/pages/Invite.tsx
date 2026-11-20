import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { CheckCircle2, XCircle } from 'lucide-react';
import { post } from '../lib/api';
import { useApp } from '../state/AppContext';
import { Button, Card, Spinner } from '../components/ui';

export default function Invite() {
  const { token = '' } = useParams();
  const { refresh, workspaces } = useApp();
  const navigate = useNavigate();
  const [state, setState] = useState<'idle' | 'working' | 'accepted' | 'declined' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Mantém o convite acessível mesmo após o login.
    if (token) sessionStorage.setItem('sc:invite', token);
  }, [token]);

  const accept = async () => {
    setState('working');
    try {
      await post(`/workspaces/invitations/${token}/accept`);
      await refresh();
      setState('accepted');
      setTimeout(() => navigate('/app', { replace: true }), 900);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível aceitar o convite');
      setState('error');
    }
  };

  const decline = async () => {
    setState('working');
    try {
      await post(`/workspaces/invitations/${token}/decline`);
      setState('declined');
      setTimeout(() => navigate('/app', { replace: true }), 900);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível recusar o convite');
      setState('error');
    }
  };

  return (
    <div className="grid min-h-screen place-items-center px-4">
      <Card className="w-full max-w-md p-6">
        <p className="text-[10px] uppercase tracking-[0.3em] text-mist-500">STREAM COMMAND</p>
        <h1 className="mt-2 text-lg font-semibold text-white">Convite para equipe</h1>
        <p className="mt-1 text-xs text-mist-400">
          Você foi convidado para colaborar em um workspace. Ao aceitar, seu acesso passa a valer apenas para as
          permissões concedidas pelo proprietário.
        </p>

        {state === 'working' ? <Spinner label="Processando convite…" /> : null}

        {state === 'accepted' ? (
          <div className="mt-5 flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-2.5 text-xs text-emerald-200">
            <CheckCircle2 size={15} /> Convite aceito. Abrindo o painel…
          </div>
        ) : null}

        {state === 'declined' ? (
          <div className="mt-5 rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-2.5 text-xs text-mist-300">
            Convite recusado.
          </div>
        ) : null}

        {error ? (
          <div className="mt-5 flex items-start gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3.5 py-2.5 text-xs text-rose-200">
            <XCircle size={15} className="mt-0.5 shrink-0" /> {error}
          </div>
        ) : null}

        {state === 'idle' || state === 'error' ? (
          <div className="mt-5 flex gap-2">
            <Button onClick={() => void accept()} className="flex-1">
              Aceitar convite
            </Button>
            <Button variant="secondary" onClick={() => void decline()}>
              Recusar
            </Button>
          </div>
        ) : null}

        <p className="mt-6 text-[10px] text-mist-500">
          Você já participa de {workspaces.length} workspace(s).{' '}
          <button type="button" className="underline hover:text-mist-300" onClick={() => navigate('/app')}>
            Ir para o painel
          </button>
        </p>
      </Card>
    </div>
  );
}
