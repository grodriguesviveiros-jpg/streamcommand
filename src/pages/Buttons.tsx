import { useEffect, useMemo, useState } from 'react';
import {
  Camera,
  Command,
  MessageSquare,
  Music2,
  Play,
  Plus,
  Radio,
  Sparkles,
  Trash2,
  Volume2,
  Zap,
} from 'lucide-react';
import { useResource, useSubmit } from '../lib/hooks';
import { post } from '../lib/api';
import { obs } from '../lib/obs';
import { soundPlayer } from '../lib/audio';
import type { ActionButton, Sound } from '../lib/types';
import { Badge, Button, Card, ColorField, ConfirmButton, EmptyState, ErrorBanner, Field, Input, Modal, PageHeader, Select, Spinner, Tabs } from '../components/ui';
import { ACTION_LABELS, formatDateTime } from '../lib/format';

const ICONS: Record<string, typeof Zap> = {
  zap: Zap,
  camera: Camera,
  music: Music2,
  message: MessageSquare,
  radio: Radio,
  play: Play,
  sparkles: Sparkles,
  volume: Volume2,
  command: Command,
};

type FormState = {
  label: string;
  icon: string;
  color: string;
  category: string;
  page: string;
  action_type: string;
  scene: string;
  message: string;
  soundId: string;
  hotkey: string;
};

const EMPTY: FormState = {
  label: '',
  icon: 'zap',
  color: '#7c3aed',
  category: 'Geral',
  page: 'Principal',
  action_type: 'chat_message',
  scene: '',
  message: '',
  soundId: '',
  hotkey: '',
};

export default function Buttons() {
  const { items, loading, error, create, update, remove } = useResource<ActionButton>('buttons');
  const sounds = useResource<Sound>('sounds');
  const [page, setPage] = useState('Principal');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ActionButton | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [log, setLog] = useState<{ label: string; result: string; at: string }[]>([]);
  const submit = useSubmit();

  const pages = useMemo(() => [...new Set(['Principal', ...items.map((item) => item.page)])], [items]);
  const visible = items.filter((item) => item.page === page);

  const openCreate = () => {
    setEditing(null);
    setForm({ ...EMPTY, page });
    setOpen(true);
  };

  const openEdit = (button: ActionButton) => {
    setEditing(button);
    setForm({
      label: button.label,
      icon: button.icon,
      color: button.color,
      category: button.category,
      page: button.page,
      action_type: button.action_type,
      scene: String(button.action_config?.scene ?? ''),
      message: String(button.action_config?.message ?? button.action_config?.command ?? ''),
      soundId: String(button.action_config?.soundId ?? ''),
      hotkey: button.hotkey ?? '',
    });
    setOpen(true);
  };

  const save = async () => {
    const ok = await submit.run(async () => {
      if (!form.label.trim()) throw new Error('Informe o nome do botão.');
      if (form.action_type === 'obs_scene' && !form.scene.trim()) throw new Error('Informe o nome da cena do OBS.');
      if (['chat_message', 'run_command'].includes(form.action_type) && !form.message.trim())
        throw new Error('Informe a mensagem ou o comando.');
      if (form.action_type === 'play_sound' && !form.soundId) throw new Error('Selecione um som.');

      const payload = {
        label: form.label,
        icon: form.icon,
        color: form.color,
        category: form.category,
        page: form.page,
        action_type: form.action_type,
        action_config:
          form.action_type === 'obs_scene'
            ? { scene: form.scene }
            : form.action_type === 'play_sound'
              ? { soundId: form.soundId }
              : form.action_type === 'run_command'
                ? { command: form.message.replace(/^!/, '') }
                : form.action_type === 'chat_message'
                  ? { message: form.message }
                  : {},
        hotkey: form.hotkey.trim() || null,
        sort_order: editing?.sort_order ?? items.length,
      };
      if (editing) await update(editing.id, payload);
      else await create(payload);
    });
    if (ok) setOpen(false);
  };

  const execute = async (button: ActionButton) => {
    const config = button.action_config ?? {};
    let result = '';
    try {
      switch (button.action_type) {
        case 'chat_message':
          await post('/chat/send', { message: String(config.message ?? '') });
          result = 'mensagem enviada no chat';
          break;
        case 'run_command':
          await post('/chat/send', { message: `!${String(config.command ?? '').replace(/^!/, '')}` });
          result = 'comando disparado no chat';
          break;
        case 'obs_scene':
          await obs.setScene(String(config.scene ?? ''));
          result = `cena trocada para ${config.scene}`;
          break;
        case 'obs_record': {
          const status = await obs.getRecordStatus();
          if (status.outputActive) await obs.stopRecord();
          else await obs.startRecord();
          result = status.outputActive ? 'gravação encerrada' : 'gravação iniciada';
          break;
        }
        case 'play_sound': {
          const sound = sounds.items.find((item) => item.id === config.soundId);
          if (!sound) throw new Error('Som não encontrado');
          soundPlayer.play(sound.file_path, Number(sound.volume ?? 1));
          result = `som ${sound.name} reproduzido`;
          break;
        }
        default:
          result = 'ação não reconhecida';
      }
    } catch (err) {
      result = err instanceof Error ? err.message : 'falha ao executar';
    }
    setLog((prev) => [{ label: button.label, result, at: new Date().toISOString() }, ...prev].slice(0, 8));
  };

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      const button = items.find(
        (item) => item.hotkey && item.hotkey.toLowerCase() === event.key.toLowerCase() && item.page === page,
      );
      if (!button) return;
      event.preventDefault();
      void execute(button);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });

  return (
    <div className="animate-fade-up">
      <PageHeader
        title="Central de botões"
        subtitle="Painel de ações rápidas: OBS, sons, mensagens e comandos com atalhos de teclado."
        actions={
          <Button onClick={openCreate}>
            <Plus size={15} /> Novo botão
          </Button>
        }
      />

      <ErrorBanner message={error ?? submit.error} />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Tabs tabs={pages.map((item) => ({ value: item, label: item }))} value={page} onChange={setPage} />
        <Badge tone={obs.connected ? 'success' : 'neutral'}>
          OBS {obs.connected ? 'conectado' : 'desconectado'}
        </Badge>
      </div>

      {loading ? <Spinner /> : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {visible.map((button) => {
          const Icon = ICONS[button.icon] ?? Zap;
          return (
            <div
              key={button.id}
              className="group relative overflow-hidden rounded-2xl border border-white/[0.06] bg-ink-850/85 p-4 shadow-panel transition hover:border-white/15"
            >
              <div className="pointer-events-none absolute -right-6 -top-8 h-20 w-20 rounded-full opacity-20 blur-2xl" style={{ background: button.color }} />
              <div className="flex items-start justify-between">
                <div
                  className="grid h-10 w-10 place-items-center rounded-xl text-white"
                  style={{ background: `linear-gradient(135deg, ${button.color}, color-mix(in srgb, ${button.color} 45%, #0b0e16))` }}
                >
                  <Icon size={17} />
                </div>
                <div className="flex items-center gap-1 opacity-0 transition group-hover:opacity-100">
                  <button type="button" onClick={() => openEdit(button)} className="btn-ghost p-1 text-[10px]">
                    editar
                  </button>
                  <ConfirmButton onConfirm={() => void remove(button.id)} confirmLabel="excluir?">
                    <Trash2 size={12} />
                  </ConfirmButton>
                </div>
              </div>
              <button type="button" onClick={() => void execute(button)} className="mt-3 block w-full text-left">
                <p className="text-sm font-semibold text-white">{button.label}</p>
                <p className="mt-0.5 text-[11px] text-mist-400">
                  {ACTION_LABELS[button.action_type] ?? button.action_type}
                  {button.hotkey ? ` · tecla ${button.hotkey}` : ''}
                </p>
              </button>
            </div>
          );
        })}
      </div>

      {!loading && !visible.length ? (
        <Card>
          <EmptyState
            icon={<Zap size={18} />}
            title="Nenhum botão nesta página"
            description="Monte seu painel com as ações que você mais usa durante a live."
            action={<Button onClick={openCreate}>Criar botão</Button>}
          />
        </Card>
      ) : null}

      {log.length ? (
        <Card className="mt-4">
          <div className="panel-head">
            <h2 className="text-sm font-semibold text-white">Últimas execuções</h2>
          </div>
          <div className="divide-y divide-white/[0.05]">
            {log.map((entry, index) => (
              <div key={index} className="flex items-center justify-between px-5 py-2 text-[11px]">
                <span className="text-mist-200">{entry.label}</span>
                <span className="text-mist-400">{entry.result}</span>
                <span className="text-mist-500">{formatDateTime(entry.at)}</span>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? 'Editar botão' : 'Novo botão'}
        wide
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => void save()} disabled={submit.saving}>
              {submit.saving ? 'Salvando…' : 'Salvar botão'}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nome">
              <Input value={form.label} onChange={(event) => setForm({ ...form, label: event.target.value })} placeholder="Cena de jogo" />
            </Field>
            <Field label="Categoria">
              <Input value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} />
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Página">
              <Input value={form.page} onChange={(event) => setForm({ ...form, page: event.target.value })} />
            </Field>
            <Field label="Atalho (1 tecla)">
              <Input value={form.hotkey} maxLength={3} onChange={(event) => setForm({ ...form, hotkey: event.target.value })} placeholder="1" />
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Ícone">
              <Select value={form.icon} onChange={(event) => setForm({ ...form, icon: event.target.value })}>
                {Object.keys(ICONS).map((icon) => (
                  <option key={icon} value={icon}>
                    {icon}
                  </option>
                ))}
              </Select>
            </Field>
            <ColorField label="Cor" value={form.color} onChange={(value) => setForm({ ...form, color: value })} />
          </div>

          <Field label="Ação">
            <Select value={form.action_type} onChange={(event) => setForm({ ...form, action_type: event.target.value })}>
              <option value="chat_message">Enviar mensagem no chat</option>
              <option value="run_command">Executar comando</option>
              <option value="obs_scene">Trocar cena do OBS</option>
              <option value="obs_record">Iniciar/parar gravação</option>
              <option value="play_sound">Reproduzir som</option>
            </Select>
          </Field>

          {form.action_type === 'obs_scene' ? (
            <Field label="Nome da cena" hint="Precisa ser exatamente o nome da cena no OBS.">
              <Input value={form.scene} onChange={(event) => setForm({ ...form, scene: event.target.value })} />
            </Field>
          ) : null}

          {form.action_type === 'chat_message' ? (
            <Field label="Mensagem">
              <Input value={form.message} onChange={(event) => setForm({ ...form, message: event.target.value })} />
            </Field>
          ) : null}

          {form.action_type === 'run_command' ? (
            <Field label="Comando">
              <Input value={form.message} onChange={(event) => setForm({ ...form, message: event.target.value })} placeholder="discord" />
            </Field>
          ) : null}

          {form.action_type === 'play_sound' ? (
            <Field label="Som">
              <Select value={form.soundId} onChange={(event) => setForm({ ...form, soundId: event.target.value })}>
                <option value="">Selecione…</option>
                {sounds.items.map((sound) => (
                  <option key={sound.id} value={sound.id}>
                    {sound.name} ({sound.category})
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}
        </div>
      </Modal>
    </div>
  );
}
