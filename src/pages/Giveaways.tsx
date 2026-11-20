import { useState } from 'react';
import { Dices, Gift, Plus, Trash2, Users } from 'lucide-react';
import { useResource, useSubmit } from '../lib/hooks';
import { get, post } from '../lib/api';
import type { Giveaway } from '../lib/types';
import { Badge, Button, Card, ConfirmButton, EmptyState, ErrorBanner, Field, Input, Modal, PageHeader, Spinner } from '../components/ui';
import { formatDateTime } from '../lib/format';

type Entry = { id: string; username: string; entered_at: string };

export default function Giveaways() {
  const { items, loading, error, create, update, remove } = useResource<Giveaway>('giveaways');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: '', keyword: '!participar', winner_count: 1 });
  const [entriesFor, setEntriesFor] = useState<Giveaway | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [result, setResult] = useState<{ giveaway: string; winners: string[] } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const submit = useSubmit();

  const save = async () => {
    const ok = await submit.run(async () => {
      if (!form.title.trim()) throw new Error('Informe o título do sorteio.');
      if (!form.keyword.trim().startsWith('!')) throw new Error('A palavra-chave deve começar com !');
      await create({ ...form, status: 'open' });
      setForm({ title: '', keyword: '!participar', winner_count: 1 });
    });
    if (ok) setOpen(false);
  };

  const draw = async (giveaway: Giveaway) => {
    setActionError(null);
    try {
      const data = await post<{ winners: string[] }>(`/data/giveaways/${giveaway.id}/draw`);
      setResult({ giveaway: giveaway.title, winners: data.winners });
      await update(giveaway.id, {});
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Falha ao sortear');
    }
  };

  const showEntries = async (giveaway: Giveaway) => {
    setEntriesFor(giveaway);
    setEntries([]);
    try {
      const data = await get<{ entries: Entry[] }>(`/data/giveaways/${giveaway.id}/entries`);
      setEntries(data.entries);
    } catch {
      setEntries([]);
    }
  };

  return (
    <div className="animate-fade-up">
      <PageHeader
        title="Sorteios"
        subtitle="Participação pelo chat usando uma palavra-chave. O sorteio é aleatório e auditável."
        actions={
          <Button onClick={() => setOpen(true)}>
            <Plus size={15} /> Novo sorteio
          </Button>
        }
      />

      <ErrorBanner message={error ?? actionError} />

      {result ? (
        <Card className="mb-4 border-emerald-500/30 bg-emerald-500/[0.07] p-4">
          <p className="text-sm font-semibold text-white">Resultado de “{result.giveaway}”</p>
          <p className="mt-1 text-xs text-emerald-200">Vencedores: {result.winners.join(', ')}</p>
        </Card>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {loading ? <Spinner /> : null}
        {items.map((giveaway) => (
          <Card key={giveaway.id} className="p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-white">{giveaway.title}</p>
                <p className="mt-0.5 text-[11px] text-mist-400">
                  palavra <code className="rounded bg-white/[0.06] px-1 font-mono">{giveaway.keyword}</code> ·{' '}
                  {giveaway.winner_count} vencedor(es)
                </p>
              </div>
              <Badge tone={giveaway.status === 'open' ? 'success' : giveaway.status === 'drawn' ? 'primary' : 'neutral'}>
                {giveaway.status === 'open' ? 'aberto' : giveaway.status === 'drawn' ? 'sorteado' : 'encerrado'}
              </Badge>
            </div>

            {giveaway.winners?.length ? (
              <p className="mt-2 rounded-lg border border-white/[0.06] bg-white/[0.02] px-2.5 py-1.5 text-[11px] text-emerald-200">
                Vencedores: {giveaway.winners.join(', ')}
              </p>
            ) : null}

            <p className="mt-2 text-[10px] text-mist-500">criado em {formatDateTime(giveaway.created_at)}</p>

            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <Button variant="secondary" size="sm" onClick={() => void showEntries(giveaway)}>
                <Users size={13} /> Participantes
              </Button>
              {giveaway.status === 'open' ? (
                <Button size="sm" onClick={() => void draw(giveaway)}>
                  <Dices size={13} /> Sortear
                </Button>
              ) : null}
              {giveaway.status === 'open' ? (
                <Button variant="ghost" size="sm" onClick={() => void update(giveaway.id, { status: 'closed' })}>
                  Encerrar
                </Button>
              ) : null}
              <ConfirmButton onConfirm={() => void remove(giveaway.id)} confirmLabel="Excluir?">
                <Trash2 size={13} />
              </ConfirmButton>
            </div>
          </Card>
        ))}
      </div>

      {!loading && !items.length ? (
        <Card>
          <EmptyState
            icon={<Gift size={18} />}
            title="Nenhum sorteio criado"
            description="Crie um sorteio e divulgue a palavra-chave no chat. Cada pessoa entra uma única vez."
            action={<Button onClick={() => setOpen(true)}>Criar sorteio</Button>}
          />
        </Card>
      ) : null}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Novo sorteio"
        description="Os espectadores participam digitando a palavra-chave no chat."
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => void save()} disabled={submit.saving}>
              {submit.saving ? 'Criando…' : 'Criar sorteio'}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <ErrorBanner message={submit.error} />
          <Field label="Título">
            <Input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="Sorteio de skin" />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Palavra-chave">
              <Input value={form.keyword} onChange={(event) => setForm({ ...form, keyword: event.target.value })} />
            </Field>
            <Field label="Quantidade de vencedores">
              <Input
                type="number"
                min={1}
                value={form.winner_count}
                onChange={(event) => setForm({ ...form, winner_count: Number(event.target.value) })}
              />
            </Field>
          </div>
        </div>
      </Modal>

      <Modal open={Boolean(entriesFor)} onClose={() => setEntriesFor(null)} title={`Participantes · ${entriesFor?.title ?? ''}`}>
        {entries.length ? (
          <div className="space-y-1.5">
            {entries.map((entry, index) => (
              <div key={entry.id} className="flex items-center justify-between rounded-lg border border-white/[0.06] px-3 py-1.5 text-xs">
                <span className="text-mist-200">
                  {index + 1}. {entry.username}
                </span>
                <span className="text-[10px] text-mist-500">{formatDateTime(entry.entered_at)}</span>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState title="Nenhum participante ainda" description="Divulgue a palavra-chave no chat para receber inscrições." />
        )}
      </Modal>
    </div>
  );
}
