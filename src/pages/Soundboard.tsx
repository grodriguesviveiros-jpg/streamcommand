import { useEffect, useMemo, useRef, useState } from 'react';
import { Play, Plus, Square, Trash2, Upload, Volume2 } from 'lucide-react';
import { useResource, useSubmit } from '../lib/hooks';
import { api } from '../lib/api';
import { soundPlayer } from '../lib/audio';
import type { Sound } from '../lib/types';
import { Badge, Button, Card, ConfirmButton, EmptyState, ErrorBanner, Field, Input, Modal, PageHeader, Select, Spinner } from '../components/ui';

export default function Soundboard() {
  const { items, loading, error, update, remove, reload } = useResource<Sound>('sounds');
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState('');
  const [category, setCategory] = useState('Geral');
  const [master, setMaster] = useState(1);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const submit = useSubmit();
  const fileRef = useRef<HTMLInputElement | null>(null);

  const categories = useMemo(() => {
    const map = new Map<string, Sound[]>();
    for (const sound of items) {
      const list = map.get(sound.category) ?? [];
      list.push(sound);
      map.set(sound.category, list);
    }
    return [...map.entries()];
  }, [items]);

  const play = (sound: Sound) => {
    soundPlayer.play(sound.file_path, Number(sound.volume ?? 1));
    setPlayingId(sound.id);
    setMessage(`Tocando: ${sound.name}`);
    setTimeout(() => setPlayingId((current) => (current === sound.id ? null : current)), 1200);
  };

  useEffect(() => {
    soundPlayer.setMasterVolume(master);
  }, [master]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      const sound = items.find((item) => item.hotkey && item.hotkey.toLowerCase() === event.key.toLowerCase());
      if (!sound) return;
      event.preventDefault();
      play(sound);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [items]);

  const upload = async () => {
    const ok = await submit.run(async () => {
      if (!file) throw new Error('Selecione um arquivo de áudio.');
      const formData = new FormData();
      formData.append('file', file);
      formData.append('name', name.trim() || file.name.replace(/\.[^.]+$/, ''));
      formData.append('category', category.trim() || 'Geral');
      await api('/data/sounds', { method: 'POST', body: formData });
      await reload();
      setFile(null);
      setName('');
      if (fileRef.current) fileRef.current.value = '';
    }, 'Som adicionado ao soundboard.');
    if (ok) setOpen(false);
  };

  return (
    <div className="animate-fade-up">
      <PageHeader
        title="Soundboard"
        subtitle="Central de sons com categorias, volume, atalhos e reprodução local no aplicativo."
        actions={
          <>
            <Button variant="secondary" onClick={() => soundPlayer.stop()}>
              <Square size={14} /> Parar
            </Button>
            <Button onClick={() => setOpen(true)}>
              <Plus size={15} /> Novo som
            </Button>
          </>
        }
      />

      <ErrorBanner message={error ?? submit.error} />
      {message ? (
        <div className="mb-4 rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2 text-xs text-mist-200">{message}</div>
      ) : null}

      <Card className="mb-4 flex flex-wrap items-center gap-4 p-4">
        <div className="flex items-center gap-2 text-xs text-mist-300">
          <Volume2 size={15} />
          <span className="w-14 text-mist-500">Volume</span>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(master * 100)}
            onChange={(event) => setMaster(Number(event.target.value) / 100)}
            className="w-40 accent-[var(--primary)]"
          />
          <span className="w-9 text-right font-mono text-[11px] text-mist-400">{Math.round(master * 100)}%</span>
        </div>
        <p className="text-[11px] text-mist-500">
          Os atalhos funcionam com esta página aberta. O áudio toca no computador do operador.
        </p>
      </Card>

      {loading ? <Spinner /> : null}

      <div className="space-y-4">
        {categories.map(([group, sounds]) => (
          <Card key={group}>
            <div className="panel-head">
              <h2 className="text-sm font-semibold text-white">{group}</h2>
              <Badge tone="neutral">{sounds.length} som(ns)</Badge>
            </div>
            <div className="grid gap-2 p-4 sm:grid-cols-2 xl:grid-cols-3">
              {sounds.map((sound) => (
                <div
                  key={sound.id}
                  className="group flex items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] p-2.5 transition hover:border-white/15"
                >
                  <button
                    type="button"
                    onClick={() => play(sound)}
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-white"
                    style={{ background: 'linear-gradient(135deg, var(--primary), var(--secondary))' }}
                    aria-label={`Tocar ${sound.name}`}
                  >
                    <Play size={14} />
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold text-white">{sound.name}</p>
                    <div className="mt-0.5 flex items-center gap-1.5">
                      {sound.hotkey ? (
                        <kbd className="rounded border border-white/15 bg-white/[0.06] px-1 py-0.5 text-[10px] text-mist-300">
                          {sound.hotkey}
                        </kbd>
                      ) : null}
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={Math.round(Number(sound.volume ?? 1) * 100)}
                        onChange={(event) => void update(sound.id, { volume: Number(event.target.value) / 100 })}
                        className="w-16 accent-[var(--primary)]"
                        aria-label={`Volume de ${sound.name}`}
                      />
                      {playingId === sound.id ? <Badge tone="success">tocando</Badge> : null}
                    </div>
                  </div>
                  <input
                    defaultValue={sound.hotkey ?? ''}
                    placeholder="tecla"
                    maxLength={3}
                    onBlur={(event) => {
                      const value = event.target.value.trim().slice(0, 3) || null;
                      if (value !== sound.hotkey) void update(sound.id, { hotkey: value });
                    }}
                    className="w-12 rounded-md border border-white/10 bg-ink-900/80 px-1.5 py-1 text-center text-[11px] text-mist-200 outline-none"
                    aria-label={`Atalho de ${sound.name}`}
                  />
                  <ConfirmButton onConfirm={() => void remove(sound.id)} confirmLabel="Excluir?">
                    <Trash2 size={12} />
                  </ConfirmButton>
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>

      {!loading && !items.length ? (
        <Card>
          <EmptyState
            icon={<Volume2 size={18} />}
            title="Nenhum som adicionado"
            description="Envie arquivos de áudio (mp3, wav, ogg) e dispare com um clique ou atalho de teclado."
            action={<Button onClick={() => setOpen(true)}>Enviar primeiro som</Button>}
          />
        </Card>
      ) : null}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Adicionar som"
        description="Arquivos de até 8 MB. O arquivo fica privado no workspace."
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => void upload()} disabled={submit.saving}>
              <Upload size={14} /> {submit.saving ? 'Enviando…' : 'Enviar som'}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Arquivo de áudio">
            <input
              ref={fileRef}
              type="file"
              accept="audio/*"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              className="block w-full cursor-pointer rounded-xl border border-dashed border-white/15 bg-white/[0.02] px-3 py-6 text-xs text-mist-300 file:mr-3 file:rounded-lg file:border-0 file:bg-white/10 file:px-3 file:py-1.5 file:text-xs file:text-white"
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nome">
              <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Aplausos" />
            </Field>
            <Field label="Categoria">
              <Select value={category} onChange={(event) => setCategory(event.target.value)}>
                {['Geral', 'Memes', 'Alertas', 'Jogos', 'Transição'].map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        </div>
      </Modal>
    </div>
  );
}
