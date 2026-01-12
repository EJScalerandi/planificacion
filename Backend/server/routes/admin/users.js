const express = require('express');
const bcrypt = require('bcryptjs');
const { adminAuth } = require('../../middleware/adminAuth');
const { pool } = require('../../db');

const router = express.Router();

function isNonEmpty(s) {
  return String(s || '').trim().length > 0;
}

function normalizeScopes(scopes) {
  if (!Array.isArray(scopes)) return [];
  return Array.from(new Set(scopes.map(s => String(s || '').trim()).filter(Boolean)));
}

// GET /admin/users
router.get('/users', adminAuth, async (_req, res, next) => {
  try {
    // El frontend del dashboard viene consumiendo arrays directos (como /portones,
    // /preproduccion-valores, etc.). Para mantener el contrato consistente, acá
    // devolvemos la lista directamente (sin wrapper { ok, users }).
    const { rows } = await pool.query(`
  select
    id,
    username,
    is_active,
    coalesce(scopes, '{}'::text[]) as scopes,
    name,
    name as full_name,
    email,
    created_at,
    updated_at
  from public.admin_users
  order by id asc;
`);
return res.json(rows);
  } catch (e) { next(e); }
});

// POST /admin/users
router.post('/users', adminAuth, async (req, res, next) => {
  try {
    const body = req.body || {};

    const un = String(body.username || '').trim();
    const pw = String(body.password || '');

    const name = String(body.full_name ?? body.name ?? '').trim() || null;
    const email = body.email == null ? null : String(body.email).trim() || null;

    // activo: soporta is_active o active
    const isActive =
      body.is_active !== undefined ? body.is_active === true
      : body.active !== undefined ? body.active === true
      : true;

    if (!isNonEmpty(un)) return res.status(400).json({ error: 'username requerido' });
    if (!isNonEmpty(pw) || pw.length < 6) return res.status(400).json({ error: 'password mínimo 6 caracteres' });

    const sc = normalizeScopes(body.scopes);
    const hash = await bcrypt.hash(pw, 10);

    const { rows } = await pool.query(`
      insert into public.admin_users (username, password_hash, is_active, scopes, name, email, created_at, updated_at)
      values ($1, $2, $3, $4::text[], $5, $6, now(), now())
      returning id, username, is_active, scopes, name, name as full_name, email, created_at, updated_at;
    `, [un, hash, isActive, sc, name, email]);

    return res.status(201).json(rows[0]);
  } catch (e) { next(e); }
});


// PATCH /admin/users/:id
router.patch('/users/:id', adminAuth, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'id inválido' });

    const patch = req.body || {};
    const fields = [];
    const params = [];
    let idx = 1;

    // Activo: soporta is_active o active
    if (patch.is_active !== undefined || patch.active !== undefined) {
      const v = patch.is_active !== undefined ? patch.is_active : patch.active;
      fields.push(`is_active = $${idx++}`);
      params.push(v === true);
    }

    // Name: soporta name o full_name
    if (patch.name !== undefined || patch.full_name !== undefined) {
      const nm = String(patch.full_name ?? patch.name ?? '').trim();
      fields.push(`name = $${idx++}`);
      params.push(nm || null);
    }

    // Email
    if (patch.email !== undefined) {
      const em = patch.email == null ? null : String(patch.email).trim();
      fields.push(`email = $${idx++}`);
      params.push(em || null);
    }

    // Scopes
    if (patch.scopes !== undefined) {
      const sc = normalizeScopes(patch.scopes);
      fields.push(`scopes = $${idx++}::text[]`);
      params.push(sc);
    }

    if (!fields.length) return res.status(400).json({ error: 'No hay campos para actualizar' });

    fields.push(`updated_at = now()`);
    params.push(id);

    const { rows, rowCount } = await pool.query(`
      update public.admin_users
      set ${fields.join(', ')}
      where id = $${idx}
      returning id, username, is_active, scopes, name, name as full_name, email, created_at, updated_at;
    `, params);

    if (!rowCount) return res.status(404).json({ error: 'Usuario no encontrado' });

    return res.json(rows[0]);
  } catch (e) { next(e); }
});


// POST /admin/users/:id/password
router.post('/users/:id/password', adminAuth, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'id inválido' });

    const pw = String(req.body?.password || '');
    if (!isNonEmpty(pw) || pw.length < 6) return res.status(400).json({ error: 'password mínimo 6 caracteres' });

    const hash = await bcrypt.hash(pw, 10);

    const { rowCount } = await pool.query(`
      update public.admin_users
      set password_hash = $2, updated_at = now()
      where id = $1;
    `, [id, hash]);

    if (!rowCount) return res.status(404).json({ error: 'Usuario no encontrado' });

    return res.json({ ok: true });
  } catch (e) { next(e); }
});

// GET /admin/scopes
router.get('/scopes', adminAuth, async (_req, res) => {
  const scopes = (process.env.ADMIN_SCOPES || 'users:read,users:write,qc:admin,workflow:admin')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

  return res.json(scopes);
});

module.exports = router;
