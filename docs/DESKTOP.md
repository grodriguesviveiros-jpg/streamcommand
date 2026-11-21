# Aplicativo desktop (Tauri)

O site funciona normalmente no navegador, com uma exceção: **o navegador bloqueia
conexões `ws://` a partir de páginas HTTPS** (conteúdo misto). Como o OBS WebSocket
local é sempre `ws://127.0.0.1:4455`, o controle do OBS só funciona quando o app roda
em `http://localhost:3000` ou no **aplicativo desktop**.

O aplicativo desktop é uma janela (Tauri v2) que carrega o próprio site e faz a
conexão com o OBS pelo processo nativo. Login Discord, Twitch, chat, eventos em
tempo real, soundboard e permissões continuam iguais — o site é o mesmo.

## Como funciona

- `src-tauri/src/main.rs` abre uma janela com a URL configurada em
  `STREAM_COMMAND_APP_URL` (padrão `http://localhost:3000`).
- `src-tauri/src/obs.rs` implementa o cliente do WebSocket do OBS (protocolo v5):
  `obs_connect`, `obs_request` e `obs_disconnect`. A senha do OBS nunca sai da
  máquina; o handshake acontece no processo nativo.
- `src/lib/obs.ts` usa esses comandos quando está dentro do app desktop
  (`window.__TAURI__.core.invoke`) e mantém o WebSocket do navegador quando não está.
- `src-tauri/capabilities/default.json` libera os comandos para a janela principal
  e para a URL remota do site (`remote.urls`). Se você publicar em um domínio fixo,
  troque `https://*` por `https://SEU-DOMINIO` para restringir ainda mais.

## Pré-requisitos

1. O site publicado (ou rodando localmente em `http://localhost:3000`).
2. **Node.js 22** e **Rust stable** (`rustup`): https://rustup.rs
3. Dependências de sistema:
   - **Windows:** WebView2 (já vem no Windows 10/11) e Visual Studio Build Tools (C++).
   - **macOS:** Xcode Command Line Tools (`xcode-select --install`).
   - **Linux (Debian/Ubuntu):**
     ```bash
     sudo apt-get install -y libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf
     ```

## Gerar o instalador

```bash
# Linux/macOS
STREAM_COMMAND_APP_URL=https://seu-dominio.com npm run desktop:build

# Windows (PowerShell)
$env:STREAM_COMMAND_APP_URL = "https://seu-dominio.com"; npm run desktop:build
```

Os instaladores ficam em `src-tauri/target/release/bundle/`
(`.msi`/`.exe` no Windows, `.dmg` no macOS, `.deb`/`.AppImage` no Linux).

Sem `STREAM_COMMAND_APP_URL`, o app abre `http://localhost:3000` — útil para
testar com `npm run dev:web` + `npm run desktop:dev`.

## Gerar os instaladores no GitHub

O workflow `.github/workflows/desktop.yml` (execução manual em **Actions →
desktop → Run workflow**) compila Windows, macOS e Linux e publica um rascunho de
release com os instaladores. Informe a URL pública do site no campo `app_url`.

## Checklist depois de instalar

1. Abrir o app desktop e entrar com Discord normalmente.
2. **Configurações → Twitch**: conectar a conta do streamer (e a do bot, se usar
   uma segunda identidade). Reconectar é necessário para conceder escopos novos.
3. **OBS Studio → Ferramentas → WebSocket do OBS Server**: ativar o servidor.
4. **OBS** no app: host `127.0.0.1`, porta `4455`, senha → **Conectar ao OBS**.

## Limitações

- O app desktop abre o site publicado: é preciso internet e o site no ar.
- O OBS precisa estar na mesma máquina do app (a conexão é `127.0.0.1`).
- A janela carrega a URL remota; não há modo offline.
