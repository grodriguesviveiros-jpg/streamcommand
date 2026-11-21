# STREAM COMMAND

O **STREAM COMMAND** é uma plataforma web profissional para centralizar o gerenciamento de transmissões ao vivo na Twitch.

## Início rápido

```bash
docker compose -f docker-compose.base44.yml up -d
```

Abra **http://localhost:3000**. Guia completo, passo a passo (Discord, Twitch, OBS e chaves):
**[docs/CONFIGURACAO.md](docs/CONFIGURACAO.md)**.

### Status das integrações

| Área | Estado |
| --- | --- |
| App, workspaces, equipe, permissões, RLS | Funcionando |
| Comandos, timers, automações, sorteios, enquetes, fila, soundboard, botões | Funcionando |
| Login Discord | Implementado — depende de `DISCORD_CLIENT_ID`/`SECRET` |
| Chat/eventos/moderação Twitch | Implementado — depende de `TWITCH_CLIENT_ID`/`SECRET` e das contas do streamer e do bot conectadas |
| OBS WebSocket (v5) | Implementado — depende do OBS local com WebSocket ativo |

Repositório no GitHub: https://github.com/grodriguesviveiros-jpg/streamcommand

Ele foi criado para permitir que vários streamers tenham seus próprios espaços de trabalho, equipes e configurações, sem que as informações sejam misturadas entre usuários.

## Objetivo

Reunir em um único painel as principais ferramentas necessárias para organizar, controlar e acompanhar uma live.

O produto deve ter aparência moderna, escura e profissional, com navegação lateral, cartões informativos, indicadores em tempo real e uma experiência preparada para uso comercial.

## Público-alvo

- Streamers da Twitch.
- Criadores de conteúdo que trabalham com equipe.
- Moderadores e operadores de transmissão.
- Streamers que desejam controlar OBS, chat e automações pelo mesmo sistema.

## Identidade visual

- Tema escuro moderno.
- Navegação lateral fixa.
- Cores personalizáveis pelo streamer.
- Componentes organizados em cards.
- Ícones modernos e animações discretas.
- Interface responsiva.
- Marca **SmartFountain** visível discretamente no rodapé lateral.

## Contas e acessos

- Login com conta Discord.
- Identificação de cada usuário.
- Perfil próprio para cada streamer.
- Workspace privado por usuário.
- Convites para membros da equipe.
- Papéis e permissões individuais.
- Suporte futuro para administradores, moderadores e operadores.

Nenhum usuário poderá visualizar ou alterar dados de outro workspace sem autorização.

## Funcionalidades principais

### Dashboard

- Status da conexão com Twitch.
- Status da conexão com OBS.
- Situação da transmissão.
- Quantidade de espectadores.
- Seguidores recentes.
- Eventos da live.
- Atividade do chat.
- Ações rápidas.
- Histórico recente.

Todos os indicadores devem apresentar dados reais das integrações. Não devem ser usados números falsos ou dados simulados como resultados reais.

### Chat ao vivo

- Visualização das mensagens em tempo real.
- Envio de mensagens pela Twitch.
- Identificação dos usuários.
- Filtros e ferramentas de moderação.
- Execução de comandos personalizados.
- Histórico permitido pela API da Twitch.

### Comandos personalizados

Permite criar respostas como:

- `!discord`
- `!redes`
- `!setup`
- `!youtube`
- `!comandos`

Cada comando deve possuir nome, resposta, tempo de recarga, permissão mínima e opção para ativar ou desativar.

### Automações

Sistema baseado em eventos para executar ações automaticamente.

Exemplos:

- Quando alguém seguir, enviar uma mensagem.
- Quando alguém se inscrever, executar uma ação.
- Quando ocorrer uma raid, enviar um aviso.
- Quando uma palavra aparecer no chat, executar uma ação.

Cada automação deve possuir gatilho, condições, ações, atraso e estado ativo ou desativado.

### Timers

Mensagens enviadas automaticamente ao chat em intervalos configurados pelo usuário.

### Integração com OBS

- Conexão local com OBS Studio.
- Visualização das cenas.
- Troca de cenas.
- Controle de fontes.
- Controle de volumes.
- Inicialização e interrupção da gravação.
- Consulta do estado da transmissão e da gravação.

O OBS deve ser acessado apenas localmente pelo computador do usuário. Nenhuma senha ou endereço do WebSocket deve ser exposto publicamente.

### Sorteios e enquetes

- Criar sorteios.
- Definir critérios de participação.
- Sortear participantes.
- Exibir o resultado.
- Criar enquetes.
- Visualizar votos e resultados.

### Fila de jogadores

- Adicionar participantes.
- Remover participantes.
- Reorganizar a fila.
- Marcar participantes atendidos.
- Exibir os próximos da fila.

### Soundboard

- Upload de arquivos de áudio.
- Organização por categorias.
- Botões personalizados.
- Controle de volume.
- Reprodução e interrupção.
- Atalhos de teclado.

### Central de botões

Painel personalizável com botões capazes de executar ações reais, como:

- Trocar cena no OBS.
- Reproduzir um som.
- Enviar uma mensagem no chat.
- Executar um comando.
- Iniciar ou parar gravações.

Os botões devem ser organizados em páginas, categorias, cores e posições personalizadas.

### Estatísticas e histórico

- Histórico de transmissões.
- Seguidores.
- Média e pico de espectadores.
- Atividade do chat.
- Eventos de Twitch.
- Relatórios por período.
- Histórico de ações da equipe.
- Identificação de quem executou cada ação.

### Equipe

- Convidar membros pelo Discord.
- Aceitar ou recusar convites.
- Remover membros.
- Criar papéis personalizados.
- Definir permissões individuais.
- Impedir que membros concedam permissões superiores às próprias.
- Manter histórico das ações da equipe.

Exemplos de permissões:

- Visualizar dashboard.
- Acessar chat.
- Enviar mensagens.
- Gerenciar comandos.
- Executar automações.
- Controlar OBS.
- Criar sorteios.
- Gerenciar soundboard.
- Visualizar estatísticas.
- Gerenciar equipe.
- Alterar configurações.

### Configurações

- Perfil e nome de exibição.
- Nome do canal.
- Logotipo ou foto de perfil.
- Cor principal.
- Cor secundária.
- Conta Discord.
- Conta Twitch.
- Conexão OBS.
- Preferências visuais.
- Preferências de notificação.
- Segurança.
- Gerenciamento da equipe.

## Integrações previstas

- **Supabase:** autenticação, banco de dados, armazenamento e segurança.
- **Discord OAuth2:** login seguro dos usuários.
- **Twitch API:** dados da conta, chat e eventos.
- **Twitch EventSub:** eventos em tempo real de follows, inscrições, raids e outros eventos autorizados.
- **OBS WebSocket:** controle local do OBS Studio.

Credenciais secretas não devem ser armazenadas no frontend.

## Estrutura multiusuário

Cada conta Discord deve possuir seu próprio workspace.

O backend deve separar os dados por `workspace_id` e aplicar políticas de acesso no banco de dados, garantindo que:

- Cada usuário visualize apenas workspaces autorizados.
- Proprietários gerenciem seus workspaces.
- Membros tenham apenas as permissões concedidas.
- Convites sejam individuais.
- Alterações sejam registradas em um histórico com o usuário responsável.

## Segurança

- Login OAuth seguro.
- Separação de dados por workspace.
- Permissões validadas no backend.
- Tokens armazenados de forma segura.
- Nenhum segredo privado exposto no navegador.
- Conexões externas tratadas como integrações autorizadas pelo usuário.

## Implementação sugerida na Base44

Criar o sistema como uma aplicação web responsiva com:

1. Tela inicial de login com Discord.
2. Tela do usuário sem dados compartilhados.
3. Criação automática de um workspace após o primeiro login.
4. Dashboard como página inicial.
5. Navegação lateral para todas as áreas.
6. Área de equipe e permissões.
7. Conectores para Discord, Twitch, OBS e Supabase.
8. Banco de dados separado por workspace.
9. Estados claros para serviços conectados e desconectados.
10. Nenhum número fictício ou integração simulada.
