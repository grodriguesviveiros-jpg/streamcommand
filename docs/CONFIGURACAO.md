# Guia de configuração — STREAM COMMAND (SmartFountain)

Este guia foi escrito para quem está começando. Cada etapa indica **onde clicar**, **o que copiar** e
**onde colar**. Nenhum valor secreto deve ir para o GitHub.

---

## 1. O que já funciona e o que depende de configuração

### Funciona sem nenhuma credencial externa
- Aplicativo completo (dashboard, navegação, identidade visual, marca SmartFountain).
- Contas, workspaces, convites de equipe, papéis e permissões.
- Isolamento de dados por workspace (RLS no PostgreSQL + validação no servidor).
- Comandos, automações, timers, sorteios, enquetes, fila, soundboard e central de botões (cadastro e execução local).
- Histórico de ações da equipe e estatísticas do que foi coletado.
- Conexão com o OBS local (quando o app roda em `http://localhost:3000` ou na versão desktop).

### Depende de configuração sua
| Recurso | Precisa de |
| --- | --- |
| Login com Discord | Aplicativo no Discord Developer Portal |
| Chat, follows, inscrições, raids, moderação, envio de mensagens | Aplicativo na Twitch Developer Console + conectar a conta na tela Configurações → Twitch |
| Controle do OBS | OBS Studio com o WebSocket do OBS Server ativo |
| Banco gerenciado na nuvem (Supabase) | Projeto Supabase (opcional — o app já roda com PostgreSQL local) |

Nada é simulado: enquanto uma integração não estiver configurada, a interface mostra o estado
"não conectada" e explica o que falta.

---

## 2. Arquitetura em uma olhada

```
Navegador (React + TypeScript + Vite, porta 3000)
        │  mesma origem, cookie de sessão httpOnly
        ▼
API Node/Express (porta 4000)
        ├── OAuth Discord (PKCE) e sessão assinada
        ├── OAuth Twitch + tokens criptografados (AES-256-GCM)
        ├── Motor do bot: chat (IRC/WebSocket), EventSub, comandos, timers, automações
        └── PostgreSQL (RLS forçado por workspace)
```

- `server/` → API, banco, integrações e motor do bot.
- `src/` → interface React (páginas, componentes, estado).
- `server/migrations/` → schema do banco com políticas de segurança.
- `docs/` → esta documentação.

---

## 3. Rodar o projeto no seu computador

### 3.1 Pré-requisitos
1. **Docker Desktop** — https://www.docker.com/products/docker-desktop/
2. **Git** — https://git-scm.com/downloads (opcional se você baixar o ZIP)
3. **OBS Studio** — https://obsproject.com/ (apenas para a integração com o OBS)

### 3.2 Comandos
```bash
git clone https://github.com/grodriguesviveiros-jpg/streamcommand.git
cd streamcommand
docker compose -f docker-compose.base44.yml up -d
```

Abra **http://localhost:3000**.

- A primeira execução instala dependências e cria o banco (pode levar 1–2 minutos).
- Para acompanhar: `docker compose -f docker-compose.base44.yml logs -f api`
- Para parar: `docker compose -f docker-compose.base44.yml down`
- Se você alterar `package.json`, rode: `docker compose -f docker-compose.base44.yml run --rm install`

### 3.3 Variáveis de ambiente
1. Copie o modelo: `cp .env.example .env`
2. Preencha apenas no seu computador (o `.env` está no `.gitignore`).
3. No Docker, os valores entram pelo arquivo de secrets do projeto (`.env.base44-defaults` contém apenas
   placeholders de desenvolvimento).

---

## 4. Criar o aplicativo no Discord (login)

1. Acesse **https://discord.com/developers/applications** e entre com sua conta.
2. Clique em **New Application**, dê o nome `STREAM COMMAND` e confirme.
3. No menu lateral, abra **OAuth2**.
4. Copie o **Client ID** (fica em "Client information").
5. Clique em **Reset Secret** e copie o **Client Secret** (guarde bem — ele nunca deve ir para o GitHub).
6. Em **Redirects**, clique em **Add Redirect** e cole exatamente:
   - Local: `http://localhost:3000/api/auth/discord/callback`
   - No preview online: `https://SEU-ENDERECO/api/auth/discord/callback`
7. Clique em **Save Changes**.
8. Em **OAuth2 → URL Generator** (opcional, só para conferir): marque os escopos `identify` e `email`.

### Onde colocar
Nos secrets do projeto (painel do Base44 → Secrets) ou no seu `.env`:
```
DISCORD_CLIENT_ID=...
DISCORD_CLIENT_SECRET=...
DISCORD_REDIRECT_URI=http://localhost:3000/api/auth/discord/callback
```

Depois de salvar, a tela de login passa a mostrar o botão **Entrar com Discord** funcionando.

> O app usa **PKCE + state**: mesmo que alguém intercepte a URL de autorização, não consegue trocar o
> código por um token. O Client Secret fica apenas no servidor.

---

## 5. Criar o aplicativo na Twitch (chat, eventos e moderação)

1. Acesse **https://dev.twitch.tv/console/apps** e faça login.
2. Clique em **Register Your Application**.
3. Preencha:
   - **Name**: `STREAM COMMAND`
   - **OAuth Redirect URLs**: `http://localhost:3000/api/integrations/twitch/callback`
   - **Category**: `Application Integration`
   - **Client Type**: `Confidential`
4. Clique em **Create**.
5. Copie o **Client ID**.
6. Clique em **New Secret** e copie o **Client Secret** (ele aparece uma única vez).

### Onde colocar
```
TWITCH_CLIENT_ID=...
TWITCH_CLIENT_SECRET=...
TWITCH_REDIRECT_URI=http://localhost:3000/api/integrations/twitch/callback
```

### Conectar sua conta
1. Abra o app → **Configurações → Twitch**.
2. Clique em **Conectar Twitch** e autorize os escopos solicitados.
3. Pronto: o bot lê o chat pelo EventSub (`channel.chat.message`) e responde pela API de chat automaticamente.
   O status **online** do bot só aparece depois que a assinatura do chat é aceita pela Twitch.

Escopos usados e por quê:
| Escopo | Para que serve |
| --- | --- |
| `user:read:email` | identificar a conta conectada |
| `user:read:chat`, `user:write:chat` | ler e enviar mensagens no chat |
| `moderator:manage:banned_users` | aplicar timeout/ban |
| `moderator:read:followers` | receber evento de novos seguidores |
| `channel:read:subscriptions` | receber evento de inscrições |

> Os tokens são renovados automaticamente e ficam **criptografados** no banco (AES-256-GCM).

---

## 6. OBS Studio

1. Instale o OBS Studio: https://obsproject.com/
2. Abra o OBS → **Ferramentas → WebSocket do OBS Server**.
3. Marque **Ativar o servidor WebSocket**.
4. Anote a **porta** (padrão `4455`) e defina/copie a **senha**.
5. No app: **Configurações → OBS** → preencha host (`127.0.0.1`), porta e senha → **Salvar**.
6. Abra **OBS Studio** no menu lateral e clique em **Conectar ao OBS**.

Importante: o navegador só permite `ws://` a partir de páginas `http://`. Use
`http://localhost:3000` ou a versão desktop (Tauri). Em HTTPS o app avisa isso na própria tela.

---

## 7. Equipe, permissões e segurança

- Convide alguém em **Equipe → Convidar membro** usando o nome de usuário do Discord.
- Copie o link do convite e envie para a pessoa; ela entra com a própria conta Discord e aceita.
- O proprietário escolhe cada permissão. **Ninguém consegue conceder uma permissão que não possui** —
  a regra é validada no servidor.
- Toda ação relevante fica registrada em **Estatísticas → Histórico da equipe**, com autor e horário.
- O isolamento é duplo: validado nas rotas da API **e** no banco com Row Level Security forçado
  (o usuário de runtime não vê linhas de outro workspace nem com SQL direto).

---

## 8. Supabase (opcional, para produção na nuvem)

O app já usa PostgreSQL com RLS forçado, exatamente o mesmo modelo do Supabase — não existe código
específico de Supabase para escrever. Para apontar o app para lá:

1. Crie um projeto em **https://supabase.com/dashboard**.
2. Em **Project Settings → Database**, copie a string do **Session pooler** (porta 5432) e acrescente
   `?sslmode=require` no final — o `pg` liga o TLS a partir desse parâmetro, e sem ele a conexão é recusada.
3. Rode as migrações contra o banco novo (elas criam o papel `sc_app` e todas as políticas de RLS):
   ```bash
   MIGRATION_DATABASE_URL="postgres://postgres:...@...supabase.com:5432/postgres?sslmode=require" \
   APP_DB_PASSWORD="<senha forte do sc_app>" npm run migrate
   ```
4. Use duas strings diferentes no ambiente:
   - `MIGRATION_DATABASE_URL` = usuário `postgres` (migrações e o serviço de bot).
   - `DATABASE_URL` = usuário `sc_app` com a senha definida em `APP_DB_PASSWORD` (runtime, com RLS forçado).
5. **Nunca** coloque a `service_role` no frontend. O app não usa essa chave nem o Supabase Auth.

O que ainda não está pronto para a nuvem:
- **Uploads** (avatares e soundboard) ficam no volume local `/app/uploads`, não no Supabase Storage.
- **Sessão** é cookie JWT próprio (`sc_session`), não Supabase Auth.
- No Compose, `DATABASE_URL` e `MIGRATION_DATABASE_URL` estão fixos no banco local; para usar Supabase eles
  precisam sair do bloco `environment:` e virar defaults em `.env.base44-defaults`, para que os secrets
  `DATABASE_URL` / `MIGRATION_DATABASE_URL` possam sobrescrevê-los.
- Plano gratuito do Supabase pausa o projeto por inatividade — o bot cai junto.

---

## 9. Como testar cada funcionalidade

| Funcionalidade | Como testar |
| --- | --- |
| Login | Sair e entrar com Discord |
| Workspace | Configurações → Identidade: trocar nome e cores (aplicado em todo o app) |
| Equipe | Convidar outro Discord, abrir o link em outra conta e aceitar |
| Comandos | Criar `!discord`, mandar `!discord` no chat da live |
| Timers | Criar timer de 60s, ficar ao vivo e ver a mensagem no chat |
| Automações | Automação "follow → mensagem"; pedir um follow de teste |
| Sorteios | Criar com palavra `!sorteio`, digitar no chat, clicar em Sortear |
| Enquetes | Criar enquete, votar com `!voto 1`, abrir Resultados |
| Fila | Adicionar manualmente ou usar automação "Adicionar à fila" |
| Soundboard | Enviar um mp3, definir atalho e tocar |
| Botões | Criar botão de troca de cena, conectar OBS e clicar |
| OBS | Conectar, trocar cena, mover volume, iniciar gravação |
| Estatísticas | Ver sessões, mensagens por dia e histórico da equipe |

---

## 10. Problemas comuns

| Sintoma | Causa provável | Solução |
| --- | --- | --- |
| "Login Discord não configurado" | faltam `DISCORD_CLIENT_ID`/`SECRET` | preencha os secrets e reinicie a API |
| `redirect_uri mismatch` no Discord | URL não cadastrada no app | cadastre exatamente a URL do app |
| Chat não aparece | Twitch não conectada | Configurações → Twitch → Conectar |
| Bot não lê nem responde o chat | conexão sem `user:read:chat`/`user:write:chat` | Configurações → Twitch → Reconectar |
| Bot não responde comandos | bot offline | verifique Configurações → Twitch e os logs da API |
| OBS não conecta | página em HTTPS | use `http://localhost:3000` ou o app desktop |
| Nada carrega | containers parados | `docker compose -f docker-compose.base44.yml up -d` |

Logs: `docker compose -f docker-compose.base44.yml logs -f api`

---

## 11. Próximos passos sugeridos

1. Configurar Discord e Twitch (seções 4 e 5) — é o que libera o uso real.
2. Conectar o OBS e montar a central de botões com as cenas que você mais usa.
3. Criar os comandos e timers do seu canal.
4. Convidar a equipe e revisar as permissões.
5. Versão desktop (Tauri): empacotar o mesmo frontend com o backend local para liberar `ws://` do OBS
   e atalhos globais.
