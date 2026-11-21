-- ============================================================================
-- Duas conexões Twitch independentes por workspace
--
-- Antes existia uma única conexão por workspace (a conta do canal, usada tanto
-- para eventos quanto para enviar mensagens). Agora cada workspace pode manter:
--   streamer → conta principal do canal (eventos, informações, autorizações)
--   bot      → conta separada usada para enviar mensagens e responder no chat
--
-- Cada linha guarda a própria identidade, tokens, escopos e estado. A chave
-- única passa de (workspace_id) para (workspace_id, connection_type).
-- ============================================================================

alter table twitch_connections
  add column if not exists connection_type text not null default 'streamer';

alter table twitch_connections
  add column if not exists status text not null default 'active';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'twitch_connections_connection_type_check'
  ) then
    alter table twitch_connections
      add constraint twitch_connections_connection_type_check
      check (connection_type in ('streamer', 'bot'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'twitch_connections_status_check'
  ) then
    alter table twitch_connections
      add constraint twitch_connections_status_check
      check (status in ('active', 'expired', 'revoked', 'error'));
  end if;
end $$;

-- A constraint única antiga (uma conexão por workspace) dá lugar à chave
-- composta. O nome é o gerado pelo "unique" inline da migração 001.
alter table twitch_connections drop constraint if exists twitch_connections_workspace_id_key;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'twitch_connections_workspace_type_key'
  ) then
    alter table twitch_connections
      add constraint twitch_connections_workspace_type_key unique (workspace_id, connection_type);
  end if;
end $$;

create index if not exists twitch_connections_workspace_idx on twitch_connections (workspace_id);
