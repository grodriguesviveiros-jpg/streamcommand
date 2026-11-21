export type Permission =
  | 'dashboard.view'
  | 'chat.view'
  | 'chat.send'
  | 'chat.moderate'
  | 'commands.manage'
  | 'automations.manage'
  | 'timers.manage'
  | 'obs.control'
  | 'giveaways.manage'
  | 'polls.manage'
  | 'queue.manage'
  | 'soundboard.manage'
  | 'buttons.manage'
  | 'stats.view'
  | 'team.manage'
  | 'settings.manage'
  | 'twitch.manage';

export type User = {
  id: string;
  discord_id: string;
  username: string;
  global_name: string | null;
  avatar_url: string | null;
  email: string | null;
  created_at: string;
  last_login_at: string | null;
};

export type Workspace = {
  id: string;
  name: string;
  channel_name: string | null;
  display_name: string | null;
  logo_url: string | null;
  primary_color: string;
  secondary_color: string;
  preferences: Record<string, unknown>;
  role: string;
  permissions: Permission[];
};

export type Me = {
  user: User;
  workspaces: Workspace[];
  discordConfigured: boolean;
  twitchConfigured: boolean;
  appUrl: string;
};

export type LiveStatus = {
  connected: boolean;
  live: boolean;
  viewers?: number;
  startedAt?: string | null;
  title?: string | null;
  game?: string | null;
  thumbnailUrl?: string | null;
  followers?: number | null;
  error?: string;
  bot?: { chat: string; live: boolean; connected: boolean };
};

export type TwitchAccountType = 'streamer' | 'bot';

export type TwitchAccount = {
  id: string;
  twitchUserId: string;
  login: string;
  displayName: string | null;
  avatarUrl: string | null;
  broadcasterType: string | null;
  scopes: string[];
  status: 'active' | 'expired' | 'revoked' | 'error';
  connectedAt: string;
  expiresAt: string;
  missingScopes: string[];
};

export type TwitchBotStatus = {
  chat: string;
  live: boolean;
  connected: boolean;
  streamer?: boolean;
  bot?: boolean;
  events?: string;
  chatSender?: 'bot' | null;
  detail?: string | null;
};

export type TwitchConnectionInfo = {
  configured: boolean;
  redirectUri: string;
  bot: TwitchBotStatus;
  connections: {
    streamer: TwitchAccount | null;
    bot: TwitchAccount | null;
  };
  requiredScopes: {
    streamer: string[];
    bot: string[];
  };
  sameAccount?: boolean;
};

export type TwitchBotPermissions = {
  connected: boolean;
  streamerConnected: boolean;
  required: string[];
  granted: string[];
  missing: string[];
  channelBot: boolean;
  checkedLive: boolean;
  canSend: boolean;
  detail?: string;
};

export type ChatMessage = {
  id?: string;
  userId?: string;
  username: string;
  displayName: string;
  color: string | null;
  message: string;
  isMod: boolean;
  isSub: boolean;
  isBroadcaster?: boolean;
  createdAt: string;
};

export type Command = {
  id: string;
  name: string;
  response: string;
  cooldown_seconds: number;
  min_role: string;
  enabled: boolean;
  use_count: number;
  created_at: string;
};

export type Timer = {
  id: string;
  name: string;
  message: string;
  interval_seconds: number;
  only_when_live: boolean;
  enabled: boolean;
  last_sent_at: string | null;
  created_at: string;
};

export type Automation = {
  id: string;
  name: string;
  trigger_type: string;
  trigger_config: Record<string, unknown>;
  conditions: Record<string, unknown>;
  action_type: string;
  action_config: Record<string, unknown>;
  delay_seconds: number;
  enabled: boolean;
  run_count: number;
  created_at: string;
};

export type Giveaway = {
  id: string;
  title: string;
  keyword: string;
  status: string;
  winner_count: number;
  winners: string[];
  ends_at: string | null;
  created_at: string;
};

export type Poll = {
  id: string;
  question: string;
  options: { id: string; label: string }[];
  status: string;
  created_at: string;
};

export type QueueEntry = {
  id: string;
  username: string;
  note: string | null;
  position: number;
  status: string;
  created_at: string;
};

export type Sound = {
  id: string;
  name: string;
  category: string;
  file_path: string;
  volume: number;
  hotkey: string | null;
  size_bytes: number;
  created_at: string;
};

export type ActionButton = {
  id: string;
  label: string;
  icon: string;
  color: string;
  category: string;
  page: string;
  action_type: string;
  action_config: Record<string, unknown>;
  hotkey: string | null;
  sort_order: number;
};

export type Member = {
  id: string;
  user_id: string;
  role: string;
  permissions: Permission[];
  username: string;
  global_name: string | null;
  avatar_url: string | null;
  discord_id: string;
  created_at: string;
};

export type Invitation = {
  id: string;
  token: string;
  discord_username: string;
  role: string;
  permissions: Permission[];
  status: string;
  created_at: string;
  expires_at: string;
  workspace_name?: string;
  invited_by?: string;
};

export type StatsOverview = {
  days: number;
  messages: { day: string; count: number }[];
  sessions: {
    id: string;
    title: string | null;
    game_name: string | null;
    started_at: string;
    ended_at: string | null;
    peak_viewers: number;
    avg_viewers: number;
  }[];
  activity: {
    id: string;
    actor_name: string;
    action: string;
    target: string | null;
    created_at: string;
  }[];
  commands: { id: string; name: string; use_count: number }[];
  totals: {
    commands: number;
    automations: number;
    timers: number;
    messages: number;
    members: number;
    automation_runs: number;
  };
  live: (LiveStatus & { followers?: number | null }) | null;
  twitchConnected: boolean;
};
