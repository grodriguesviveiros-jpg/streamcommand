/** Catálogo de permissões individuais de um membro da equipe. */
export const PERMISSIONS = [
  { key: 'dashboard.view', label: 'Visualizar dashboard', group: 'Painel' },
  { key: 'chat.view', label: 'Acessar chat', group: 'Chat' },
  { key: 'chat.send', label: 'Enviar mensagens', group: 'Chat' },
  { key: 'chat.moderate', label: 'Moderar chat', group: 'Chat' },
  { key: 'commands.manage', label: 'Gerenciar comandos', group: 'Automação' },
  { key: 'automations.manage', label: 'Executar automações', group: 'Automação' },
  { key: 'timers.manage', label: 'Gerenciar timers', group: 'Automação' },
  { key: 'obs.control', label: 'Controlar OBS', group: 'Transmissão' },
  { key: 'giveaways.manage', label: 'Criar sorteios', group: 'Engajamento' },
  { key: 'polls.manage', label: 'Criar enquetes', group: 'Engajamento' },
  { key: 'queue.manage', label: 'Gerenciar fila', group: 'Engajamento' },
  { key: 'soundboard.manage', label: 'Gerenciar soundboard', group: 'Ferramentas' },
  { key: 'buttons.manage', label: 'Gerenciar botões', group: 'Ferramentas' },
  { key: 'stats.view', label: 'Visualizar estatísticas', group: 'Análise' },
  { key: 'team.manage', label: 'Gerenciar equipe', group: 'Gestão' },
  { key: 'settings.manage', label: 'Modificar configurações', group: 'Gestão' },
  { key: 'twitch.manage', label: 'Gerenciar conta Twitch', group: 'Integrações' },
] as const;

export type Permission = (typeof PERMISSIONS)[number]['key'];

export const ALL_PERMISSIONS = PERMISSIONS.map((p) => p.key) as Permission[];

export const ROLES = [
  { value: 'admin', label: 'Administrador' },
  { value: 'moderator', label: 'Moderador' },
  { value: 'operator', label: 'Operador' },
  { value: 'viewer', label: 'Visualizador' },
] as const;

export type Member = { role: string; permissions: string[] };

/** O proprietário tem acesso total; os demais apenas o que foi concedido. */
export function permissionsOf(member: Member): Permission[] {
  if (member.role === 'owner') return ALL_PERMISSIONS;
  const granted = new Set(member.permissions ?? []);
  return ALL_PERMISSIONS.filter((p) => granted.has(p));
}

export function hasPermission(member: Member, permission: Permission): boolean {
  return permissionsOf(member).includes(permission);
}

/**
 * Regra de não-escalonamento: ninguém concede permissões que não possui.
 */
export function canGrant(actor: Member, requested: string[]): boolean {
  const owned = new Set(permissionsOf(actor));
  return requested.every((p) => owned.has(p as Permission));
}

export function sanitizePermissions(requested: unknown): Permission[] {
  if (!Array.isArray(requested)) return [];
  const valid = new Set(ALL_PERMISSIONS);
  return [...new Set(requested.filter((p): p is Permission => typeof p === 'string' && valid.has(p as Permission)))];
}
