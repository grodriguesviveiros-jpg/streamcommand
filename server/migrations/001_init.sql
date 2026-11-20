-- ============================================================================
-- STREAM COMMAND — schema multi-workspace (PostgreSQL)
-- Toda tabela de dados pertence a um workspace e é protegida por RLS forçado.
-- O runtime da API conecta com o papel restrito "sc_app"; nenhuma consulta
-- consegue ler/escrever dados de outro workspace sem o contexto definido
-- (app.workspace_id / app.user_id) e a política correspondente.
-- ============================================================================

create extension if not exists pgcrypto;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'sc_app') then
    execute format('create role sc_app login password %L', current_setting('app.db_password'));
  else
    execute format('alter role sc_app with login password %L', current_setting('app.db_password'));
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Funções de contexto usadas pelas políticas
-- ---------------------------------------------------------------------------
create or replace function app_ws() returns uuid language sql stable as $$
  select nullif(current_setting('app.workspace_id', true), '')::uuid
$$;

create or replace function app_uid() returns uuid language sql stable as $$
  select nullif(current_setting('app.user_id', true), '')::uuid
$$;

create or replace function app_discord_id() returns text language sql stable as $$
  select nullif(current_setting('app.discord_id', true), '')
$$;

create or replace function app_discord_username() returns text language sql stable as $$
  select lower(nullif(current_setting('app.discord_username', true), ''))
$$;

create or replace function app_invite_token() returns text language sql stable as $$
  select nullif(current_setting('app.invite_token', true), '')
$$;

-- ---------------------------------------------------------------------------
-- Identidade
-- ---------------------------------------------------------------------------
create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  discord_id text not null unique,
  username text not null,
  global_name text,
  avatar_url text,
  email text,
  created_at timestamptz not null default now(),
  last_login_at timestamptz
);

create table if not exists workspaces (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references users(id) on delete cascade,
  name text not null,
  channel_name text,
  display_name text,
  logo_url text,
  primary_color text not null default '#7c3aed',
  secondary_color text not null default '#22d3ee',
  preferences jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  role text not null default 'member',
  permissions jsonb not null default '[]'::jsonb,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (workspace_id, user_id)
);

create table if not exists workspace_invitations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  token text not null unique,
  discord_username text not null,
  role text not null default 'member',
  permissions jsonb not null default '[]'::jsonb,
  status text not null default 'pending',
  created_by uuid references users(id) on delete set null,
  accepted_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days'
);

-- ---------------------------------------------------------------------------
-- Integrações
-- ---------------------------------------------------------------------------
create table if not exists twitch_connections (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null unique references workspaces(id) on delete cascade,
  twitch_user_id text not null,
  login text not null,
  display_name text,
  avatar_url text,
  broadcaster_type text,
  scopes text[] not null default '{}',
  access_token text not null,
  refresh_token text not null,
  expires_at timestamptz not null,
  connected_by uuid references users(id) on delete set null,
  connected_at timestamptz not null default now(),
  last_sync_at timestamptz
);

create table if not exists obs_settings (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null unique references workspaces(id) on delete cascade,
  host text not null default '127.0.0.1',
  port integer not null default 4455,
  password_enc text,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Ferramentas do workspace
-- ---------------------------------------------------------------------------
create table if not exists custom_commands (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name text not null,
  response text not null,
  cooldown_seconds integer not null default 10,
  min_role text not null default 'everyone',
  enabled boolean not null default true,
  use_count integer not null default 0,
  last_used_at timestamptz,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists timers (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name text not null,
  message text not null,
  interval_seconds integer not null default 600,
  min_messages integer not null default 0,
  only_when_live boolean not null default true,
  enabled boolean not null default false,
  last_sent_at timestamptz,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists automations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name text not null,
  trigger_type text not null,
  trigger_config jsonb not null default '{}'::jsonb,
  conditions jsonb not null default '{}'::jsonb,
  action_type text not null,
  action_config jsonb not null default '{}'::jsonb,
  delay_seconds integer not null default 0,
  enabled boolean not null default true,
  run_count integer not null default 0,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists automation_logs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  automation_id uuid references automations(id) on delete cascade,
  event jsonb not null default '{}'::jsonb,
  action_result text,
  status text not null default 'ok',
  created_at timestamptz not null default now()
);

create table if not exists giveaways (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  title text not null,
  keyword text not null default '!participar',
  status text not null default 'open',
  winner_count integer not null default 1,
  require_follower boolean not null default false,
  winners jsonb not null default '[]'::jsonb,
  ends_at timestamptz,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists giveaway_entries (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  giveaway_id uuid not null references giveaways(id) on delete cascade,
  twitch_user_id text not null,
  username text not null,
  entered_at timestamptz not null default now(),
  unique (giveaway_id, twitch_user_id)
);

create table if not exists polls (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  question text not null,
  options jsonb not null default '[]'::jsonb,
  status text not null default 'open',
  ends_at timestamptz,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists poll_votes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  poll_id uuid not null references polls(id) on delete cascade,
  twitch_user_id text not null,
  username text not null,
  option_id text not null,
  created_at timestamptz not null default now(),
  unique (poll_id, twitch_user_id)
);

create table if not exists queue_entries (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  username text not null,
  note text,
  position integer not null default 0,
  status text not null default 'waiting',
  added_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  served_at timestamptz
);

create table if not exists soundboard_sounds (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name text not null,
  category text not null default 'Geral',
  file_path text not null,
  mime_type text,
  size_bytes integer not null default 0,
  volume numeric not null default 1,
  hotkey text,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists button_layouts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name text not null,
  page text not null default 'Principal',
  created_at timestamptz not null default now()
);

create table if not exists custom_buttons (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  label text not null,
  icon text not null default 'zap',
  color text not null default '#7c3aed',
  category text not null default 'Geral',
  page text not null default 'Principal',
  action_type text not null,
  action_config jsonb not null default '{}'::jsonb,
  hotkey text,
  sort_order integer not null default 0,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Histórico / estatísticas
-- ---------------------------------------------------------------------------
create table if not exists activity_logs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id uuid references users(id) on delete set null,
  actor_name text not null default 'Sistema',
  action text not null,
  target text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists stream_sessions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  twitch_stream_id text,
  title text,
  game_name text,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  peak_viewers integer not null default 0,
  avg_viewers integer not null default 0,
  follower_gain integer not null default 0
);

create table if not exists chat_messages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  twitch_user_id text,
  username text not null,
  display_color text,
  message text not null,
  is_mod boolean not null default false,
  is_sub boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists chat_messages_ws_created_idx on chat_messages (workspace_id, created_at desc);
create index if not exists activity_logs_ws_created_idx on activity_logs (workspace_id, created_at desc);
create index if not exists stream_sessions_ws_started_idx on stream_sessions (workspace_id, started_at desc);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table users enable row level security;
alter table users force row level security;
create policy users_self on users
  using (
    id = app_uid()
    or discord_id = app_discord_id()
    or id in (select user_id from workspace_members where workspace_id = app_ws())
  )
  with check (id = app_uid());

alter table workspaces enable row level security;
alter table workspaces force row level security;
create policy workspaces_access on workspaces
  using (
    id = app_ws()
    or owner_user_id = app_uid()
    or id in (select workspace_id from workspace_members where user_id = app_uid())
  )
  with check (owner_user_id = app_uid());

alter table workspace_members enable row level security;
alter table workspace_members force row level security;
create policy members_access on workspace_members
  using (workspace_id = app_ws() or user_id = app_uid())
  with check (workspace_id = app_ws() or user_id = app_uid());

alter table workspace_invitations enable row level security;
alter table workspace_invitations force row level security;
create policy invitations_access on workspace_invitations
  using (
    workspace_id = app_ws()
    or (status = 'pending' and app_discord_username() is not null and lower(discord_username) = app_discord_username())
    or (app_invite_token() is not null and token = app_invite_token())
  )
  with check (workspace_id = app_ws());

-- Tabelas estritamente vinculadas ao workspace
do $$
declare
  t text;
begin
  foreach t in array array[
    'twitch_connections','obs_settings','custom_commands','timers','automations',
    'automation_logs','giveaways','giveaway_entries','polls','poll_votes',
    'queue_entries','soundboard_sounds','button_layouts','custom_buttons',
    'activity_logs','stream_sessions','chat_messages'
  ]
  loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
    execute format(
      'create policy %I on %I using (workspace_id = app_ws()) with check (workspace_id = app_ws())',
      t || '_workspace_isolation', t
    );
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Privilégios do papel de runtime (as políticas continuam valendo)
-- ---------------------------------------------------------------------------
grant usage on schema public to sc_app;
grant select, insert, update, delete on all tables in schema public to sc_app;
grant execute on all functions in schema public to sc_app;
