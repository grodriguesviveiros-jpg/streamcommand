import { useEffect, useState } from 'react';
import { Radio } from 'lucide-react';
import { useApp } from '../state/AppContext';
import { useApi } from '../lib/hooks';
import type { TwitchConnectionInfo } from '../lib/types';
import { Button, Modal } from './ui';

const dismissKey = (workspaceId: string) => `stream-command:twitch-onboarding:${workspaceId}`;

/**
 * Pedido de conexão da Twitch logo depois do login.
 * Aparece uma vez por sessão para quem pode gerenciar a integração e ainda não conectou o canal.
 */
export default function TwitchOnboarding() {
  const { workspace, can } = useApp();
  const twitch = useApi<TwitchConnectionInfo>(workspace ? '/integrations/twitch' : null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    setDismissed(workspace ? sessionStorage.getItem(dismissKey(workspace.id)) === '1' : false);
  }, [workspace?.id]);

  const dismiss = () => {
    if (workspace) sessionStorage.setItem(dismissKey(workspace.id), '1');
    setDismissed(true);
  };

  const open =
    Boolean(workspace) &&
    !dismissed &&
    can('twitch.manage') &&
    Boolean(twitch.data?.configured) &&
    !twitch.data?.connection;

  return (
    <Modal
      open={open}
      onClose={dismiss}
      title="Conecte sua Twitch"
      description="É o passo que liga o painel à sua live de verdade."
      footer={
        <>
          <Button variant="ghost" onClick={dismiss}>
            Agora não
          </Button>
          <a href={`/api/integrations/twitch/start?workspace=${workspace?.id}`} className="btn-primary">
            <Radio size={15} /> Conectar Twitch
          </a>
        </>
      }
    >
      <div className="space-y-3 text-xs leading-relaxed text-mist-300">
        <p>
          Com a conta conectada, o bot lê e envia mensagens no chat, aplica comandos, timers e automações, recebe
          follows, inscrições e raids via EventSub — e as estatísticas do painel passam a mostrar dados reais.
        </p>
        <ul className="space-y-1.5 text-mist-400">
          <li>• A autorização acontece na própria Twitch, no seu navegador.</li>
          <li>• Os tokens ficam criptografados no servidor e são renovados automaticamente.</li>
          <li>• Você pode desconectar quando quiser em Configurações → Twitch.</li>
        </ul>
        <p className="text-mist-500">Sem conectar, o app abre normalmente, mas em modo somente cadastro.</p>
      </div>
    </Modal>
  );
}
