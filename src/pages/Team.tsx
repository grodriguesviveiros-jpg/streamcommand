import { useMemo, useState } from 'react';
import { Copy, Mail, ShieldCheck, Trash2, UserPlus, Users } from 'lucide-react';
import { useApi, useSubmit } from '../lib/hooks';
import { del, patch, post } from '../lib/api';
import { useApp } from '../state/AppContext';
import type { Invitation, Member, Permission } from '../lib/types';
import { Badge, Button, Card, ConfirmButton, EmptyState, ErrorBanner, Field, Input, Modal, PageHeader, Select, Spinner } from '../components/ui';
import { formatDateTime, PERMISSION_LABELS, ROLE_LABELS } from '../lib/format';

type MembersResponse = { members: Member[]; invitations: Invitation[] };

export default function Team() {
  const { workspace } = useApp();
  const { data, loading, error, reload } = useApi<MembersResponse>('/workspaces/current/members');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<{ discord_username: string; role: string; permissions: Permission[] }>({
    discord_username: '',
    role: 'moderator',
    permissions: ['dashboard.view', 'chat.view'],
  });
  const [editing, setEditing] = useState<Member | null>(null);
  const [editForm, setEditForm] = useState<{ role: string; permissions: Permission[] }>({ role: 'moderator', permissions: [] });
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const submit = useSubmit();

  const available = useMemo(() => (workspace?.permissions ?? []) as Permission[], [workspace]);

  const toggle = (list: Permission[], permission: Permission) =>
    list.includes(permission) ? list.filter((item) => item !== permission) : [...list, permission];

  const invite = async () => {
    const ok = await submit.run(async () => {
      if (!form.discord_username.trim()) throw new Error('Informe o usuário do Discord.');
      const result = await post<{ token: string; inviteUrl: string }>('/workspaces/current/members/invite', form);
      setInviteLink(`${window.location.origin}${result.inviteUrl}`);
      await reload();
    });
    if (ok) setOpen(false);
  };

  const saveMember = async () => {
    if (!editing) return;
    const ok = await submit.run(async () => {
      await patch(`/workspaces/current/members/${editing.id}`, editForm);
      await reload();
    });
    if (ok) setEditing(null);
  };

  const removeMember = async (member: Member) => {
    try {
      await del(`/workspaces/current/members/${member.id}`);
      await reload();
    } catch (err) {
      submit.setError(err instanceof Error ? err.message : 'Falha ao remover membro');
    }
  };

  return (
    <div className="animate-fade-up">
      <PageHeader
        title="Equipe e permissões"
        subtitle="Cada membro entra com a própria conta Discord e recebe apenas as permissões concedidas."
        actions={
          <Button onClick={() => setOpen(true)}>
            <UserPlus size={15} /> Convidar membro
          </Button>
        }
      />

      <ErrorBanner message={error ?? submit.error} />

      {inviteLink ? (
        <Card className="mb-4 border-emerald-500/30 bg-emerald-500/[0.06] p-4">
          <p className="text-sm font-semibold text-white">Convite criado</p>
          <p className="mt-1 text-[11px] text-mist-300">
            Envie este link para a pessoa. Ela precisa entrar com a conta Discord informada.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <code className="flex-1 truncate rounded-lg bg-black/30 px-3 py-2 text-[11px] text-emerald-200">{inviteLink}</code>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                void navigator.clipboard.writeText(inviteLink).then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                });
              }}
            >
              <Copy size={13} /> {copied ? 'Copiado' : 'Copiar'}
            </Button>
          </div>
        </Card>
      ) : null}

      <Card>
        <div className="panel-head">
          <div className="flex items-center gap-2">
            <Users size={15} style={{ color: 'var(--secondary)' }} />
            <h2 className="text-sm font-semibold text-white">Membros</h2>
          </div>
          <Badge tone="neutral">{data?.members.length ?? 0}</Badge>
        </div>
        {loading ? (
          <Spinner />
        ) : data?.members.length ? (
          <div className="divide-y divide-white/[0.05]">
            {data.members.map((member) => (
              <div key={member.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                {member.avatar_url ? (
                  <img src={member.avatar_url} alt={member.username} className="h-9 w-9 rounded-full border border-white/10" />
                ) : (
                  <div className="grid h-9 w-9 place-items-center rounded-full bg-white/10 text-xs font-semibold">
                    {member.username.slice(0, 2).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-white">{member.global_name || member.username}</p>
                  <p className="text-[11px] text-mist-500">@{member.username}</p>
                </div>
                <Badge tone={member.role === 'owner' ? 'primary' : 'neutral'}>
                  {ROLE_LABELS[member.role] ?? member.role}
                </Badge>
                <span className="text-[11px] text-mist-500">
                  {member.role === 'owner' ? 'acesso total' : `${member.permissions?.length ?? 0} permissões`}
                </span>
                {member.role !== 'owner' ? (
                  <div className="flex items-center gap-1">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setEditing(member);
                        setEditForm({ role: member.role, permissions: (member.permissions ?? []) as Permission[] });
                      }}
                    >
                      Permissões
                    </Button>
                    <ConfirmButton onConfirm={() => void removeMember(member)} confirmLabel="Remover?">
                      <Trash2 size={13} />
                    </ConfirmButton>
                  </div>
                ) : (
                  <Badge tone="success">
                    <ShieldCheck size={11} /> proprietário
                  </Badge>
                )}
              </div>
            ))}
          </div>
        ) : (
          <EmptyState icon={<Users size={18} />} title="Nenhum membro" description="Convide moderadores para ajudar na operação." />
        )}
      </Card>

      <Card className="mt-4">
        <div className="panel-head">
          <div className="flex items-center gap-2">
            <Mail size={15} style={{ color: 'var(--secondary)' }} />
            <h2 className="text-sm font-semibold text-white">Convites pendentes</h2>
          </div>
        </div>
        {data?.invitations.length ? (
          <div className="divide-y divide-white/[0.05]">
            {data.invitations.map((invitation) => (
              <div key={invitation.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-white">@{invitation.discord_username}</p>
                  <p className="text-[11px] text-mist-500">
                    {ROLE_LABELS[invitation.role] ?? invitation.role} · expira em {formatDateTime(invitation.expires_at)}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    const url = `${window.location.origin}/convite/${invitation.token}`;
                    void navigator.clipboard.writeText(url);
                    setInviteLink(url);
                  }}
                >
                  <Copy size={13} /> Copiar link
                </Button>
                <ConfirmButton
                  onConfirm={() => {
                    void del(`/workspaces/current/invitations/${invitation.id}`).then(reload);
                  }}
                  confirmLabel="Cancelar?"
                >
                  Cancelar
                </ConfirmButton>
              </div>
            ))}
          </div>
        ) : (
          <p className="px-5 py-4 text-xs text-mist-500">Nenhum convite pendente.</p>
        )}
      </Card>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Convidar membro"
        description="A pessoa entra com a própria conta Discord e só vê o que for permitido."
        wide
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => void invite()} disabled={submit.saving}>
              {submit.saving ? 'Criando…' : 'Criar convite'}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Usuário do Discord" hint="Sem @. Ex.: nomeusuario">
              <Input
                value={form.discord_username}
                onChange={(event) => setForm({ ...form, discord_username: event.target.value })}
                placeholder="nomeusuario"
              />
            </Field>
            <Field label="Papel">
              <Select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })}>
                <option value="admin">Administrador</option>
                <option value="moderator">Moderador</option>
                <option value="operator">Operador</option>
                <option value="viewer">Visualizador</option>
              </Select>
            </Field>
          </div>
          <div>
            <span className="label">Permissões</span>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {available.map((permission) => (
                <label key={permission} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-mist-300 hover:bg-white/[0.04]">
                  <input
                    type="checkbox"
                    checked={form.permissions.includes(permission)}
                    onChange={() => setForm({ ...form, permissions: toggle(form.permissions, permission) })}
                    className="accent-[var(--primary)]"
                  />
                  {PERMISSION_LABELS[permission] ?? permission}
                </label>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-mist-500">
              Você só pode conceder permissões que você mesmo possui. O servidor valida essa regra.
            </p>
          </div>
        </div>
      </Modal>

      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={`Permissões de ${editing?.global_name || editing?.username || ''}`}
        wide
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)}>
              Cancelar
            </Button>
            <Button onClick={() => void saveMember()} disabled={submit.saving}>
              Salvar alterações
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Papel">
            <Select value={editForm.role} onChange={(event) => setEditForm({ ...editForm, role: event.target.value })}>
              <option value="admin">Administrador</option>
              <option value="moderator">Moderador</option>
              <option value="operator">Operador</option>
              <option value="viewer">Visualizador</option>
            </Select>
          </Field>
          <div>
            <span className="label">Permissões individuais</span>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {available.map((permission) => (
                <label key={permission} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-mist-300 hover:bg-white/[0.04]">
                  <input
                    type="checkbox"
                    checked={editForm.permissions.includes(permission)}
                    onChange={() => setEditForm({ ...editForm, permissions: toggle(editForm.permissions, permission) })}
                    className="accent-[var(--primary)]"
                  />
                  {PERMISSION_LABELS[permission] ?? permission}
                </label>
              ))}
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
