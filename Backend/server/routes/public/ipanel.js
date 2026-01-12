const express = require('express');
const { pool } = require('../../db');
const { isValidISODate10 } = require('../../lib/common');
const { STATUS, loadStageMap, getNextStages, checkRequirements } = require('../../lib/workflow');

const router = express.Router();

const IPANEL_STAGES = {
  diseno: { status: 'diseno', start: 'diseno_inicio', end: 'diseno_fin' },
  guillotina: { status: 'guillotina', start: 'guillotina_inicio', end: 'guillotina_fin' },
  plegado: { status: 'plegado', start: 'plegado_inicio', end: 'plegado_fin' },
  pintura: { status: 'pintura', start: 'pintura_inicio', end: 'pintura_fin' },
  inyeccion: { status: 'inyeccion', start: 'inyeccion_inicio', end: 'inyeccion_fin' },
  despacho: { status: 'despacho', start: 'despacho_inicio', end: 'despacho_fin' },
};

const IPANEL_ALLOWED_STATUS_COLS = new Set(Object.keys(IPANEL_STAGES));

// GET /ipanel
router.get('/ipanel', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `
      select *
      from public.ipanel
      order by coalesce(partida, 0) asc, coalesce(nv, 0) asc, id asc;
      `
    );
    return res.json(rows);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error leyendo ipanel', detail: err.message });
  }
});

// POST /ipanel
router.post('/ipanel', async (req, res) => {
  try {
    const { partida: bodyPartida, npartida, nv } = req.body || {};
    const nNv = Number(nv);
    const hasPartida = (bodyPartida ?? npartida) != null;

    if (!Number.isInteger(nNv)) return res.status(400).json({ error: 'nv debe ser entero' });

    const query = `
      insert into public.ipanel (nv${hasPartida ? ', partida' : ''})
      values ($1${hasPartida ? ', $2' : ''})
      returning *;
    `;
    const params = hasPartida ? [nNv, Number(bodyPartida ?? npartida)] : [nNv];

    const { rows } = await pool.query(query, params);
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
    return res.status(400).json({ error: 'Parámetros inválidos' });
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

    const afterQ = await client.query('select * from public.ipanel where id = $1;', [id]);
    const row1 = afterQ.rows[0];

    const stageMap = await loadStageMap('ipanel');
    const ctx = { ...(row1 || {}) };
    const nextKeys = await getNextStages('ipanel', stage, ctx);

    for (const nk of nextKeys) {
      const ns = stageMap.get(nk);
      if (!ns) continue;

      const col = ns.status_col;
      if (!IPANEL_ALLOWED_STATUS_COLS.has(col)) continue;

      await client.query(
        `
        update public.ipanel
        set ${col} = coalesce(${col}, $2)
        where id = $1;
        `,
        [id, STATUS.PENDIENTE]
      );
    }

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
        if (!isValidISODate10(v)) return res.status(400).json({ error: `${fieldName} inválida. Use formato YYYY-MM-DD` });
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
