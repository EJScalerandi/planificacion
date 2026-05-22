const express = require('express');
const bcrypt = require('bcryptjs');
const { pool } = require('../../db');
const { signAdminToken } = require('../../middleware/adminAuth');

const router = express.Router();

// POST /admin/login
router.post('/login', async (req, res, next) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ error: 'username y password son requeridos' });
    }

    const normalizedUsername = String(username).trim();

    const { rows } = await pool.query(
      `
      select
        id,
        username,
        password_hash,
        is_active,
        coalesce(scopes, '{}'::text[]) as scopes
      from public.admin_users
      where lower(username) = lower($1)
      limit 1;
      `,
      [normalizedUsername]
    );

    const u = rows[0];
    if (!u || !u.is_active) return res.status(401).json({ error: 'Credenciales inválidas' });

    const ok = await bcrypt.compare(String(password), u.password_hash);
    if (!ok) return res.status(401).json({ error: 'Credenciales inválidas' });

    const token = signAdminToken({
      sub: String(u.id),
      username: u.username,
      scopes: Array.isArray(u.scopes) ? u.scopes : [],
    });

    return res.json({ ok: true, token });
  } catch (err) {
    console.error('admin login error:', err);
    return res.status(500).json({ error: 'Error en login admin', detail: err.message });
  }
});

module.exports = router;
