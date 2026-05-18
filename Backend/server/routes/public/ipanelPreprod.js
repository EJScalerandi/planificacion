const express = require('express');
const { pool } = require('../../db');
const { isValidISODate10 } = require('../../lib/common');
const { adminAuth } = require('../../middleware/adminAuth');

const router = express.Router();

function toStr(v) {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

function toIntOrNull(v) {
  const s = toStr(v);
  if (!s) return null;
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
}

function isTruthySi(v) {
  if (v === true) return true;
  return ['1', 'true', 'si', 'sí', 'yes'].includes(toStr(v).toLowerCase());
}

function normalizeDate10(v) {
  if (v === null || v === undefined || v === '') return null;

  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return null;
    return v.toISOString().slice(0, 10);
  }

  const s = String(v).trim();
  if (!s) return null;

  const direct = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (direct && isValidISODate10(direct[1])) return direct[1];

  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);

  return null;
}

function firstDate10(...values) {
  for (const v of values) {
    const d = normalizeDate10(v);
    if (d) return d;
  }
  return null;
}

function assertDate10OrNull(value, fieldName) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string') {
    const err = new Error(`${fieldName} debe ser string YYYY-MM-DD o null`);
    err.statusCode = 400;
    throw err;
  }
  const d = value.slice(0, 10);
  if (!isValidISODate10(d)) {
    const err = new Error(`${fieldName} invalida. Use formato YYYY-MM-DD`);
    err.statusCode = 400;
    throw err;
  }
  return d;
}

function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj || {}, key);
}


const ADMIN_AUTH_FIELDS = new Set([
  'admin_cliente_en_regla',
  'admin_acciones',
  'admin_acciones_detalle',
  'auth_admin',
  'auth_admin_at',
]);

function touchesAdminAuthFields(body = {}) {
  return Object.keys(body || {}).some((key) => ADMIN_AUTH_FIELDS.has(key));
}

function normalizeScopes(scopesRaw) {
  if (Array.isArray(scopesRaw)) return scopesRaw.map((s) => String(s || '').trim()).filter(Boolean);
  if (typeof scopesRaw === 'string') {
    return scopesRaw
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

function hasAdminPreproduccionScope(req) {
  const scopes = normalizeScopes(req?.admin?.scopes ?? req?.admin?.scope ?? req?.admin?.permissions ?? []);
  return scopes.includes('preproduccion:admin');
}

function requireAdminForAdminAuthPatch(req, res, next) {
  if (!touchesAdminAuthFields(req.body || {})) return next();

  return adminAuth(req, res, () => {
    if (!hasAdminPreproduccionScope(req)) {
      return res.status(403).json({ error: 'No tenés permiso para autorizar iPanels' });
    }
    return next();
  });
}

function getDescripcionFromRowOrData(row = {}, data = {}) {
  return toStr(
    row.descripcion ??
    data.descripcion ??
    data.producto_descripcion ??
    data.producto_descripciones ??
    data.descripcion_producto
  ) || null;
}

function getDescripcionSimpleFromRowOrData(row = {}, data = {}) {
  return toStr(
    row.descripcion_simple ??
    row.DescripcionSimple ??
    data.DescripcionSimple ??
    data.descripcion_simple
  ) || null;
}

function getAdminAccionesDetalle(data = {}) {
  return toStr(
    data.admin_acciones_detalle ??
    data.admin_acciones_observacion ??
    data.admin_acciones_observacion_imput ??
    data.acciones_detalle ??
    data.acciones_observacion
  );
}

function buildObservacionesFromData(data = {}) {
  const parts = [];
  const cliente = toStr(data.cliente ?? data.Cliente);
  const nombre = toStr(data.nombre ?? data.Nombre);
  const direccion = toStr(data.direccion ?? data.Direccion);
  const localidad = toStr(data.localidad ?? data.Localidad);
  const provincia = toStr(data.provincia ?? data.Provincia);
  const cp = toStr(data.cp ?? data.CP);
  const cuit = toStr(data.cuit ?? data.CUIT);
  const observ = toStr(data.observ ?? data.Observ);
  const obs = toStr(data.obs ?? data.Obs);
  const oc = toStr(data.oc ?? data.OC);
  const idpedido = toStr(data.idpedido ?? data.IdPedido ?? data.IDPEDIDO);
  const vendedor = toStr(data.vendedor ?? data.Vendedor);
  const operador = toStr(data.operador ?? data.Operador);
  const descripcion = getDescripcionFromRowOrData({}, data);

  if (cliente || nombre) parts.push(`Cliente: ${[cliente, nombre].filter(Boolean).join(' - ')}`);
  if (direccion || localidad || provincia || cp) {
    parts.push(`Direccion: ${[direccion, localidad, provincia, cp ? `CP ${cp}` : ''].filter(Boolean).join(' | ')}`);
  }
  if (cuit) parts.push(`CUIT: ${cuit}`);
  if (vendedor) parts.push(`Vendedor: ${vendedor}`);
  if (operador) parts.push(`Operador: ${operador}`);
  if (descripcion) parts.push(`Descripcion: ${descripcion}`);
  if (observ) parts.push(`Observ: ${observ}`);
  if (obs) parts.push(`Obs: ${obs}`);
  if (oc) parts.push(`OC: ${oc}`);
  if (idpedido) parts.push(`ID pedido: ${idpedido}`);

  return parts.join('\n') || null;
}

function normalizePreprodRow(row) {
  const data = row?.data && typeof row.data === 'object' ? row.data : {};
  const ipanelId = row?.ipanel_id_resolved ?? row?.ipanel_id ?? null;
  const enviado = row?.produccion_enviada_resolved === true || row?.produccion_enviada === true || !!ipanelId;
  const descripcion = getDescripcionFromRowOrData(row, data);
  const descripcionSimple = getDescripcionSimpleFromRowOrData(row, data);
  const accionesDetalle = getAdminAccionesDetalle(data);

  return {
    ...row,
    descripcion,
    descripcion_simple: descripcionSimple,
    DescripcionSimple: descripcionSimple,
    data,
    ipanel_id: ipanelId,
    produccion_enviada: enviado,
    fecha_prod: firstDate10(row?.fecha_prod, data.fecha_prod, data.inicio_prod_imput),
    fecha_plan_entrega: firstDate10(row?.fecha_plan_entrega, data.fecha_plan_entrega, data.fecha_salida_imput, data.fechaent),
    fecha_nv: firstDate10(row?.fecha_nv, data.fecha_nv, data.fecha),
    partida: toIntOrNull(row?.partida ?? data.partida ?? data.numero),
    nv: toIntOrNull(row?.nv ?? data.nv ?? data.numero),
    auth_admin: isTruthySi(data.auth_admin),
    auth_admin_at: data.auth_admin_at ?? null,
    admin_cliente_en_regla: isTruthySi(data.admin_cliente_en_regla),
    admin_acciones: isTruthySi(data.admin_acciones) || Boolean(accionesDetalle),
    admin_acciones_detalle: accionesDetalle || null,
  };
}

async function getPreprodById(clientOrPool, id) {
  const { rows } = await clientOrPool.query(
    `
    select
      p.*,
      coalesce(p.ipanel_id, ip.id) as ipanel_id_resolved,
      (coalesce(p.produccion_enviada, false) or ip.id is not null) as produccion_enviada_resolved
    from public.preproduccion_valores_ipanels p
    left join lateral (
      select id
      from public.ipanel i
      where i.partida = p.partida
      order by id asc
      limit 1
    ) ip on true
    where p.id = $1
    limit 1;
    `,
    [id]
  );
  return rows[0] ? normalizePreprodRow(rows[0]) : null;
}

router.get('/preproduccion-valores-ipanels', async (req, res) => {
  try {
    const q = toStr(req.query.q);
    const onlyPending = ['1', 'true', 'si', 'yes'].includes(toStr(req.query.onlyPending).toLowerCase());
    const params = [];
    const where = [];

    if (q) {
      params.push(`%${q}%`);
      const p = params.length;
      where.push(`(
        p.partida::text ilike $${p}
        or coalesce(p.nv::text, '') ilike $${p}
        or coalesce(p.data->>'nombre', p.data->>'Nombre', '') ilike $${p}
        or coalesce(p.data->>'cliente', p.data->>'Cliente', '') ilike $${p}
        or coalesce(p.data->>'localidad', p.data->>'Localidad', '') ilike $${p}
        or coalesce(p.data->>'oc', p.data->>'OC', '') ilike $${p}
        or coalesce(p.descripcion, p.data->>'descripcion', p.data->>'producto_descripcion', p.data->>'producto_descripciones', p.data->>'descripcion_producto', '') ilike $${p}
        or coalesce(p.descripcion_simple, p.data->>'DescripcionSimple', p.data->>'descripcion_simple', '') ilike $${p}
      )`);
    }

    if (onlyPending) where.push('(coalesce(p.produccion_enviada, false) = false and ip.id is null)');
    const whereSql = where.length ? `where ${where.join(' and ')}` : '';

    const { rows } = await pool.query(
      `
      select
        p.*,
        coalesce(p.ipanel_id, ip.id) as ipanel_id_resolved,
        (coalesce(p.produccion_enviada, false) or ip.id is not null) as produccion_enviada_resolved
      from public.preproduccion_valores_ipanels p
      left join lateral (
        select id
        from public.ipanel i
        where i.partida = p.partida
        order by id asc
        limit 1
      ) ip on true
      ${whereSql}
      order by
        coalesce(p.fecha_prod, p.fecha_nv, p.created_at::date) desc nulls last,
        p.partida desc,
        p.id desc;
      `,
      params
    );

    res.setHeader('Cache-Control', 'no-store');
    return res.json(rows.map(normalizePreprodRow));
  } catch (err) {
    console.error('preproduccion_valores_ipanels list error:', err);
    return res.status(500).json({ error: 'Error leyendo preproduccion_valores_ipanels', detail: err.message });
  }
});

router.get('/ipanels/preproduccion', async (req, res, next) => {
  req.url = `/preproduccion-valores-ipanels${req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : ''}`;
  return router.handle(req, res, next);
});

function mergeAdminAuthFields(data, incoming = {}) {
  const next = { ...(data || {}) };

  if (hasOwn(incoming, 'admin_cliente_en_regla')) next.admin_cliente_en_regla = Boolean(incoming.admin_cliente_en_regla);
  if (hasOwn(incoming, 'admin_acciones')) next.admin_acciones = Boolean(incoming.admin_acciones);
  if (hasOwn(incoming, 'admin_acciones_detalle')) {
    const detalle = toStr(incoming.admin_acciones_detalle);
    next.admin_acciones_detalle = detalle || null;
  }
  if (hasOwn(incoming, 'auth_admin')) next.auth_admin = Boolean(incoming.auth_admin);
  if (hasOwn(incoming, 'auth_admin_at')) next.auth_admin_at = incoming.auth_admin_at || null;

  return next;
}

async function updatePreprodDates(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'id invalido' });

  try {
    const current = await getPreprodById(pool, id);
    if (!current) return res.status(404).json({ error: 'iPanel de preproduccion no encontrado' });

    const incoming = req.body || {};
    const fechaProd = hasOwn(incoming, 'fecha_prod')
      ? assertDate10OrNull(incoming.fecha_prod, 'fecha_prod')
      : current.fecha_prod;
    const fechaPlanEntrega = hasOwn(incoming, 'fecha_plan_entrega')
      ? assertDate10OrNull(incoming.fecha_plan_entrega, 'fecha_plan_entrega')
      : current.fecha_plan_entrega;

    const descripcion = getDescripcionFromRowOrData(current, current.data || {});
    const descripcionSimple = getDescripcionSimpleFromRowOrData(current, current.data || {});
    const data = mergeAdminAuthFields({
      ...(current.data || {}),
      descripcion,
      DescripcionSimple: descripcionSimple,
      descripcion_simple: descripcionSimple,
      fecha_prod: fechaProd,
      fecha_plan_entrega: fechaPlanEntrega,
      inicio_prod_imput: fechaProd,
      fecha_salida_imput: fechaPlanEntrega,
    }, incoming);

    const { rows } = await pool.query(
      `
      update public.preproduccion_valores_ipanels
      set fecha_prod = $2::date,
          fecha_plan_entrega = $3::date,
          descripcion = $4,
          descripcion_simple = $5,
          data = $6::jsonb,
          updated_at = now()
      where id = $1
      returning *;
      `,
      [id, fechaProd, fechaPlanEntrega, descripcion, descripcionSimple, JSON.stringify(data)]
    );

    const updated = await getPreprodById(pool, rows[0].id);
    return res.json(updated);
  } catch (err) {
    console.error('update preproduccion_valores_ipanels error:', err);
    return res.status(err.statusCode || 500).json({
      error: err.statusCode ? err.message : 'Error actualizando iPanel de preproduccion',
      detail: err.statusCode ? undefined : err.message,
    });
  }
}

router.patch('/preproduccion-valores-ipanels/:id', requireAdminForAdminAuthPatch, updatePreprodDates);
router.put('/preproduccion-valores-ipanels/:id', requireAdminForAdminAuthPatch, updatePreprodDates);

router.post('/preproduccion-valores-ipanels/:id/enviar-produccion', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'id invalido' });

  const client = await pool.connect();
  try {
    await client.query('begin');

    const current = await getPreprodById(client, id);
    if (!current) {
      await client.query('rollback');
      return res.status(404).json({ error: 'iPanel de preproduccion no encontrado' });
    }

    const fechaProd = hasOwn(req.body || {}, 'fecha_prod')
      ? assertDate10OrNull(req.body.fecha_prod, 'fecha_prod')
      : current.fecha_prod;
    const fechaPlanEntrega = hasOwn(req.body || {}, 'fecha_plan_entrega')
      ? assertDate10OrNull(req.body.fecha_plan_entrega, 'fecha_plan_entrega')
      : current.fecha_plan_entrega;

    if (!fechaProd) {
      await client.query('rollback');
      return res.status(400).json({ error: 'Para enviar a produccion primero cargue fecha_prod' });
    }

    const partida = toIntOrNull(current.partida);
    const nv = toIntOrNull(current.nv) || partida;
    if (!partida) {
      await client.query('rollback');
      return res.status(400).json({ error: 'El registro no tiene partida valida' });
    }

    const descripcion = getDescripcionFromRowOrData(current, current.data || {});
    const descripcionSimple = getDescripcionSimpleFromRowOrData(current, current.data || {});
    const data = {
      ...(current.data || {}),
      descripcion,
      DescripcionSimple: descripcionSimple,
      descripcion_simple: descripcionSimple,
      fecha_prod: fechaProd,
      fecha_plan_entrega: fechaPlanEntrega,
      inicio_prod_imput: fechaProd,
      fecha_salida_imput: fechaPlanEntrega,
      produccion_enviada: true,
    };

    const observaciones = toStr(data.observaciones ?? data.Observaciones) || buildObservacionesFromData(data);

    const existing = await client.query(
      `select * from public.ipanel where partida = $1 order by id asc limit 1;`,
      [partida]
    );

    let ipanel;
    if (existing.rows.length) {
      const upd = await client.query(
        `
        update public.ipanel
        set nv = $2,
            fecha_nv = coalesce($3::date, fecha_nv),
            fecha_prod = $4::date,
            fecha_plan_entrega = $5::date,
            observaciones = coalesce($6, observaciones),
            descripcion = coalesce($7, descripcion),
            descripcion_simple = coalesce($8, descripcion_simple),
            updated_at = now()
        where id = $1
        returning *;
        `,
        [existing.rows[0].id, nv, current.fecha_nv, fechaProd, fechaPlanEntrega, observaciones || null, descripcion || null, descripcionSimple || null]
      );
      ipanel = upd.rows[0];
    } else {
      const ins = await client.query(
        `
        insert into public.ipanel (
          partida,
          nv,
          fecha_nv,
          fecha_prod,
          fecha_plan_entrega,
          observaciones,
          descripcion,
          descripcion_simple,
          diseno,
          guillotina,
          plegado,
          pintura,
          inyeccion,
          despacho
        ) values ($1,$2,$3::date,$4::date,$5::date,$6,$7,$8,$9,$10,$11,$12,$13,$14)
        returning *;
        `,
        [
          partida,
          nv,
          current.fecha_nv,
          fechaProd,
          fechaPlanEntrega,
          observaciones || null,
          descripcion || null,
          descripcionSimple || null,
          'Pendiente',
          null,
          null,
          null,
          null,
          null,
        ]
      );
      ipanel = ins.rows[0];
    }

    await client.query(
      `
      update public.preproduccion_valores_ipanels
      set fecha_prod = $2::date,
          fecha_plan_entrega = $3::date,
          descripcion = $6,
          descripcion_simple = $7,
          produccion_enviada = true,
          produccion_enviada_at = coalesce(produccion_enviada_at, now()),
          ipanel_id = $4,
          data = $5::jsonb,
          updated_at = now()
      where id = $1;
      `,
      [id, fechaProd, fechaPlanEntrega, ipanel.id, JSON.stringify(data), descripcion || null, descripcionSimple || null]
    );

    const preproduccion = await getPreprodById(client, id);
    await client.query('commit');
    return res.status(existing.rows.length ? 200 : 201).json({ ok: true, ipanel, preproduccion });
  } catch (err) {
    await client.query('rollback');
    console.error('enviar ipanel a produccion error:', err);
    return res.status(err.statusCode || 500).json({
      error: err.statusCode ? err.message : 'Error enviando iPanel a produccion',
      detail: err.statusCode ? undefined : err.message,
    });
  } finally {
    client.release();
  }
});

module.exports = router;
