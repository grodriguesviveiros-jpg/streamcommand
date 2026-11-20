import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { get, post, setActiveWorkspace } from '../lib/api';
import type { ChatMessage, Me, Workspace } from '../lib/types';

export type RealtimeEvent = { type: string; data: Record<string, unknown>; at: number };

type AppContextValue = {
  me: Me | null;
  user: Me['user'] | null;
  workspaces: Workspace[];
  workspace: Workspace | null;
  loading: boolean;
  error: string | null;
  can: (permission: string) => boolean;
  selectWorkspace: (id: string) => void;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
  events: RealtimeEvent[];
  chat: ChatMessage[];
  clearChat: () => void;
  realtimeConnected: boolean;
};

const AppContext = createContext<AppContextValue | null>(null);

const STORAGE_KEY = 'stream-command:workspace';
const EVENT_TYPES = [
  'chat.message',
  'bot.status',
  'bot.eventsub',
  'twitch.event',
  'twitch.live',
  'giveaway.entry',
  'poll.vote',
  'automation.run',
];

export function AppProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [events, setEvents] = useState<RealtimeEvent[]>([]);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const sourceRef = useRef<EventSource | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await get<Me>('/auth/me');
      setMe(data);
      setError(null);
      const stored = localStorage.getItem(STORAGE_KEY);
      const next = data.workspaces.find((w) => w.id === stored) ?? data.workspaces[0] ?? null;
      setActiveId(next?.id ?? null);
      setActiveWorkspace(next?.id ?? null);
    } catch (err) {
      setMe(null);
      setActiveId(null);
      setActiveWorkspace(null);
      setError(err instanceof Error ? err.message : 'Falha ao carregar sessão');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const workspace = useMemo(
    () => me?.workspaces.find((w) => w.id === activeId) ?? me?.workspaces[0] ?? null,
    [me, activeId],
  );

  // Identidade visual do workspace vira variáveis CSS globais.
  useEffect(() => {
    if (!workspace) return;
    document.documentElement.style.setProperty('--primary', workspace.primary_color);
    document.documentElement.style.setProperty('--secondary', workspace.secondary_color);
  }, [workspace]);

  // Canal de eventos em tempo real (chat, eventos Twitch, bot).
  useEffect(() => {
    if (!me) return;
    const source = new EventSource('/api/realtime');
    sourceRef.current = source;

    source.addEventListener('ready', () => setRealtimeConnected(true));
    for (const type of EVENT_TYPES) {
      source.addEventListener(type, (event) => {
        try {
          const payload = JSON.parse((event as MessageEvent).data) as Record<string, unknown>;
          setEvents((prev) => [{ type, data: payload, at: Date.now() }, ...prev].slice(0, 120));
          if (type === 'chat.message') {
            setChat((prev) => [...prev, payload as unknown as ChatMessage].slice(-200));
          }
        } catch {
          /* ignora payload inválido */
        }
      });
    }
    source.onerror = () => setRealtimeConnected(false);

    return () => {
      source.close();
      sourceRef.current = null;
      setRealtimeConnected(false);
    };
  }, [me]);

  const selectWorkspace = useCallback((id: string) => {
    localStorage.setItem(STORAGE_KEY, id);
    setActiveId(id);
    setActiveWorkspace(id);
    setEvents([]);
    setChat([]);
  }, []);

  const can = useCallback(
    (permission: string) => Boolean(workspace?.permissions.includes(permission as never)),
    [workspace],
  );

  const logout = useCallback(async () => {
    await post('/auth/logout');
    setMe(null);
    setActiveWorkspace(null);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  const value: AppContextValue = {
    me,
    user: me?.user ?? null,
    workspaces: me?.workspaces ?? [],
    workspace,
    loading,
    error,
    can,
    selectWorkspace,
    refresh: load,
    logout,
    events,
    chat,
    clearChat: () => setChat([]),
    realtimeConnected,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp precisa estar dentro de AppProvider');
  return context;
}
