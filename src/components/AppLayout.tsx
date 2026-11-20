import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  BarChart3,
  Bell,
  ChevronDown,
  Command,
  Gift,
  LayoutDashboard,
  ListOrdered,
  LogOut,
  Menu,
  MessagesSquare,
  MonitorPlay,
  Settings,
  SlidersHorizontal,
  Terminal,
  Timer,
  TrendingUp,
  Users,
  Volume2,
  Workflow,
  X,
} from 'lucide-react';
import { useApp } from '../state/AppContext';
import { Badge, Dot } from './ui';
import { initials, ROLE_LABELS } from '../lib/format';

type NavItem = { to: string; label: string; icon: typeof LayoutDashboard; permission: string; end?: boolean };

const NAV: { group: string; items: NavItem[] }[] = [
  {
    group: 'Painel',
    items: [{ to: '/app', label: 'Dashboard', icon: LayoutDashboard, permission: 'dashboard.view', end: true }],
  },
  {
    group: 'Transmissão',
    items: [
      { to: '/app/chat', label: 'Chat ao vivo', icon: MessagesSquare, permission: 'chat.view' },
      { to: '/app/obs', label: 'OBS Studio', icon: MonitorPlay, permission: 'obs.control' },
    ],
  },
  {
    group: 'Engajamento',
    items: [
      { to: '/app/sorteios', label: 'Sorteios', icon: Gift, permission: 'giveaways.manage' },
      { to: '/app/enquetes', label: 'Enquetes', icon: BarChart3, permission: 'polls.manage' },
      { to: '/app/fila', label: 'Fila de jogadores', icon: ListOrdered, permission: 'queue.manage' },
    ],
  },
  {
    group: 'Automação',
    items: [
      { to: '/app/comandos', label: 'Comandos', icon: Terminal, permission: 'commands.manage' },
      { to: '/app/automacoes', label: 'Automações', icon: Workflow, permission: 'automations.manage' },
      { to: '/app/timers', label: 'Timers', icon: Timer, permission: 'timers.manage' },
    ],
  },
  {
    group: 'Ferramentas',
    items: [
      { to: '/app/soundboard', label: 'Soundboard', icon: Volume2, permission: 'soundboard.manage' },
      { to: '/app/botoes', label: 'Central de botões', icon: SlidersHorizontal, permission: 'buttons.manage' },
    ],
  },
  {
    group: 'Gestão',
    items: [
      { to: '/app/estatisticas', label: 'Estatísticas', icon: TrendingUp, permission: 'stats.view' },
      { to: '/app/equipe', label: 'Equipe', icon: Users, permission: 'team.manage' },
      { to: '/app/configuracoes', label: 'Configurações', icon: Settings, permission: 'settings.manage' },
    ],
  },
];

export default function AppLayout() {
  const { workspace, workspaces, selectWorkspace, user, can, logout, realtimeConnected } = useApp();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  const nav = (
    <nav className="flex-1 space-y-5 overflow-y-auto px-3 pb-4">
      {NAV.map((group) => {
        const items = group.items.filter((item) => can(item.permission));
        if (!items.length) return null;
        return (
          <div key={group.group}>
            <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-mist-500">
              {group.group}
            </p>
            <div className="space-y-0.5">
              {items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  onClick={() => setOpen(false)}
                  className={({ isActive }) => `nav-link ${isActive ? 'nav-link-active' : ''}`}
                >
                  <item.icon size={16} className="shrink-0" />
                  <span className="truncate">{item.label}</span>
                </NavLink>
              ))}
            </div>
          </div>
        );
      })}
    </nav>
  );

  const brand = (
    <div className="flex items-center gap-2.5 px-4 py-5">
      <div
        className="grid h-9 w-9 place-items-center rounded-xl text-white shadow-glow"
        style={{ background: 'linear-gradient(135deg, var(--primary), var(--secondary))' }}
      >
        <Command size={18} />
      </div>
      <div className="min-w-0">
        <p className="truncate text-[13px] font-bold tracking-[0.12em] text-white">STREAM COMMAND</p>
        <p className="text-[10px] uppercase tracking-[0.2em] text-mist-500">SmartFountain</p>
      </div>
    </div>
  );

  const switcher = (
    <div className="px-3 pb-4">
      <div className="relative">
        <select
          value={workspace?.id ?? ''}
          onChange={(event) => {
            selectWorkspace(event.target.value);
            navigate('/app');
          }}
          className="w-full appearance-none rounded-xl border border-white/10 bg-ink-800/80 px-3 py-2 pr-8 text-xs font-medium text-mist-100 outline-none focus:border-white/25"
        >
          {workspaces.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
        <ChevronDown size={14} className="pointer-events-none absolute right-2.5 top-2.5 text-mist-400" />
      </div>
      {workspace ? (
        <p className="mt-1.5 px-1 text-[10px] uppercase tracking-wider text-mist-500">
          {ROLE_LABELS[workspace.role] ?? workspace.role}
          {workspace.channel_name ? ` · twitch.tv/${workspace.channel_name}` : ' · Twitch não conectada'}
        </p>
      ) : null}
    </div>
  );

  const footer = (
    <div className="border-t border-white/[0.06] px-3 py-3">
      <div className="flex items-center gap-2.5 rounded-xl px-2 py-1.5">
        {user?.avatar_url ? (
          <img src={user.avatar_url} alt={user.username} className="h-8 w-8 rounded-full border border-white/10" />
        ) : (
          <div className="grid h-8 w-8 place-items-center rounded-full bg-white/10 text-[11px] font-semibold">
            {initials(user?.global_name || user?.username || 'SC')}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold text-white">{user?.global_name || user?.username}</p>
          <p className="truncate text-[10px] text-mist-500">@{user?.username}</p>
        </div>
        <button type="button" onClick={() => void logout()} className="btn-ghost p-1.5" aria-label="Sair">
          <LogOut size={14} />
        </button>
      </div>
      <div className="mt-2 flex items-center justify-between px-2">
        <span className="watermark">SmartFountain</span>
        <span className="flex items-center gap-1 text-[10px] text-mist-500">
          <Dot tone={realtimeConnected ? 'success' : 'warning'} pulse={realtimeConnected} />
          {realtimeConnected ? 'tempo real' : 'reconectando'}
        </span>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[var(--sidebar-width)] flex-col border-r border-white/[0.06] bg-ink-900/80 backdrop-blur-xl lg:flex">
        {brand}
        {switcher}
        {nav}
        {footer}
      </aside>

      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/70" onClick={() => setOpen(false)} />
          <aside className="animate-fade-up absolute inset-y-0 left-0 flex w-[280px] flex-col border-r border-white/10 bg-ink-900">
            <div className="flex items-center justify-between">
              {brand}
              <button type="button" onClick={() => setOpen(false)} className="btn-ghost mr-2 p-1.5">
                <X size={16} />
              </button>
            </div>
            {switcher}
            {nav}
            {footer}
          </aside>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col lg:pl-[var(--sidebar-width)]">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-white/[0.06] bg-ink-950/80 px-4 py-3 backdrop-blur-xl sm:px-6">
          <button type="button" onClick={() => setOpen(true)} className="btn-ghost p-1.5 lg:hidden">
            <Menu size={18} />
          </button>
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <span className="truncate text-sm font-semibold text-white">{workspace?.name ?? 'Workspace'}</span>
            {workspace?.channel_name ? (
              <Badge tone="primary">twitch.tv/{workspace.channel_name}</Badge>
            ) : (
              <Badge tone="warning">Twitch pendente</Badge>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <NavLink to="/app/configuracoes" className="btn-ghost p-2" aria-label="Configurações">
              <Settings size={16} />
            </NavLink>
            <NavLink to="/app/equipe" className="btn-ghost relative p-2" aria-label="Equipe">
              <Bell size={16} />
            </NavLink>
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
