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
  o bot lê o chat (`channel.chat.message`, `user_id` = bot) e envia por `POST /helix/chat/messages` com
  `broadcaster_id` = streamer e `sender_id` = bot. O streamer precisa autorizar `channel:bot`; o bot usa
  `user:bot` / `user:read:chat` / `user:write:chat`. Não usa IRC. Sem a conta do bot, o envio fica explicitamente
  indisponível (nunca cai para o token do streamer). O status "connected" do chat só aparece quando a assinatura
  `channel.chat.message` é aceita. Renovação é por conta; falha de refresh marca `status = 'expired'`; desconectar
  revoga os tokens na Twitch e reinicia o motor sem tocar na outra conta.
- OBS: conexão `ws://` direto do navegador com o protocolo v5 (`src/lib/obs.ts`). Só funciona em http/localhost.

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

## Preview (Base44)
- `vite.config.ts` libera o host do preview quando `BASE44_PREVIEW_MODE === '1'` (usa
  `BASE44_SANDBOX_HOST_DOMAIN`). Sem a variável, `allowedHosts` fica no padrão.
- `APP_URL` é derivada de `BASE44_PUBLIC_HOST_SUFFIX` quando não definida — usada nos redirects OAuth.
