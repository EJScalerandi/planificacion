// routes/portones.js
const express = require('express');
const { pool } = require('../../db');
const { isValidISODate10 } = require('../../lib/common');
const { STATUS, loadStageMap, getNextStages, checkRequirements } = require('../../lib/workflow');

const router = express.Router();

// Portones (normalizado): set defensivo para no aceptar cualquier texto
const PORTON_ETAPAS = new Set([
  'diseno', 'laser', 'guillotina', 'plegadora',
  'armado_marco_piernas', 'armado_piernas', 'armado_primario', 'armado_hojas',
  'inyeccion', 'revestimiento', 'pintura', 'pintura_revestimiento', 'armado_final', 'despacho',
  'corte_revest', 'plegado_revest',
]);

// OJO: acá el orden solo lo usamos para “shape” y compatibilidad en frontend
const PORTON_STAGE_KEYS_ORDER = [
  'diseno', 'laser', 'guillotina', 'plegadora',
  'armado_piernas', 'armado_primario', 'inyeccion', 'corte_revest', 'plegado_revest',
  'revestimiento', 'pintura', 'pintura_revestimiento', 'armado_hojas', 'armado_marco_piernas', 'armado_final', 'despacho'
];

// IMPORTANTE:
// No usar p.* porque public.portones todavía tiene columnas de etapa con default Pendiente.
// Eso rompe el workflow porque hace que “aparezca en todos lados”.
const PORTON_BASE_COLS_SQL = `
  p.id, p.nv, p.nlista, p.partida,
  p.fecha_plan, p.fecha_prod, p.fecha_nv, p.fecha_med, p.fecha_plan_entrega,
  p.observaciones,
  p.created_at
`;

async function getPortonShapeById(db, id) {
  const { rows } = await db.query(
    `
    select
      ${PORTON_BASE_COLS_SQL},

      -- ====== ESTADOS (SIEMPRE desde porton_etapas_estado) ======
      max(case when e.etapa = 'diseno'::public.porton_etapa then e.estado end) as diseno,
      max(case when e.etapa = 'laser'::public.porton_etapa then e.estado end) as laser,
      max(case when e.etapa = 'guillotina'::public.porton_etapa then e.estado end) as guillotina,
      max(case when e.etapa = 'plegadora'::public.porton_etapa then e.estado end) as plegadora,
      max(case when e.etapa = 'armado_piernas'::public.porton_etapa then e.estado end) as armado_piernas,
      max(case when e.etapa = 'armado_primario'::public.porton_etapa then e.estado end) as armado_primario,
      max(case when e.etapa = 'inyeccion'::public.porton_etapa then e.estado end) as inyeccion,
      max(case when e.etapa = 'corte_revest'::public.porton_etapa then e.estado end) as corte_revest,
      max(case when e.etapa = 'plegado_revest'::public.porton_etapa then e.estado end) as plegado_revest,
      max(case when e.etapa = 'revestimiento'::public.porton_etapa then e.estado end) as revestimiento,
      max(case when e.etapa = 'pintura'::public.porton_etapa then e.estado end) as pintura,
      max(case when e.etapa = 'pintura_revestimiento'::public.porton_etapa then e.estado end) as pintura_revestimiento,
      max(case when e.etapa = 'armado_hojas'::public.porton_etapa then e.estado end) as armado_hojas,
      max(case when e.etapa = 'armado_marco_piernas'::public.porton_etapa then e.estado end) as armado_marco_piernas,
      max(case when e.etapa = 'armado_final'::public.porton_etapa then e.estado end) as armado_final,
      max(case when e.etapa = 'despacho'::public.porton_etapa then e.estado end) as despacho,

      -- ====== TIEMPOS (SIEMPRE desde porton_etapas_tiempos) ======
      max(case when t.etapa = 'diseno'::public.porton_etapa then t.inicio end) as diseno_inicio,
      max(case when t.etapa = 'diseno'::public.porton_etapa then t.fin end) as diseno_fin,

      max(case when t.etapa = 'laser'::public.porton_etapa then t.inicio end) as laser_inicio,
      max(case when t.etapa = 'laser'::public.porton_etapa then t.fin end) as laser_fin,

      max(case when t.etapa = 'guillotina'::public.porton_etapa then t.inicio end) as guillotina_inicio,
      max(case when t.etapa = 'guillotina'::public.porton_etapa then t.fin end) as guillotina_fin,

      max(case when t.etapa = 'plegadora'::public.porton_etapa then t.inicio end) as plegadora_inicio,
      max(case when t.etapa = 'plegadora'::public.porton_etapa then t.fin end) as plegadora_fin,

      max(case when t.etapa = 'armado_piernas'::public.porton_etapa then t.inicio end) as armado_piernas_inicio,
      max(case when t.etapa = 'armado_piernas'::public.porton_etapa then t.fin end) as armado_piernas_fin,

      max(case when t.etapa = 'armado_primario'::public.porton_etapa then t.inicio end) as armado_primario_inicio,
      max(case when t.etapa = 'armado_primario'::public.porton_etapa then t.fin end) as armado_primario_fin,

      max(case when t.etapa = 'inyeccion'::public.porton_etapa then t.inicio end) as inyeccion_inicio,
      max(case when t.etapa = 'inyeccion'::public.porton_etapa then t.fin end) as inyeccion_fin,

      max(case when t.etapa = 'corte_revest'::public.porton_etapa then t.inicio end) as corte_revest_inicio,
      max(case when t.etapa = 'corte_revest'::public.porton_etapa then t.fin end) as corte_revest_fin,

      max(case when t.etapa = 'plegado_revest'::public.porton_etapa then t.inicio end) as plegado_revest_inicio,
      max(case when t.etapa = 'plegado_revest'::public.porton_etapa then t.fin end) as plegado_revest_fin,

      max(case when t.etapa = 'revestimiento'::public.porton_etapa then t.inicio end) as revestimiento_inicio,
      max(case when t.etapa = 'revestimiento'::public.porton_etapa then t.fin end) as revestimiento_fin,

      max(case when t.etapa = 'pintura'::public.porton_etapa then t.inicio end) as pintura_inicio,
      max(case when t.etapa = 'pintura'::public.porton_etapa then t.fin end) as pintura_fin,

      max(case when t.etapa = 'pintura_revestimiento'::public.porton_etapa then t.inicio end) as pintura_revestimiento_inicio,
      max(case when t.etapa = 'pintura_revestimiento'::public.porton_etapa then t.fin end) as pintura_revestimiento_fin,

      max(case when t.etapa = 'armado_hojas'::public.porton_etapa then t.inicio end) as armado_hojas_inicio,
      max(case when t.etapa = 'armado_hojas'::public.porton_etapa then t.fin end) as armado_hojas_fin,

      max(case when t.etapa = 'armado_marco_piernas'::public.porton_etapa then t.inicio end) as armado_marco_piernas_inicio,
      max(case when t.etapa = 'armado_marco_piernas'::public.porton_etapa then t.fin end) as armado_marco_piernas_fin,

      max(case when t.etapa = 'armado_final'::public.porton_etapa then t.inicio end) as armado_final_inicio,
      max(case when t.etapa = 'armado_final'::public.porton_etapa then t.fin end) as armado_final_fin,

      max(case when t.etapa = 'despacho'::public.porton_etapa then t.inicio end) as despacho_inicio,
      max(case when t.etapa = 'despacho'::public.porton_etapa then t.fin end) as despacho_fin

    from public.portones p
    left join public.porton_etapas_estado e
      on e.porton_id = p.id
    left join public.porton_etapas_tiempos t
      on t.porton_id = p.id
    where p.id = $1
    group by p.id
    limit 1;
    `,
    [id]
  );

  // NOTA: ya NO “normalizamos” null a Pendiente.
  // null significa “esa etapa no existe todavía”, y el front la oculta.
  return rows[0] || null;
}

// GET /portones
router.get('/portones', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `
      select
        ${PORTON_BASE_COLS_SQL},

        -- ====== ESTADOS ======
        max(case when e.etapa = 'diseno'::public.porton_etapa then e.estado end) as diseno,
        max(case when e.etapa = 'laser'::public.porton_etapa then e.estado end) as laser,
        max(case when e.etapa = 'guillotina'::public.porton_etapa then e.estado end) as guillotina,
        max(case when e.etapa = 'plegadora'::public.porton_etapa then e.estado end) as plegadora,
        max(case when e.etapa = 'armado_piernas'::public.porton_etapa then e.estado end) as armado_piernas,
        max(case when e.etapa = 'armado_primario'::public.porton_etapa then e.estado end) as armado_primario,
        max(case when e.etapa = 'inyeccion'::public.porton_etapa then e.estado end) as inyeccion,
        max(case when e.etapa = 'corte_revest'::public.porton_etapa then e.estado end) as corte_revest,
        max(case when e.etapa = 'plegado_revest'::public.porton_etapa then e.estado end) as plegado_revest,
        max(case when e.etapa = 'revestimiento'::public.porton_etapa then e.estado end) as revestimiento,
        max(case when e.etapa = 'pintura'::public.porton_etapa then e.estado end) as pintura,
        max(case when e.etapa = 'pintura_revestimiento'::public.porton_etapa then e.estado end) as pintura_revestimiento,
        max(case when e.etapa = 'armado_hojas'::public.porton_etapa then e.estado end) as armado_hojas,
        max(case when e.etapa = 'armado_marco_piernas'::public.porton_etapa then e.estado end) as armado_marco_piernas,
        max(case when e.etapa = 'armado_final'::public.porton_etapa then e.estado end) as armado_final,
        max(case when e.etapa = 'despacho'::public.porton_etapa then e.estado end) as despacho,

        -- ====== TIEMPOS ======
        max(case when t.etapa = 'diseno'::public.porton_etapa then t.inicio end) as diseno_inicio,
        max(case when t.etapa = 'diseno'::public.porton_etapa then t.fin end) as diseno_fin,

        max(case when t.etapa = 'laser'::public.porton_etapa then t.inicio end) as laser_inicio,
        max(case when t.etapa = 'laser'::public.porton_etapa then t.fin end) as laser_fin,

        max(case when t.etapa = 'guillotina'::public.porton_etapa then t.inicio end) as guillotina_inicio,
        max(case when t.etapa = 'guillotina'::public.porton_etapa then t.fin end) as guillotina_fin,

        max(case when t.etapa = 'plegadora'::public.porton_etapa then t.inicio end) as plegadora_inicio,
        max(case when t.etapa = 'plegadora'::public.porton_etapa then t.fin end) as plegadora_fin,

        max(case when t.etapa = 'armado_piernas'::public.porton_etapa then t.inicio end) as armado_piernas_inicio,
        max(case when t.etapa = 'armado_piernas'::public.porton_etapa then t.fin end) as armado_piernas_fin,

        max(case when t.etapa = 'armado_primario'::public.porton_etapa then t.inicio end) as armado_primario_inicio,
        max(case when t.etapa = 'armado_primario'::public.porton_etapa then t.fin end) as armado_primario_fin,

        max(case when t.etapa = 'inyeccion'::public.porton_etapa then t.inicio end) as inyeccion_inicio,
        max(case when t.etapa = 'inyeccion'::public.porton_etapa then t.fin end) as inyeccion_fin,

        max(case when t.etapa = 'corte_revest'::public.porton_etapa then t.inicio end) as corte_revest_inicio,
        max(case when t.etapa = 'corte_revest'::public.porton_etapa then t.fin end) as corte_revest_fin,

        max(case when t.etapa = 'plegado_revest'::public.porton_etapa then t.inicio end) as plegado_revest_inicio,
        max(case when t.etapa = 'plegado_revest'::public.porton_etapa then t.fin end) as plegado_revest_fin,

        max(case when t.etapa = 'revestimiento'::public.porton_etapa then t.inicio end) as revestimiento_inicio,
        max(case when t.etapa = 'revestimiento'::public.porton_etapa then t.fin end) as revestimiento_fin,

        max(case when t.etapa = 'pintura'::public.porton_etapa then t.inicio end) as pintura_inicio,
        max(case when t.etapa = 'pintura'::public.porton_etapa then t.fin end) as pintura_fin,

        max(case when t.etapa = 'pintura_revestimiento'::public.porton_etapa then t.inicio end) as pintura_revestimiento_inicio,
        max(case when t.etapa = 'pintura_revestimiento'::public.porton_etapa then t.fin end) as pintura_revestimiento_fin,

        max(case when t.etapa = 'armado_hojas'::public.porton_etapa then t.inicio end) as armado_hojas_inicio,
        max(case when t.etapa = 'armado_hojas'::public.porton_etapa then t.fin end) as armado_hojas_fin,

        max(case when t.etapa = 'armado_marco_piernas'::public.porton_etapa then t.inicio end) as armado_marco_piernas_inicio,
        max(case when t.etapa = 'armado_marco_piernas'::public.porton_etapa then t.fin end) as armado_marco_piernas_fin,

        max(case when t.etapa = 'armado_final'::public.porton_etapa then t.inicio end) as armado_final_inicio,
        max(case when t.etapa = 'armado_final'::public.porton_etapa then t.fin end) as armado_final_fin,

        max(case when t.etapa = 'despacho'::public.porton_etapa then t.inicio end) as despacho_inicio,
        max(case when t.etapa = 'despacho'::public.porton_etapa then t.fin end) as despacho_fin

      from public.portones p
      left join public.porton_etapas_estado e
        on e.porton_id = p.id
      left join public.porton_etapas_tiempos t
        on t.porton_id = p.id
      group by p.id
      order by p.nv asc;
      `
    );

    return res.json(rows);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error leyendo portones', detail: err.message });
  }
});

// POST /portones
router.post('/portones', async (req, res) => {
  const client = await pool.connect();
  try {
    const { nv, nlista, partida: bodyPartida, npartida } = req.body || {};

    const nNv = Number(nv);
    const nNl = Number(nlista);
    const nPa = Number(bodyPartida ?? npartida);

    if (![nNv, nNl, nPa].every(Number.isInteger)) {
      return res.status(400).json({ error: 'nv, nlista y partida/npartida deben ser enteros' });
    }

    await client.query('begin');

    const { rowCount: exists } = await client.query(
      'select 1 from public.portones where nv = $1 and nlista = $2 limit 1;',
      [nNv, nNl]
    );
    if (exists) {
      await client.query('rollback');
      return res.status(409).json({ error: 'Ya existe un portón con ese NV y NLista' });
    }

    const ins = await client.query(
      `
      insert into public.portones (nv, nlista, partida)
      values ($1, $2, $3)
      returning id;
      `,
      [nNv, nNl, nPa]
    );

    const id = ins.rows[0]?.id;

    // ====== ETAPAS INICIALES (WORKFLOW) ======
    // Antes: siempre entraba a Diseño + Corte Piernas.
    // Ahora: si existe el stage "inicio" en el workflow (línea portones),
    // ruteamos según sus edges (con condiciones).
    // Fallback: si no hay config o no matchea nada, mantenemos el comportamiento anterior.

    const shapedBefore = await getPortonShapeById(client, id);

    let insertedAny = false;
    try {
      const stageMap = await loadStageMap('portones');
      const nextKeys = await getNextStages('portones', 'inicio', shapedBefore || {});

      const cols = [];
      for (const nk of nextKeys || []) {
        const ns = stageMap.get(nk);
        const col = String(ns?.status_col || '').trim();
        if (col && PORTON_ETAPAS.has(col)) cols.push(col);
      }

      if (cols.length) {
        await client.query(
          `
          insert into public.porton_etapas_estado(porton_id, etapa, estado)
          select $1, x::public.porton_etapa, $2
          from unnest($3::text[]) as x
          on conflict (porton_id, etapa) do nothing;
          `,
          [id, STATUS.PENDIENTE, cols]
        );
        insertedAny = true;
      }
    } catch (e) {
      // Ignoramos para poder hacer fallback sin romper create.
      insertedAny = false;
    }

    if (!insertedAny) {
      // Fallback legacy
      await client.query(
        `
        insert into public.porton_etapas_estado(porton_id, etapa, estado)
        values
          ($1, 'diseno'::public.porton_etapa, $2),
          ($1, 'guillotina'::public.porton_etapa, $2)
        on conflict (porton_id, etapa) do nothing;
        `,
        [id, STATUS.PENDIENTE]
      );
    }

    const shaped = await getPortonShapeById(client, id);

    await client.query('commit');
    return res.status(201).json(shaped || { id, nv: nNv, nlista: nNl, partida: nPa });
  } catch (err) {
    await client.query('rollback');
    console.error('create porton error:', err);
    return res.status(500).json({ error: 'Error creando portón', detail: err.message });
  } finally {
    client.release();
  }
});

// POST /portones/:id/stage
router.post('/portones/:id/stage', async (req, res) => {
  const { id } = req.params;
  const { stage, action } = req.body || {};

  const stageKey = String(stage || '').trim();
  const act = String(action || '').trim();

  if (!PORTON_ETAPAS.has(stageKey) || !['start', 'stop'].includes(act)) {
    return res.status(400).json({ error: 'Parámetros inválidos' });
  }

  const client = await pool.connect();
  try {
    await client.query('begin');

    const before = await getPortonShapeById(client, id);
    if (!before) {
      await client.query('rollback');
      return res.status(404).json({ error: 'Portón no encontrado' });
    }

    if (act === 'start') {
      const reqCheck = await checkRequirements('portones', stageKey, before);
      if (!reqCheck.ok) {
        await client.query('rollback');
        return res.status(409).json({ error: reqCheck.reason });
      }

      await client.query(
        `
        insert into public.porton_etapas_estado(porton_id, etapa, estado)
        values ($1, $2::public.porton_etapa, $3)
        on conflict (porton_id, etapa)
        do update set estado = excluded.estado;
        `,
        [id, stageKey, STATUS.EN_PROCESO]
      );

      await client.query(
        `
        insert into public.porton_etapas_tiempos(porton_id, etapa, inicio, fin)
        values ($1, $2::public.porton_etapa, now(), null)
        on conflict (porton_id, etapa)
        do update set inicio = coalesce(public.porton_etapas_tiempos.inicio, excluded.inicio);
        `,
        [id, stageKey]
      );

      const after = await getPortonShapeById(client, id);
      await client.query('commit');
      return res.json(after);
    }

    // stop
    await client.query(
      `
      insert into public.porton_etapas_estado(porton_id, etapa, estado)
      values ($1, $2::public.porton_etapa, $3)
      on conflict (porton_id, etapa)
      do update set estado = excluded.estado;
      `,
      [id, stageKey, STATUS.FINALIZADO]
    );

    await client.query(
      `
      insert into public.porton_etapas_tiempos(porton_id, etapa, inicio, fin)
      values ($1, $2::public.porton_etapa, null, now())
      on conflict (porton_id, etapa)
      do update set fin = coalesce(public.porton_etapas_tiempos.fin, excluded.fin);
      `,
      [id, stageKey]
    );

    // IMPORTANTE:
    // A partir de ahora, el routeo a la siguiente etapa NO se hace al poner STOP.
    // Se hace cuando se completa el QC (APROBADO u OBSERVADO). Ver /qc/authorize.
    const afterStop = await getPortonShapeById(client, id);
    await client.query('commit');
    return res.json(afterStop);
  } catch (err) {
    await client.query('rollback');
    console.error('stage error:', err);
    return res.status(500).json({ error: 'Error al actualizar etapa', detail: err.message });
  } finally {
    client.release();
  }
});

// date patch helpers
function datePatchHandlerPortones(fieldName) {
  return async (req, res) => {
    const { id } = req.params;
    let v = req.body?.[fieldName];

    try {
      if (v !== null && v !== undefined) {
        if (typeof v !== 'string') return res.status(400).json({ error: `${fieldName} debe ser string YYYY-MM-DD o null` });
        v = v.slice(0, 10);
        if (!isValidISODate10(v)) return res.status(400).json({ error: `${fieldName} inválida. Use formato YYYY-MM-DD` });
      }

      const { rowCount } = await pool.query(
        `
        update public.portones
        set ${fieldName} = $2
        where id = $1;
        `,
        [id, v ?? null]
      );

      if (!rowCount) return res.status(404).json({ error: 'Portón no encontrado' });

      const shaped = await getPortonShapeById(pool, id);
      return res.json(shaped);
    } catch (err) {
      console.error(`set ${fieldName} error:`, err);
      return res.status(500).json({ error: `Error al actualizar ${fieldName}`, detail: err.message });
    }
  };
}

router.post('/portones/:id/fecha-plan', datePatchHandlerPortones('fecha_plan'));
router.post('/portones/:id/fecha-prod', datePatchHandlerPortones('fecha_prod'));
router.post('/portones/:id/fecha-nv', datePatchHandlerPortones('fecha_nv'));
router.post('/portones/:id/fecha-med', datePatchHandlerPortones('fecha_med'));
router.post('/portones/:id/fecha-plan-entrega', datePatchHandlerPortones('fecha_plan_entrega'));

// Observaciones
router.get('/portones/:id/observaciones', async (req, res) => {
  const { id } = req.params;

  try {
    const { rows } = await pool.query(
      `
      select id, observaciones
      from public.portones
      where id = $1;
      `,
      [id]
    );

    if (!rows.length) return res.status(404).json({ error: 'Portón no encontrado' });
    return res.json(rows[0]);
  } catch (err) {
    console.error('get observaciones porton error:', err);
    return res.status(500).json({ error: 'Error leyendo observaciones de portón', detail: err.message });
  }
});

async function upsertPortonObservaciones(req, res) {
  const { id } = req.params;
  let { observaciones } = req.body || {};

  try {
    if (observaciones !== null && observaciones !== undefined && typeof observaciones !== 'string') {
      return res.status(400).json({ error: 'observaciones debe ser string o null' });
    }

    const { rowCount } = await pool.query(
      `
      update public.portones
      set observaciones = $2
      where id = $1;
      `,
      [id, observaciones ?? null]
    );

    if (!rowCount) return res.status(404).json({ error: 'Portón no encontrado' });

    const shaped = await getPortonShapeById(pool, id);
    return res.json(shaped);
  } catch (err) {
    console.error('set observaciones porton error:', err);
    return res.status(500).json({ error: 'Error al actualizar observaciones de portón', detail: err.message });
  }
}
router.post('/portones/:id/observaciones', upsertPortonObservaciones);
router.put('/portones/:id/observaciones', upsertPortonObservaciones);

module.exports = router;
