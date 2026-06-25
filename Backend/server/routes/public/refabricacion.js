// routes/public/refabricacion.js
const express = require('express');
const { pool } = require('../../db');
const { STATUS, loadStageMap, getNextStages, checkRequirements } = require('../../lib/workflow');

const router = express.Router();

const PORTON_ETAPAS = new Set([
  'diseno', 'laser', 'guillotina', 'plegadora',
  'armado_marco_piernas', 'armado_piernas', 'armado_primario', 'armado_hojas',
  'inyeccion', 'revestimiento', 'pintura', 'pintura_revestimiento',
  'armado_final', 'despacho', 'corte_revest', 'plegado_revest',
]);

function isValidISODate10(v) {
  const s = String(v || '').trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return false;
  const d = new Date(s);
  return !Number.isNaN(d.getTime());
}

// Reconstruye el shape de un portón (etapas + datos base) desde la DB
async function getPortonShapeById(db, id) {
  const { rows } = await db.query(
    `select p.*, pv.data as preprod_data
     from public.portones p
     left join public.preproduccion_valores pv on pv.nv = p.nv
     where p.id = $1 limit 1`,
    [id]
  );
  if (!rows.length) return null;
  const row = { ...rows[0] };
  const pre = row.preprod_data;
  delete row.preprod_data;
  const preObj = (pre && typeof pre === 'object') ? pre : {};

  const eQ = await db.query(
    `select etapa as k, estado from public.porton_etapas_estado where porton_id = $1`,
    [id]
  );
  for (const r of eQ.rows) row[String(r.k)] = r.estado;

  return { ...preObj, ...row };
}

// =============================================================
// GET /refabricacion/pendientes
// Devuelve portones con eventos OBSERVADO o RECHAZADO que aún
// no tienen el stage despacho en estado Finalizado.
// Separados en dos listas según el estado QC más reciente.
// =============================================================
router.get('/refabricacion/pendientes', async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      with ultimo_qc as (
        select distinct on (item_id)
          item_id,
          qc_status,
          stage_key,
          note,
          created_at,
          motive_id,
          by_user_id
        from public.qc_event
        where line = 'portones'
          and qc_status in ('OBSERVADO', 'RECHAZADO')
        order by item_id, created_at desc
      ),
      porton_despacho as (
        select e.porton_id, e.estado as despacho_estado
        from public.porton_etapas_estado e
        where e.etapa = 'despacho'
      )
      select
        p.id,
        p.nv,
        p.nlista,
        p.partida,
        p.sistema,
        p.tipo,
        p.parent_id,
        p.revision_ok,
        p.revision_ok_at,
        p.detalle_refabricacion,
        p.fecha_prod,
        p.fecha_plan,
        p.fecha_plan_entrega,
        p.created_at,
        uq.qc_status    as ultimo_qc_status,
        uq.stage_key    as ultimo_qc_stage,
        uq.note         as ultimo_qc_note,
        uq.created_at   as ultimo_qc_fecha,
        uq.motive_id    as ultimo_qc_motive_id,
        m.label         as ultimo_qc_motive_label,
        u.name          as ultimo_qc_usuario,
        pd.despacho_estado,
        (
          select string_agg(etapa::text, ', ' order by etapa)
          from public.porton_etapas_estado
          where porton_id = p.id and estado = 'En Proceso'
        ) as etapas_en_proceso
      from public.portones p
      inner join ultimo_qc uq on uq.item_id = p.nv
      left join public.qc_motive m on m.id = uq.motive_id
      left join public.qc_users u on u.id = uq.by_user_id
      left join porton_despacho pd on pd.porton_id = p.id
      where
        -- No mostrar los que ya terminaron despacho
        (pd.despacho_estado is null or pd.despacho_estado != 'Finalizado')
      order by p.nv asc, p.id asc
    `);

    const observados = rows.filter(r => r.ultimo_qc_status === 'OBSERVADO');
    const rechazados = rows.filter(r => r.ultimo_qc_status === 'RECHAZADO');

    return res.json({ ok: true, observados, rechazados });
  } catch (err) {
    console.error('refabricacion/pendientes error:', err);
    return res.status(500).json({ error: 'Error leyendo pendientes', detail: err.message });
  }
});

// =============================================================
// POST /refabricacion
// Crea un portón de tipo 'refabricacion' basado en uno existente.
// Body: {
//   parent_id: number,
//   fecha_prod: 'YYYY-MM-DD',
//   detalle_refabricacion: string,
//   etapas_a_realizar: string[]   // status_col keys que el usuario debe fabricar (→ PENDIENTE)
// }
// El resto de etapas del portón padre quedan como FINALIZADO.
// =============================================================
router.post('/refabricacion', async (req, res) => {
  const { parent_id, fecha_prod, detalle_refabricacion, etapas_a_realizar } = req.body || {};

  const nParentId = Number(parent_id);
  if (!Number.isInteger(nParentId)) {
    return res.status(400).json({ error: 'parent_id debe ser un entero' });
  }

  const fechaProd = String(fecha_prod || '').trim();
  if (fechaProd && !isValidISODate10(fechaProd)) {
    return res.status(400).json({ error: 'fecha_prod debe ser YYYY-MM-DD o vacío' });
  }

  const etapasARealizar = Array.isArray(etapas_a_realizar)
    ? etapas_a_realizar.map(String).filter(e => PORTON_ETAPAS.has(e) && e !== 'despacho')
    : [];
  const etapasARealiarSet = new Set(etapasARealizar);

  const detalle = String(detalle_refabricacion || '').trim() || null;

  const client = await pool.connect();
  try {
    await client.query('begin');

    const parentQ = await client.query(
      `select id, nv, nlista, partida, sistema, fecha_plan, fecha_plan_entrega, fecha_nv
       from public.portones where id = $1 limit 1`,
      [nParentId]
    );
    if (!parentQ.rows.length) {
      await client.query('rollback');
      return res.status(404).json({ error: 'Portón padre no encontrado' });
    }
    const parent = parentQ.rows[0];

    // Insertar la refabricación
    const ins = await client.query(
      `insert into public.portones (
        nv, nlista, partida, sistema,
        fecha_plan, fecha_prod, fecha_plan_entrega, fecha_nv,
        tipo, parent_id, revision_ok, detalle_refabricacion
      ) values ($1,$2,$3,$4,$5,$6,$7,$8,'refabricacion',$9,false,$10)
      returning id`,
      [
        parent.nv, parent.nlista, parent.partida, parent.sistema,
        parent.fecha_plan, fechaProd || null, parent.fecha_plan_entrega, parent.fecha_nv,
        nParentId, detalle,
      ]
    );
    const newId = ins.rows[0].id;

    const now = new Date().toISOString();

    // Obtener etapas reales del portón padre (evita insertar etapas fantasma)
    const parentStagesQ = await client.query(
      `select etapa::text as etapa
       from public.porton_etapas_estado
       where porton_id = $1 and etapa::text != 'despacho'`,
      [nParentId]
    );
    const parentStageCols = parentStagesQ.rows.map(r => r.etapa);
    const parentStageSet = new Set(parentStageCols);

    // Etapas a finalizar = etapas del padre que el usuario NO va a rehacer
    const etapasAFinalizar = parentStageCols.filter(e => !etapasARealiarSet.has(e));

    if (etapasAFinalizar.length > 0) {
      await client.query(
        `insert into public.porton_etapas_estado(porton_id, etapa, estado)
         select $1, x::public.porton_etapa, $2
         from unnest($3::text[]) as x
         on conflict (porton_id, etapa) do nothing`,
        [newId, STATUS.FINALIZADO, etapasAFinalizar]
      );
      await client.query(
        `insert into public.porton_etapas_tiempos(porton_id, etapa, inicio, fin)
         select $1, x::public.porton_etapa, $2, $2
         from unnest($3::text[]) as x
         on conflict (porton_id, etapa) do nothing`,
        [newId, now, etapasAFinalizar]
      );
    }

    // Etapas a realizar = seleccionadas por el usuario (filtradas a las del padre)
    const pendienteCols = etapasARealizar.filter(e => parentStageSet.has(e));
    if (pendienteCols.length > 0) {
      await client.query(
        `insert into public.porton_etapas_estado(porton_id, etapa, estado)
         select $1, x::public.porton_etapa, $2
         from unnest($3::text[]) as x
         on conflict (porton_id, etapa) do nothing`,
        [newId, STATUS.PENDIENTE, pendienteCols]
      );
    }

    // Fallback: si el padre no tenía etapas registradas, arrancar desde el inicio del workflow
    if (parentStageSet.size === 0) {
      const shape = await getPortonShapeById(client, newId);
      const stageMap = await loadStageMap('portones');
      const initNextKeys = await getNextStages('portones', 'inicio', shape || {});
      const initCols = [];
      for (const nk of initNextKeys || []) {
        const ns = stageMap.get(nk);
        if (!ns) continue;
        const col = String(ns.status_col || '').trim();
        if (col && PORTON_ETAPAS.has(col) && col !== 'despacho') initCols.push(col);
      }
      if (initCols.length > 0) {
        await client.query(
          `insert into public.porton_etapas_estado(porton_id, etapa, estado)
           select $1, x::public.porton_etapa, $2
           from unnest($3::text[]) as x
           on conflict (porton_id, etapa) do nothing`,
          [newId, STATUS.PENDIENTE, initCols]
        );
      }
    }

    await client.query('commit');

    const result = await getPortonShapeById(pool, newId);
    return res.status(201).json(result || { id: newId });
  } catch (err) {
    await client.query('rollback');
    console.error('crear refabricacion error:', err);
    return res.status(500).json({ error: 'Error creando refabricacion', detail: err.message });
  } finally {
    client.release();
  }
});

// =============================================================
// POST /portones/:id/revision-ok
// Aprueba un portón observado/rechazado para que pase a despacho.
// Requiere que armado_final esté Finalizado.
// =============================================================
router.post('/portones/:id/revision-ok', async (req, res) => {
  const { id } = req.params;
  const nId = Number(id);
  if (!Number.isInteger(nId)) {
    return res.status(400).json({ error: 'id inválido' });
  }

  const client = await pool.connect();
  try {
    await client.query('begin');

    // Verificar que existe y que armado_final está Finalizado
    const { rows: portRows } = await client.query(
      `select p.id, p.nv, p.revision_ok,
              e.estado as armado_final_estado
       from public.portones p
       left join public.porton_etapas_estado e
         on e.porton_id = p.id and e.etapa = 'armado_final'
       where p.id = $1 limit 1`,
      [nId]
    );

    if (!portRows.length) {
      await client.query('rollback');
      return res.status(404).json({ error: 'Portón no encontrado' });
    }

    const port = portRows[0];
    if (String(port.armado_final_estado || '').toLowerCase() !== 'finalizado') {
      await client.query('rollback');
      return res.status(409).json({ error: 'armado_final debe estar Finalizado antes de aprobar' });
    }

    // Marcar revision_ok = true y guardar timestamp de aprobación
    await client.query(
      `update public.portones set revision_ok = true, revision_ok_at = now() where id = $1`,
      [nId]
    );

    // Activar despacho si no está ya activo
    await client.query(
      `insert into public.porton_etapas_estado(porton_id, etapa, estado)
       values ($1, 'despacho'::public.porton_etapa, $2)
       on conflict (porton_id, etapa)
       do update set estado = coalesce(public.porton_etapas_estado.estado, excluded.estado)`,
      [nId, STATUS.PENDIENTE]
    );

    await client.query('commit');

    const shape = await getPortonShapeById(pool, nId);
    return res.json({ ok: true, porton: shape });
  } catch (err) {
    await client.query('rollback');
    console.error('revision-ok error:', err);
    return res.status(500).json({ error: 'Error aprobando portón', detail: err.message });
  } finally {
    client.release();
  }
});

module.exports = router;
