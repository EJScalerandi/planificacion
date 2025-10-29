require('dotenv').config();

const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const { Pool } = require('pg');

const app = express();

const PORT = process.env.PORT || 4000;

// ✅ Orígenes permitidos
const allowedOrigins = (process.env.FRONTEND_ORIGINS ||
  'http://localhost:5173,http://localhost:5174,https://planificacion-pi.vercel.app'
)
  .split(',')
  .map(s => s.trim().replace(/\/$/, ''))
  .filter(Boolean);

// Pool de Postgres (Supabase requiere SSL)
const pool = new Pool({
  connectionString: process.env.SUPABASE_DB_URL,
  ssl: { rejectUnauthorized: false }
});

// Para que caches/CDN varíen por Origin
app.use((req, res, next) => { res.header('Vary', 'Origin'); next(); });

// ✅ CORS dinámico
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

// --------------------- Lógica Portones ---------------------
const STATUS = {
  PENDIENTE:  'Pendiente',
  EN_PROCESO: 'En Proceso',
  FINALIZADO: 'Finalizado',
};

const STAGES = {
  diseno:          { status: 'diseno',          start: 'diseno_inicio',          end: 'diseno_fin',          next: null },
  laser:           { status: 'laser',           start: 'laser_inicio',           end: 'laser_fin',           next: null },
  guillotina:      { status: 'guillotina',      start: 'guillotina_inicio',      end: 'guillotina_fin',      next: null },
  plegadora:       { status: 'plegadora',       start: 'plegadora_inicio',       end: 'plegadora_fin',       next: null },
  armado_marco_piernas: {
    status: 'armado_marco_piernas',
    start:  'armado_marco_piernas_inicio',
    end:    'armado_marco_piernas_fin',
    next:   null
  },
  armado_piernas:  { status: 'armado_piernas',  start: 'armado_piernas_inicio',  end: 'armado_piernas_fin',  next: null },
  armado_primario: { status: 'armado_primario', start: 'armado_primario_inicio', end: 'armado_primario_fin', next: null },
  armado_hojas:    { status: 'armado_hojas',    start: 'armado_hojas_inicio',    end: 'armado_hojas_fin',    next: null },
  inyeccion:       { status: 'inyeccion',       start: 'inyeccion_inicio',       end: 'inyeccion_fin',       next: null },
  revestimiento:   { status: 'revestimiento',   start: 'revestimiento_inicio',   end: 'revestimiento_fin',   next: null },
  pintura:         { status: 'pintura',         start: 'pintura_inicio',         end: 'pintura_fin',         next: null },
  armado_final:    { status: 'armado_final',    start: 'armado_final_inicio',    end: 'armado_final_fin',    next: null },
  despacho:        { status: 'despacho',        start: 'despacho_inicio',        end: 'despacho_fin',        next: null }
};

// GET: todos
app.get('/portones', async (_req, res) => {
  try {
    const { rows } = await pool.query('select * from public.portones order by nv asc;');
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error leyendo portones', detail: err.message });
  }
});

// POST: crear portón { nv, nlista, partida | npartida }
app.post('/portones', async (req, res) => {
  try {
    const { nv, nlista, partida: bodyPartida, npartida } = req.body || {};

    // Acepta 'partida' o 'npartida' y los convierte a entero
    const nNv  = Number(nv);
    const nNl  = Number(nlista);
    const nPa  = Number(bodyPartida ?? npartida);

    if (![nNv, nNl, nPa].every(Number.isInteger)) {
      return res.status(400).json({ error: 'nv, nlista y partida/npartida deben ser enteros' });
    }

    // Evitar duplicados (por nv + nlista)
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

// POST: avanzar etapa { stage, action: 'start' | 'stop' }
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
      await client.query(
        `
        UPDATE public.portones
        SET ${cfg.status} = $2,
            ${cfg.start}  = COALESCE(${cfg.start}, now())
        WHERE id = $1;
        `,
        [id, STATUS.EN_PROCESO]
      );
    } else {
      const nextSet = cfg.next ? `, ${cfg.next} = $3` : '';
      const params  = cfg.next
        ? [id, STATUS.FINALIZADO, STATUS.PENDIENTE]
        : [id, STATUS.FINALIZADO];

      await client.query(
        `
        UPDATE public.portones
        SET ${cfg.status} = $2,
            ${cfg.end}    = COALESCE(${cfg.end}, now())
            ${nextSet}
        WHERE id = $1;
        `,
        params
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
