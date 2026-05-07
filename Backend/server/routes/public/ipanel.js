const express = require('express');
const { pool } = require('../../db');
const { isValidISODate10 } = require('../../lib/common');
const { STATUS, checkRequirements } = require('../../lib/workflow');

const router = express.Router();

const IPANEL_STAGES = {
  diseno: { status: 'diseno', start: 'diseno_inicio', end: 'diseno_fin' },
  guillotina: { status: 'guillotina', start: 'guillotina_inicio', end: 'guillotina_fin' },
  plegado: { status: 'plegado', start: 'plegado_inicio', end: 'plegado_fin' },
  pintura: { status: 'pintura', start: 'pintura_inicio', end: 'pintura_fin' },
  inyeccion: { status: 'inyeccion', start: 'inyeccion_inicio', end: 'inyeccion_fin' },
  despacho: { status: 'despacho', start: 'despacho_inicio', end: 'despacho_fin' },
};

function truthy(v) {
  return ['1', 'true', 'si', 'yes'].includes(String(v || '').trim().toLowerCase());
}

function toIntOrNull(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = parseInt(String(v).trim(), 10);
  return Number.isFinite(n) ? n : null;
}

// GET /ipanel
// Tabla productiva: solo se alimenta cuando logistica envia un registro desde preproduccion_valores_ipanels.
router.get('/ipanel', async (req, res) => {
  try {
    const params = [];
    const where = [];

    if (truthy(req.query.produccion) || truthy(req.query.production)) {
      where.push('fecha_prod is not null');
    }

    const q = String(req.query.q || '').trim();
    if (q) {
      params.push(`%${q}%`);
      const p = params.length;
      where.push(`(partida::text ilike $${p} or coalesce(nv::text, '') ilike $${p} or coalesce(observaciones, '') ilike $${p})`);
    }

    const n = toIntOrNull(req.query.nv || req.query.partida);
    if (n) {
      params.push(n);
      const p = params.length;
      where.push('(partida = $' + p + ' or nv = $' + p + ')');
    }

    const whereSql = where.length ? 'where ' + where.join(' and ') : '';

    const { rows } = await pool.query(
      `
      select *
      from public.ipanel
      ${whereSql}
      order by coalesce(fecha_prod, fecha_plan_entrega, fecha_nv) asc nulls last,
               coalesce(partida, 0) asc,
               coalesce(nv, 0) asc,
               id asc;
      `,
      params
    );
    res.setHeader('Cache-Control', 'no-store');
    return res.json(rows);
  } catch (err) {
    console.error('ipanel list error:', err);
    return res.status(500).json({ error: 'Error leyendo ipanel', detail: err.message });
  }
});

// POST /ipanel
router.post('/ipanel', async (req, res) => {
  try {
    const { partida: bodyPartida, npartida, nv, fecha_prod, fecha_plan_entrega, fecha_nv, observaciones } = req.body || {};
    const nNv = Number(nv);
    const hasPartida = (bodyPartida ?? npartida) != null;
    const nPartida = hasPartida ? Number(bodyPartida ?? npartida) : nNv;

    if (!Number.isInteger(nNv)) return res.status(400).json({ error: 'nv debe ser entero' });
    if (!Number.isInteger(nPartida)) return res.status(400).json({ error: 'partida debe ser entero' });

    const { rows } = await pool.query(
      `
      insert into public.ipanel (nv, partida, fecha_prod, fecha_plan_entrega, fecha_nv, observaciones)
      values ($1,$2,$3::date,$4::date,$5::date,$6)
      returning *;
      `,
      [nNv, nPartida, fecha_prod || null, fecha_plan_entrega || null, fecha_nv || null, observaciones || null]
    );
    return res.status(201).json(rows[0]);
  } catch (err) {
    console.error('create ipanel error:', err);
    return res.status(500).json({ error: 'Error creando ipanel', detail: err.message });
  }
});

// POST /ipanel/:id/stage
router.post('/ipanel/:id/stage', async (req, res) => {
  const { id } = req.params;
  const { stage, action } = req.body || {};
  const cfg = IPANEL_STAGES[stage];

  if (!cfg || !['start', 'stop'].includes(action)) {
    return res.status(400).json({ error: 'Parametros invalidos' });
  }

  const client = await pool.connect();
  try {
    await client.query('begin');

    const before = await client.query('select * from public.ipanel where id = $1;', [id]);
    const row0 = before.rows[0];
    if (!row0) {
      await client.query('rollback');
      return res.status(404).json({ error: 'iPanel no encontrado' });
    }

    if (!row0.fecha_prod) {
      await client.query('rollback');
      return res.status(409).json({ error: 'El iPanel todavia no tiene fecha de produccion' });
    }

    if (action === 'start') {
      const reqCheck = await checkRequirements('ipanel', stage, row0);
      if (!reqCheck.ok) {
        await client.query('rollback');
        return res.status(409).json({ error: reqCheck.reason });
      }

      await client.query(
        `
        update public.ipanel
        set ${cfg.status} = $2,
            ${cfg.start}  = coalesce(${cfg.start}, now())
        where id = $1;
        `,
        [id, STATUS.EN_PROCESO]
      );

      const { rows } = await client.query('select * from public.ipanel where id = $1;', [id]);
      await client.query('commit');
      return res.json(rows[0]);
    }

    await client.query(
      `
      update public.ipanel
      set ${cfg.status} = $2,
          ${cfg.end}    = coalesce(${cfg.end}, now())
      where id = $1;
      `,
      [id, STATUS.FINALIZADO]
    );

    const { rows } = await client.query('select * from public.ipanel where id = $1;', [id]);
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

function datePatchHandler(fieldName) {
  return async (req, res) => {
    const { id } = req.params;
    let v = req.body?.[fieldName];

    try {
      if (v !== null && v !== undefined) {
        if (typeof v !== 'string') return res.status(400).json({ error: `${fieldName} debe ser string YYYY-MM-DD o null` });
        v = v.slice(0, 10);
        if (!isValidISODate10(v)) return res.status(400).json({ error: `${fieldName} invalida. Use formato YYYY-MM-DD` });
      }

      const { rows } = await pool.query(
        `
        update public.ipanel
        set ${fieldName} = $2
        where id = $1
        returning *;
        `,
        [id, v ?? null]
      );

      if (!rows.length) return res.status(404).json({ error: 'iPanel no encontrado' });
      return res.json(rows[0]);
    } catch (err) {
      console.error(`set ${fieldName} error:`, err);
      return res.status(500).json({ error: `Error al actualizar ${fieldName}`, detail: err.message });
    }
  };
}

router.post('/ipanel/:id/fecha-prod', datePatchHandler('fecha_prod'));
router.post('/ipanel/:id/fecha-nv', datePatchHandler('fecha_nv'));
router.post('/ipanel/:id/fecha-med', datePatchHandler('fecha_med'));
router.post('/ipanel/:id/fecha-plan', datePatchHandler('fecha_plan'));
router.post('/ipanel/:id/fecha-plan-entrega', datePatchHandler('fecha_plan_entrega'));

router.get('/ipanel/:id/observaciones', async (req, res) => {
  const { id } = req.params;

  try {
    const { rows } = await pool.query(
      `
      select id, observaciones
      from public.ipanel
      where id = $1;
      `,
      [id]
    );

    if (!rows.length) return res.status(404).json({ error: 'iPanel no encontrado' });
    return res.json(rows[0]);
  } catch (err) {
    console.error('get observaciones ipanel error:', err);
    return res.status(500).json({ error: 'Error leyendo observaciones de iPanel', detail: err.message });
  }
});

async function upsertIpanelObservaciones(req, res) {
  const { id } = req.params;
  let { observaciones } = req.body || {};

  try {
    if (observaciones !== null && observaciones !== undefined && typeof observaciones !== 'string') {
      return res.status(400).json({ error: 'observaciones debe ser string o null' });
    }

    const { rows } = await pool.query(
      `
      update public.ipanel
      set observaciones = $2
      where id = $1
      returning id, observaciones;
      `,
      [id, observaciones ?? null]
    );

    if (!rows.length) return res.status(404).json({ error: 'iPanel no encontrado' });
    return res.json(rows[0]);
  } catch (err) {
    console.error('set observaciones ipanel error:', err);
    return res.status(500).json({ error: 'Error al actualizar observaciones de iPanel', detail: err.message });
  }
}
router.post('/ipanel/:id/observaciones', upsertIpanelObservaciones);
router.put('/ipanel/:id/observaciones', upsertIpanelObservaciones);

module.exports = router;
