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

// --------------------- Estados & Etapas ---------------------
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
    start: 'armado_marco_piernas_inicio',
    end:   'armado_marco_piernas_fin',
    next:  null
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

// iPanel: ahora incluye Despacho
const IPANEL_STAGES = {
  guillotina: { status: 'guillotina', start: 'guillotina_inicio', end: 'guillotina_fin' },
  plegado:    { status: 'plegado',    start: 'plegado_inicio',    end: 'plegado_fin'    },
  pintura:    { status: 'pintura',    start: 'pintura_inicio',    end: 'pintura_fin'    },
  inyeccion:  { status: 'inyeccion',  start: 'inyeccion_inicio',  end: 'inyeccion_fin'  },
  despacho:   { status: 'despacho',   start: 'despacho_inicio',   end: 'despacho_fin'   }, // ⬅️ agregado
};

// --------------------- Lógica Portones ---------------------
// GET: todos los portones
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

    const nNv  = Number(nv);
    const nNl  = Number(nlista);
    const nPa  = Number(bodyPartida ?? npartida);

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
      await client.query(
        `
        UPDATE public.portones
        SET ${cfg.status} = $2,
            ${cfg.end}    = COALESCE(${cfg.end}, now())
        WHERE id = $1;
        `,
        [id, STATUS.FINALIZADO]
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

// POST: asignar/actualizar fecha planificada del portón
// Body: { fecha_plan: 'YYYY-MM-DD' }  // puede ser null para limpiar
app.post('/portones/:id/fecha-plan', async (req, res) => {
  const { id } = req.params;
  let { fecha_plan } = req.body || {};

  try {
    // Permitir limpiar la fecha con null/undefined
    if (fecha_plan !== null && fecha_plan !== undefined) {
      if (typeof fecha_plan !== 'string') {
        return res.status(400).json({ error: 'fecha_plan debe ser string con formato YYYY-MM-DD o null' });
      }
      // Si viene con hora (ISO), nos quedamos con la parte de fecha
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

    if (!rows.length) {
      return res.status(404).json({ error: 'Portón no encontrado' });
    }
    return res.json(rows[0]);
  } catch (err) {
    console.error('set fecha_plan error:', err);
    return res.status(500).json({ error: 'Error al actualizar fecha planificada', detail: err.message });
  }
});

// POST: asignar/actualizar fecha de producción del portón
// Body: { fecha_prod: 'YYYY-MM-DD' }  // puede ser null para limpiar
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

    if (!rows.length) {
      return res.status(404).json({ error: 'Portón no encontrado' });
    }
    return res.json(rows[0]);
  } catch (err) {
    console.error('set fecha_prod error:', err);
    return res.status(500).json({ error: 'Error al actualizar fecha de producción', detail: err.message });
  }
});

// --------------------- Lógica IPANEL ---------------------
// GET: todos los ipanel
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

// POST: crear ipanel { nv (obligatorio), partida|npartida (opcional) }
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

// POST: avanzar etapa iPanel { stage, action: 'start' | 'stop' }
app.post('/ipanel/:id/stage', async (req, res) => {
  const { id } = req.params;
  const { stage, action } = req.body || {};
  const cfg = IPANEL_STAGES[stage];

  if (!cfg || !['start','stop'].includes(action)) {
    return res.status(400).json({ error: 'Parámetros inválidos' });
  }

  const client = await pool.connect();
  try {
    await client.query('begin');

    if (action === 'start') {
      await client.query(
        `
        UPDATE public.ipanel
        SET ${cfg.status} = $2,
            ${cfg.start}  = COALESCE(${cfg.start}, now())
        WHERE id = $1;
        `,
        [id, STATUS.EN_PROCESO]
      );
    } else {
      await client.query(
        `
        UPDATE public.ipanel
        SET ${cfg.status} = $2,
            ${cfg.end}    = COALESCE(${cfg.end}, now())
        WHERE id = $1;
        `,
        [id, STATUS.FINALIZADO]
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

// POST: asignar/actualizar fecha de producción de iPanel
// Body: { fecha_prod: 'YYYY-MM-DD' }  // puede ser null para limpiar
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

    if (!rows.length) {
      return res.status(404).json({ error: 'iPanel no encontrado' });
    }
    return res.json(rows[0]);
  } catch (err) {
    console.error('set ipanel fecha_prod error:', err);
    return res.status(500).json({ error: 'Error al actualizar fecha de producción de iPanel', detail: err.message });
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
