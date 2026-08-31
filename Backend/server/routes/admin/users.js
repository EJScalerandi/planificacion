const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');

const { pool } = require('../../db');
const { adminAuth } = require('../../middleware/adminAuth');

// Alcances válidos de la app: los que realmente chequea el frontend
// (menú de Índice, panel de Preproducción, etc.). Es una lista fija de la
// aplicación, no una config de entorno: si se agrega un scope acá sin
// enchufarlo en el frontend (o viceversa), no hace nada.
const CANONICAL_SCOPES = [
  'qc:admin',
  'workflow:admin',
  'users:admin',
  'preproduccion:full',
  'preproduccion:admin',
  'preproduccion:comercial_view',
  'prefabricados:admin',
  'servicio_tecnico:admin',
  'compras:admin',
  'scheduling:admin',
];

function normalizeScopes(scopes) {
  if (!Array.isArray(scopes)) return [];
  return Array.from(
    new Set(scopes.map((s) => String(s || '').trim()).filter(Boolean))
  );
}

// GET /admin/users
router.get('/users', adminAuth, async (_req, res) => {
  try {
    const q = await pool.query(`
      select
        id,
        username,
        is_active,
        coalesce(scopes, '{}'::text[]) as scopes,
        name,
        email,
        created_at,
        updated_at
      from public.admin_users
      order by id asc
    `);

    return res.json(q.rows || []);
  } catch (err) {
    console.error('admin users list error:', err);
    return res.status(500).json({ error: 'Error listando usuarios', detail: err.message });
  }
});

// POST /admin/users
router.post('/users', adminAuth, async (req, res) => {
  try {
    const body = req.body || {};
    const username = String(body.username || '').trim();
    const password = String(body.password || '').trim();
    const is_active = body.is_active === false ? false : true;
    const name = body.name == null ? null : String(body.name || '').trim();
    const email = body.email == null ? null : String(body.email || '').trim();
    const scopes = normalizeScopes(body.scopes);

    if (!username) return res.status(400).json({ error: 'username requerido' });
    if (!password) return res.status(400).json({ error: 'password requerido' });
    if (password.length < 6) return res.status(400).json({ error: 'password debe tener al menos 6 caracteres' });

    const password_hash = await bcrypt.hash(password, 10);

    const ins = await pool.query(
      `
      insert into public.admin_users (username, password_hash, is_active, scopes, name, email, created_at, updated_at)
      values ($1, $2, $3, $4::text[], $5, $6, now(), now())
      returning id, username, is_active, scopes, name, name as full_name, email, created_at, updated_at;
      `,
      [username, password_hash, is_active, scopes, name, email]
    );

    return res.status(201).json(ins.rows[0]);
  } catch (err) {
    console.error('admin users create error:', err);
    return res.status(500).json({ error: 'Error creando usuario', detail: err.message });
  }
});

// PATCH /admin/users/:id
router.patch('/users/:id', adminAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'id inválido' });

    const patch = req.body || {};
    const fields = [];
    const values = [];
    let idx = 1;

    if (patch.username !== undefined) {
      const username = String(patch.username || '').trim();
      if (!username) return res.status(400).json({ error: 'username inválido' });
      fields.push(`username = $${idx++}`);
      values.push(username);
    }

    if (patch.is_active !== undefined) {
      fields.push(`is_active = $${idx++}`);
      values.push(patch.is_active === false ? false : true);
    }

    if (patch.name !== undefined) {
      fields.push(`name = $${idx++}`);
      values.push(patch.name == null ? null : String(patch.name || '').trim());
    }

    if (patch.email !== undefined) {
      fields.push(`email = $${idx++}`);
      values.push(patch.email == null ? null : String(patch.email || '').trim());
    }

    if (patch.scopes !== undefined) {
      const sc = normalizeScopes(patch.scopes);
      fields.push(`scopes = $${idx++}::text[]`);
      values.push(sc);
    }

    if (!fields.length) return res.status(400).json({ error: 'sin cambios' });

    fields.push(`updated_at = now()`);

    const upd = await pool.query(
      `
      update public.admin_users
      set ${fields.join(', ')}
      where id = $${idx}
      returning id, username, is_active, scopes, name, name as full_name, email, created_at, updated_at;
      `,
      [...values, id]
    );

    if (!upd.rows[0]) return res.status(404).json({ error: 'No encontrado' });
    return res.json(upd.rows[0]);
  } catch (err) {
    console.error('admin users patch error:', err);
    return res.status(500).json({ error: 'Error actualizando usuario', detail: err.message });
  }
});

// POST /admin/users/:id/password
router.post('/users/:id/password', adminAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'id inválido' });

    const password = String(req.body?.password || '').trim();
    if (!password) return res.status(400).json({ error: 'password requerido' });
    if (password.length < 6) return res.status(400).json({ error: 'password debe tener al menos 6 caracteres' });

    const password_hash = await bcrypt.hash(password, 10);

    const upd = await pool.query(
      `
      update public.admin_users
      set password_hash = $1, updated_at = now()
      where id = $2
      returning id;
      `,
      [password_hash, id]
    );

    if (!upd.rows[0]) return res.status(404).json({ error: 'No encontrado' });
    return res.json({ ok: true });
  } catch (err) {
    console.error('admin users password error:', err);
    return res.status(500).json({ error: 'Error cambiando password', detail: err.message });
  }
});

// GET /admin/scopes
router.get('/scopes', adminAuth, async (_req, res) => {
  return res.json(CANONICAL_SCOPES);
});

module.exports = router;
