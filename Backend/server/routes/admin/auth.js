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

    const { rows } = await pool.query(
      `
      select id, username, password_hash, is_active
      from public.admin_users
      where username = $1
      limit 1;
      `,
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

module.exports = router;
