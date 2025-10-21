require('dotenv').config();

const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const { Pool } = require('pg');

const app = express();

const PORT = process.env.PORT || 4000;
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || 'http://localhost:5173';

// Pool de Postgres (Supabase requiere SSL)
const pool = new Pool({
  connectionString: process.env.SUPABASE_DB_URL,
  ssl: { rejectUnauthorized: false }
});

app.use(cors({ origin: FRONTEND_ORIGIN }));
app.use(express.json());
app.use(morgan('dev'));

app.get('/', (_req, res) => {
  res.json({ ok: true, service: 'portones-backend' });
});

const getAllPortones = async (_req, res) => {
  try {
    const { rows } = await pool.query(
      'select * from public.portones order by nv asc;'
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error leyendo portones', detail: err.message });
  }
};

// Healthcheck: devuelve texto simple según estado
app.get('/healtz', async (_req, res) => {
  try {
    // chequeo básico de DB (rápido y barato)
    await pool.query('select 1;');
    return res
      .status(200)
      .type('text/plain; charset=utf-8')
      .send('El servidor está Online');
  } catch (err) {
    console.error('Healthcheck error:', err);
    return res
      .status(500)
      .type('text/plain; charset=utf-8')
      .send('El servidor tiene errores');
  }
});

// (opcional) alias sin la z
app.get('/healt', async (_req, res) => {
  try {
    await pool.query('select 1;');
    return res.status(200).type('text/plain; charset=utf-8').send('El servidor está Online');
  } catch (err) {
    console.error('Healthcheck error:', err);
    return res.status(500).type('text/plain; charset=utf-8').send('El servidor tiene errores');
  }
});

app.get('/portones', getAllPortones);

// Cierre prolijo
process.on('SIGINT', async () => {
  await pool.end();
  process.exit(0);
});

app.listen(PORT, () => {
  console.log(`Backend escuchando en http://localhost:${PORT}`);
});
