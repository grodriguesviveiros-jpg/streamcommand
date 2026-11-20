export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return new Intl.NumberFormat('pt-BR').format(value);
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium' }).format(new Date(value));
}

export function timeAgo(value: string | null | undefined): string {
  if (!value) return '—';
  const diff = Date.now() - new Date(value).getTime();
  const minutes = Math.round(diff / 60_000);
  if (minutes < 1) return 'agora';
  if (minutes < 60) return `${minutes} min atrás`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h atrás`;
  const days = Math.round(hours / 24);
  return `${days} d atrás`;
}

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '—';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}min`;
  return `${m}min`;
}

export function formatInterval(seconds: number): string {
  if (seconds % 3600 === 0) return `${seconds / 3600} h`;
  if (seconds % 60 === 0) return `${seconds / 60} min`;
  return `${seconds} s`;
}

export function liveDuration(startedAt: string | null | undefined): string {
  if (!startedAt) return '—';
  return formatDuration((Date.now() - new Date(startedAt).getTime()) / 1000);
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
}

export const ACTION_LABELS: Record<string, string> = {
  chat_message: 'Enviar mensagem no chat',
  timeout_user: 'Suspender usuário',
  add_queue: 'Adicionar à fila',
  run_command: 'Executar comando',
  obs_scene: 'Trocar cena do OBS',
  play_sound: 'Reproduzir som',
  obs_record: 'Iniciar/parar gravação',
};

export const TRIGGER_LABELS: Record<string, string> = {
  follow: 'Novo seguidor',
  subscribe: 'Nova inscrição',
  raid: 'Raid recebida',
  chat_message: 'Palavra no chat',
  stream_online: 'Live iniciada',
  stream_offline: 'Live encerrada',
};

export const ROLE_LABELS: Record<string, string> = {
  owner: 'Proprietário',
  admin: 'Administrador',
  moderator: 'Moderador',
  operator: 'Operador',
  viewer: 'Visualizador',
  everyone: 'Todos',
  subscriber: 'Inscritos',
  broadcaster: 'Streamer',
};

export const PERMISSION_LABELS: Record<string, string> = {
  'dashboard.view': 'Visualizar dashboard',
  'chat.view': 'Acessar chat',
  'chat.send': 'Enviar mensagens',
  'chat.moderate': 'Moderar chat',
  'commands.manage': 'Gerenciar comandos',
  'automations.manage': 'Executar automações',
  'timers.manage': 'Gerenciar timers',
  'obs.control': 'Controlar OBS',
  'giveaways.manage': 'Criar sorteios',
  'polls.manage': 'Criar enquetes',
  'queue.manage': 'Gerenciar fila',
  'soundboard.manage': 'Gerenciar soundboard',
  'buttons.manage': 'Gerenciar botões',
  'stats.view': 'Visualizar estatísticas',
  'team.manage': 'Gerenciar equipe',
  'settings.manage': 'Modificar configurações',
  'twitch.manage': 'Gerenciar conta Twitch',
};
