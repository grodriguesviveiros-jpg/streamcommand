import { useEffect, useState } from 'react';
import { Circle, Mic, MonitorPlay, Plug, Radio, Square, Video } from 'lucide-react';
import { get, put } from '../lib/api';
import { obs, type ObsInput, type ObsScene } from '../lib/obs';
import { Badge, Button, Card, ErrorBanner, Field, Input, PageHeader, Spinner } from '../components/ui';

type ObsSettings = { host: string; port: number; hasPassword: boolean };

export default function Obs() {
  const [settings, setSettings] = useState<ObsSettings>({ host: '127.0.0.1', port: 4455, hasPassword: false });
  const [password, setPassword] = useState('');
  const [connected, setConnected] = useState(obs.connected);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scenes, setScenes] = useState<ObsScene[]>([]);
  const [currentScene, setCurrentScene] = useState<string | null>(null);
  const [inputs, setInputs] = useState<ObsInput[]>([]);
  const [recording, setRecording] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const httpsPage = window.location.protocol === 'https:';

  useEffect(() => {
    get<ObsSettings>('/integrations/obs')
      .then((data) => setSettings(data))
      .catch((err) => setError(err instanceof Error ? err.message : 'Falha ao carregar configuração'));
  }, []);

  const refreshState = async () => {
    try {
      const [sceneData, inputData, recordData, streamData] = await Promise.all([
        obs.getScenes(),
        obs.getInputs().catch(() => ({ inputs: [] })),
        obs.getRecordStatus().catch(() => ({ outputActive: false })),
        obs.getStreamStatus().catch(() => ({ outputActive: false })),
      ]);
      setScenes(sceneData.scenes ?? []);
      setCurrentScene(sceneData.currentProgramSceneName ?? null);
      setInputs(inputData.inputs ?? []);
      setRecording(Boolean(recordData.outputActive));
      setStreaming(Boolean(streamData.outputActive));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao consultar o OBS');
    }
  };

  const connect = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await put('/integrations/obs', { host: settings.host, port: settings.port, password });
      const stored = await get<{ password: string }>('/integrations/obs/password');
      await obs.connect(settings.host, settings.port, stored.password || password);
      setConnected(true);
      setNotice('Conectado ao OBS Studio.');
      await refreshState();
    } catch (err) {
      setConnected(false);
      setError(err instanceof Error ? err.message : 'Não foi possível conectar ao OBS');
    } finally {
      setBusy(false);
    }
  };

  const disconnect = () => {
    obs.disconnect();
    setConnected(false);
    setScenes([]);
    setInputs([]);
    setNotice('Conexão com o OBS encerrada.');
  };

  const run = async (action: () => Promise<void>, success?: string) => {
    try {
      await action();
      if (success) setNotice(success);
      await refreshState();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ação falhou');
    }
  };

  return (
    <div className="animate-fade-up">
      <PageHeader
        title="OBS Studio"
        subtitle="Controle cenas, áudio e gravação pelo WebSocket local do OBS (protocolo v5)."
        actions={<Badge tone={connected ? 'success' : 'neutral'}>{connected ? 'conectado' : 'desconectado'}</Badge>}
      />

      <ErrorBanner message={error} />
      {notice ? (
        <div className="mb-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-2.5 text-xs text-emerald-200">
          {notice}
        </div>
      ) : null}

      {httpsPage ? (
        <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-3 text-[11px] leading-relaxed text-amber-200">
          <p className="font-semibold">Conexão local exige http ou o aplicativo desktop</p>
          <p className="mt-1">
            Você está acessando por HTTPS. O navegador bloqueia conexões <code className="font-mono">ws://</code> a
            partir de páginas HTTPS, então o OBS só conecta quando o app roda localmente em http://localhost:3000 ou na
            versão desktop (Tauri). Nenhuma informação do OBS é enviada para a internet.
          </p>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
        <Card className="h-fit p-4">
          <div className="flex items-center gap-2">
            <Plug size={15} style={{ color: 'var(--secondary)' }} />
            <p className="text-sm font-semibold text-white">Conexão local</p>
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-mist-400">
            No OBS: <span className="text-mist-200">Ferramentas → WebSocket do OBS Server</span>, ative o servidor e
            copie a porta e a senha. A senha fica criptografada no banco.
          </p>
          <div className="mt-3 space-y-3">
            <Field label="Host">
              <Input value={settings.host} onChange={(event) => setSettings({ ...settings, host: event.target.value })} />
            </Field>
            <Field label="Porta">
              <Input
                type="number"
                value={settings.port}
                onChange={(event) => setSettings({ ...settings, port: Number(event.target.value) })}
              />
            </Field>
            <Field label="Senha" hint={settings.hasPassword ? 'Uma senha já está salva — deixe em branco para mantê-la.' : undefined}>
              <Input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="senha do WebSocket"
                autoComplete="off"
              />
            </Field>
            <div className="flex gap-2">
              <Button className="flex-1" onClick={() => void connect()} disabled={busy}>
                {busy ? 'Conectando…' : connected ? 'Reconectar' : 'Conectar ao OBS'}
              </Button>
              {connected ? (
                <Button variant="secondary" onClick={disconnect}>
                  Desconectar
                </Button>
              ) : null}
            </div>
          </div>
        </Card>

        <div className="space-y-4">
          <Card>
            <div className="panel-head">
              <div className="flex items-center gap-2">
                <MonitorPlay size={15} style={{ color: 'var(--secondary)' }} />
                <h2 className="text-sm font-semibold text-white">Cenas</h2>
              </div>
              {currentScene ? <Badge tone="primary">no ar: {currentScene}</Badge> : null}
            </div>
            <div className="p-4">
              {!connected ? (
                <p className="text-xs text-mist-500">Conecte ao OBS para listar as cenas.</p>
              ) : scenes.length ? (
                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {scenes.map((scene) => (
                    <button
                      key={scene.sceneName}
                      type="button"
                      onClick={() => void run(() => obs.setScene(scene.sceneName), `Cena alterada para ${scene.sceneName}`)}
                      className={`rounded-xl border px-3 py-2.5 text-left text-xs font-medium transition ${
                        currentScene === scene.sceneName
                          ? 'border-white/25 bg-white/[0.08] text-white'
                          : 'border-white/[0.06] bg-white/[0.02] text-mist-300 hover:border-white/15'
                      }`}
                    >
                      {scene.sceneName}
                    </button>
                  ))}
                </div>
              ) : (
                <Spinner label="Nenhuma cena encontrada" />
              )}
            </div>
          </Card>

          <Card>
            <div className="panel-head">
              <div className="flex items-center gap-2">
                <Mic size={15} style={{ color: 'var(--secondary)' }} />
                <h2 className="text-sm font-semibold text-white">Áudio</h2>
              </div>
            </div>
            <div className="divide-y divide-white/[0.05]">
              {inputs.length ? (
                inputs.map((input) => (
                  <div key={input.inputName} className="flex items-center gap-3 px-5 py-2.5">
                    <span className="w-40 truncate text-xs text-mist-200">{input.inputName}</span>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      defaultValue={100}
                      onChange={(event) => void run(() => obs.setInputVolume(input.inputName, Number(event.target.value)))}
                      className="flex-1 accent-[var(--primary)]"
                      aria-label={`Volume de ${input.inputName}`}
                    />
                    <Button variant="ghost" size="sm" onClick={() => void run(() => obs.toggleMute(input.inputName))}>
                      mute
                    </Button>
                  </div>
                ))
              ) : (
                <p className="px-5 py-4 text-xs text-mist-500">
                  {connected ? 'Nenhuma fonte de áudio encontrada.' : 'Conecte ao OBS para ver as fontes de áudio.'}
                </p>
              )}
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant={recording ? 'danger' : 'secondary'}
                onClick={() => void run(async () => (recording ? obs.stopRecord() : obs.startRecord()), recording ? 'Gravação encerrada' : 'Gravação iniciada')}
                disabled={!connected}
              >
                {recording ? <Square size={14} /> : <Video size={14} />} {recording ? 'Parar gravação' : 'Iniciar gravação'}
              </Button>
              <Button
                variant={streaming ? 'danger' : 'secondary'}
                onClick={() => void run(async () => (streaming ? obs.stopStream() : obs.startStream()), streaming ? 'Transmissão encerrada' : 'Transmissão iniciada')}
                disabled={!connected}
              >
                {streaming ? <Square size={14} /> : <Radio size={14} />} {streaming ? 'Parar transmissão' : 'Iniciar transmissão'}
              </Button>
              <Button variant="ghost" onClick={() => void run(refreshState)} disabled={!connected}>
                Atualizar estado
              </Button>
              <span className="ml-auto flex items-center gap-3 text-[11px] text-mist-400">
                <span className="flex items-center gap-1.5">
                  <Circle size={9} fill={recording ? '#fb7185' : 'transparent'} stroke={recording ? '#fb7185' : '#5f6b82'} />
                  gravação {recording ? 'ativa' : 'parada'}
                </span>
                <span className="flex items-center gap-1.5">
                  <Circle size={9} fill={streaming ? '#34d399' : 'transparent'} stroke={streaming ? '#34d399' : '#5f6b82'} />
                  live {streaming ? 'no ar' : 'parada'}
                </span>
              </span>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
