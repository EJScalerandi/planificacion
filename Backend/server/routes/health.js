const express = require('express');
const { pool } = require('../db');

const router = express.Router();

router.get('/', (_req, res) => {
  res.json({ ok: true, service: 'portones-backend' });
});

async function healthHandler(_req, res) {
  try {
    await pool.query('select 1;');
    return res.status(200).type('text/plain; charset=utf-8').send('El servidor está Online');
  } catch (err) {
    console.error('Healthcheck error:', err);
    return res.status(500).type('text/plain; charset=utf-8').send('El servidor tiene errores');
  }
}

router.get('/healtz', healthHandler);
router.get('/healt', healthHandler);

module.exports = router;
