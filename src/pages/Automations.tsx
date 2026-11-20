import { useState } from 'react';
import { History, Plus, Trash2, Workflow } from 'lucide-react';
import { useResource, useSubmit } from '../lib/hooks';
import { get } from '../lib/api';
import type { Automation } from '../lib/types';
import { Badge, Button, Card, ConfirmButton, EmptyState, ErrorBanner, Field, Input, Modal, PageHeader, Select, Spinner, Textarea, Toggle } from '../components/ui';
import { ACTION_LABELS, formatDateTime, TRIGGER_LABELS } from '../lib/format';

type LogRow = { id: string; action_result: string | null; status: string; created_at: string };

type FormState = {
  name: string;
  trigger_type: string;
  keyword: string;
  min_viewers: number;
  action_type: string;
  message: string;
  duration: number;
  reason: string;
  delay_seconds: number;
  enabled: boolean;
};

const EMPTY: FormState = {
  name: '',
  trigger_type: 'follow',
  keyword: '',
  min_viewers: 0,
  action_type: 'chat_message',
  message: '',
  duration: 600,
  reason: 'automação',
  delay_seconds: 0,
  enabled: true,
};

const TRIGGERS = ['follow', 'subscribe', 'raid', 'chat_message'];
const ACTIONS = ['chat_message', 'timeout_user', 'add_queue', 'run_command'];

export default function Automations() {
  const { items, loading, error, create, update, remove } = useResource<Automation>('automations');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Automation | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [logsFor, setLogsFor] = useState<Automation | null>(null);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const submit = useSubmit();

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY);
    setOpen(true);
  };

  const openEdit = (automation: Automation) => {
    setEditing(automation);
    setForm({
      name: automation.name,
      trigger_type: automation.trigger_type,
      keyword: String(automation.trigger_config?.keyword ?? ''),
      min_viewers: Number(automation.conditions?.min_viewers ?? 0),
      action_type: automation.action_type,
      message: String(automation.action_config?.message ?? automation.action_config?.command ?? ''),
      duration: Number(automation.action_config?.duration ?? 600),
      reason: String(automation.action_config?.reason ?? 'automação'),
      delay_seconds: automation.delay_seconds,
      enabled: automation.enabled,
    });
    setOpen(true);
  };

  const save = async () => {
    const ok = await submit.run(async () => {
      if (!form.name.trim()) throw new Error('Dê um nome para a automação.');
      if (form.trigger_type === 'chat_message' && !form.keyword.trim())
        throw new Error('Informe a palavra que dispara a automação.');
      if (['chat_message', 'run_command'].includes(form.action_type) && !form.message.trim())
        throw new Error('Informe a mensagem ou o comando da ação.');

      const payload = {
        name: form.name,
        trigger_type: form.trigger_type,
        trigger_config:
          form.trigger_type === 'chat_message' ? { keyword: form.keyword, match: 'contains' } : {},
        conditions: form.trigger_type === 'raid' && form.min_viewers > 0 ? { min_viewers: form.min_viewers } : {},
        action_type: form.action_type,
        action_config:
          form.action_type === 'chat_message'
            ? { message: form.message }
            : form.action_type === 'run_command'
              ? { command: form.message.replace(/^!/, '') }
              : form.action_type === 'timeout_user'
                ? { duration: form.duration, reason: form.reason }
                : {},
        delay_seconds: form.delay_seconds,
        enabled: form.enabled,
      };
      if (editing) await update(editing.id, payload);
      else await create(payload);
    });
    if (ok) setOpen(false);
  };

  const showLogs = async (automation: Automation) => {
    setLogsFor(automation);
    setLogs([]);
    try {
      const data = await get<{ logs: LogRow[] }>(`/data/automations/${automation.id}/logs`);
      setLogs(data.logs);
    } catch {
      setLogs([]);
    }
  };

  return (
    <div className="animate-fade-up">
      <PageHeader
        title="Automações"
        subtitle="Reações automáticas a follows, inscrições, raids e palavras no chat."
        actions={
          <Button onClick={openCreate}>
            <Plus size={15} /> Nova automação
          </Button>
        }
      />

      <ErrorBanner message={error} />

      <Card>
        {loading ? (
          <Spinner />
        ) : items.length ? (
          <div className="divide-y divide-white/[0.05]">
            {items.map((automation) => (
              <div key={automation.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                <div className="min-w-[220px] flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-white">{automation.name}</p>
                    {automation.enabled ? <Badge tone="success">ativa</Badge> : <Badge tone="neutral">pausada</Badge>}
                  </div>
                  <p className="mt-1 text-[11px] text-mist-400">
                    <span className="text-mist-200">{TRIGGER_LABELS[automation.trigger_type] ?? automation.trigger_type}</span>
                    {automation.trigger_type === 'chat_message'
                      ? ` · palavra "${String(automation.trigger_config.keyword ?? '')}"`
                      : ''}
                    {' → '}
                    {ACTION_LABELS[automation.action_type] ?? automation.action_type}
                    {automation.delay_seconds ? ` (após ${automation.delay_seconds}s)` : ''}
                  </p>
                </div>
                <div className="text-right text-[11px] text-mist-500">
                  <p>{automation.run_count} execuções</p>
                  <p>{formatDateTime(automation.created_at)}</p>
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="sm" onClick={() => void showLogs(automation)}>
                    <History size={13} /> Logs
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => openEdit(automation)}>
                    Editar
                  </Button>
                  <Toggle checked={automation.enabled} onChange={(value) => void update(automation.id, { enabled: value })} />
                  <ConfirmButton onConfirm={() => void remove(automation.id)} confirmLabel="Excluir?">
                    <Trash2 size={13} />
                  </ConfirmButton>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={<Workflow size={18} />}
            title="Nenhuma automação"
            description="Ex.: quando alguém seguir, agradecer no chat; quando alguém fizer raid, avisar a audiência."
            action={<Button onClick={openCreate}>Criar automação</Button>}
          />
        )}
      </Card>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? 'Editar automação' : 'Nova automação'}
        description="Gatilho → ação. O servidor executa em nome do canal conectado."
        wide
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => void save()} disabled={submit.saving}>
              {submit.saving ? 'Salvando…' : 'Salvar automação'}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <ErrorBanner message={submit.error} />
          <Field label="Nome">
            <Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Agradecer novo seguidor" />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Gatilho">
              <Select value={form.trigger_type} onChange={(event) => setForm({ ...form, trigger_type: event.target.value })}>
                {TRIGGERS.map((trigger) => (
                  <option key={trigger} value={trigger}>
                    {TRIGGER_LABELS[trigger]}
                  </option>
                ))}
              </Select>
            </Field>
            {form.trigger_type === 'chat_message' ? (
              <Field label="Palavra-chave">
                <Input value={form.keyword} onChange={(event) => setForm({ ...form, keyword: event.target.value })} placeholder="gg" />
              </Field>
            ) : form.trigger_type === 'raid' ? (
              <Field label="Mínimo de espectadores (opcional)">
                <Input
                  type="number"
                  min={0}
                  value={form.min_viewers}
                  onChange={(event) => setForm({ ...form, min_viewers: Number(event.target.value) })}
                />
              </Field>
            ) : (
              <div />
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Ação">
              <Select value={form.action_type} onChange={(event) => setForm({ ...form, action_type: event.target.value })}>
                {ACTIONS.map((action) => (
                  <option key={action} value={action}>
                    {ACTION_LABELS[action]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Atraso (segundos)">
              <Input
                type="number"
                min={0}
                value={form.delay_seconds}
                onChange={(event) => setForm({ ...form, delay_seconds: Number(event.target.value) })}
              />
            </Field>
          </div>

          {form.action_type === 'chat_message' ? (
            <Field label="Mensagem" hint="Use {user} para o nome do espectador.">
              <Textarea value={form.message} onChange={(event) => setForm({ ...form, message: event.target.value })} placeholder="Obrigado pelo follow, {user}! 💜" />
            </Field>
          ) : null}

          {form.action_type === 'run_command' ? (
            <Field label="Comando a executar">
              <Input value={form.message} onChange={(event) => setForm({ ...form, message: event.target.value })} placeholder="discord" />
            </Field>
          ) : null}

          {form.action_type === 'timeout_user' ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Duração (segundos)">
                <Input
                  type="number"
                  min={1}
                  value={form.duration}
                  onChange={(event) => setForm({ ...form, duration: Number(event.target.value) })}
                />
              </Field>
              <Field label="Motivo">
                <Input value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} />
              </Field>
            </div>
          ) : null}

          <Toggle checked={form.enabled} onChange={(value) => setForm({ ...form, enabled: value })} label="Automação ativa" />
        </div>
      </Modal>

      <Modal open={Boolean(logsFor)} onClose={() => setLogsFor(null)} title={`Logs · ${logsFor?.name ?? ''}`} wide>
        {logs.length ? (
          <div className="space-y-2">
            {logs.map((log) => (
              <div key={log.id} className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2">
                <div className="flex items-center justify-between text-[11px]">
                  <Badge tone={log.status === 'ok' ? 'success' : 'danger'}>{log.status}</Badge>
                  <span className="text-mist-500">{formatDateTime(log.created_at)}</span>
                </div>
                <p className="mt-1 text-xs text-mist-200">{log.action_result ?? '—'}</p>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState title="Sem execuções registradas" description="Os logs aparecem quando a automação for disparada." />
        )}
      </Modal>
    </div>
  );
}
