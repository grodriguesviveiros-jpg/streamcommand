import { Router } from 'express';
import { listWorkspaces, loadWorkspace, requireAuth, requirePermission } from '../auth';
import { withContext } from '../db';
import { randomToken } from '../crypto';
import { logActivity } from '../activity';
import { canGrant, ROLES, sanitizePermissions } from '../permissions';

const router = Router();
router.use(requireAuth);

/** Cria um workspace próprio (cada streamer tem o seu). */
router.post('/', async (req, res) => {
  const name = String(req.body?.name ?? '').trim();
  if (name.length < 2) {
    res.status(400).json({ error: 'Informe um nome com pelo menos 2 caracteres.' });
    return;
  }
  const userId = req.user!.id;
  const workspace = await withContext({ userId }, async (q) => {
    const created = await q<{ id: string }>(
      `insert into workspaces (owner_user_id, name, display_name) values ($1,$2,$3) returning id`,
      [userId, name, name],
    );
    await q(`select set_config('app.workspace_id', $1, true)`, [created.rows[0].id]);
    await q(
      `insert into workspace_members (workspace_id, user_id, role, permissions, created_by)
       values ($1,$2,'owner','[]'::jsonb,$2)`,
      [created.rows[0].id, userId],
    );
    return created.rows[0].id;
  });
  res.status(201).json({ id: workspace, workspaces: await listWorkspaces(userId) });
});

router.get('/', async (req, res) => {
  res.json({ workspaces: await listWorkspaces(req.user!.id) });
});

/** Identidade visual e preferências do workspace ativo. */
router.patch('/current', loadWorkspace, requirePermission('settings.manage'), async (req, res) => {
  const workspace = req.workspace!;
  const body = req.body ?? {};
  const name = body.name === undefined ? workspace.name : String(body.name).trim();
  if (name.length < 2) {
    res.status(400).json({ error: 'Nome inválido.' });
    return;
  }
  const updated = await withContext({ userId: req.user!.id, workspaceId: workspace.id }, async (q) => {
    const result = await q<Record<string, unknown>>(
      `update workspaces set
         name = $2,
         display_name = $3,
         logo_url = $4,
         primary_color = $5,
         secondary_color = $6,
         preferences = preferences || $7::jsonb,
         updated_at = now()
       where id = $1
       returning *`,
      [
        workspace.id,
        name,
        body.display_name === undefined ? workspace.display_name : String(body.display_name),
        body.logo_url === undefined ? workspace.logo_url : String(body.logo_url),
        body.primary_color === undefined ? workspace.primary_color : String(body.primary_color),
        body.secondary_color === undefined ? workspace.secondary_color : String(body.secondary_color),
        JSON.stringify(body.preferences ?? {}),
      ],
    );
    await logActivity(q, {
      workspaceId: workspace.id,
      userId: req.user!.id,
      actorName: req.user!.username,
      action: 'workspace.atualizado',
      target: name,
    });
    return result.rows[0];
  });
  res.json({ workspace: updated, workspaces: await listWorkspaces(req.user!.id) });
});

/** ---- Convites recebidos pelo usuário logado --------------------------- */
router.get('/invitations', async (req, res) => {
  const rows = await withContext(
    { userId: req.user!.id, discordUsername: req.user!.username },
    async (q) =>
      (
        await q<Record<string, unknown>>(
          `select i.id, i.token, i.role, i.permissions, i.status, i.created_at, i.expires_at,
                  w.name as workspace_name, w.logo_url, u.username as invited_by
             from workspace_invitations i
             join workspaces w on w.id = i.workspace_id
             left join users u on u.id = i.created_by
            where lower(i.discord_username) = lower($1)
              and i.status = 'pending'
              and i.expires_at > now()
            order by i.created_at desc`,
          [req.user!.username],
        )
      ).rows,
  );
  res.json({ invitations: rows });
});

router.post('/invitations/:token/accept', async (req, res) => {
  const token = String(req.params.token);
  const userId = req.user!.id;
  const invitation = await withContext({ userId, inviteToken: token }, async (q) => {
    const { rows } = await q<Record<string, unknown>>(
      `select * from workspace_invitations
        where token = $1 and status = 'pending' and expires_at > now()
          and lower(discord_username) = lower($2)`,
      [token, req.user!.username],
    );
    return rows[0];
  });
  if (!invitation) {
    res.status(404).json({ error: 'Convite inválido, expirado ou destinado a outro usuário.' });
    return;
  }

  await withContext({ userId, workspaceId: String(invitation.workspace_id) }, async (q) => {
    await q(
      `insert into workspace_members (workspace_id, user_id, role, permissions, created_by)
       values ($1,$2,$3,$4,$5)
       on conflict (workspace_id, user_id) do update set role = excluded.role, permissions = excluded.permissions`,
      [
        invitation.workspace_id,
        userId,
        String(invitation.role),
        JSON.stringify(invitation.permissions ?? []),
        invitation.created_by,
      ],
    );
    await q(`update workspace_invitations set status = 'accepted', accepted_by = $2 where id = $1`, [
      invitation.id,
      userId,
    ]);
    await logActivity(q, {
      workspaceId: String(invitation.workspace_id),
      userId,
      actorName: req.user!.username,
      action: 'equipe.convite_aceito',
      target: String(invitation.discord_username),
    });
  });

  res.json({ ok: true, workspaces: await listWorkspaces(userId) });
});

router.post('/invitations/:token/decline', async (req, res) => {
  const token = String(req.params.token);
  const invitation = await withContext({ userId: req.user!.id, inviteToken: token }, async (q) => {
    const { rows } = await q<Record<string, unknown>>(
      `select * from workspace_invitations where token = $1 and status = 'pending' and lower(discord_username) = lower($2)`,
      [token, req.user!.username],
    );
    return rows[0];
  });
  if (!invitation) {
    res.status(404).json({ error: 'Convite não encontrado.' });
    return;
  }
  await withContext({ userId: req.user!.id, workspaceId: String(invitation.workspace_id) }, (q) =>
    q(`update workspace_invitations set status = 'declined' where id = $1`, [invitation.id]),
  );
  res.json({ ok: true });
});

/** ---- Equipe do workspace ativo ---------------------------------------- */
router.get('/current/members', loadWorkspace, requirePermission('team.manage'), async (req, res) => {
  const rows = await withContext({ userId: req.user!.id, workspaceId: req.workspace!.id }, async (q) => {
    const members = await q<Record<string, unknown>>(
      `select m.id, m.user_id, m.role, m.permissions, m.created_at,
              u.username, u.global_name, u.avatar_url, u.discord_id
         from workspace_members m
         join users u on u.id = m.user_id
        where m.workspace_id = $1
        order by case when m.role = 'owner' then 0 else 1 end, m.created_at asc`,
      [req.workspace!.id],
    );
    const invitations = await q<Record<string, unknown>>(
      `select id, token, discord_username, role, permissions, status, created_at, expires_at
         from workspace_invitations
        where workspace_id = $1 and status = 'pending'
        order by created_at desc`,
      [req.workspace!.id],
    );
    return { members: members.rows, invitations: invitations.rows };
  });
  res.json(rows);
});

router.post('/current/members/invite', loadWorkspace, requirePermission('team.manage'), async (req, res) => {
  const discordUsername = String(req.body?.discord_username ?? '').trim().toLowerCase();
  const role = String(req.body?.role ?? 'moderator');
  const permissions = sanitizePermissions(req.body?.permissions);

  if (!discordUsername) {
    res.status(400).json({ error: 'Informe o nome de usuário do Discord.' });
    return;
  }
  if (!ROLES.some((r) => r.value === role)) {
    res.status(400).json({ error: 'Papel inválido.' });
    return;
  }
  if (!canGrant(req.workspace!, permissions)) {
    res.status(403).json({ error: 'Você não pode conceder permissões que não possui.' });
    return;
  }

  const token = randomToken(24);
  await withContext({ userId: req.user!.id, workspaceId: req.workspace!.id }, async (q) => {
    await q(
      `insert into workspace_invitations (workspace_id, token, discord_username, role, permissions, created_by)
       values ($1,$2,$3,$4,$5,$6)`,
      [req.workspace!.id, token, discordUsername, role, JSON.stringify(permissions), req.user!.id],
    );
    await logActivity(q, {
      workspaceId: req.workspace!.id,
      userId: req.user!.id,
      actorName: req.user!.username,
      action: 'equipe.convite_enviado',
      target: discordUsername,
      details: { role, permissions },
    });
  });

  res.status(201).json({ token, inviteUrl: `/convite/${token}` });
});

router.patch('/current/members/:memberId', loadWorkspace, requirePermission('team.manage'), async (req, res) => {
  const memberId = String(req.params.memberId);
  const role = String(req.body?.role ?? '');
  const permissions = sanitizePermissions(req.body?.permissions);

  if (role === 'owner') {
    res.status(400).json({ error: 'Não é possível atribuir o papel de proprietário.' });
    return;
  }
  if (!ROLES.some((r) => r.value === role)) {
    res.status(400).json({ error: 'Papel inválido.' });
    return;
  }
  if (!canGrant(req.workspace!, permissions)) {
    res.status(403).json({ error: 'Você não pode conceder permissões que não possui.' });
    return;
  }

  const updated = await withContext({ userId: req.user!.id, workspaceId: req.workspace!.id }, async (q) => {
    const target = await q<{ role: string }>(`select role from workspace_members where id = $1`, [memberId]);
    if (!target.rows[0] || target.rows[0].role === 'owner') return null;
    const result = await q<Record<string, unknown>>(
      `update workspace_members set role = $2, permissions = $3 where id = $1 returning *`,
      [memberId, role, JSON.stringify(permissions)],
    );
    await logActivity(q, {
      workspaceId: req.workspace!.id,
      userId: req.user!.id,
      actorName: req.user!.username,
      action: 'equipe.permissões_atualizadas',
      target: String(result.rows[0]?.user_id ?? ''),
      details: { role, permissions },
    });
    return result.rows[0];
  });

  if (!updated) {
    res.status(404).json({ error: 'Membro não encontrado ou é o proprietário.' });
    return;
  }
  res.json({ member: updated });
});

router.delete('/current/members/:memberId', loadWorkspace, requirePermission('team.manage'), async (req, res) => {
  const memberId = String(req.params.memberId);
  const removed = await withContext({ userId: req.user!.id, workspaceId: req.workspace!.id }, async (q) => {
    const target = await q<{ role: string; user_id: string }>(
      `select role, user_id from workspace_members where id = $1`,
      [memberId],
    );
    if (!target.rows[0] || target.rows[0].role === 'owner') return false;
    await q(`delete from workspace_members where id = $1`, [memberId]);
    await logActivity(q, {
      workspaceId: req.workspace!.id,
      userId: req.user!.id,
      actorName: req.user!.username,
      action: 'equipe.membro_removido',
      target: target.rows[0].user_id,
    });
    return true;
  });

  if (!removed) {
    res.status(400).json({ error: 'Não é possível remover este membro.' });
    return;
  }
  res.json({ ok: true });
});

router.delete('/current/invitations/:id', loadWorkspace, requirePermission('team.manage'), async (req, res) => {
  await withContext({ userId: req.user!.id, workspaceId: req.workspace!.id }, (q) =>
    q(`update workspace_invitations set status = 'cancelled' where id = $1 and status = 'pending'`, [req.params.id]),
  );
  res.json({ ok: true });
});

export default router;
