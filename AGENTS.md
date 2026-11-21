# Notas para quem for mexer neste repositório

## Como rodar
```bash
docker compose -f docker-compose.base44.yml up -d
```
- `web` (Vite, porta 3000) faz proxy de `/api` e `/uploads` para `api:4000` — tudo em uma origem, sem CORS.
- `install` é um serviço de execução única que instala dependências em um volume nomeado. **Se `package.json`
  mudar**, rode `docker compose -f docker-compose.base44.yml run --rm install` antes de reiniciar.
- `migrate` roda `server/migrate.ts` e aplica `server/migrations/*.sql` uma única vez (tabela `schema_migrations`).

## Banco e segurança (não é óbvio)
- A API conecta com o papel **`sc_app`**, que tem RLS **forçado**. As políticas leem
  `current_setting('app.workspace_id')` / `app.user_id`, definidos por transação em `server/db.ts` (`withContext`).
- Toda rota de dados precisa passar pelo `withContext`; consultar sem contexto retorna zero linhas (de propósito).
- O motor do bot usa `adminPool` (superusuário) **apenas** para descobrir quais workspaces têm Twitch conectada;
  todo o resto é feito com contexto de workspace.
- `applyAsyncGuard` (server/async-router.ts) é obrigatório: Express 4 não captura rejeições de handlers async e
  o processo morreria em um id inválido.

## Integrações
- Discord: OAuth2 com PKCE; o cookie de sessão é um JWT `sc_session` (httpOnly, 30 dias).
- Twitch: **duas conexões independentes por workspace** em `twitch_connections` (`connection_type` = `streamer` | `bot`,
  chave única `(workspace_id, connection_type)`), cada uma com identidade, tokens, escopos e `status` próprios.
  O streamer recebe eventos (`channel.follow`, `channel.subscribe`, `channel.raid`, `stream.online/offline`) e modera;
  o chat é lido pela conta do bot (`channel.chat.message`, `user_id` = bot) ou, **sem bot conectado, pela própria conta
  do streamer** (`user_id` = streamer, escopo `user:read:chat` — modo Chat Client). O envio por
  `POST /helix/chat/messages` usa a conta escolhida no workspace em `preferences.chat_sender` (`bot`, padrão, ou
  `streamer`) com `broadcaster_id` = streamer e `sender_id` = conta escolhida; a escolha vale para o painel, comandos e
  timers. Única exceção: quando a conta escolhida nunca foi conectada e a outra existe, a conta do streamer envia (o
  `sender` devolvido diz qual foi usada) — uma conta escolhida que existe mas expirou continua sendo um erro claro, sem
  troca silenciosa. O streamer precisa autorizar `channel:bot`, `user:read:chat` e `user:write:chat`; o bot usa
  `user:bot` / `user:read:chat` / `user:write:chat`. Não usa IRC. O status "connected" do chat só aparece quando a
  assinatura `channel.chat.message` é aceita; a página do chat mostra um diagnóstico (`ChatHealthBanner`) com o que falta.
  Renovação é por conta; falha de refresh marca `status = 'expired'`; desconectar revoga os tokens na Twitch e reinicia
  o motor sem tocar na outra conta.
- OBS: protocolo v5 em `src/lib/obs.ts`. No navegador a conexão é `ws://` direto, o que **só funciona em
  http/localhost** (páginas HTTPS bloqueiam conteúdo misto). No aplicativo desktop (Tauri) a conexão é feita pelo
  processo nativo (`src-tauri/src/obs.rs`) e funciona também em HTTPS. Ver `docs/DESKTOP.md`.

## Verificação rápida
```bash
curl -s localhost:3000/api/health
docker compose -f docker-compose.base44.yml exec -T api npx tsc --noEmit
docker compose -f docker-compose.base44.yml exec -T web npx vite build
```

## Deploy (Render)
- `render.yaml` define um único Web Service + PostgreSQL. O Express serve `dist/` (SPA) e a API na
  mesma origem quando `dist/index.html` existe; em desenvolvimento o Vite continua servindo a interface.
- `APP_URL` é lida de `RENDER_EXTERNAL_URL`; o runtime tenta o papel `sc_app` derivado de
  `MIGRATION_DATABASE_URL` + `APP_DB_PASSWORD` e, se ele não existir no banco, conecta com o próprio usuário
  do banco (o RLS forçado continua valendo; avisa no log se esse usuário ignorar RLS). O Compose continua
  definindo `DATABASE_URL` explicitamente, então nada muda em desenvolvimento.
- Guia do usuário: `docs/RENDER.md`.

## Desktop (Tauri)
- `src-tauri/` é o shell desktop: a janela carrega `STREAM_COMMAND_APP_URL` (embutida no build por
  `option_env!`, sobrescrevível em runtime) e o OBS é acessado pelo processo nativo, então `ws://` funciona em HTTPS.
- Nada do site muda no desktop: mesma origem, mesmo cookie de sessão, mesmo SSE. O frontend só detecta o Tauri em
  `src/lib/obs.ts` (`window.__TAURI__.core.invoke`) e usa `obs_connect` / `obs_request` / `obs_disconnect`.
- `src-tauri/capabilities/default.json` libera os comandos para a janela `main` e para `remote.urls`
  (`https://*`, `http://localhost:*`). Restrinja ao domínio real ao publicar.
- `tauri.conf.json` tem `devUrl` (localhost:3000) e `beforeBuildCommand` (`npm run build`). Guia: `docs/DESKTOP.md`;
  instaladores pelo workflow `.github/workflows/desktop.yml`.
- O build desktop **não roda no sandbox** (precisa de Rust + SDKs do sistema): valide o app web normalmente e, para o
  shell, `cargo check` com as dependências de sistema instaladas.

## Preview (Base44)
- `vite.config.ts` libera o host do preview quando `BASE44_PREVIEW_MODE === '1'` (usa
  `BASE44_SANDBOX_HOST_DOMAIN`). Sem a variável, `allowedHosts` fica no padrão.
- `APP_URL` é derivada de `BASE44_PUBLIC_HOST_SUFFIX` quando não definida — usada nos redirects OAuth.
