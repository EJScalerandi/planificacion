const express = require('express');
const { pool } = require('../../db');
const { apiKeyAuth } = require('../../middleware/apiKeyAuth');

const router = express.Router();

router.use(apiKeyAuth);

// Extrae el número entero de strings como "NV3001", "INV3001", "NP3001", "3001", etc.
function extractNvNumber(raw) {
  const s = String(raw || '').trim().replace(/^[A-Za-z]+/, '');
  const n = parseInt(s, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// SQL base reutilizado en ambas rutas.
// Devuelve la info mapeada al formato del CSV para la IA.
// Sólo retorna portones donde preprod_data->>'permitir_consulta_ia' sea truthy.
const BASE_SQL = `
  SELECT
    p.id                                                                   AS id_porton,
    p.nv,
    p.nlista,
    p.partida,

    -- Nombre del cliente: buscamos en preprod_data y en presupuestador_quotes
    COALESCE(
      pv.data->>'Nombre',
      pv.data->>'nombre',
      pv.data->>'nombre_cliente',
      pv.data->>'NombreCliente',
      sq.cliente_nombre
    )                                                                      AS nombre_cliente,

    COALESCE(pv.data->>'Distribuidor', pv.data->>'distribuidor')           AS distribuidor,

    -- Etapa actual: la más avanzada en el workflow con cualquier estado
    cur.etapa                                                              AS etapa_actual_repo,
    cur.estado                                                             AS estado_etapa_actual,
    CASE
      WHEN cur.etapa = 'diseno'   THEN 'Diseño'
      WHEN cur.etapa = 'despacho' THEN 'Listo para despacho'
      WHEN cur.etapa IS NOT NULL  THEN 'Producción'
      ELSE NULL
    END                                                                    AS etapa_ia,

    -- Fechas (ISO YYYY-MM-DD)
    to_char(p.fecha_nv,            'YYYY-MM-DD')  AS fecha_venta_nv,
    to_char(p.fecha_med,           'YYYY-MM-DD')  AS fecha_medicion,
    to_char(p.fecha_prod,          'YYYY-MM-DD')  AS fecha_produccion,
    to_char(p.fecha_plan,          'YYYY-MM-DD')  AS fecha_despacho_plan,
    to_char(p.fecha_plan_entrega,  'YYYY-MM-DD')  AS fecha_plan_entrega,

    -- Datos del portón
    p.sistema,
    COALESCE(
      pv.data->>'Tipo',
      pv.data->>'tipo',
      pv.data->>'TipoPorton',
      p.tipo
    )                                                                      AS tipo_porton,
    COALESCE(pv.data->>'Color',          pv.data->>'color')               AS color,
    COALESCE(pv.data->>'Ancho',          pv.data->>'ancho_mm')            AS ancho_mm,
    COALESCE(pv.data->>'Alto',           pv.data->>'alto_mm')             AS alto_mm,
    COALESCE(pv.data->>'Revestimiento',  pv.data->>'revestimiento')       AS revestimiento,
    COALESCE(
      pv.data->>'Vendedor',
      pv.data->>'vendedor',
      pv.data->>'NombreVendedor',
      pv.data->>'nombre_vendedor'
    )                                                                      AS nombre_vendedor,

    -- Semanas estimadas en formato ISO (YYYY-Www)
    to_char(p.fecha_plan_entrega, 'IYYY-"W"IW')  AS semana_entrega_estimada,
    to_char(p.fecha_prod,         'IYYY-"W"IW')  AS semana_produccion_estimada,

    -- Contacto y ubicación
    COALESCE(
      pv.data->>'pq_maps_url',
      pv.data->>'maps_url',
      pv.data->>'MapsUrl'
    )                                                                      AS ubicacion_maps_url,
    COALESCE(
      pv.data->>'pq_phone',
      pv.data->>'phone',
      pv.data->>'Celular',
      pv.data->>'celular',
      pv.data->>'ContactoCliente'
    )                                                                      AS contacto_cliente_cel,

    pv.updated_at                                                          AS preprod_updated_at

  FROM public.portones p

  -- Datos de preproducción (JSON flexible por NV)
  LEFT JOIN public.preproduccion_valores pv
    ON pv.nv = p.nv AND pv.nv_tipo = 'NV'

  -- Nombre del cliente desde presupuestador (fallback)
  LEFT JOIN LATERAL (
    SELECT q.end_customer->>'name' AS cliente_nombre
    FROM public.presupuestador_quotes q
    WHERE q.quote_kind = 'original'
      AND (
        q.final_sale_order_name  = 'NV' || p.nv::text
        OR q.odoo_sale_order_name = 'NV' || p.nv::text
      )
    ORDER BY q.id DESC
    LIMIT 1
  ) sq ON TRUE

  -- Etapa más avanzada alcanzada en el workflow
  LEFT JOIN LATERAL (
    SELECT e.etapa::text, e.estado::text
    FROM public.porton_etapas_estado e
    WHERE e.porton_id = p.id
    ORDER BY
      CASE e.etapa::text
        WHEN 'despacho'              THEN 16
        WHEN 'armado_final'          THEN 15
        WHEN 'armado_marco_piernas'  THEN 14
        WHEN 'armado_hojas'          THEN 13
        WHEN 'pintura_revestimiento' THEN 12
        WHEN 'pintura'               THEN 11
        WHEN 'revestimiento'         THEN 10
        WHEN 'plegado_revest'        THEN 9
        WHEN 'corte_revest'          THEN 8
        WHEN 'inyeccion'             THEN 7
        WHEN 'armado_primario'       THEN 6
        WHEN 'armado_piernas'        THEN 5
        WHEN 'plegadora'             THEN 4
        WHEN 'guillotina'            THEN 3
        WHEN 'laser'                 THEN 2
        WHEN 'diseno'                THEN 1
        ELSE 0
      END DESC
    LIMIT 1
  ) cur ON TRUE

  -- Filtro: todos habilitados EXCEPTO los que tienen permitir_consulta_ia = false/no/0
  WHERE lower(coalesce(pv.data->>'permitir_consulta_ia', '')) NOT IN ('false', '0', 'no')
`;

// ---------------------------------------------------------------------------
// GET /api/ia/portones/buscar?q=<texto>
//
// Búsqueda amplia. Acepta:
//   - Número NV con o sin prefijo (NV3001, INV3001, NP3001, 3001, ...)
//   - Nombre del cliente (parcial, case-insensitive)
//   - Nombre del distribuidor (parcial, case-insensitive)
//
// Devuelve hasta 50 resultados.
// ---------------------------------------------------------------------------
router.get('/api/ia/portones/buscar', async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (!q) {
    return res.status(400).json({ error: 'Falta el parámetro q (texto de búsqueda)' });
  }

  try {
    const params = [];
    const conditions = [];

    // Si el texto parece un número (con o sin prefijo de letras), buscar por NV exacto
    const nNum = extractNvNumber(q);
    if (nNum) {
      params.push(nNum);
      conditions.push(`p.nv = $${params.length}`);
    }

    // Búsqueda textual en nombre cliente y distribuidor
    params.push(`%${q}%`);
    const pi = params.length;
    conditions.push(`(
      coalesce(pv.data->>'Nombre',       '') ilike $${pi}
      OR coalesce(pv.data->>'nombre',       '') ilike $${pi}
      OR coalesce(pv.data->>'nombre_cliente','') ilike $${pi}
      OR coalesce(pv.data->>'NombreCliente', '') ilike $${pi}
      OR coalesce(pv.data->>'Distribuidor',  '') ilike $${pi}
      OR coalesce(pv.data->>'distribuidor',  '') ilike $${pi}
      OR coalesce(sq.cliente_nombre,         '') ilike $${pi}
    )`);

    const { rows } = await pool.query(
      `${BASE_SQL} AND (${conditions.join(' OR ')})
       ORDER BY p.nv ASC, p.nlista ASC
       LIMIT 50`,
      params
    );

    return res.json({
      found: rows.length > 0,
      total: rows.length,
      data: rows,
    });
  } catch (err) {
    console.error('ia/buscar error:', err);
    return res.status(500).json({ error: 'Error en búsqueda', detail: err.message });
  }
});

// ---------------------------------------------------------------------------
// GET /api/ia/portones/por-nv/:numero
//
// Detalle completo por número de NV.
// Acepta cualquier prefijo: NV3001, NP3001, INV3001, INP3001, ONP3001, 3001, etc.
// Devuelve todos los portones (nlistas) de ese NV.
// ---------------------------------------------------------------------------
router.get('/api/ia/portones/por-nv/:numero', async (req, res) => {
  const nNum = extractNvNumber(req.params.numero);
  if (!nNum) {
    return res.status(400).json({ error: 'Número de NV inválido. Use el número solo o con prefijo (NV3001, INV3001, etc.)' });
  }

  try {
    const { rows } = await pool.query(
      `${BASE_SQL} AND p.nv = $1
       ORDER BY p.nlista ASC`,
      [nNum]
    );

    if (!rows.length) {
      return res.status(404).json({
        found: false,
        nv: nNum,
        error: `No se encontró ningún portón con NV ${nNum}, o no tiene habilitada la consulta IA`,
      });
    }

    return res.json({
      found: true,
      nv: nNum,
      total: rows.length,
      data: rows,
    });
  } catch (err) {
    console.error('ia/por-nv error:', err);
    return res.status(500).json({ error: 'Error consultando portón', detail: err.message });
  }
});

module.exports = router;
