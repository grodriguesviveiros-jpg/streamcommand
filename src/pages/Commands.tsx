import { useState } from 'react';
import { Plus, Terminal, Trash2 } from 'lucide-react';
import { useResource, useSubmit } from '../lib/hooks';
import type { Command } from '../lib/types';
import { Badge, Button, Card, ConfirmButton, EmptyState, ErrorBanner, Field, Input, Modal, PageHeader, Select, Spinner, Textarea, Toggle } from '../components/ui';
import { formatDateTime, ROLE_LABELS } from '../lib/format';

type FormState = { name: string; response: string; cooldown_seconds: number; min_role: string; enabled: boolean };

const EMPTY: FormState = { name: '', response: '', cooldown_seconds: 10, min_role: 'everyone', enabled: true };

export default function Commands() {
  const { items, loading, error, create, update, remove } = useResource<Command>('commands');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Command | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const submit = useSubmit();

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY);
    submit.setError(null);
    setOpen(true);
  };

  const openEdit = (command: Command) => {
    setEditing(command);
    setForm({
      name: command.name,
      response: command.response,
      cooldown_seconds: command.cooldown_seconds,
      min_role: command.min_role,
      enabled: command.enabled,
    });
    submit.setError(null);
    setOpen(true);
  };

  const save = async () => {
    const ok = await submit.run(async () => {
      const payload = { ...form, name: form.name.replace(/^!/, '').trim().toLowerCase() };
      if (!payload.name || !payload.response.trim()) throw new Error('Informe o comando e a resposta.');
      if (editing) await update(editing.id, payload);
      else await create(payload);
    });
    if (ok) setOpen(false);
  };

  return (
    <div className="animate-fade-up">
      <PageHeader
        title="Comandos personalizados"
        subtitle="Respostas automáticas no chat, com tempo de recarga e permissão mínima."
        actions={
          <Button onClick={openCreate}>
            <Plus size={15} /> Novo comando
          </Button>
        }
      />

      <ErrorBanner message={error} />

      <Card>
        {loading ? (
          <Spinner />
        ) : items.length ? (
          <div className="divide-y divide-white/[0.05]">
            {items.map((command) => (
              <div key={command.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                <div className="min-w-[160px] flex-1">
                  <div className="flex items-center gap-2">
                    <code className="rounded-md bg-white/[0.06] px-1.5 py-0.5 text-xs font-semibold text-white">
                      !{command.name}
                    </code>
                    {command.enabled ? <Badge tone="success">ativo</Badge> : <Badge tone="neutral">pausado</Badge>}
                    <Badge tone="primary">{ROLE_LABELS[command.min_role] ?? command.min_role}</Badge>
                  </div>
                  <p className="mt-1 line-clamp-1 text-xs text-mist-400">{command.response}</p>
                </div>
                <div className="text-right text-[11px] text-mist-500">
                  <p>{command.cooldown_seconds}s de recarga</p>
                  <p>
                    {command.use_count} usos
                    {command.created_at ? ` · ${formatDateTime(command.created_at)}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="secondary" size="sm" onClick={() => openEdit(command)}>
                    Editar
                  </Button>
                  <Toggle
                    checked={command.enabled}
                    onChange={(value) => void update(command.id, { enabled: value })}
                  />
                  <ConfirmButton onConfirm={() => void remove(command.id)} confirmLabel="Excluir?">
                    <Trash2 size={13} />
                  </ConfirmButton>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={<Terminal size={18} />}
            title="Nenhum comando criado"
            description="Crie comandos como !discord, !redes e !setup para responder automaticamente no chat."
            action={<Button onClick={openCreate}>Criar primeiro comando</Button>}
          />
        )}
      </Card>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? 'Editar comando' : 'Novo comando'}
        description="O bot responde quando a mensagem começar com o nome do comando."
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => void save()} disabled={submit.saving}>
              {submit.saving ? 'Salvando…' : 'Salvar comando'}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <ErrorBanner message={submit.error} />
          <Field label="Nome do comando" hint="Sem o ponto de exclamação. Ex.: discord">
            <Input
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              placeholder="discord"
            />
          </Field>
          <Field label="Resposta" hint="Máximo de 500 caracteres por mensagem no chat.">
            <Textarea
              value={form.response}
              onChange={(event) => setForm({ ...form, response: event.target.value })}
              placeholder="Entre no nosso Discord: discord.gg/exemplo"
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Recarga (segundos)">
              <Input
                type="number"
                min={0}
                value={form.cooldown_seconds}
                onChange={(event) => setForm({ ...form, cooldown_seconds: Number(event.target.value) })}
              />
            </Field>
            <Field label="Permissão mínima">
              <Select value={form.min_role} onChange={(event) => setForm({ ...form, min_role: event.target.value })}>
                <option value="everyone">Todos</option>
                <option value="subscriber">Inscritos</option>
                <option value="moderator">Moderadores</option>
                <option value="broadcaster">Somente o streamer</option>
              </Select>
            </Field>
          </div>
          <Toggle checked={form.enabled} onChange={(value) => setForm({ ...form, enabled: value })} label="Comando ativo" />
        </div>
      </Modal>
    </div>
  );
}
