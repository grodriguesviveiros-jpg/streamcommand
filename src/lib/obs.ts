/**
 * Cliente do OBS WebSocket (protocolo v5).
 * A conexão é feita direto do aplicativo para o OBS local (ws://127.0.0.1:4455),
 * sem intermediários e sem expor a senha na rede.
 */

type Pending = { resolve: (value: unknown) => void; reject: (error: Error) => void };

async function sha256Base64(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)));
}

export type ObsScene = { sceneName: string; sceneIndex: number };
export type ObsInput = { inputName: string; inputKind: string; muted: boolean; volume: number };

export class ObsClient {
  private ws: WebSocket | null = null;
  private pending = new Map<string, Pending>();
  private counter = 0;

  get connected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  async connect(host: string, port: number, password: string): Promise<void> {
    this.disconnect();
    const url = `ws://${host}:${port}`;
    const ws = new WebSocket(url);
    this.ws = ws;

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        ws.close();
        reject(new Error('Tempo esgotado ao conectar no OBS. Verifique se o WebSocket está ativo.'));
      }, 8000);

      ws.onerror = () => {
        clearTimeout(timer);
        reject(
          new Error(
            'Não foi possível conectar ao OBS. Abra o OBS, ative Ferramentas → WebSocket do OBS Server e confira host/porta.',
          ),
        );
      };

      ws.onmessage = async (event) => {
        const message = JSON.parse(String(event.data)) as { op: number; d: Record<string, unknown> };
        if (message.op === 0) {
          const auth = message.d.authentication as { challenge: string; salt: string } | undefined;
          const identify: Record<string, unknown> = { rpcVersion: 1, eventSubscriptions: 0 };
          if (auth) {
            if (!password) {
              clearTimeout(timer);
              reject(new Error('O OBS exige senha. Informe a senha configurada no WebSocket do OBS.'));
              ws.close();
              return;
            }
            const secret = await sha256Base64(password + auth.salt);
            identify.authentication = await sha256Base64(secret + auth.challenge);
          }
          ws.send(JSON.stringify({ op: 1, d: identify }));
          return;
        }
        if (message.op === 2) {
          clearTimeout(timer);
          resolve();
          return;
        }
        if (message.op === 7) {
          const id = String(message.d.requestId);
          const entry = this.pending.get(id);
          this.pending.delete(id);
          if (!entry) return;
          const status = message.d.requestStatus as { result: boolean; comment?: string } | undefined;
          if (status && status.result === false) {
            entry.reject(new Error(status.comment || 'OBS recusou a solicitação'));
          } else {
            entry.resolve(message.d.responseData ?? {});
          }
        }
      };
    });
  }

  disconnect(): void {
    this.pending.forEach((entry) => entry.reject(new Error('Conexão encerrada')));
    this.pending.clear();
    this.ws?.close();
    this.ws = null;
  }

  request<T = Record<string, unknown>>(requestType: string, requestData?: Record<string, unknown>): Promise<T> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error('OBS desconectado'));
    }
    const requestId = `req-${++this.counter}`;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(requestId, { resolve: resolve as (value: unknown) => void, reject });
      this.ws!.send(JSON.stringify({ op: 6, d: { requestType, requestId, requestData } }));
      setTimeout(() => {
        if (this.pending.has(requestId)) {
          this.pending.delete(requestId);
          reject(new Error(`OBS não respondeu a ${requestType}`));
        }
      }, 8000);
    });
  }

  getScenes(): Promise<{ currentProgramSceneName: string; scenes: ObsScene[] }> {
    return this.request('GetSceneList');
  }

  setScene(sceneName: string): Promise<void> {
    return this.request('SetCurrentProgramScene', { sceneName });
  }

  getInputs(): Promise<{ inputs: ObsInput[] }> {
    return this.request('GetInputList');
  }

  setInputVolume(inputName: string, volumePercent: number): Promise<void> {
    return this.request('SetInputVolume', { inputName, inputVolumeDb: 20 * Math.log10(Math.max(volumePercent, 1) / 100) });
  }

  toggleMute(inputName: string): Promise<void> {
    return this.request('ToggleInputMute', { inputName });
  }

  getRecordStatus(): Promise<{ outputActive: boolean; outputTimecode?: string }> {
    return this.request('GetRecordStatus');
  }

  startRecord(): Promise<void> {
    return this.request('StartRecord');
  }

  stopRecord(): Promise<void> {
    return this.request('StopRecord');
  }

  getStreamStatus(): Promise<{ outputActive: boolean; outputTimecode?: string }> {
    return this.request('GetStreamStatus');
  }

  startStream(): Promise<void> {
    return this.request('StartStream');
  }

  stopStream(): Promise<void> {
    return this.request('StopStream');
  }
}

export const obs = new ObsClient();
