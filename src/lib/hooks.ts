import { useCallback, useEffect, useState } from 'react';
import { del, get, patch, post } from '../lib/api';
import { useApp } from '../state/AppContext';

/** Carrega um endpoint da API e recarrega quando o workspace ativo muda. */
export function useApi<T>(path: string | null) {
  const { workspace } = useApp();
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(Boolean(path));
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!path) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setData(await get<T>(path));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar dados');
    } finally {
      setLoading(false);
    }
  }, [path, workspace?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  return { data, loading, error, reload: load, setData };
}

type WithId = { id: string };

/** CRUD sobre um recurso do workspace (/api/data/:name). */
export function useResource<T extends WithId>(name: string) {
  const { data, loading, error, reload } = useApi<{ items: T[] }>(`/data/${name}`);
  const items = data?.items ?? [];

  const create = useCallback(
    async (body: Record<string, unknown>) => {
      const result = await post<{ item: T }>(`/data/${name}`, body);
      await reload();
      return result.item;
    },
    [name, reload],
  );

  const update = useCallback(
    async (id: string, body: Record<string, unknown>) => {
      await patch(`/data/${name}/${id}`, body);
      await reload();
    },
    [name, reload],
  );

  const remove = useCallback(
    async (id: string) => {
      await del(`/data/${name}/${id}`);
      await reload();
    },
    [name, reload],
  );

  return { items, loading, error, reload, create, update, remove };
}

/** Estado de formulário simples com mensagens de erro. */
export function useSubmit() {
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async (action: () => Promise<void>, success?: string) => {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await action();
      if (success) setMessage(success);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível concluir a ação');
      return false;
    } finally {
      setSaving(false);
    }
  }, []);

  return { saving, message, error, run, setMessage, setError };
}
