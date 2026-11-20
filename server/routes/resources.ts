import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import multer from 'multer';
import { loadWorkspace, requireAuth } from '../auth';
import { withContext } from '../db';
import { logActivity } from '../activity';
import { config } from '../config';
import { invalidateBotCache } from '../bot/engine';
import type { Permission } from '../permissions';

type FieldType = 'string' | 'number' | 'bool' | 'json';

type ResourceDef = {
  table: string;
  permission: Permission;
  fields: Record<string, FieldType>;
  order: string;
  creatorColumn?: string;
};

const RESOURCES: Record<string, ResourceDef> = {
  commands: {
    table: 'custom_commands',
    permission: 'commands.manage',
    fields: { name: 'string', response: 'string', cooldown_seconds: 'number', min_role: 'string', enabled: 'bool' },
    order: 'created_at asc',
  },
  timers: {
    table: 'timers',
    permission: 'timers.manage',
    fields: {
      name: 'string',
      message: 'string',
      interval_seconds: 'number',
      min_messages: 'number',
      only_when_live: 'bool',
      enabled: 'bool',
    },
    order: 'created_at asc',
  },
  automations: {
    table: 'automations',
    permission: 'automations.manage',
    fields: {
      name: 'string',
      trigger_type: 'string',
      trigger_config: 'json',
      conditions: 'json',
      action_type: 'string',
      action_config: 'json',
      delay_seconds: 'number',
      enabled: 'bool',
    },
    order: 'created_at asc',
  },
  giveaways: {
    table: 'giveaways',
    permission: 'giveaways.manage',
    fields: { title: 'string', keyword: 'string', status: 'string', winner_count: 'number', require_follower: 'bool', ends_at: 'string' },
    order: 'created_at desc',
  },
  polls: {
    table: 'polls',
    permission: 'polls.manage',
    fields: { question: 'string', options: 'json', status: 'string', ends_at: 'string' },
    order: 'created_at desc',
  },
  queue: {
    table: 'queue_entries',
    permission: 'queue.manage',
    fields: { username: 'string', note: 'string', position: 'number', status: 'string' },
    order: 'position asc, created_at asc',
    creatorColumn: 'added_by',
  },
  sounds: {
    table: 'soundboard_sounds',
    permission: 'soundboard.manage',
    fields: { name: 'string', category: 'string', volume: 'number', hotkey: 'string' },
    order: 'created_at desc',
  },
  buttons: {
    table: 'custom_buttons',
    permission: 'buttons.manage',
    fields: {
      label: 'string',
      icon: 'string',
      color: 'string',
      category: 'string',
      page: 'string',
      action_type: 'string',
      action_config: 'json',
      hotkey: 'string',
      sort_order: 'number',
    },
    order: 'sort_order asc, created_at asc',
  },
};

const router = Router();
router.use(requireAuth, loadWorkspace);

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      fs.mkdirSync(config.uploadDir, { recursive: true });
      cb(null, config.uploadDir);
    },
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).slice(0, 10).replace(/[^a-zA-Z0-9.]/g, '');
      cb(null, `${crypto.randomUUID()}${ext}`);
    },
  }),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = file.mimetype.startsWith('audio/') || file.mimetype === 'application/ogg' || file.mimetype === 'video/ogg';
    if (ok) cb(null, true);
    else cb(new Error('Envie um arquivo de áudio (mp3, wav, ogg, m4a).'));
  },
});

function coerce(type: FieldType, value: unknown): unknown {
  if (value === null || value === undefined || value === '') return null;
  switch (type) {
    case 'number': {
      const num = Number(value);
      return Number.isFinite(num) ? num : 0;
    }
    case 'bool':
      return value === true || value === 'true' || value === 1;
    case 'json':
      return typeof value === 'string' ? value : JSON.stringify(value);
    default:
      return String(value);
  }
}

function guard(permission: Permission) {
  return (req: any, res: any, next: any) => {
    if (!req.workspace?.permissions.includes(permission)) {
      res.status(403).json({ error: `Permissão necessária: ${permission}` });
      return;
    }
    next();
  };
}

/* ---- Soundboard: upload de áudio --------------------------------------- */
router.post('/sounds', guard('soundboard.manage'), upload.single('file'), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: 'Nenhum arquivo enviado.' });
    return;
  }
  const name = String(req.body?.name ?? req.file.originalname).slice(0, 80);
  const category = String(req.body?.category ?? 'Geral').slice(0, 40);
  const created = await withContext({ userId: req.user!.id, workspaceId: req.workspace!.id }, async (q) => {
    const { rows } = await q<Record<string, unknown>>(
      `insert into soundboard_sounds (workspace_id, name, category, file_path, mime_type, size_bytes, created_by)
       values ($1,$2,$3,$4,$5,$6,$7) returning *`,
      [req.workspace!.id, name, category, `/uploads/${req.file!.filename}`, req.file!.mimetype, req.file!.size, req.user!.id],
    );
    await logActivity(q, {
      workspaceId: req.workspace!.id,
      userId: req.user!.id,
      actorName: req.user!.username,
      action: 'soundboard.som_adicionado',
      target: name,
    });
    return rows[0];
  });
  res.status(201).json({ sound: created });
});

router.delete('/sounds/:id', guard('soundboard.manage'), async (req, res) => {
  const removed = await withContext({ userId: req.user!.id, workspaceId: req.workspace!.id }, async (q) => {
    const { rows } = await q<{ file_path: string }>(
      `delete from soundboard_sounds where id = $1 returning file_path`,
      [req.params.id],
    );
    return rows[0];
  });
  if (removed?.file_path?.startsWith('/uploads/')) {
    const file = path.join(config.uploadDir, path.basename(removed.file_path));
    fs.promises.unlink(file).catch(() => undefined);
  }
  res.json({ ok: true });
});

/* ---- Sorteios ---------------------------------------------------------- */
router.get('/giveaways/:id/entries', guard('giveaways.manage'), async (req, res) => {
  const rows = await withContext({ userId: req.user!.id, workspaceId: req.workspace!.id }, async (q) =>
    (
      await q(
        `select id, username, twitch_user_id, entered_at from giveaway_entries
          where giveaway_id = $1 order by entered_at asc`,
        [req.params.id],
      )
    ).rows,
  );
  res.json({ entries: rows });
});

router.post('/giveaways/:id/draw', guard('giveaways.manage'), async (req, res) => {
  const result = await withContext({ userId: req.user!.id, workspaceId: req.workspace!.id }, async (q) => {
    const giveaway = await q<{ id: string; winner_count: number; title: string; status: string }>(
      `select id, winner_count, title, status from giveaways where id = $1`,
      [req.params.id],
    );
    const row = giveaway.rows[0];
    if (!row) return { error: 'Sorteio não encontrado.' };

    const entries = await q<{ username: string }>(
      `select username from giveaway_entries where giveaway_id = $1`,
      [row.id],
    );
    if (!entries.rows.length) return { error: 'Nenhum participante inscrito.' };

    const pool = [...entries.rows];
    for (let i = pool.length - 1; i > 0; i -= 1) {
      const j = crypto.randomInt(i + 1);
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const winners = pool.slice(0, Math.max(1, row.winner_count)).map((e) => e.username);

    await q(`update giveaways set status = 'drawn', winners = $2::jsonb where id = $1`, [
      row.id,
      JSON.stringify(winners),
    ]);
    await logActivity(q, {
      workspaceId: req.workspace!.id,
      userId: req.user!.id,
      actorName: req.user!.username,
      action: 'sorteio.realizado',
      target: row.title,
      details: { winners },
    });
    return { winners };
  });

  if ('error' in result) {
    res.status(400).json({ error: result.error });
    return;
  }
  res.json({ winners: result.winners });
});

/* ---- Enquetes ---------------------------------------------------------- */
router.get('/polls/:id/results', guard('polls.manage'), async (req, res) => {
  const data = await withContext({ userId: req.user!.id, workspaceId: req.workspace!.id }, async (q) => {
    const poll = await q<{ id: string; question: string; options: { id: string; label: string }[]; status: string }>(
      `select id, question, options, status from polls where id = $1`,
      [req.params.id],
    );
    const votes = await q<{ option_id: string; count: number }>(
      `select option_id, count(*)::int as count from poll_votes where poll_id = $1 group by option_id`,
      [req.params.id],
    );
    if (!poll.rows[0]) return null;
    const counts = new Map(votes.rows.map((v) => [v.option_id, Number(v.count)]));
    return {
      poll: poll.rows[0],
      results: poll.rows[0].options.map((option) => ({
        id: option.id,
        label: option.label,
        votes: counts.get(option.id) ?? 0,
      })),
      total: votes.rows.reduce((sum, v) => sum + Number(v.count), 0),
    };
  });
  if (!data) {
    res.status(404).json({ error: 'Enquete não encontrada.' });
    return;
  }
  res.json(data);
});

router.post('/polls/:id/close', guard('polls.manage'), async (req, res) => {
  await withContext({ userId: req.user!.id, workspaceId: req.workspace!.id }, (q) =>
    q(`update polls set status = 'closed' where id = $1`, [req.params.id]),
  );
  res.json({ ok: true });
});

/* ---- Fila -------------------------------------------------------------- */
router.post('/queue/reorder', guard('queue.manage'), async (req, res) => {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const ids = Array.isArray(req.body?.ids) ? (req.body.ids as string[]).filter((id) => uuid.test(String(id))) : [];
  await withContext({ userId: req.user!.id, workspaceId: req.workspace!.id }, async (q) => {
    for (let index = 0; index < ids.length; index += 1) {
      await q(`update queue_entries set position = $2 where id = $1`, [ids[index], index + 1]);
    }
  });
  res.json({ ok: true });
});

router.post('/queue/:id/serve', guard('queue.manage'), async (req, res) => {
  await withContext({ userId: req.user!.id, workspaceId: req.workspace!.id }, (q) =>
    q(`update queue_entries set status = 'served', served_at = now() where id = $1`, [req.params.id]),
  );
  res.json({ ok: true });
});

/* ---- Logs de automação ------------------------------------------------- */
router.get('/automations/:id/logs', guard('automations.manage'), async (req, res) => {
  const rows = await withContext({ userId: req.user!.id, workspaceId: req.workspace!.id }, async (q) =>
    (
      await q(
        `select id, event, action_result, status, created_at from automation_logs
          where automation_id = $1 order by created_at desc limit 50`,
        [req.params.id],
      )
    ).rows,
  );
  res.json({ logs: rows });
});

/* ---- CRUD genérico ----------------------------------------------------- */
router.get('/:resource', (req, res, next) => {
  const def = RESOURCES[req.params.resource];
  if (!def) {
    next();
    return;
  }
  if (!req.workspace!.permissions.includes(def.permission)) {
    res.status(403).json({ error: `Permissão necessária: ${def.permission}` });
    return;
  }
  withContext({ userId: req.user!.id, workspaceId: req.workspace!.id }, async (q) => {
    const { rows } = await q(`select * from ${def.table} where workspace_id = $1 order by ${def.order}`, [
      req.workspace!.id,
    ]);
    res.json({ items: rows });
  }).catch(next);
});

router.post('/:resource', (req, res, next) => {
  const def = RESOURCES[req.params.resource];
  if (!def) {
    next();
    return;
  }
  if (!req.workspace!.permissions.includes(def.permission)) {
    res.status(403).json({ error: `Permissão necessária: ${def.permission}` });
    return;
  }
  const body = req.body ?? {};
  const entries = Object.entries(def.fields).filter(([key]) => body[key] !== undefined);
  if (!entries.length) {
    res.status(400).json({ error: 'Nenhum campo válido enviado.' });
    return;
  }
  const columns = ['workspace_id', ...entries.map(([key]) => key), def.creatorColumn ?? 'created_by'];
  const values = [
    req.workspace!.id,
    ...entries.map(([key, type]) => coerce(type, body[key])),
    req.user!.id,
  ];
  const placeholders = columns.map((_, index) => `$${index + 1}`).join(',');

  withContext({ userId: req.user!.id, workspaceId: req.workspace!.id }, async (q) => {
    const { rows } = await q(
      `insert into ${def.table} (${columns.join(',')}) values (${placeholders}) returning *`,
      values,
    );
    await logActivity(q, {
      workspaceId: req.workspace!.id,
      userId: req.user!.id,
      actorName: req.user!.username,
      action: `${req.params.resource}.criado`,
      target: String(body.name ?? body.label ?? body.title ?? body.question ?? body.username ?? ''),
    });
    res.status(201).json({ item: rows[0] });
  }).catch(next);
  invalidateBotCache(req.workspace!.id);
});

router.patch('/:resource/:id', (req, res, next) => {
  const def = RESOURCES[req.params.resource];
  if (!def) {
    next();
    return;
  }
  if (!req.workspace!.permissions.includes(def.permission)) {
    res.status(403).json({ error: `Permissão necessária: ${def.permission}` });
    return;
  }
  const body = req.body ?? {};
  const entries = Object.entries(def.fields).filter(([key]) => body[key] !== undefined);
  if (!entries.length) {
    res.status(400).json({ error: 'Nenhum campo válido enviado.' });
    return;
  }
  const sets = entries.map(([key], index) => `${key} = $${index + 2}`).join(', ');
  const values = [req.params.id, ...entries.map(([key, type]) => coerce(type, body[key]))];

  withContext({ userId: req.user!.id, workspaceId: req.workspace!.id }, async (q) => {
    const { rows } = await q(`update ${def.table} set ${sets} where id = $1 returning *`, values);
    if (!rows[0]) {
      res.status(404).json({ error: 'Registro não encontrado.' });
      return;
    }
    await logActivity(q, {
      workspaceId: req.workspace!.id,
      userId: req.user!.id,
      actorName: req.user!.username,
      action: `${req.params.resource}.atualizado`,
      target: String((rows[0] as Record<string, unknown>).name ?? req.params.id),
    });
    res.json({ item: rows[0] });
  }).catch(next);
  invalidateBotCache(req.workspace!.id);
});

router.delete('/:resource/:id', (req, res, next) => {
  const def = RESOURCES[req.params.resource];
  if (!def) {
    next();
    return;
  }
  if (!req.workspace!.permissions.includes(def.permission)) {
    res.status(403).json({ error: `Permissão necessária: ${def.permission}` });
    return;
  }
  withContext({ userId: req.user!.id, workspaceId: req.workspace!.id }, async (q) => {
    await q(`delete from ${def.table} where id = $1`, [req.params.id]);
    await logActivity(q, {
      workspaceId: req.workspace!.id,
      userId: req.user!.id,
      actorName: req.user!.username,
      action: `${req.params.resource}.removido`,
      target: req.params.id,
    });
    res.json({ ok: true });
  }).catch(next);
  invalidateBotCache(req.workspace!.id);
});

export default router;
