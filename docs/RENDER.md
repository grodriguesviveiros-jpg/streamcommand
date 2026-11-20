# Publicar o STREAM COMMAND no Render

Guia para quem nunca publicou um site. São 6 passos e cerca de 20 minutos.

O que o Render vai criar:

| Recurso | Para que serve |
| --- | --- |
| **stream-command** (Web Service) | O app completo: interface + API + bot da Twitch, em um único endereço |
| **stream-command-db** (PostgreSQL) | O banco de dados |

Tudo é definido no arquivo `render.yaml`, que já está no repositório. Você não precisa
configurar nada manualmente além das credenciais do Discord e da Twitch.

---

## Passo 1 — Conta no Render

1. Acesse **https://render.com** e clique em **Get Started**.
2. Entre com a conta do **GitHub** (a mesma dona do repositório `streamcommand`).
3. Autorize o Render a ver seus repositórios. Não é preciso cartão de crédito para começar.

---

## Passo 2 — O código precisa estar na branch `main`

O Render publica a partir da branch **main**. Se as mudanças mais recentes ainda estão em
outra branch, junte-as na main antes (por exemplo, abrindo e mesclando um pull request).

> Alternativa: ao criar o Blueprint, o Render deixa escolher outra branch. Se preferir
> publicar direto da branch atual, selecione-a nessa tela.

---

## Passo 3 — Criar o Blueprint

1. No painel do Render, clique em **New +** (canto superior direito) → **Blueprint**.
2. Escolha o repositório **streamcommand**.
3. Nome do Blueprint: `stream-command`.
4. Clique em **Apply**.

O Render lê o `render.yaml` e cria o serviço web e o banco. Isso leva alguns minutos.
O primeiro deploy deve terminar com o serviço no ar (status **Live**).

---

## Passo 4 — Preencher as credenciais (obrigatório)

Ainda não vai funcionar: faltam as chaves do Discord (login) e da Twitch (chat e live).

1. Abra o serviço **stream-command** no painel do Render.
2. Vá em **Environment** (menu lateral).
3. Preencha os quatro campos vazios:

| Variável | Onde pegar |
| --- | --- |
| `DISCORD_CLIENT_ID` | **https://discord.com/developers/applications** → seu app → **OAuth2** → *Client ID* |
| `DISCORD_CLIENT_SECRET` | Mesma tela → *Client Secret* → **Reset Secret** se você não tiver guardado |
| `TWITCH_CLIENT_ID` | **https://dev.twitch.tv/console/apps** → seu app → *Client ID* |
| `TWITCH_CLIENT_SECRET` | Mesma tela → **New Secret** se você não tiver guardado |

4. Clique em **Save Changes**. O Render reinicia o serviço sozinho.

As outras variáveis (`SESSION_SECRET`, `TOKEN_ENCRYPTION_KEY`, `APP_DB_PASSWORD`,
`MIGRATION_DATABASE_URL`) são geradas automaticamente — não mexa nelas.

---

## Passo 5 — Descobrir o endereço e liberar o login

1. No topo da página do serviço aparece a URL, algo como
   **https://stream-command.onrender.com** (se o nome já estiver em uso, o Render
   acrescenta um sufixo, ex.: `stream-command-a1b2.onrender.com`). Copie a sua.
2. Cadastre os dois endereços de retorno do login:

**Discord** — https://discord.com/developers/applications → seu app → **OAuth2** →
*Redirects* → **Add Redirect**:

```
https://SUA-URL.onrender.com/api/auth/discord/callback
```

**Twitch** — https://dev.twitch.tv/console/apps → seu app → **Manage** →
*OAuth Redirect URLs* → **Add**:

```
https://SUA-URL.onrender.com/api/integrations/twitch/callback
```

Troque `SUA-URL` pelo endereço copiado no item 1. Salve nos dois sites.

---

## Passo 6 — Testar

1. Abra a URL do app no navegador.
2. Clique em **Entrar com Discord** e autorize.
3. Depois do login, conecte a Twitch (o app pede automaticamente).
4. Se o chat aparecer com a sua live, está tudo funcionando.

---

## Plano gratuito: o que você precisa saber

O plano gratuito serve para testar, **não para uso profissional**:

- O serviço **dorme após 15 minutos** sem visitas. Ao acordar, leva ~1 minuto. Enquanto
  dorme, o bot da Twitch fica offline (comandos, timers e sorteios não respondem).
- O banco gratuito **expira 30 dias após a criação**. Depois disso ele fica inacessível e,
  após 14 dias de carência, os dados são apagados. O Render avisa por e-mail.
- **Arquivos enviados** (avatares e sons do soundboard) são apagados a cada deploy ou
  reinício, porque não há disco permanente no plano gratuito.
- Não há backup do banco.

Para uso de verdade, o caminho recomendado é:

| Item | Preço aprox. |
| --- | --- |
| Web Service **Starter** (não dorme) | US$ 7/mês |
| Postgres **Basic 256 MB** (com backup) | US$ 6/mês |
| Disco de 1 GB para os arquivos | US$ 0,25/mês |

### Como mudar para os planos pagos

1. No serviço **stream-command**: **Settings** → **Instance Type** → **Starter** → Save.
2. No banco **stream-command-db**: **Settings** → **Instance Type** → **Basic 256 MB** → Save.
   **Faça isso antes dos 30 dias** para não perder os dados.
3. No serviço, **Disks** → **Add Disk**: nome `data`, mount path `/var/data`, tamanho 1 GB.
4. Em **Environment**, mude `UPLOAD_DIR` de `uploads` para `/var/data/uploads` → Save.

---

## Atualizações futuras

Todo push na branch `main` publica automaticamente a nova versão. As migrações do banco
rodam sozinhas no início de cada deploy — nada manual.

---

## Problemas comuns

| Mensagem / sintoma | O que fazer |
| --- | --- |
| `permission denied to create role` no log | O usuário do banco não pode criar papéis. No banco do Render: **Info** → **Credentials** → **+ New default credential**, usuário `sc_app`, copie a senha, cole em `APP_DB_PASSWORD` no serviço e faça **Manual Deploy → Deploy latest commit**. |
| Login volta com `redirect_uri` inválido | O endereço do Passo 5 está errado ou não foi salvo no Discord/Twitch. Precisa ser exatamente `https://SUA-URL.onrender.com/api/.../callback`, com `https`. |
| "Application failed to respond" | O serviço ainda está subindo (plano gratuito demora ~1 min após dormir). Aguarde e recarregue. Se persistir, veja **Logs**. |
| Bot não responde no chat | Confirme que a Twitch está conectada em **Configurações → Twitch**. No plano gratuito, o serviço dormindo também derruba o bot. |
| Erro de banco no log | Confira se o banco está **Available** e se `MIGRATION_DATABASE_URL` existe em **Environment**. |
