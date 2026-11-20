import { useState } from 'react';
import { Plus, Timer as TimerIcon, Trash2 } from 'lucide-react';
import { useResource, useSubmit } from '../lib/hooks';
import type { Timer } from '../lib/types';
import { Badge, Button, Card, ConfirmButton, EmptyState, ErrorBanner, Field, Input, Modal, PageHeader, Spinner, Textarea, Toggle } from '../components/ui';
import { formatInterval, timeAgo } from '../lib/format';

type FormState = { name: string; message: string; interval_seconds: number; only_when_live: boolean; enabled: boolean };

const EMPTY: FormState = { name: '', message: '', interval_seconds: 600, only_when_live: true, enabled: true };

export default function Timers() {
  const { items, loading, error, create, update, remove } = useResource<Timer>('timers');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Timer | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const submit = useSubmit();

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY);
    setOpen(true);
  };

  const openEdit = (timer: Timer) => {
    setEditing(timer);
    setForm({
      name: timer.name,
      message: timer.message,
      interval_seconds: timer.interval_seconds,
      only_when_live: timer.only_when_live,
      enabled: timer.enabled,
    });
    setOpen(true);
  };

  const save = async () => {
    const ok = await submit.run(async () => {
      if (!form.name.trim() || !form.message.trim()) throw new Error('Informe nome e mensagem do timer.');
      if (form.interval_seconds < 30) throw new Error('O intervalo mínimo é de 30 segundos.');
      if (editing) await update(editing.id, form);
      else await create(form);
    });
    if (ok) setOpen(false);
  };

  return (
    <div className="animate-fade-up">
      <PageHeader
        title="Timers"
        subtitle="Mensagens automáticas enviadas ao chat em intervalos configuráveis."
        actions={
          <Button onClick={openCreate}>
            <Plus size={15} /> Novo timer
          </Button>
        }
      />

      <ErrorBanner message={error} />

      <Card>
        {loading ? (
          <Spinner />
        ) : items.length ? (
          <div className="divide-y divide-white/[0.05]">
            {items.map((timer) => (
              <div key={timer.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                <div className="min-w-[200px] flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-white">{timer.name}</p>
                    {timer.enabled ? <Badge tone="success">ativo</Badge> : <Badge tone="neutral">pausado</Badge>}
                    {timer.only_when_live ? <Badge tone="primary">só na live</Badge> : null}
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs text-mist-400">{timer.message}</p>
                </div>
                <div className="text-right text-[11px] text-mist-500">
                  <p>a cada {formatInterval(timer.interval_seconds)}</p>
                  <p>último envio: {timeAgo(timer.last_sent_at)}</p>
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="secondary" size="sm" onClick={() => openEdit(timer)}>
                    Editar
                  </Button>
                  <Toggle checked={timer.enabled} onChange={(value) => void update(timer.id, { enabled: value })} />
                  <ConfirmButton onConfirm={() => void remove(timer.id)} confirmLabel="Excluir?">
                    <Trash2 size={13} />
                  </ConfirmButton>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={<TimerIcon size={18} />}
            title="Nenhum timer configurado"
            description="Timers lembram a audiência das redes sociais, regras e comandos durante a live."
            action={<Button onClick={openCreate}>Criar timer</Button>}
          />
        )}
      </Card>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? 'Editar timer' : 'Novo timer'}
        description="O bot envia a mensagem quando o intervalo for atingido."
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => void save()} disabled={submit.saving}>
              {submit.saving ? 'Salvando…' : 'Salvar timer'}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <ErrorBanner message={submit.error} />
          <Field label="Nome">
            <Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Lembrete de redes" />
          </Field>
          <Field label="Mensagem enviada no chat">
            <Textarea
              value={form.message}
              onChange={(event) => setForm({ ...form, message: event.target.value })}
              placeholder="Siga nas redes: linktr.ee/seucanal"
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Intervalo (segundos)" hint="Mínimo de 30 segundos.">
              <Input
                type="number"
                min={30}
                value={form.interval_seconds}
                onChange={(event) => setForm({ ...form, interval_seconds: Number(event.target.value) })}
              />
            </Field>
            <div className="flex flex-col justify-center gap-3 pt-5">
              <Toggle
                checked={form.only_when_live}
                onChange={(value) => setForm({ ...form, only_when_live: value })}
                label="Enviar apenas durante a live"
              />
              <Toggle checked={form.enabled} onChange={(value) => setForm({ ...form, enabled: value })} label="Timer ativo" />
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
