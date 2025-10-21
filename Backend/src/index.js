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
const STATUS = {
  PENDIENTE:  'Pendiente',
  EN_PROCESO: 'En Proceso',
  FINALIZADO: 'Finalizado',
};

const STAGES = {
  diseno:          { status: 'diseno',          start: 'diseno_inicio',          end: 'diseno_fin',          next: 'laser' },
  laser:           { status: 'laser',           start: 'laser_inicio',           end: 'laser_fin',           next: 'guillotina' },
  guillotina:      { status: 'guillotina',      start: 'guillotina_inicio',      end: 'guillotina_fin',      next: 'plegadora' },
  plegadora:       { status: 'plegadora',       start: 'plegadora_inicio',       end: 'plegadora_fin',       next: 'armado_piernas' },
  armado_piernas:  { status: 'armado_piernas',  start: 'armado_piernas_inicio',  end: 'armado_piernas_fin',  next: 'armado_primario' },
  armado_primario: { status: 'armado_primario', start: 'armado_primario_inicio', end: 'armado_primario_fin', next: 'inyeccion' },
  inyeccion:       { status: 'inyeccion',       start: 'inyeccion_inicio',       end: 'inyeccion_fin',       next: 'revestimiento' },
  revestimiento:   { status: 'revestimiento',   start: 'revestimiento_inicio',   end: 'revestimiento_fin',   next: 'pintura' },
  pintura:         { status: 'pintura',         start: 'pintura_inicio',         end: 'pintura_fin',         next: 'armado_final' },
  armado_final:    { status: 'armado_final',    start: 'armado_final_inicio',    end: 'armado_final_fin',    next: 'despacho' },
  despacho:        { status: 'despacho',        start: 'despacho_inicio',        end: 'despacho_fin',        next: null }
};

// POST /portones/:id/stage  body: { stage: 'diseno', action: 'start' | 'stop' }
app.post('/portones/:id/stage', async (req, res) => {
  const { id } = req.params;
  const { stage, action } = req.body || {};
  const cfg = STAGES[stage];
  if (!cfg || !['start','stop'].includes(action)) {
    return res.status(400).json({ error: 'Parámetros inválidos' });
  }

  const client = await pool.connect();
  try {
    await client.query('begin');

    if (action === 'start') {
      // ▶️ En Proceso + setear inicio (si estaba null)
      await client.query(`
        UPDATE public.portones
        SET ${cfg.status} = $2,
            ${cfg.start}  = COALESCE(${cfg.start}, now())
        WHERE id = $1;
      `, [id, STATUS.EN_PROCESO]);
    } else {
      // ⏹ Finalizado + setear fin (si estaba null) + próxima etapa Pendiente
      const nextSet = cfg.next ? `, ${cfg.next} = $3` : '';
      const params  = cfg.next
        ? [id, STATUS.FINALIZADO, STATUS.PENDIENTE]
        : [id, STATUS.FINALIZADO];

      await client.query(`
        UPDATE public.portones
        SET ${cfg.status} = $2,
            ${cfg.end}    = COALESCE(${cfg.end}, now())
            ${nextSet}
        WHERE id = $1;
      `, params);
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
