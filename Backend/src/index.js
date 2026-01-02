const path = require('path');

require('dotenv').config({
  path: path.join(__dirname, '..', '.env'),
});

const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const { Pool } = require('pg');

const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs'); // usado SOLO para admin_users
const crypto = require('crypto');   // usado para PIN QC (sin dependencias)

const app = express();
const PORT = process.env.PORT || 4000;

console.log('supabase url:', process.env.SUPABASE_DB_URL);

// ======================= CORS / BASE =======================

const allowedOrigins = (process.env.FRONTEND_ORIGINS ||
  'https://planificacion-pi.vercel.app'
)
  .split(',')
  .map(s => s.trim().replace(/\/$/, ''))
  .filter(Boolean);

const pool = new Pool({
  connectionString: process.env.SUPABASE_DB_URL,
  ssl: { rejectUnauthorized: false }
});

// Para que caches/CDN varíen por Origin
app.use((req, res, next) => { res.header('Vary', 'Origin'); next(); });

app.use(cors({
  origin(origin, cb) {
    if (!origin) return cb(null, true);
    const clean = origin.replace(/\/$/, '');
    if (allowedOrigins.includes(clean)) return cb(null, true);
    return cb(new Error(`CORS bloqueado para: ${origin}`));
  },
}));
app.options('*', cors());

app.use(express.json());
app.use(morgan('dev'));

// --------------------- Rutas básicas ---------------------
app.get('/', (_req, res) => {
  res.json({ ok: true, service: 'portones-backend' });
});

app.get('/healtz', async (_req, res) => {
  try {
    await pool.query('select 1;');
    return res.status(200).type('text/plain; charset=utf-8').send('El servidor está Online');
  } catch (err) {
    console.error('Healthcheck error:', err);
    return res.status(500).type('text/plain; charset=utf-8').send('El servidor tiene errores');
  }
});

app.get('/healt', async (_req, res) => {
  try {
    await pool.query('select 1;');
    return res.status(200).type('text/plain; charset=utf-8').send('El servidor está Online');
  } catch (err) {
    console.error('Healthcheck error:', err);
    return res.status(500).type('text/plain; charset=utf-8').send('El servidor tiene errores');
  }
});

// =========================
// AUTH ADMIN (dashboard)
// =========================
const JWT_SECRET = process.env.ADMIN_JWT_SECRET || 'dev_secret_change_me';

function signAdminToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '12h' });
}

function adminAuth(req, res, next) {
  const auth = req.headers.authorization || '';
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m) return res.status(401).json({ error: 'No autorizado' });
  try {
    const decoded = jwt.verify(m[1], JWT_SECRET);
    req.admin = decoded;
    return next();
  } catch {
    return res.status(401).json({ error: 'Token inválido' });
  }
}

app.post('/admin/login', async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ error: 'username y password son requeridos' });
    }

    const { rows } = await pool.query(
      `select id, username, password_hash, is_active
       from public.admin_users
       where username = $1
       limit 1;`,
      [String(username).trim()]
    );

    const u = rows[0];
    if (!u || !u.is_active) return res.status(401).json({ error: 'Credenciales inválidas' });

    const ok = await bcrypt.compare(String(password), u.password_hash);
    if (!ok) return res.status(401).json({ error: 'Credenciales inválidas' });

    const token = signAdminToken({ sub: u.id, username: u.username });
    return res.json({ ok: true, token });
  } catch (err) {
    console.error('admin login error:', err);
    return res.status(500).json({ error: 'Error en login admin', detail: err.message });
  }
});

// =========================
// PLANTA BASE (Supabase table public.planta_base)
// =========================

function isValidISODate10(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(s || '').trim());
}

// GET /planta/base -> { date: "YYYY-MM-DD", qty: 123 }  o {date:null, qty:null} si no hay base
app.get('/planta/base', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `
      select base_date::text as date, qty
      from public.planta_base
      order by base_date desc, created_at desc, id desc
      limit 1;
      `
    );

    res.setHeader('Cache-Control', 'no-store');

    if (!rows.length) return res.json({ date: null, qty: null });
    return res.json(rows[0]);
  } catch (err) {
    console.error('planta base get error:', err);
    return res.status(500).json({ error: 'Error leyendo base planta', detail: err.message });
  }
});

// POST /planta/base (LIBRE) body: { date, qty } -> inserta nueva base
// devuelve { date, qty }
app.post('/planta/base', async (req, res) => {
  try {
    const date = String(req.body?.date || '').trim();
    const qty = Number(req.body?.qty);

    if (!isValidISODate10(date)) {
      return res.status(400).json({ error: 'Fecha inválida (YYYY-MM-DD)' });
    }
    if (!Number.isInteger(qty) || qty < 0) {
      return res.status(400).json({ error: 'qty debe ser entero >= 0' });
    }

    const { rows } = await pool.query(
      `
      insert into public.planta_base(base_date, qty)
      values ($1::date, $2::int)
      returning base_date::text as date, qty;
      `,
      [date, qty]
    );

    res.setHeader('Cache-Control', 'no-store');
    return res.status(201).json(rows[0]);
  } catch (err) {
    console.error('planta base post error:', err);
    return res.status(500).json({ error: 'Error guardando base planta', detail: err.message });
  }
});

// =========================
// QC (PIN + permisos + motivos + auditoría)
// =========================
const QC_PIN_SALT = process.env.QC_PIN_SALT || 'dev_change_me_pin_salt';

function hashPin(pin) {
  return crypto.createHmac('sha256', QC_PIN_SALT).update(String(pin)).digest('hex');
}

function isValidLine(line) {
  return ['portones', 'ipanel'].includes(line);
}

function isValidQcStatus(s) {
  return ['APROBADO', 'OBSERVADO', 'RECHAZADO'].includes(s);
}

function isValidKind(k) {
  return ['OBSERVADO', 'RECHAZADO'].includes(k);
}

// GET /qc/motives?line=portones&kind=RECHAZADO&stage=laser
app.get('/qc/motives', async (req, res) => {
  try {
    const line = String(req.query.line || '').trim();
    const kind = String(req.query.kind || '').trim().toUpperCase();
    const stage = req.query.stage == null ? null : String(req.query.stage).trim();

    if (!isValidLine(line)) return res.status(400).json({ error: 'line inválida' });
    if (!isValidKind(kind)) return res.status(400).json({ error: 'kind inválido' });

    const { rows } = await pool.query(
      `
      select id, line, kind, stage_key, label, priority
      from public.qc_motive
      where enabled = true
        and line = $1
        and kind = $2
        and (stage_key is null or stage_key = $3)
      order by priority asc, id asc;
      `,
      [line, kind, stage]
    );

    return res.json(rows);
  } catch (err) {
    console.error('qc motives error:', err);
    return res.status(500).json({ error: 'Error leyendo motivos', detail: err.message });
  }
});

// GET /qc/history/:line/:itemId
app.get('/qc/history/:line/:itemId', async (req, res) => {
  try {
    const line = String(req.params.line || '').trim();
    const itemId = Number(req.params.itemId);

    if (!isValidLine(line)) return res.status(400).json({ error: 'line inválida' });
    if (!Number.isInteger(itemId)) return res.status(400).json({ error: 'itemId inválido' });

    const { rows } = await pool.query(
      `
      select
        e.id,
        e.stage_key,
        e.qc_status,
        e.note,
        e.created_at,
        u.id as user_id,
        u.name as user_name,
        u.is_global as user_is_global,
        m.id as motive_id,
        m.label as motive_label
      from public.qc_event e
      join public.qc_users u on u.id = e.by_user_id
      left join public.qc_motive m on m.id = e.motive_id
      where e.line = $1 and e.item_id = $2
      order by e.created_at desc;
      `,
      [line, itemId]
    );

    return res.json(rows);
  } catch (err) {
    console.error('qc history error:', err);
    return res.status(500).json({ error: 'Error leyendo historial QC', detail: err.message });
  }
});

// POST /qc/authorize
// Body: { line, item_id, stage_key, qc_status, motive_id?, note?, pin }
app.post('/qc/authorize', async (req, res) => {
  const {
    line,
    item_id,
    stage_key,
    qc_status,
    motive_id,
    note,
    pin
  } = req.body || {};

  const nItemId = Number(item_id);
  const stageKey = String(stage_key || '').trim();
  const qcStatus = String(qc_status || '').trim().toUpperCase();
  const pinStr = String(pin || '').trim();

  if (!isValidLine(line)) return res.status(400).json({ error: 'line inválida' });
  if (!Number.isInteger(nItemId)) return res.status(400).json({ error: 'item_id inválido' });
  if (!stageKey) return res.status(400).json({ error: 'stage_key requerido' });
  if (!isValidQcStatus(qcStatus)) return res.status(400).json({ error: 'qc_status inválido' });
  if (!/^\d{3,10}$/.test(pinStr)) return res.status(400).json({ error: 'PIN inválido (solo numérico)' });

  const client = await pool.connect();
  try {
    await client.query('begin');

    // 1) Usuario por PIN
    const pinHash = hashPin(pinStr);
    const uQ = await client.query(
      `
      select id, name, is_global, is_active
      from public.qc_users
      where pin_hash = $1
      limit 1;
      `,
      [pinHash]
    );

    const user = uQ.rows[0];
    if (!user || !user.is_active) {
      await client.query('rollback');
      return res.status(401).json({ error: 'PIN incorrecto o usuario inactivo' });
    }

    // 2) Estado actual QC (último evento)
    const lastQ = await client.query(
      `
      select qc_status
      from public.qc_event
      where line = $1 and item_id = $2
      order by created_at desc
      limit 1;
      `,
      [line, nItemId]
    );

    const lastStatus = lastQ.rows[0]?.qc_status || null;

    // 3) Regla especial: si está RECHAZADO, solo GLOBAL lo destraba
    if (lastStatus === 'RECHAZADO' && qcStatus !== 'RECHAZADO' && !user.is_global) {
      await client.query('rollback');
      return res.status(403).json({ error: 'Solo un usuario GLOBAL puede destrabar un RECHAZADO' });
    }

    // 4) Permisos por sección si no es global
    if (!user.is_global) {
      const sQ = await client.query(
        `
        select 1
        from public.qc_user_scope
        where user_id = $1
          and line = $2
          and stage_key = $3
          and enabled = true
        limit 1;
        `,
        [user.id, line, stageKey]
      );
      if (!sQ.rows.length) {
        await client.query('rollback');
        return res.status(403).json({ error: 'Usuario sin permiso para esa sección' });
      }
    }

    // 5) Motivo obligatorio para OBSERVADO/RECHAZADO
    let motiveId = null;
    if (qcStatus === 'OBSERVADO' || qcStatus === 'RECHAZADO') {
      const mid = Number(motive_id);
      if (!Number.isInteger(mid)) {
        await client.query('rollback');
        return res.status(400).json({ error: 'motive_id requerido para Observado/Rechazado' });
      }

      // validar motivo (line + kind + enabled + stage_key null o coincide)
      const motQ = await client.query(
        `
        select id
        from public.qc_motive
        where id = $1
          and enabled = true
          and line = $2
          and kind = $3
          and (stage_key is null or stage_key = $4)
        limit 1;
        `,
        [mid, line, qcStatus, stageKey]
      );
      if (!motQ.rows.length) {
        await client.query('rollback');
        return res.status(400).json({ error: 'motive_id inválido para esa línea/estado/etapa' });
      }

      motiveId = mid;
    }

    // 6) Insert auditoría
    const ins = await client.query(
      `
      insert into public.qc_event(line, item_id, stage_key, qc_status, motive_id, note, by_user_id)
      values ($1,$2,$3,$4,$5,$6,$7)
      returning *;
      `,
      [line, nItemId, stageKey, qcStatus, motiveId, note ?? null, user.id]
    );

    await client.query('commit');

    return res.json({
      ok: true,
      qc: ins.rows[0],
      user: { id: user.id, name: user.name, is_global: user.is_global }
    });
  } catch (err) {
    await client.query('rollback');
    console.error('qc authorize error:', err);
    return res.status(500).json({ error: 'Error autorizando QC', detail: err.message });
  } finally {
    client.release();
  }
});

// =========================
// ADMIN QC API (CRUD usuarios QC + motivos)
// Protegido con adminAuth
// =========================

// GET /admin/qc/users
app.get('/admin/qc/users', adminAuth, async (_req, res) => {
  try {
    const [uQ, sQ] = await Promise.all([
      pool.query(
        `
        select id, name, is_active, is_global, created_at, updated_at
        from public.qc_users
        order by id asc;
        `
      ),
      pool.query(
        `
        select user_id, line, stage_key, enabled
        from public.qc_user_scope
        order by user_id asc, line asc, stage_key asc;
        `
      ),
    ]);

    const scopesByUser = new Map();
    for (const s of sQ.rows) {
      if (!scopesByUser.has(s.user_id)) scopesByUser.set(s.user_id, []);
      scopesByUser.get(s.user_id).push(s);
    }

    const users = uQ.rows.map(u => ({
      ...u,
      scopes: scopesByUser.get(u.id) || []
    }));

    return res.json({ ok: true, users });
  } catch (err) {
    console.error('admin qc users list error:', err);
    return res.status(500).json({ error: 'Error listando usuarios QC', detail: err.message });
  }
});

// POST /admin/qc/users
// Body: { name, pin, is_global?, is_active?, scopes?:[{line,stage_key,enabled?}] }
app.post('/admin/qc/users', adminAuth, async (req, res) => {
  const { name, pin, is_global, is_active, scopes } = req.body || {};
  const nm = String(name || '').trim();
  const pinStr = String(pin || '').trim();

  if (!nm) return res.status(400).json({ error: 'name requerido' });
  if (!/^\d{3,10}$/.test(pinStr)) return res.status(400).json({ error: 'pin inválido (3 a 10 dígitos)' });

  const client = await pool.connect();
  try {
    await client.query('begin');

    const ins = await client.query(
      `
      insert into public.qc_users(name, pin_hash, is_active, is_global, created_at, updated_at)
      values ($1,$2,$3,$4, now(), now())
      returning id, name, is_active, is_global, created_at, updated_at;
      `,
      [
        nm,
        hashPin(pinStr),
        is_active !== false,
        is_global === true
      ]
    );

    const user = ins.rows[0];

    // scopes opcionales (si no es global)
    if (user.is_global !== true && Array.isArray(scopes)) {
      for (const s of scopes) {
        const line = String(s?.line || '').trim();
        const stage_key = String(s?.stage_key || '').trim();
        if (!isValidLine(line) || !stage_key) continue;

        await client.query(
          `
          insert into public.qc_user_scope(user_id, line, stage_key, enabled, created_at)
          values ($1,$2,$3,$4, now())
          on conflict (user_id, line, stage_key) do update
            set enabled = excluded.enabled;
          `,
          [user.id, line, stage_key, s?.enabled !== false]
        );
      }
    }

    await client.query('commit');

    // devolver con scopes
    const sQ = await pool.query(
      `
      select user_id, line, stage_key, enabled
      from public.qc_user_scope
      where user_id = $1
      order by line asc, stage_key asc;
      `,
      [user.id]
    );

    return res.status(201).json({ ok: true, user: { ...user, scopes: sQ.rows } });
  } catch (err) {
    await client.query('rollback');
    console.error('admin qc users create error:', err);
    return res.status(500).json({ error: 'Error creando usuario QC', detail: err.message });
  } finally {
    client.release();
  }
});

// PUT /admin/qc/users/:id
// Body: { name?, pin?, is_global?, is_active? }
app.put('/admin/qc/users/:id', adminAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'id inválido' });

  const patch = req.body || {};
  const fields = [];
  const params = [];
  let idx = 1;

  if (patch.name != null) {
    const nm = String(patch.name).trim();
    if (!nm) return res.status(400).json({ error: 'name no puede ser vacío' });
    fields.push(`name = $${idx++}`);
    params.push(nm);
  }

  if (patch.pin != null) {
    const pinStr = String(patch.pin).trim();
    if (!/^\d{3,10}$/.test(pinStr)) return res.status(400).json({ error: 'pin inválido (3 a 10 dígitos)' });
    fields.push(`pin_hash = $${idx++}`);
    params.push(hashPin(pinStr));
  }

  if (patch.is_active != null) {
    fields.push(`is_active = $${idx++}`);
    params.push(patch.is_active === true);
  }

  if (patch.is_global != null) {
    fields.push(`is_global = $${idx++}`);
    params.push(patch.is_global === true);
  }

  if (!fields.length) return res.status(400).json({ error: 'No hay campos para actualizar' });

  params.push(id);

  try {
    const { rows } = await pool.query(
      `
      update public.qc_users
      set ${fields.join(', ')}, updated_at = now()
      where id = $${idx}
      returning id, name, is_active, is_global, created_at, updated_at;
      `,
      params
    );

    if (!rows.length) return res.status(404).json({ error: 'Usuario QC no encontrado' });

    const sQ = await pool.query(
      `
      select user_id, line, stage_key, enabled
      from public.qc_user_scope
      where user_id = $1
      order by line asc, stage_key asc;
      `,
      [id]
    );

    return res.json({ ok: true, user: { ...rows[0], scopes: sQ.rows } });
  } catch (err) {
    console.error('admin qc users update error:', err);
    return res.status(500).json({ error: 'Error actualizando usuario QC', detail: err.message });
  }
});

// PUT /admin/qc/users/:id/scopes
// Body: { scopes: [{line, stage_key, enabled?}, ...] }
// Reemplaza scopes completos (wipe & insert)
app.put('/admin/qc/users/:id/scopes', adminAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'id inválido' });

  const scopes = Array.isArray(req.body?.scopes) ? req.body.scopes : null;
  if (!scopes) return res.status(400).json({ error: 'scopes debe ser array' });

  const client = await pool.connect();
  try {
    await client.query('begin');

    const uQ = await client.query(
      `select id, is_global from public.qc_users where id = $1 limit 1;`,
      [id]
    );
    if (!uQ.rows.length) {
      await client.query('rollback');
      return res.status(404).json({ error: 'Usuario QC no encontrado' });
    }
    const isGlobal = uQ.rows[0].is_global === true;

    await client.query(`delete from public.qc_user_scope where user_id = $1;`, [id]);

    for (const s of scopes) {
      const line = String(s?.line || '').trim();
      const stage_key = String(s?.stage_key || '').trim();
      if (!isValidLine(line) || !stage_key) continue;

      await client.query(
        `
        insert into public.qc_user_scope(user_id, line, stage_key, enabled, created_at)
        values ($1,$2,$3,$4, now());
        `,
        [id, line, stage_key, s?.enabled !== false]
      );
    }

    await client.query('commit');

    const sQ = await pool.query(
      `
      select user_id, line, stage_key, enabled
      from public.qc_user_scope
      where user_id = $1
      order by line asc, stage_key asc;
      `,
      [id]
    );

    return res.json({ ok: true, user_id: id, is_global: isGlobal, scopes: sQ.rows });
  } catch (err) {
    await client.query('rollback');
    console.error('admin qc scopes error:', err);
    return res.status(500).json({ error: 'Error guardando scopes QC', detail: err.message });
  } finally {
    client.release();
  }
});

// GET /admin/qc/motives?line=&kind=&stage=
app.get('/admin/qc/motives', adminAuth, async (req, res) => {
  try {
    const line = req.query.line ? String(req.query.line).trim() : null;
    const kind = req.query.kind ? String(req.query.kind).trim().toUpperCase() : null;
    const stage = req.query.stage ? String(req.query.stage).trim() : null;

    if (line && !isValidLine(line)) return res.status(400).json({ error: 'line inválida' });
    if (kind && !isValidKind(kind)) return res.status(400).json({ error: 'kind inválido' });

    const { rows } = await pool.query(
      `
      select id, line, kind, stage_key, label, enabled, priority, created_at
      from public.qc_motive
      where ($1::text is null or line = $1)
        and ($2::text is null or kind = $2)
        and ($3::text is null or stage_key = $3 or stage_key is null)
      order by line asc, kind asc, priority asc, id asc;
      `,
      [line, kind, stage]
    );

    return res.json({ ok: true, motives: rows });
  } catch (err) {
    console.error('admin qc motives list error:', err);
    return res.status(500).json({ error: 'Error listando motivos', detail: err.message });
  }
});

// POST /admin/qc/motives
// Body: { line, kind, stage_key?, label, enabled?, priority? }
app.post('/admin/qc/motives', adminAuth, async (req, res) => {
  try {
    const { line, kind, stage_key, label, enabled, priority } = req.body || {};
    const ln = String(line || '').trim();
    const kd = String(kind || '').trim().toUpperCase();
    const sk = stage_key == null || stage_key === '' ? null : String(stage_key).trim();
    const lb = String(label || '').trim();

    if (!isValidLine(ln)) return res.status(400).json({ error: 'line inválida' });
    if (!isValidKind(kd)) return res.status(400).json({ error: 'kind inválido' });
    if (!lb) return res.status(400).json({ error: 'label requerido' });

    const pr = Number.isInteger(Number(priority)) ? Number(priority) : 100;

    const { rows } = await pool.query(
      `
      insert into public.qc_motive(line, kind, stage_key, label, enabled, priority, created_at)
      values ($1,$2,$3,$4,$5,$6, now())
      returning *;
      `,
      [ln, kd, sk, lb, enabled !== false, pr]
    );

    return res.status(201).json({ ok: true, motive: rows[0] });
  } catch (err) {
    console.error('admin qc motives create error:', err);
    return res.status(500).json({ error: 'Error creando motivo', detail: err.message });
  }
});

// PUT /admin/qc/motives/:id
// Body: { label?, enabled?, priority?, stage_key? }
app.put('/admin/qc/motives/:id', adminAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'id inválido' });

  const patch = req.body || {};
  const fields = [];
  const params = [];
  let idx = 1;

  if (patch.label != null) {
    const lb = String(patch.label).trim();
    if (!lb) return res.status(400).json({ error: 'label no puede ser vacío' });
    fields.push(`label = $${idx++}`);
    params.push(lb);
  }

  if (patch.enabled != null) {
    fields.push(`enabled = $${idx++}`);
    params.push(patch.enabled === true);
  }

  if (patch.priority != null) {
    const pr = Number(patch.priority);
    if (!Number.isFinite(pr)) return res.status(400).json({ error: 'priority inválido' });
    fields.push(`priority = $${idx++}`);
    params.push(pr);
  }

  if (patch.stage_key !== undefined) {
    const sk = patch.stage_key == null || patch.stage_key === '' ? null : String(patch.stage_key).trim();
    fields.push(`stage_key = $${idx++}`);
    params.push(sk);
  }

  if (!fields.length) return res.status(400).json({ error: 'No hay campos para actualizar' });

  params.push(id);

  try {
    const { rows } = await pool.query(
      `
      update public.qc_motive
      set ${fields.join(', ')}
      where id = $${idx}
      returning *;
      `,
      params
    );

    if (!rows.length) return res.status(404).json({ error: 'Motivo no encontrado' });
    return res.json({ ok: true, motive: rows[0] });
  } catch (err) {
    console.error('admin qc motives update error:', err);
    return res.status(500).json({ error: 'Error actualizando motivo', detail: err.message });
  }
});

// =========================
// WORKFLOW ENGINE (Opción A)
// =========================
const STATUS = {
  PENDIENTE: 'Pendiente',
  EN_PROCESO: 'En Proceso',
  FINALIZADO: 'Finalizado',
};

function low(v) { return (v || '').toString().toLowerCase(); }

function getValueByField(ctx, field) {
  if (!ctx) return undefined;
  return ctx[field];
}

// condition_json soportado (simple):
// { all: [ {field,op,value}, ... ] }
// { any: [ ... ] }
// o ambos: { all:[...], any:[...] }
function evalRule(ctx, rule) {
  const field = rule?.field;
  const op = rule?.op;
  const value = rule?.value;

  const actual = getValueByField(ctx, field);

  const asNum = (x) => {
    const n = Number(x);
    return Number.isFinite(n) ? n : null;
  };

  if (op === '=') return String(actual ?? '') === String(value ?? '');
  if (op === '!=') return String(actual ?? '') !== String(value ?? '');

  if (op === '>')  { const a = asNum(actual); const b = asNum(value); return a !== null && b !== null && a >  b; }
  if (op === '>=') { const a = asNum(actual); const b = asNum(value); return a !== null && b !== null && a >= b; }
  if (op === '<')  { const a = asNum(actual); const b = asNum(value); return a !== null && b !== null && a <  b; }
  if (op === '<=') { const a = asNum(actual); const b = asNum(value); return a !== null && b !== null && a <= b; }

  if (op === 'in') {
    if (!Array.isArray(value)) return false;
    return value.map(String).includes(String(actual));
  }

  if (op === 'contains') {
    return String(actual ?? '').toLowerCase().includes(String(value ?? '').toLowerCase());
  }

  return false;
}

function evalConditionJson(ctx, conditionJson) {
  if (!conditionJson) return true;
  let obj = conditionJson;
  if (typeof obj === 'string') {
    try { obj = JSON.parse(obj); } catch { return false; }
  }
  const all = Array.isArray(obj.all) ? obj.all : [];
  const any = Array.isArray(obj.any) ? obj.any : [];

  const allOk = all.every(r => evalRule(ctx, r));
  const anyOk = any.length ? any.some(r => evalRule(ctx, r)) : true;

  return allOk && anyOk;
}

async function getWorkflowConfig(line) {
  const [st, ed, rq] = await Promise.all([
    pool.query(
      `select line, key, label, status_col, start_col, end_col, enabled
       from public.workflow_stage
       where line = $1
       order by key asc;`,
      [line]
    ),
    pool.query(
      `select id, line, from_key, to_key, priority, enabled, condition_json
       from public.workflow_edge
       where line = $1
       order by from_key asc, priority asc, to_key asc;`,
      [line]
    ),
    pool.query(
      `select id, line, stage_key, type, group_id, required_key
       from public.workflow_requirement
       where line = $1
       order by stage_key asc, type asc, group_id asc nulls first, required_key asc;`,
      [line]
    ),
  ]);

  return {
    stages: st.rows,
    edges: ed.rows,
    requirements: rq.rows,
  };
}

async function loadStageMap(line) {
  const { rows } = await pool.query(
    `select key, label, status_col, start_col, end_col, enabled
     from public.workflow_stage
     where line = $1;`,
    [line]
  );
  const map = new Map();
  for (const r of rows) map.set(r.key, r);
  return map;
}

async function getNextStages(line, fromKey, ctx) {
  const { rows } = await pool.query(
    `select id, line, from_key, to_key, priority, enabled, condition_json
     from public.workflow_edge
     where line = $1 and from_key = $2 and enabled = true
     order by priority asc, to_key asc;`,
    [line, fromKey]
  );

  const next = [];
  for (const e of rows) {
    if (evalConditionJson(ctx, e.condition_json)) next.push(e.to_key);
  }
  return next;
}

async function checkRequirements(line, stageKey, rowData) {
  const { rows } = await pool.query(
    `select type, group_id, required_key
     from public.workflow_requirement
     where line = $1 and stage_key = $2;`,
    [line, stageKey]
  );

  const reqAll = rows.filter(r => r.type === 'ALL').map(r => r.required_key);

  const anyGroups = new Map();
  for (const r of rows.filter(r => r.type === 'ANY_GROUP')) {
    const gid = r.group_id ?? 0;
    if (!anyGroups.has(gid)) anyGroups.set(gid, []);
    anyGroups.get(gid).push(r.required_key);
  }

  const isFinal = (k) => low(rowData?.[k]) === low(STATUS.FINALIZADO);

  for (const k of reqAll) {
    if (!isFinal(k)) {
      return { ok: false, reason: `Requisito ALL no cumplido: ${k} no está Finalizado` };
    }
  }

  for (const [gid, keys] of anyGroups.entries()) {
    const ok = keys.some(k => isFinal(k));
    if (!ok) {
      return { ok: false, reason: `Requisito ANY_GROUP(${gid}) no cumplido: ninguno de [${keys.join(', ')}] está Finalizado` };
    }
  }

  return { ok: true };
}

// ===================== WORKFLOW ADMIN API =====================

app.get('/admin/workflow/config', adminAuth, async (req, res) => {
  try {
    const line = String(req.query.line || '').trim();
    if (!['portones', 'ipanel'].includes(line)) {
      return res.status(400).json({ error: 'line debe ser portones o ipanel' });
    }
    const cfg = await getWorkflowConfig(line);
    return res.json({ ok: true, ...cfg });
  } catch (err) {
    console.error('get workflow config error:', err);
    return res.status(500).json({ error: 'Error leyendo workflow', detail: err.message });
  }
});

app.put('/admin/workflow/config', adminAuth, async (req, res) => {
  const line = String(req.query.line || '').trim();
  if (!['portones', 'ipanel'].includes(line)) {
    return res.status(400).json({ error: 'line debe ser portones o ipanel' });
  }

  const { edges = [], requirements = [], stageLabels = [] } = req.body || {};

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    if (Array.isArray(stageLabels) && stageLabels.length) {
      for (const s of stageLabels) {
        if (!s?.key) continue;
        await client.query(
          `update public.workflow_stage
           set label = $3, updated_at = now()
           where line = $1 and key = $2;`,
          [line, String(s.key), String(s.label || s.key)]
        );
      }
    }

    await client.query(`delete from public.workflow_edge where line = $1;`, [line]);
    for (const e of edges) {
      if (!e?.from_key || !e?.to_key) continue;
      await client.query(
        `
        insert into public.workflow_edge(line, from_key, to_key, priority, enabled, condition_json)
        values ($1,$2,$3,$4,$5,$6);
        `,
        [
          line,
          String(e.from_key),
          String(e.to_key),
          Number.isInteger(Number(e.priority)) ? Number(e.priority) : 100,
          e.enabled !== false,
          e.condition_json ?? null
        ]
      );
    }

    await client.query(`delete from public.workflow_requirement where line = $1;`, [line]);
    for (const r of requirements) {
      if (!r?.stage_key || !r?.type || !r?.required_key) continue;
      await client.query(
        `
        insert into public.workflow_requirement(line, stage_key, type, group_id, required_key)
        values ($1,$2,$3,$4,$5);
        `,
        [
          line,
          String(r.stage_key),
          String(r.type),
          r.group_id == null ? null : Number(r.group_id),
          String(r.required_key)
        ]
      );
    }

    await client.query('COMMIT');
    const cfg = await getWorkflowConfig(line);
    return res.json({ ok: true, ...cfg });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('save workflow config error:', err);
    return res.status(500).json({ error: 'Error guardando workflow', detail: err.message });
  } finally {
    client.release();
  }
});

// ===================== Estados & Etapas ====================
// Mantengo tus keys técnicas (no rompe lo previo)

const STAGES = {
  diseno: { status: 'diseno', start: 'diseno_inicio', end: 'diseno_fin' },
  laser: { status: 'laser', start: 'laser_inicio', end: 'laser_fin' },

  guillotina: { status: 'guillotina', start: 'guillotina_inicio', end: 'guillotina_fin' }, // Corte piernas
  corte_revest: { status: 'corte_revest', start: 'corte_revest_inicio', end: 'corte_revest_fin' }, // Corte revest.

  plegadora: { status: 'plegadora', start: 'plegadora_inicio', end: 'plegadora_fin' }, // Plegado piernas
  plegado_revest: { status: 'plegado_revest', start: 'plegado_revest_inicio', end: 'plegado_revest_fin' }, // Plegado revest.

  armado_piernas: { status: 'armado_piernas', start: 'armado_piernas_inicio', end: 'armado_piernas_fin' }, // Prefabricados
  armado_hojas: { status: 'armado_hojas', start: 'armado_hojas_inicio', end: 'armado_hojas_fin' },
  armado_marco_piernas: { status: 'armado_marco_piernas', start: 'armado_marco_piernas_inicio', end: 'armado_marco_piernas_fin' },
  armado_primario: { status: 'armado_primario', start: 'armado_primario_inicio', end: 'armado_primario_fin' },

  revestimiento: { status: 'revestimiento', start: 'revestimiento_inicio', end: 'revestimiento_fin' },
  pintura: { status: 'pintura', start: 'pintura_inicio', end: 'pintura_fin' },
  inyeccion: { status: 'inyeccion', start: 'inyeccion_inicio', end: 'inyeccion_fin' },

  armado_final: { status: 'armado_final', start: 'armado_final_inicio', end: 'armado_final_fin' },
  despacho: { status: 'despacho', start: 'despacho_inicio', end: 'despacho_fin' }
};

const IPANEL_STAGES = {
  diseno: { status: 'diseno', start: 'diseno_inicio', end: 'diseno_fin' },
  guillotina: { status: 'guillotina', start: 'guillotina_inicio', end: 'guillotina_fin' }, // Corte ipanel
  plegado: { status: 'plegado', start: 'plegado_inicio', end: 'plegado_fin' }, // Plegado ipanel
  pintura: { status: 'pintura', start: 'pintura_inicio', end: 'pintura_fin' },
  inyeccion: { status: 'inyeccion', start: 'inyeccion_inicio', end: 'inyeccion_fin' },
  despacho: { status: 'despacho', start: 'despacho_inicio', end: 'despacho_fin' },
};

const PORTONES_ALLOWED_STATUS_COLS = new Set(Object.keys(STAGES));
const IPANEL_ALLOWED_STATUS_COLS = new Set(Object.keys(IPANEL_STAGES));

// --------------------- Lógica Portones ---------------------

app.get('/portones', async (_req, res) => {
  try {
    const { rows } = await pool.query('select * from public.portones order by nv asc;');
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error leyendo portones', detail: err.message });
  }
});

app.post('/portones', async (req, res) => {
  try {
    const { nv, nlista, partida: bodyPartida, npartida } = req.body || {};

    const nNv = Number(nv);
    const nNl = Number(nlista);
    const nPa = Number(bodyPartida ?? npartida);

    if (![nNv, nNl, nPa].every(Number.isInteger)) {
      return res.status(400).json({ error: 'nv, nlista y partida/npartida deben ser enteros' });
    }

    const { rowCount: exists } = await pool.query(
      'select 1 from public.portones where nv = $1 and nlista = $2 limit 1;',
      [nNv, nNl]
    );
    if (exists) {
      return res.status(409).json({ error: 'Ya existe un portón con ese NV y NLista' });
    }

    const { rows } = await pool.query(
      `insert into public.portones (nv, nlista, partida)
       values ($1, $2, $3)
       returning *;`,
      [nNv, nNl, nPa]
    );

    return res.status(201).json(rows[0]);
  } catch (err) {
    console.error('create porton error:', err);
    return res.status(500).json({ error: 'Error creando portón', detail: err.message });
  }
});

// POST /portones/:id/stage  { stage, action: 'start'|'stop' }
app.post('/portones/:id/stage', async (req, res) => {
  const { id } = req.params;
  const { stage, action } = req.body || {};
  const cfg = STAGES[stage];

  if (!cfg || !['start', 'stop'].includes(action)) {
    return res.status(400).json({ error: 'Parámetros inválidos' });
  }

  const client = await pool.connect();
  try {
    await client.query('begin');

    const before = await client.query('select * from public.portones where id = $1;', [id]);
    const row0 = before.rows[0];
    if (!row0) {
      await client.query('rollback');
      return res.status(404).json({ error: 'Portón no encontrado' });
    }

    if (action === 'start') {
      const reqCheck = await checkRequirements('portones', stage, row0);
      if (!reqCheck.ok) {
        await client.query('rollback');
        return res.status(409).json({ error: reqCheck.reason });
      }

      await client.query(
        `
        UPDATE public.portones
        SET ${cfg.status} = $2,
            ${cfg.start}  = COALESCE(${cfg.start}, now())
        WHERE id = $1;
        `,
        [id, STATUS.EN_PROCESO]
      );

      const { rows } = await client.query('SELECT * FROM public.portones WHERE id = $1;', [id]);
      await client.query('commit');
      return res.json(rows[0]);
    }

    // stop => Finaliza
    await client.query(
      `
      UPDATE public.portones
      SET ${cfg.status} = $2,
          ${cfg.end}    = COALESCE(${cfg.end}, now())
      WHERE id = $1;
      `,
      [id, STATUS.FINALIZADO]
    );

    const afterQ = await client.query('select * from public.portones where id = $1;', [id]);
    const row1 = afterQ.rows[0];

    // ruteo mixto: habilitar múltiples "next"
    const stageMap = await loadStageMap('portones');
    const ctx = { ...(row1 || {}) };
    const nextKeys = await getNextStages('portones', stage, ctx);

    for (const nk of nextKeys) {
      const ns = stageMap.get(nk);
      if (!ns) continue;

      // Seguridad: solo permitimos columnas status conocidas
      const col = ns.status_col;
      if (!PORTONES_ALLOWED_STATUS_COLS.has(col)) continue;

      await client.query(
        `UPDATE public.portones
         SET ${col} = COALESCE(${col}, $2)
         WHERE id = $1;`,
        [id, STATUS.PENDIENTE]
      );
    }

    const { rows } = await client.query('SELECT * FROM public.portones WHERE id = $1;', [id]);
    await client.query('commit');
    return res.json(rows[0]);
  } catch (err) {
    await client.query('rollback');
    console.error('stage error:', err);
    return res.status(500).json({ error: 'Error al actualizar etapa', detail: err.message });
  } finally {
    client.release();
  }
});

// POST /portones/:id/fecha-plan
app.post('/portones/:id/fecha-plan', async (req, res) => {
  const { id } = req.params;
  let { fecha_plan } = req.body || {};

  try {
    if (fecha_plan !== null && fecha_plan !== undefined) {
      if (typeof fecha_plan !== 'string') {
        return res.status(400).json({ error: 'fecha_plan debe ser string con formato YYYY-MM-DD o null' });
      }
      fecha_plan = fecha_plan.slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha_plan)) {
        return res.status(400).json({ error: 'fecha_plan inválida. Use formato YYYY-MM-DD' });
      }
    }

    const { rows } = await pool.query(
      `UPDATE public.portones
       SET fecha_plan = $2
       WHERE id = $1
       RETURNING *;`,
      [id, fecha_plan ?? null]
    );

    if (!rows.length) return res.status(404).json({ error: 'Portón no encontrado' });
    return res.json(rows[0]);
  } catch (err) {
    console.error('set fecha_plan error:', err);
    return res.status(500).json({ error: 'Error al actualizar fecha planificada', detail: err.message });
  }
});

// POST /portones/:id/fecha-prod
app.post('/portones/:id/fecha-prod', async (req, res) => {
  const { id } = req.params;
  let { fecha_prod } = req.body || {};

  try {
    if (fecha_prod !== null && fecha_prod !== undefined) {
      if (typeof fecha_prod !== 'string') {
        return res.status(400).json({ error: 'fecha_prod debe ser string con formato YYYY-MM-DD o null' });
      }
      fecha_prod = fecha_prod.slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha_prod)) {
        return res.status(400).json({ error: 'fecha_prod inválida. Use formato YYYY-MM-DD' });
      }
    }

    const { rows } = await pool.query(
      `UPDATE public.portones
       SET fecha_prod = $2
       WHERE id = $1
       RETURNING *;`,
      [id, fecha_prod ?? null]
    );

    if (!rows.length) return res.status(404).json({ error: 'Portón no encontrado' });
    return res.json(rows[0]);
  } catch (err) {
    console.error('set fecha_prod error:', err);
    return res.status(500).json({ error: 'Error al actualizar fecha de producción', detail: err.message });
  }
});

// POST /portones/:id/fecha-nv
app.post('/portones/:id/fecha-nv', async (req, res) => {
  const { id } = req.params;
  let { fecha_nv } = req.body || {};

  try {
    if (fecha_nv !== null && fecha_nv !== undefined) {
      if (typeof fecha_nv !== 'string') {
        return res.status(400).json({ error: 'fecha_nv debe ser string con formato YYYY-MM-DD o null' });
      }
      fecha_nv = fecha_nv.slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha_nv)) {
        return res.status(400).json({ error: 'fecha_nv inválida. Use formato YYYY-MM-DD' });
      }
    }

    const { rows } = await pool.query(
      `UPDATE public.portones
       SET fecha_nv = $2
       WHERE id = $1
       RETURNING *;`,
      [id, fecha_nv ?? null]
    );

    if (!rows.length) return res.status(404).json({ error: 'Portón no encontrado' });
    return res.json(rows[0]);
  } catch (err) {
    console.error('set fecha_nv error:', err);
    return res.status(500).json({ error: 'Error al actualizar fecha de nota de venta', detail: err.message });
  }
});

// POST /portones/:id/fecha-med
app.post('/portones/:id/fecha-med', async (req, res) => {
  const { id } = req.params;
  let { fecha_med } = req.body || {};

  try {
    if (fecha_med !== null && fecha_med !== undefined) {
      if (typeof fecha_med !== 'string') {
        return res.status(400).json({ error: 'fecha_med debe ser string con formato YYYY-MM-DD o null' });
      }
      fecha_med = fecha_med.slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha_med)) {
        return res.status(400).json({ error: 'fecha_med inválida. Use formato YYYY-MM-DD' });
      }
    }

    const { rows } = await pool.query(
      `UPDATE public.portones
       SET fecha_med = $2
       WHERE id = $1
       RETURNING *;`,
      [id, fecha_med ?? null]
    );

    if (!rows.length) return res.status(404).json({ error: 'Portón no encontrado' });
    return res.json(rows[0]);
  } catch (err) {
    console.error('set fecha_med error:', err);
    return res.status(500).json({ error: 'Error al actualizar fecha de medición', detail: err.message });
  }
});

// POST /portones/:id/fecha-plan-entrega
app.post('/portones/:id/fecha-plan-entrega', async (req, res) => {
  const { id } = req.params;
  let { fecha_plan_entrega } = req.body || {};

  try {
    if (fecha_plan_entrega !== null && fecha_plan_entrega !== undefined) {
      if (typeof fecha_plan_entrega !== 'string') {
        return res.status(400).json({ error: 'fecha_plan_entrega debe ser string con formato YYYY-MM-DD o null' });
      }
      fecha_plan_entrega = fecha_plan_entrega.slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha_plan_entrega)) {
        return res.status(400).json({ error: 'fecha_plan_entrega inválida. Use formato YYYY-MM-DD' });
      }
    }

    const { rows } = await pool.query(
      `UPDATE public.portones
       SET fecha_plan_entrega = $2
       WHERE id = $1
       RETURNING *;`,
      [id, fecha_plan_entrega ?? null]
    );

    if (!rows.length) return res.status(404).json({ error: 'Portón no encontrado' });
    return res.json(rows[0]);
  } catch (err) {
    console.error('set fecha_plan_entrega error:', err);
    return res.status(500).json({ error: 'Error al actualizar fecha planificada de llegada', detail: err.message });
  }
});

// GET /planta/bases -> [{date:"YYYY-MM-DD", qty:123, created_at:"..."}]
// Devuelve TODAS las bases (histórico) para que el front no “borre” lo previo al cargar una nueva base
app.get('/planta/bases', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `
      select base_date::text as date, qty, created_at
      from public.planta_base
      order by base_date asc, created_at asc, id asc;
      `
    );

    res.setHeader('Cache-Control', 'no-store');
    return res.json(rows);
  } catch (err) {
    console.error('planta bases get error:', err);
    return res.status(500).json({ error: 'Error leyendo histórico base planta', detail: err.message });
  }
});

// ===================== Observaciones PORTONES =====================

app.get('/portones/:id/observaciones', async (req, res) => {
  const { id } = req.params;

  try {
    const { rows } = await pool.query(
      `SELECT id, observaciones
       FROM public.portones
       WHERE id = $1;`,
      [id]
    );

    if (!rows.length) return res.status(404).json({ error: 'Portón no encontrado' });
    return res.json(rows[0]);
  } catch (err) {
    console.error('get observaciones porton error:', err);
    return res.status(500).json({ error: 'Error leyendo observaciones de portón', detail: err.message });
  }
});

async function upsertPortonObservaciones(req, res) {
  const { id } = req.params;
  let { observaciones } = req.body || {};

  try {
    if (observaciones !== null && observaciones !== undefined && typeof observaciones !== 'string') {
      return res.status(400).json({ error: 'observaciones debe ser string o null' });
    }

    const { rows } = await pool.query(
      `UPDATE public.portones
       SET observaciones = $2
       WHERE id = $1
       RETURNING id, observaciones;`,
      [id, observaciones ?? null]
    );

    if (!rows.length) return res.status(404).json({ error: 'Portón no encontrado' });
    return res.json(rows[0]);
  } catch (err) {
    console.error('set observaciones porton error:', err);
    return res.status(500).json({ error: 'Error al actualizar observaciones de portón', detail: err.message });
  }
}

app.post('/portones/:id/observaciones', upsertPortonObservaciones);
app.put('/portones/:id/observaciones', upsertPortonObservaciones);

// --------------------- Lógica IPANEL ---------------------

app.get('/ipanel', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM public.ipanel
       ORDER BY COALESCE(partida, 0) ASC, COALESCE(nv, 0) ASC, id ASC;`
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error leyendo ipanel', detail: err.message });
  }
});

app.post('/ipanel', async (req, res) => {
  try {
    const { partida: bodyPartida, npartida, nv } = req.body || {};
    const nNv = Number(nv);
    const hasPartida = (bodyPartida ?? npartida) != null;

    if (!Number.isInteger(nNv)) {
      return res.status(400).json({ error: 'nv debe ser entero' });
    }

    let query = `INSERT INTO public.ipanel (nv${hasPartida ? ', partida' : ''})
                 VALUES ($1${hasPartida ? ', $2' : ''})
                 RETURNING *;`;
    let params = hasPartida ? [nNv, Number(bodyPartida ?? npartida)] : [nNv];

    const { rows } = await pool.query(query, params);
    return res.status(201).json(rows[0]);
  } catch (err) {
    console.error('create ipanel error:', err);
    return res.status(500).json({ error: 'Error creando ipanel', detail: err.message });
  }
});

// POST /ipanel/:id/stage  { stage, action: 'start'|'stop' }
app.post('/ipanel/:id/stage', async (req, res) => {
  const { id } = req.params;
  const { stage, action } = req.body || {};
  const cfg = IPANEL_STAGES[stage];

  if (!cfg || !['start', 'stop'].includes(action)) {
    return res.status(400).json({ error: 'Parámetros inválidos' });
  }

  const client = await pool.connect();
  try {
    await client.query('begin');

    const before = await client.query('select * from public.ipanel where id = $1;', [id]);
    const row0 = before.rows[0];
    if (!row0) {
      await client.query('rollback');
      return res.status(404).json({ error: 'iPanel no encontrado' });
    }

    if (action === 'start') {
      const reqCheck = await checkRequirements('ipanel', stage, row0);
      if (!reqCheck.ok) {
        await client.query('rollback');
        return res.status(409).json({ error: reqCheck.reason });
      }

      await client.query(
        `
        UPDATE public.ipanel
        SET ${cfg.status} = $2,
            ${cfg.start}  = COALESCE(${cfg.start}, now())
        WHERE id = $1;
        `,
        [id, STATUS.EN_PROCESO]
      );

      const { rows } = await client.query('SELECT * FROM public.ipanel WHERE id = $1;', [id]);
      await client.query('commit');
      return res.json(rows[0]);
    }

    // stop
    await client.query(
      `
      UPDATE public.ipanel
      SET ${cfg.status} = $2,
          ${cfg.end}    = COALESCE(${cfg.end}, now())
      WHERE id = $1;
      `,
      [id, STATUS.FINALIZADO]
    );

    const afterQ = await client.query('select * from public.ipanel where id = $1;', [id]);
    const row1 = afterQ.rows[0];

    const stageMap = await loadStageMap('ipanel');
    const ctx = { ...(row1 || {}) };
    const nextKeys = await getNextStages('ipanel', stage, ctx);

    for (const nk of nextKeys) {
      const ns = stageMap.get(nk);
      if (!ns) continue;

      const col = ns.status_col;
      if (!IPANEL_ALLOWED_STATUS_COLS.has(col)) continue;

      await client.query(
        `UPDATE public.ipanel
         SET ${col} = COALESCE(${col}, $2)
         WHERE id = $1;`,
        [id, STATUS.PENDIENTE]
      );
    }

    const { rows } = await client.query('SELECT * FROM public.ipanel WHERE id = $1;', [id]);
    await client.query('commit');
    return res.json(rows[0]);
  } catch (err) {
    await client.query('rollback');
    console.error('ipanel stage error:', err);
    return res.status(500).json({ error: 'Error al actualizar etapa de ipanel', detail: err.message });
  } finally {
    client.release();
  }
});

// POST /ipanel/:id/fecha-prod
app.post('/ipanel/:id/fecha-prod', async (req, res) => {
  const { id } = req.params;
  let { fecha_prod } = req.body || {};

  try {
    if (fecha_prod !== null && fecha_prod !== undefined) {
      if (typeof fecha_prod !== 'string') {
        return res.status(400).json({ error: 'fecha_prod debe ser string con formato YYYY-MM-DD o null' });
      }
      fecha_prod = fecha_prod.slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha_prod)) {
        return res.status(400).json({ error: 'fecha_prod inválida. Use formato YYYY-MM-DD' });
      }
    }

    const { rows } = await pool.query(
      `UPDATE public.ipanel
       SET fecha_prod = $2
       WHERE id = $1
       RETURNING *;`,
      [id, fecha_prod ?? null]
    );

    if (!rows.length) return res.status(404).json({ error: 'iPanel no encontrado' });
    return res.json(rows[0]);
  } catch (err) {
    console.error('set ipanel fecha_prod error:', err);
    return res.status(500).json({ error: 'Error al actualizar fecha de producción de iPanel', detail: err.message });
  }
});

// POST /ipanel/:id/fecha-nv
app.post('/ipanel/:id/fecha-nv', async (req, res) => {
  const { id } = req.params;
  let { fecha_nv } = req.body || {};

  try {
    if (fecha_nv !== null && fecha_nv !== undefined) {
      if (typeof fecha_nv !== 'string') {
        return res.status(400).json({ error: 'fecha_nv debe ser string con formato YYYY-MM-DD o null' });
      }
      fecha_nv = fecha_nv.slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha_nv)) {
        return res.status(400).json({ error: 'fecha_nv inválida. Use formato YYYY-MM-DD' });
      }
    }

    const { rows } = await pool.query(
      `UPDATE public.ipanel
       SET fecha_nv = $2
       WHERE id = $1
       RETURNING *;`,
      [id, fecha_nv ?? null]
    );

    if (!rows.length) return res.status(404).json({ error: 'iPanel no encontrado' });
    return res.json(rows[0]);
  } catch (err) {
    console.error('set ipanel fecha_nv error:', err);
    return res.status(500).json({ error: 'Error al actualizar fecha de nota de venta de iPanel', detail: err.message });
  }
});

// POST /ipanel/:id/fecha-med
app.post('/ipanel/:id/fecha-med', async (req, res) => {
  const { id } = req.params;
  let { fecha_med } = req.body || {};

  try {
    if (fecha_med !== null && fecha_med !== undefined) {
      if (typeof fecha_med !== 'string') {
        return res.status(400).json({ error: 'fecha_med debe ser string con formato YYYY-MM-DD o null' });
      }
      fecha_med = fecha_med.slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha_med)) {
        return res.status(400).json({ error: 'fecha_med inválida. Use formato YYYY-MM-DD' });
      }
    }

    const { rows } = await pool.query(
      `UPDATE public.ipanel
       SET fecha_med = $2
       WHERE id = $1
       RETURNING *;`,
      [id, fecha_med ?? null]
    );

    if (!rows.length) return res.status(404).json({ error: 'iPanel no encontrado' });
    return res.json(rows[0]);
  } catch (err) {
    console.error('set ipanel fecha_med error:', err);
    return res.status(500).json({ error: 'Error al actualizar fecha de medición de iPanel', detail: err.message });
  }
});

// POST /ipanel/:id/fecha-plan
app.post('/ipanel/:id/fecha-plan', async (req, res) => {
  const { id } = req.params;
  let { fecha_plan } = req.body || {};

  try {
    if (fecha_plan !== null && fecha_plan !== undefined) {
      if (typeof fecha_plan !== 'string') {
        return res.status(400).json({ error: 'fecha_plan debe ser string con formato YYYY-MM-DD o null' });
      }
      fecha_plan = fecha_plan.slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha_plan)) {
        return res.status(400).json({ error: 'fecha_plan inválida. Use formato YYYY-MM-DD' });
      }
    }

    const { rows } = await pool.query(
      `UPDATE public.ipanel
       SET fecha_plan = $2
       WHERE id = $1
       RETURNING *;`,
      [id, fecha_plan ?? null]
    );

    if (!rows.length) return res.status(404).json({ error: 'iPanel no encontrado' });
    return res.json(rows[0]);
  } catch (err) {
    console.error('set ipanel fecha_plan error:', err);
    return res.status(500).json({ error: 'Error al actualizar fecha planificada de salida de iPanel', detail: err.message });
  }
});

// POST /ipanel/:id/fecha-plan-entrega
app.post('/ipanel/:id/fecha-plan-entrega', async (req, res) => {
  const { id } = req.params;
  let { fecha_plan_entrega } = req.body || {};

  try {
    if (fecha_plan_entrega !== null && fecha_plan_entrega !== undefined) {
      if (typeof fecha_plan_entrega !== 'string') {
        return res.status(400).json({ error: 'fecha_plan_entrega debe ser string con formato YYYY-MM-DD o null' });
      }
      fecha_plan_entrega = fecha_plan_entrega.slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha_plan_entrega)) {
        return res.status(400).json({ error: 'fecha_plan_entrega inválida. Use formato YYYY-MM-DD' });
      }
    }

    const { rows } = await pool.query(
      `UPDATE public.ipanel
       SET fecha_plan_entrega = $2
       WHERE id = $1
       RETURNING *;`,
      [id, fecha_plan_entrega ?? null]
    );

    if (!rows.length) return res.status(404).json({ error: 'iPanel no encontrado' });
    return res.json(rows[0]);
  } catch (err) {
    console.error('set ipanel fecha_plan_entrega error:', err);
    return res.status(500).json({ error: 'Error al actualizar fecha planificada de llegada de iPanel', detail: err.message });
  }
});

// ===================== Observaciones IPANEL =====================

app.get('/ipanel/:id/observaciones', async (req, res) => {
  const { id } = req.params;

  try {
    const { rows } = await pool.query(
      `SELECT id, observaciones
       FROM public.ipanel
       WHERE id = $1;`,
      [id]
    );

    if (!rows.length) return res.status(404).json({ error: 'iPanel no encontrado' });
    return res.json(rows[0]);
  } catch (err) {
    console.error('get observaciones ipanel error:', err);
    return res.status(500).json({ error: 'Error leyendo observaciones de iPanel', detail: err.message });
  }
});

async function upsertIpanelObservaciones(req, res) {
  const { id } = req.params;
  let { observaciones } = req.body || {};

  try {
    if (observaciones !== null && observaciones !== undefined && typeof observaciones !== 'string') {
      return res.status(400).json({ error: 'observaciones debe ser string o null' });
    }

    const { rows } = await pool.query(
      `UPDATE public.ipanel
       SET observaciones = $2
       WHERE id = $1
       RETURNING id, observaciones;`,
      [id, observaciones ?? null]
    );

    if (!rows.length) return res.status(404).json({ error: 'iPanel no encontrado' });
    return res.json(rows[0]);
  } catch (err) {
    console.error('set observaciones ipanel error:', err);
    return res.status(500).json({ error: 'Error al actualizar observaciones de iPanel', detail: err.message });
  }
}

app.post('/ipanel/:id/observaciones', upsertIpanelObservaciones);
app.put('/ipanel/:id/observaciones', upsertIpanelObservaciones);

// =========================
// DESPACHAR BASE (Supabase table public.despachar_base)
// =========================

// GET /despachar/base -> { date: "YYYY-MM-DD", qty: 123 }  o {date:null, qty:null} si no hay base
app.get('/despachar/base', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `
      select base_date::text as date, qty
      from public.despachar_base
      order by base_date desc, created_at desc, id desc
      limit 1;
      `
    );

    res.setHeader('Cache-Control', 'no-store');

    if (!rows.length) return res.json({ date: null, qty: null });
    return res.json(rows[0]);
  } catch (err) {
    console.error('despachar base get error:', err);
    return res.status(500).json({ error: 'Error leyendo base despachar', detail: err.message });
  }
});

// POST /despachar/base (LIBRE) body: { date, qty } -> inserta nueva base
// devuelve { date, qty }
app.post('/despachar/base', async (req, res) => {
  try {
    const date = String(req.body?.date || '').trim();
    const qty = Number(req.body?.qty);

    if (!isValidISODate10(date)) {
      return res.status(400).json({ error: 'Fecha inválida (YYYY-MM-DD)' });
    }
    if (!Number.isInteger(qty) || qty < 0) {
      return res.status(400).json({ error: 'qty debe ser entero >= 0' });
    }

    const { rows } = await pool.query(
      `
      insert into public.despachar_base(base_date, qty)
      values ($1::date, $2::int)
      returning base_date::text as date, qty;
      `,
      [date, qty]
    );

    res.setHeader('Cache-Control', 'no-store');
    return res.status(201).json(rows[0]);
  } catch (err) {
    console.error('despachar base post error:', err);
    return res.status(500).json({ error: 'Error guardando base despachar', detail: err.message });
  }
});

// GET /despachar/bases -> [{date:"YYYY-MM-DD", qty:123, created_at:"..."}]
// Devuelve TODAS las bases (histórico) para que el front no “borre” lo previo al cargar una nueva base
app.get('/despachar/bases', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `
      select base_date::text as date, qty, created_at
      from public.despachar_base
      order by base_date asc, created_at asc, id asc;
      `
    );

    res.setHeader('Cache-Control', 'no-store');
    return res.json(rows);
  } catch (err) {
    console.error('despachar bases get error:', err);
    return res.status(500).json({ error: 'Error leyendo histórico base despachar', detail: err.message });
  }
});


// --------------------- Cierre prolijo ---------------------
process.on('SIGINT', async () => {
  await pool.end();
  process.exit(0);
});
process.on('SIGTERM', async () => {
  await pool.end();
  process.exit(0);
});

app.listen(PORT, () => {
  console.log(`Backend escuchando en http://localhost:${PORT}`);
});
