import { useState } from 'react';
import { ArrowDown, ArrowUp, Check, ListOrdered, Plus, Trash2 } from 'lucide-react';
import { useResource, useSubmit } from '../lib/hooks';
import { post } from '../lib/api';
import type { QueueEntry } from '../lib/types';
import { Badge, Button, Card, ConfirmButton, EmptyState, ErrorBanner, Field, Input, PageHeader, Spinner, Toggle } from '../components/ui';
import { timeAgo } from '../lib/format';

export default function Queue() {
  const { items, loading, error, create, update, remove, reload } = useResource<QueueEntry>('queue');
  const [username, setUsername] = useState('');
  const [note, setNote] = useState('');
  const [showServed, setShowServed] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const submit = useSubmit();

  const waiting = items.filter((entry) => entry.status === 'waiting');
  const served = items.filter((entry) => entry.status === 'served');
  const visible = showServed ? served : waiting;

  const add = async () => {
    const ok = await submit.run(async () => {
      if (!username.trim()) throw new Error('Informe o nome do participante.');
      await create({
        username: username.trim(),
        note: note.trim() || null,
        position: waiting.length + 1,
        status: 'waiting',
      });
      setUsername('');
      setNote('');
    });
    if (!ok) return;
  };

  const move = async (index: number, direction: -1 | 1) => {
    const next = [...waiting];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    try {
      await post('/data/queue/reorder', { ids: next.map((entry) => entry.id) });
      await reload();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Falha ao reordenar');
    }
  };

  const serve = async (entry: QueueEntry) => {
    try {
      await post(`/data/queue/${entry.id}/serve`);
      await reload();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Falha ao marcar como atendido');
    }
  };

  return (
    <div className="animate-fade-up">
      <PageHeader
        title="Fila de jogadores"
        subtitle="Organize quem vai jogar com você. O chat também pode consultar a fila com !fila."
        actions={<Toggle checked={showServed} onChange={setShowServed} label="Mostrar atendidos" />}
      />

      <ErrorBanner message={error ?? actionError} />

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <Card>
          <div className="panel-head">
            <h2 className="text-sm font-semibold text-white">{showServed ? 'Atendidos' : 'Na fila'}</h2>
            <Badge tone="primary">{visible.length}</Badge>
          </div>
          {loading ? (
            <Spinner />
          ) : visible.length ? (
            <div className="divide-y divide-white/[0.05]">
              {visible.map((entry, index) => (
                <div key={entry.id} className="flex items-center gap-3 px-5 py-3">
                  <span className="grid h-7 w-7 place-items-center rounded-lg bg-white/[0.06] text-xs font-semibold text-mist-200">
                    {showServed ? '✓' : index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-white">{entry.username}</p>
                    <p className="text-[11px] text-mist-500">
                      {entry.note ? `${entry.note} · ` : ''}
                      {timeAgo(entry.created_at)}
                    </p>
                  </div>
                  {!showServed ? (
                    <div className="flex items-center gap-1">
                      <button type="button" onClick={() => void move(index, -1)} className="btn-ghost p-1" aria-label="Subir">
                        <ArrowUp size={13} />
                      </button>
                      <button type="button" onClick={() => void move(index, 1)} className="btn-ghost p-1" aria-label="Descer">
                        <ArrowDown size={13} />
                      </button>
                      <Button variant="secondary" size="sm" onClick={() => void serve(entry)}>
                        <Check size={13} /> Atendeu
                      </Button>
                      <ConfirmButton onConfirm={() => void remove(entry.id)} confirmLabel="Remover?">
                        <Trash2 size={13} />
                      </ConfirmButton>
                    </div>
                  ) : (
                    <ConfirmButton onConfirm={() => void remove(entry.id)} confirmLabel="Remover?">
                      <Trash2 size={13} />
                    </ConfirmButton>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={<ListOrdered size={18} />}
              title={showServed ? 'Ninguém atendido ainda' : 'Fila vazia'}
              description="Adicione participantes manualmente ou use a automação “Adicionar à fila”."
            />
          )}
        </Card>

        <Card className="h-fit p-4">
          <p className="text-sm font-semibold text-white">Adicionar participante</p>
          <div className="mt-3 space-y-3">
            <ErrorBanner message={submit.error} />
            <Field label="Nome">
              <Input value={username} onChange={(event) => setUsername(event.target.value)} placeholder="Nome no jogo" />
            </Field>
            <Field label="Observação (opcional)">
              <Input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Plataforma, nick…" />
            </Field>
            <Button className="w-full" onClick={() => void add()} disabled={submit.saving}>
              <Plus size={15} /> Adicionar à fila
            </Button>
          </div>
          <div className="mt-4 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 text-[11px] leading-relaxed text-mist-400">
            <p className="font-semibold text-mist-200">Automação sugerida</p>
            <p className="mt-1">
              Crie uma automação com gatilho “Palavra no chat” e ação “Adicionar à fila” para que os espectadores entrem
              digitando <code className="font-mono">!entrar</code>.
            </p>
          </div>
          {served.length ? (
            <button type="button" onClick={() => setShowServed(true)} className="mt-3 text-[11px] text-mist-400 underline-offset-2 hover:underline">
              {served.length} participante(s) atendido(s)
            </button>
          ) : null}
        </Card>
      </div>
    </div>
  );
}
