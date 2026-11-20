import { useState } from 'react';
import { BarChart3, Plus, Trash2, X } from 'lucide-react';
import { useResource, useSubmit } from '../lib/hooks';
import { get, post } from '../lib/api';
import type { Poll } from '../lib/types';
import { Badge, Button, Card, ConfirmButton, EmptyState, ErrorBanner, Field, Input, Modal, PageHeader, Spinner } from '../components/ui';
import { formatDateTime } from '../lib/format';

type Results = { poll: Poll; results: { id: string; label: string; votes: number }[]; total: number };

export default function Polls() {
  const { items, loading, error, create, update, remove } = useResource<Poll>('polls');
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '', '']);
  const [results, setResults] = useState<Results | null>(null);
  const [resultsFor, setResultsFor] = useState<Poll | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const submit = useSubmit();

  const save = async () => {
    const ok = await submit.run(async () => {
      const labels = options.map((option) => option.trim()).filter(Boolean);
      if (!question.trim()) throw new Error('Informe a pergunta da enquete.');
      if (labels.length < 2) throw new Error('Adicione pelo menos duas opções.');
      await create({
        question,
        options: labels.map((label, index) => ({ id: `opt-${index + 1}`, label })),
        status: 'open',
      });
      setQuestion('');
      setOptions(['', '', '']);
    });
    if (ok) setOpen(false);
  };

  const openResults = async (poll: Poll) => {
    setResultsFor(poll);
    setResults(null);
    setActionError(null);
    try {
      setResults(await get<Results>(`/data/polls/${poll.id}/results`));
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Falha ao carregar resultados');
    }
  };

  const close = async (poll: Poll) => {
    try {
      await post(`/data/polls/${poll.id}/close`);
      await update(poll.id, {});
      if (resultsFor?.id === poll.id) await openResults(poll);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Falha ao encerrar enquete');
    }
  };

  return (
    <div className="animate-fade-up">
      <PageHeader
        title="Enquetes"
        subtitle="Votação pelo chat com !voto 1, !voto 2… e resultados em tempo real."
        actions={
          <Button onClick={() => setOpen(true)}>
            <Plus size={15} /> Nova enquete
          </Button>
        }
      />

      <ErrorBanner message={error ?? actionError} />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {loading ? <Spinner /> : null}
        {items.map((poll) => (
          <Card key={poll.id} className="p-4">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-semibold text-white">{poll.question}</p>
              <Badge tone={poll.status === 'open' ? 'success' : 'neutral'}>
                {poll.status === 'open' ? 'aberta' : 'encerrada'}
              </Badge>
            </div>
            <ul className="mt-2 space-y-1">
              {poll.options?.map((option, index) => (
                <li key={option.id} className="text-[11px] text-mist-400">
                  <span className="font-mono text-mist-300">!voto {index + 1}</span> · {option.label}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[10px] text-mist-500">{formatDateTime(poll.created_at)}</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <Button variant="secondary" size="sm" onClick={() => void openResults(poll)}>
                <BarChart3 size={13} /> Resultados
              </Button>
              {poll.status === 'open' ? (
                <Button variant="ghost" size="sm" onClick={() => void close(poll)}>
                  <X size={13} /> Encerrar
                </Button>
              ) : null}
              <ConfirmButton onConfirm={() => void remove(poll.id)} confirmLabel="Excluir?">
                <Trash2 size={13} />
              </ConfirmButton>
            </div>
          </Card>
        ))}
      </div>

      {!loading && !items.length ? (
        <Card>
          <EmptyState
            icon={<BarChart3 size={18} />}
            title="Nenhuma enquete criada"
            description="Enquetes ajudam a decidir o próximo jogo, o próximo conteúdo ou o próximo mapa."
            action={<Button onClick={() => setOpen(true)}>Criar enquete</Button>}
          />
        </Card>
      ) : null}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Nova enquete"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => void save()} disabled={submit.saving}>
              {submit.saving ? 'Criando…' : 'Criar enquete'}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <ErrorBanner message={submit.error} />
          <Field label="Pergunta">
            <Input value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Qual jogo na próxima live?" />
          </Field>
          <div className="space-y-2">
            <span className="label">Opções</span>
            {options.map((option, index) => (
              <Input
                key={index}
                value={option}
                placeholder={`Opção ${index + 1}`}
                onChange={(event) => {
                  const next = [...options];
                  next[index] = event.target.value;
                  setOptions(next);
                }}
              />
            ))}
            <Button variant="ghost" size="sm" onClick={() => setOptions([...options, ''])}>
              <Plus size={13} /> Adicionar opção
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={Boolean(resultsFor)} onClose={() => setResultsFor(null)} title="Resultados da enquete">
        {results ? (
          <div className="space-y-3">
            <p className="text-sm font-semibold text-white">{results.poll.question}</p>
            <p className="text-xs text-mist-400">{results.total} voto(s) registrados</p>
            <div className="space-y-2">
              {results.results.map((option) => {
                const percent = results.total ? Math.round((option.votes / results.total) * 100) : 0;
                return (
                  <div key={option.id}>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-mist-200">{option.label}</span>
                      <span className="text-mist-400">
                        {option.votes} · {percent}%
                      </span>
                    </div>
                    <div className="mt-1 h-2 overflow-hidden rounded-full bg-white/[0.06]">
                      <div className="h-full rounded-full" style={{ width: `${percent}%`, background: 'var(--primary)' }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <Spinner label="Calculando votos…" />
        )}
      </Modal>
    </div>
  );
}
