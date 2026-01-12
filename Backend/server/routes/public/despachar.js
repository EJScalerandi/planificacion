const express = require('express');
const { pool } = require('../../db');
const { isValidISODate10 } = require('../../lib/common');

const router = express.Router();

// GET /despachar/base
router.get('/despachar/base', async (_req, res) => {
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

// POST /despachar/base
router.post('/despachar/base', async (req, res) => {
  try {
    const date = String(req.body?.date || '').trim();
    const qty = Number(req.body?.qty);

    if (!isValidISODate10(date)) return res.status(400).json({ error: 'Fecha inválida (YYYY-MM-DD)' });
    if (!Number.isInteger(qty) || qty < 0) return res.status(400).json({ error: 'qty debe ser entero >= 0' });

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

// GET /despachar/bases
router.get('/despachar/bases', async (_req, res) => {
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

module.exports = router;
