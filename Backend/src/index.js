const path = require('path');

// 👇 Forzamos a dotenv a usar Backend/.env
require('dotenv').config({
  path: path.join(__dirname, '..', '.env'),
});

const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const { Pool } = require('pg');
const sql = require('mssql'); // <-- SQL Server

const app = express();

const PORT = process.env.PORT || 4000;

// DEBUG: ver qué SQL* ve Node
console.log('ENV SQL* vars:', Object.keys(process.env).filter(k => k.toUpperCase().includes('SQL')));
console.log('SQLSERVER_HOST:', process.env.SQLSERVER_HOST);
console.log('SQLSERVER_DB:', process.env.SQLSERVER_DB);
console.log('supabase url:', process.env.SUPABASE_DB_URL);

// ======================= CORS / BASE =======================

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

// Config SQL Server
const sqlServerConfig = {
  user: process.env.SQLSERVER_USER,
  password: process.env.SQLSERVER_PASSWORD,
  server: process.env.SQLSERVER_HOST,
  database: process.env.SQLSERVER_DB,
  port: Number(process.env.SQLSERVER_PORT || 1433),
  options: {
    encrypt: false,              // para 2008 R2 casi siempre false
    trustServerCertificate: true
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000
  }
};

let sqlServerPool;

async function getSqlServerPool() {
  if (!sqlServerPool) {
    sqlServerPool = await sql.connect(sqlServerConfig);
  }
  return sqlServerPool;
}

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

// =========================================================
// SYNC: traer Pre_Produccion (SQL Server) -> portones_pre_produccion (Supabase)
// =========================================================

// placeholders $1..$119 (tantos como valores insertamos)
const PREPROD_VALUE_PLACEHOLDERS = Array.from({ length: 119 }, (_, i) => `$${i + 1}`).join(', ');

// POST /sync/preproduccion
// Borra la tabla destino y la rellena completa desde SQL Server, en lotes.
app.post('/sync/preproduccion', async (_req, res) => {
  const batchSize = 500;
  let lastId = 0;
  let total = 0;

  try {
    const sqlPool = await getSqlServerPool();

    // Limpio tabla destino antes de importar
    await pool.query('TRUNCATE TABLE public.portones_pre_produccion;');

    // Leo por lotes
    while (true) {
      const result = await sqlPool.request()
        .input('lastId', sql.Int, lastId)
        .input('batchSize', sql.Int, batchSize)
        .query(`
          SELECT TOP (@batchSize)
            ID,
            PARTIDA,
            NV,
            Nombre,
            Direccion,
            ID_cliente,
            RazSoc,
            Fecha_NV,
            ID_Sistema,
            Sistema,
            Ancho,
            Alto,
            Peso,
            Fecha_Entrega,
            Fecha_Inicio,
            Estado,
            Revestimiento,
            Lucera,
            Color,
            Liston,
            PARANTES_Cantidad,
            PARANTES_Distribucion,
            Color_Sistema,
            PUERTA_Posicion,
            MOTOR_Condicion,
            MOTOR_Posicion,
            PASADOR_Condicion,
            PASADOR_Armado,
            INSTALACION_Instalador,
            INSTALACION_Empotraduras,
            INSTALACION_Posicion,
            PARANTES_Descripcion,
            PIERNAS_Tipo,
            PIERNAS_Altura,
            Espesor_Revestimiento,
            DINTEL_Tipo,
            DINTEL_Ancho,
            DATOS_Brazos,
            DATOS_Hueco_Chico,
            DATOS_Hueco_Grande,
            PERIMETRO_SINO,
            PERIMETRO_Descuento,
            PERIMETRO_Altura,
            REBAJE_SINO,
            REBAJE_Descuento,
            Largo_Planchuelas,
            Largo_Travesaños,
            Largo_Parantes,
            Parantes_Internos,
            Cantidad_Soportes,
            Tapajunta_Lat_Inf,
            Tapajunta_Lat_Sup,
            Tapajunta_R_Sup,
            Puerta_Ancho,
            Puerta_Alto,
            Piezas,
            Tapas_piernas,
            Tipo_Embalaje,
            Tipo_Canasto,
            Tipo_Cables,
            Tipo_Espada,
            Color_Hoja,
            Pintura_antes_PU,
            Cantidad_Chapas,
            Largo_Chapa,
            Ancho_Chapa,
            Cantidad_chapas_Puerta,
            Largo_Chapa_Puerta,
            Largo_G_Horiz,
            Cantidad_G_Horiz,
            Largo_G_Vertical,
            Cantidad_G_Vert_Tipo1,
            Tipo_Borde_G_Puerta,
            Cantidad_G_Horiz_Puerta,
            Cantidad_Borde_H_Puerta,
            Cantidad_G_Vertical,
            Cantidad_G_Vertical_Puerta1,
            Largo_G_Horizontal_Puerta,
            Cantidad_G_Vertical_Puerta2,
            Cantidad_Chapa_Puerta_Puntas,
            Largo_Chapa_Puerta_Puntas,
            Cantidad_Chapas_Puntas,
            Largo_Chapas_Puntas,
            BOR_V_T1_CANT,
            BOR_V_T1_LARG,
            BOR_H_T1_CANT,
            BOR_H_T1_LARG,
            BOR_V_T3_CANT,
            BOR_V_T3_LARG,
            BOR_V_T7_CANT,
            BOR_V_T7_LARG,
            BOR_H_T7_CANT,
            BOR_H_T7_LARG,
            BOR_V_T10_CANT,
            BOR_V_T10_LARG,
            BOR_H_T10_CANT,
            BOR_H_T10_LARG,
            TAPA_UNION_CANT,
            TAPA_UNION_LARG,
            LAM_PAÑO_CANT,
            LAM_PAÑO_LARG,
            LAM_PTA_CANT,
            LAM_PTA_LARG,
            LAM_EXT_T1_PAÑ_CANT,
            LAM_EXT_T1_PAÑ_LARG,
            LAM_EXT_T1_PAÑ_DES,
            LAM_EXT_T1_PTA_CANT,
            LAM_EXT_T1_PTA_LARG,
            LAM_EXT_T1_PTA_DES,
            LAM_EXT_T2_PAÑ_CANT,
            LAM_EXT_T2_PAÑ_LARG,
            LAM_EXT_T2_PAÑ_DES,
            LAM_EXT_T2_PTA_CANT,
            LAM_EXT_T2_PTA_LARG,
            LAM_EXT_T2_PTA_DES,
            RBJ_Tipo,
            RBJ_HOR_X1,
            RBJ_VER_X2,
            RBJ_Ancho
          FROM dbo.Pre_Produccion
          WHERE ID > @lastId
          ORDER BY ID ASC;
        `);

      const rows = result.recordset;
      if (!rows.length) break;

      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        for (const r of rows) {
          await client.query(
            `
            INSERT INTO public.portones_pre_produccion (
              id,
              partida,
              nv,
              nombre,
              direccion,
              id_cliente,
              razsoc,
              fecha_nv,
              id_sistema,
              sistema,
              ancho,
              alto,
              peso,
              fecha_entrega,
              fecha_inicio,
              estado,
              revestimiento,
              lucera,
              color,
              liston,
              parantes_cantidad,
              parantes_distribucion,
              color_sistema,
              puerta_posicion,
              motor_condicion,
              motor_posicion,
              pasador_condicion,
              pasador_armado,
              instalacion_instalador,
              instalacion_empotraduras,
              instalacion_posicion,
              parantes_descripcion,
              piernas_tipo,
              piernas_altura,
              espesor_revestimiento,
              dintel_tipo,
              dintel_ancho,
              datos_brazos,
              datos_hueco_chico,
              datos_hueco_grande,
              perimetro_sino,
              perimetro_descuento,
              perimetro_altura,
              rebaje_sino,
              rebaje_descuento,
              largo_planchuelas,
              largo_travesanos,
              largo_parantes,
              parantes_internos,
              cantidad_soportes,
              tapajunta_lat_inf,
              tapajunta_lat_sup,
              tapajunta_r_sup,
              puerta_ancho,
              puerta_alto,
              piezas,
              tapas_piernas,
              tipo_embalaje,
              tipo_canasto,
              tipo_cables,
              tipo_espada,
              color_hoja,
              pintura_antes_pu,
              cantidad_chapas,
              largo_chapa,
              ancho_chapa,
              cantidad_chapas_puerta,
              largo_chapa_puerta,
              largo_g_horiz,
              cantidad_g_horiz,
              largo_g_vertical,
              cantidad_g_vert_tipo1,
              tipo_borde_g_puerta,
              cantidad_g_horiz_puerta,
              cantidad_borde_h_puerta,
              cantidad_g_vertical,
              cantidad_g_vertical_puerta1,
              largo_g_horizontal_puerta,
              cantidad_g_vertical_puerta2,
              cantidad_chapa_puerta_puntas,
              largo_chapa_puerta_puntas,
              cantidad_chapas_puntas,
              largo_chapas_puntas,
              bor_v_t1_cant,
              bor_v_t1_larg,
              bor_h_t1_cant,
              bor_h_t1_larg,
              bor_v_t3_cant,
              bor_v_t3_larg,
              bor_v_t7_cant,
              bor_v_t7_larg,
              bor_h_t7_cant,
              bor_h_t7_larg,
              bor_v_t10_cant,
              bor_v_t10_larg,
              bor_h_t10_cant,
              bor_h_t10_larg,
              tapa_union_cant,
              tapa_union_larg,
              lam_pano_cant,
              lam_pano_larg,
              lam_pta_cant,
              lam_pta_larg,
              lam_ext_t1_pano_cant,
              lam_ext_t1_pano_larg,
              lam_ext_t1_pano_des,
              lam_ext_t1_pta_cant,
              lam_ext_t1_pta_larg,
              lam_ext_t1_pta_des,
              lam_ext_t2_pano_cant,
              lam_ext_t2_pano_larg,
              lam_ext_t2_pano_des,
              lam_ext_t2_pta_cant,
              lam_ext_t2_pta_larg,
              lam_ext_t2_pta_des,
              rbj_tipo,
              rbj_hor_x1,
              rbj_ver_x2,
              rbj_ancho
            ) VALUES (
              ${PREPROD_VALUE_PLACEHOLDERS}
            );
            `,
            [
              r.ID,
              r.PARTIDA,
              r.NV,
              r.Nombre,
              r.Direccion,
              r.ID_cliente,
              r.RazSoc,
              r.Fecha_NV,
              r.ID_Sistema,
              r.Sistema,
              r.Ancho,
              r.Alto,
              r.Peso,
              r.Fecha_Entrega,
              r.Fecha_Inicio,
              r.Estado,
              r.Revestimiento,
              r.Lucera,
              r.Color,
              r.Liston,
              r.PARANTES_Cantidad,
              r.PARANTES_Distribucion,
              r.Color_Sistema,
              r.PUERTA_Posicion,
              r.MOTOR_Condicion,
              r.MOTOR_Posicion,
              r.PASADOR_Condicion,
              r.PASADOR_Armado,
              r.INSTALACION_Instalador,
              r.INSTALACION_Empotraduras,
              r.INSTALACION_Posicion,
              r.PARANTES_Descripcion,
              r.PIERNAS_Tipo,
              r.PIERNAS_Altura,
              r.Espesor_Revestimiento,
              r.DINTEL_Tipo,
              r.DINTEL_Ancho,
              r.DATOS_Brazos,
              r.DATOS_Hueco_Chico,
              r.DATOS_Hueco_Grande,
              r.PERIMETRO_SINO,
              r.PERIMETRO_Descuento,
              r.PERIMETRO_Altura,
              r.REBAJE_SINO,
              r.REBAJE_Descuento,
              r.Largo_Planchuelas,
              r.Largo_Travesaños,
              r.Largo_Parantes,
              r.Parantes_Internos,
              r.Cantidad_Soportes,
              r.Tapajunta_Lat_Inf,
              r.Tapajunta_Lat_Sup,
              r.Tapajunta_R_Sup,
              r.Puerta_Ancho,
              r.Puerta_Alto,
              r.Piezas,
              r.Tapas_piernas,
              r.Tipo_Embalaje,
              r.Tipo_Canasto,
              r.Tipo_Cables,
              r.Tipo_Espada,
              r.Color_Hoja,
              r.Pintura_antes_PU,
              r.Cantidad_Chapas,
              r.Largo_Chapa,
              r.Ancho_Chapa,
              r.Cantidad_chapas_Puerta,
              r.Largo_Chapa_Puerta,
              r.Largo_G_Horiz,
              r.Cantidad_G_Horiz,
              r.Largo_G_Vertical,
              r.Cantidad_G_Vert_Tipo1,
              r.Tipo_Borde_G_Puerta,
              r.Cantidad_G_Horiz_Puerta,
              r.Cantidad_Borde_H_Puerta,
              r.Cantidad_G_Vertical,
              r.Cantidad_G_Vertical_Puerta1,
              r.Largo_G_Horizontal_Puerta,
              r.Cantidad_G_Vertical_Puerta2,
              r.Cantidad_Chapa_Puerta_Puntas,
              r.Largo_Chapa_Puerta_Puntas,
              r.Cantidad_Chapas_Puntas,
              r.Largo_Chapas_Puntas,
              r.BOR_V_T1_CANT,
              r.BOR_V_T1_LARG,
              r.BOR_H_T1_CANT,
              r.BOR_H_T1_LARG,
              r.BOR_V_T3_CANT,
              r.BOR_V_T3_LARG,
              r.BOR_V_T7_CANT,
              r.BOR_V_T7_LARG,
              r.BOR_H_T7_CANT,
              r.BOR_H_T7_LARG,
              r.BOR_V_T10_CANT,
              r.BOR_V_T10_LARG,
              r.BOR_H_T10_CANT,
              r.BOR_H_T10_LARG,
              r.TAPA_UNION_CANT,
              r.TAPA_UNION_LARG,
              r.LAM_PAÑO_CANT,
              r.LAM_PAÑO_LARG,
              r.LAM_PTA_CANT,
              r.LAM_PTA_LARG,
              r.LAM_EXT_T1_PAÑ_CANT,
              r.LAM_EXT_T1_PAÑ_LARG,
              r.LAM_EXT_T1_PAÑ_DES,
              r.LAM_EXT_T1_PTA_CANT,
              r.LAM_EXT_T1_PTA_LARG,
              r.LAM_EXT_T1_PTA_DES,
              r.LAM_EXT_T2_PAÑ_CANT,
              r.LAM_EXT_T2_PAÑ_LARG,
              r.LAM_EXT_T2_PAÑ_DES,
              r.LAM_EXT_T2_PTA_CANT,
              r.LAM_EXT_T2_PTA_LARG,
              r.LAM_EXT_T2_PTA_DES,
              r.RBJ_Tipo,
              r.RBJ_HOR_X1,
              r.RBJ_VER_X2,
              r.RBJ_Ancho
            ]
          );

          lastId = r.ID;
          total += 1;
        }

        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }
    }

    return res.json({ ok: true, imported: total });
  } catch (err) {
    console.error('sync preproduccion error:', err);
    return res.status(500).json({ error: 'Error sincronizando Pre_Produccion', detail: err.message });
  }
});

// GET /preproduccion/last-sync
// Devuelve la última fecha/hora de sincronización de Pre_Produccion
app.get('/preproduccion/last-sync', async (_req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT MAX(last_sync_at) AS last_sync_at
      FROM public.portones_pre_produccion;
    `);

    const lastSyncAt = rows[0]?.last_sync_at || null;

    return res.json({ lastSyncAt });
  } catch (err) {
    console.error('get preproduccion last-sync error:', err);
    return res.status(500).json({
      error: 'Error leyendo fecha de última sincronización de preproducción',
      detail: err.message,
    });
  }
});

// =========================================================
// PREPRODUCCION: listar y pasar a producción
// =========================================================

// GET /preproduccion
// Lista preproducción. Por defecto solo los que NO fueron pasados a producción.
app.get('/preproduccion', async (req, res) => {
  try {
    const soloPendientes = (req.query.soloPendientes ?? 'true') !== 'false';

    let query = `
      SELECT *
      FROM public.portones_pre_produccion
    `;
    const params = [];

    if (soloPendientes) {
      query += `
        WHERE COALESCE(en_produccion, false) = false
      `;
    }

    query += `
      ORDER BY
        COALESCE(nv, 0) ASC,
        COALESCE(partida, 0) ASC,
        id ASC;
    `;

    const { rows } = await pool.query(query, params);
    return res.json(rows);
  } catch (err) {
    console.error('get preproduccion error:', err);
    return res.status(500).json({
      error: 'Error leyendo preproducción',
      detail: err.message,
    });
  }
});

// GET /preproduccion/por-nv/:nv
// Busca todos los registros de preproducción para una NV concreta
app.get('/preproduccion/por-nv/:nv', async (req, res) => {
  const { nv } = req.params;

  const nNv = Number(nv);
  if (!Number.isInteger(nNv)) {
    return res.status(400).json({ error: 'nv debe ser un entero' });
  }

  try {
    const { rows } = await pool.query(
      `
      SELECT *
      FROM public.portones_pre_produccion
      WHERE nv = $1
      ORDER BY id ASC;
      `,
      [nNv]
    );

    return res.json(rows);
  } catch (err) {
    console.error('get preproduccion por nv error:', err);
    return res.status(500).json({
      error: 'Error buscando preproducción por NV',
      detail: err.message,
    });
  }
});

// POST /preproduccion/a-produccion
// Body: { ids: [1,2,3], nlista?: number }
// Crea portones en public.portones a partir de pre_produccion
// y marca en_preproduccion.en_produccion = true para que no vuelvan a aparecer.
app.post('/preproduccion/a-produccion', async (req, res) => {
  let { ids, nlista } = req.body || {};

  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'Debes enviar un array ids con al menos un id.' });
  }

  // Normalizamos ids a enteros
  ids = ids
    .map(Number)
    .filter(Number.isInteger);

  if (!ids.length) {
    return res.status(400).json({ error: 'El array ids no contiene enteros válidos.' });
  }

  const nLista = Number.isInteger(Number(nlista)) ? Number(nlista) : 1;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1) Insertar en portones solo los que aún no fueron pasados y tienen NV
    const insertResult = await client.query(
      `
      INSERT INTO public.portones (nv, nlista, partida)
      SELECT
        p.nv,
        $1 AS nlista,
        p.partida
      FROM public.portones_pre_produccion p
      WHERE
        p.id = ANY($2::int[])
        AND COALESCE(p.en_produccion, false) = false
        AND p.nv IS NOT NULL
      RETURNING id, nv, partida;
      `,
      [nLista, ids]
    );

    // 2) Marcar en_preproduccion.en_produccion = true
    await client.query(
      `
      UPDATE public.portones_pre_produccion
      SET en_produccion = true
      WHERE id = ANY($1::int[]);
      `,
      [ids]
    );

    await client.query('COMMIT');

    return res.json({
      ok: true,
      creados: insertResult.rowCount,
      portones: insertResult.rows,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('preproduccion a produccion error:', err);
    return res.status(500).json({
      error: 'Error al pasar preproducción a producción',
      detail: err.message,
    });
  } finally {
    client.release();
  }
});

// ===================== Estados & Etapas ====================
const STATUS = {
  PENDIENTE: 'Pendiente',
  EN_PROCESO: 'En Proceso',
  FINALIZADO: 'Finalizado',
};

const STAGES = {
  diseno: { status: 'diseno', start: 'diseno_inicio', end: 'diseno_fin', next: null },
  laser: { status: 'laser', start: 'laser_inicio', end: 'laser_fin', next: null },
  guillotina: { status: 'guillotina', start: 'guillotina_inicio', end: 'guillotina_fin', next: null },
  plegadora: { status: 'plegadora', start: 'plegadora_inicio', end: 'plegadora_fin', next: null },
  armado_marco_piernas: {
    status: 'armado_marco_piernas',
    start: 'armado_marco_piernas_inicio',
    end: 'armado_marco_piernas_fin',
    next: null
  },
  corte_revest: {
    status: 'corte_revest',
    start: 'corte_revest_inicio',
    end: 'corte_revest_fin',
    next: null
  },
  plegado_revest: {
    status: 'plegado_revest',
    start: 'plegado_revest_inicio',
    end: 'plegado_revest_fin',
    next: null
  },
  armado_piernas: { status: 'armado_piernas', start: 'armado_piernas_inicio', end: 'armado_piernas_fin', next: null },
  armado_primario: { status: 'armado_primario', start: 'armado_primario_inicio', end: 'armado_primario_fin', next: null },
  armado_hojas: { status: 'armado_hojas', start: 'armado_hojas_inicio', end: 'armado_hojas_fin', next: null },
  inyeccion: { status: 'inyeccion', start: 'inyeccion_inicio', end: 'inyeccion_fin', next: null },
  revestimiento: { status: 'revestimiento', start: 'revestimiento_inicio', end: 'revestimiento_fin', next: null },
  pintura: { status: 'pintura', start: 'pintura_inicio', end: 'pintura_fin', next: null },
  armado_final: { status: 'armado_final', start: 'armado_final_inicio', end: 'armado_final_fin', next: null },
  despacho: { status: 'despacho', start: 'despacho_inicio', end: 'despacho_fin', next: null }
};

// iPanel: ahora incluye Despacho
const IPANEL_STAGES = {
  diseno: { status: 'diseno', start: 'diseno_inicio', end: 'diseno_fin' },
  guillotina: { status: 'guillotina', start: 'guillotina_inicio', end: 'guillotina_fin' },
  plegado: { status: 'plegado', start: 'plegado_inicio', end: 'plegado_fin' },
  pintura: { status: 'pintura', start: 'pintura_inicio', end: 'pintura_fin' },
  inyeccion: { status: 'inyeccion', start: 'inyeccion_inicio', end: 'inyeccion_fin' },
  despacho: { status: 'despacho', start: 'despacho_inicio', end: 'despacho_fin' },
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

    const nNv = Number(nv);
    const nNl = Number(nlista);
    const nPa = Number(bodyPartida ?? npartida);

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

  if (!cfg || !['start', 'stop'].includes(action)) {
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
    if (fecha_plan !== null && fecha_plan !== undefined) {
      if (typeof fecha_plan !== 'string') {
        return res.status(400).json({ error: 'fecha_plan debe ser string con formato YYYY-MM-DD o null' });
      }
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

// POST: crear ipanel { nv (obligatorio), partida|npartida (opcional)
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

  if (!cfg || !['start', 'stop'].includes(action)) {
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

// POST: asignar/actualizar fecha de Nota de Venta de iPanel
// Body: { fecha_nv: 'YYYY-MM-DD' }  // puede ser null para limpiar
app.post('/ipanel/:id/fecha-nv', async (req, res) => {
  const { id } = req.params;
  let { fecha_nv } = req.body || {};

  try {
    if (fecha_nv !== null && fecha_nv !== undefined) {
      if (typeof fecha_nv !== 'string') {
        return res.status(400).json({ error: 'fecha_nv debe ser string con formato YYYY-MM-DD o null' });
      }
      fecha_nv = fecha_nv.slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha_nv)) {
        return res.status(400).json({ error: 'fecha_nv inválida. Use formato YYYY-MM-DD' });
      }
    }

    const { rows } = await pool.query(
      `UPDATE public.ipanel
       SET fecha_nv = $2
       WHERE id = $1
       RETURNING *;`,
      [id, fecha_nv ?? null]
    );

    if (!rows.length) {
      return res.status(404).json({ error: 'iPanel no encontrado' });
    }
    return res.json(rows[0]);
  } catch (err) {
    console.error('set ipanel fecha_nv error:', err);
    return res.status(500).json({ error: 'Error al actualizar fecha de nota de venta de iPanel', detail: err.message });
  }
});

// POST: asignar/actualizar fecha de Nota de Venta de portones
// Body: { fecha_nv: 'YYYY-MM-DD' }  // puede ser null para limpiar
app.post('/portones/:id/fecha-nv', async (req, res) => {
  const { id } = req.params;
  let { fecha_nv } = req.body || {};

  try {
    if (fecha_nv !== null && fecha_nv !== undefined) {
      if (typeof fecha_nv !== 'string') {
        return res.status(400).json({ error: 'fecha_nv debe ser string con formato YYYY-MM-DD o null' });
      }
      fecha_nv = fecha_nv.slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha_nv)) {
        return res.status(400).json({ error: 'fecha_nv inválida. Use formato YYYY-MM-DD' });
      }
    }

    const { rows } = await pool.query(
      `UPDATE public.portones
       SET fecha_nv = $2
       WHERE id = $1
       RETURNING *;`,
      [id, fecha_nv ?? null]
    );

    if (!rows.length) {
      return res.status(404).json({ error: 'Portón no encontrado' });
    }
    return res.json(rows[0]);
  } catch (err) {
    console.error('set fecha_nv error:', err);
    return res.status(500).json({ error: 'Error al actualizar fecha de nota de venta', detail: err.message });
  }
});

// POST: asignar/actualizar fecha de Medición
// Body: { fecha_med: 'YYYY-MM-DD' }  // puede ser null para limpiar
app.post('/portones/:id/fecha-med', async (req, res) => {
  const { id } = req.params;
  let { fecha_med } = req.body || {};

  try {
    if (fecha_med !== null && fecha_med !== undefined) {
      if (typeof fecha_med !== 'string') {
        return res.status(400).json({ error: 'fecha_med debe ser string con formato YYYY-MM-DD o null' });
      }
      fecha_med = fecha_med.slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha_med)) {
        return res.status(400).json({ error: 'fecha_med inválida. Use formato YYYY-MM-DD' });
      }
    }

    const { rows } = await pool.query(
      `UPDATE public.portones
       SET fecha_med = $2
       WHERE id = $1
       RETURNING *;`,
      [id, fecha_med ?? null]
    );

    if (!rows.length) {
      return res.status(404).json({ error: 'Portón no encontrado' });
    }
    return res.json(rows[0]);
  } catch (err) {
    console.error('set fecha_med error:', err);
    return res.status(500).json({ error: 'Error al actualizar fecha de medición', detail: err.message });
  }
});

// ===================== Observaciones PORTONES =====================

// GET: obtener observaciones de un portón
//  -> GET /portones/:id/observaciones
app.get('/portones/:id/observaciones', async (req, res) => {
  const { id } = req.params;

  try {
    const { rows } = await pool.query(
      `SELECT id, observaciones
       FROM public.portones
       WHERE id = $1;`,
      [id]
    );

    if (!rows.length) {
      return res.status(404).json({ error: 'Portón no encontrado' });
    }

    return res.json(rows[0]); // { id, observaciones }
  } catch (err) {
    console.error('get observaciones porton error:', err);
    return res.status(500).json({ error: 'Error leyendo observaciones de portón', detail: err.message });
  }
});

// Handler común para POST/PUT (setear / actualizar observaciones)
async function upsertPortonObservaciones(req, res) {
  const { id } = req.params;
  let { observaciones } = req.body || {};

  try {
    if (observaciones !== null && observaciones !== undefined && typeof observaciones !== 'string') {
      return res.status(400).json({ error: 'observaciones debe ser string o null' });
    }

    const { rows } = await pool.query(
      `UPDATE public.portones
       SET observaciones = $2
       WHERE id = $1
       RETURNING id, observaciones;`,
      [id, observaciones ?? null]
    );

    if (!rows.length) {
      return res.status(404).json({ error: 'Portón no encontrado' });
    }

    return res.json(rows[0]);
  } catch (err) {
    console.error('set observaciones porton error:', err);
    return res.status(500).json({ error: 'Error al actualizar observaciones de portón', detail: err.message });
  }
}

// POST: crear/actualizar observaciones de un portón
//  -> POST /portones/:id/observaciones { observaciones: '...' }
app.post('/portones/:id/observaciones', upsertPortonObservaciones);

// PUT: idem (idempotente)
//  -> PUT /portones/:id/observaciones { observaciones: '...' }
app.put('/portones/:id/observaciones', upsertPortonObservaciones);

// ===================== Observaciones IPANEL =====================

// GET: obtener observaciones de un ipanel
//  -> GET /ipanel/:id/observaciones
app.get('/ipanel/:id/observaciones', async (req, res) => {
  const { id } = req.params;

  try {
    const { rows } = await pool.query(
      `SELECT id, observaciones
       FROM public.ipanel
       WHERE id = $1;`,
      [id]
    );

    if (!rows.length) {
      return res.status(404).json({ error: 'iPanel no encontrado' });
    }

    return res.json(rows[0]); // { id, observaciones }
  } catch (err) {
    console.error('get observaciones ipanel error:', err);
    return res.status(500).json({ error: 'Error leyendo observaciones de iPanel', detail: err.message });
  }
});

// Handler común para POST/PUT (setear / actualizar observaciones)
async function upsertIpanelObservaciones(req, res) {
  const { id } = req.params;
  let { observaciones } = req.body || {};

  try {
    if (observaciones !== null && observaciones !== undefined && typeof observaciones !== 'string') {
      return res.status(400).json({ error: 'observaciones debe ser string o null' });
    }

    const { rows } = await pool.query(
      `UPDATE public.ipanel
       SET observaciones = $2
       WHERE id = $1
       RETURNING id, observaciones;`,
      [id, observaciones ?? null]
    );

    if (!rows.length) {
      return res.status(404).json({ error: 'iPanel no encontrado' });
    }

    return res.json(rows[0]);
  } catch (err) {
    console.error('set observaciones ipanel error:', err);
    return res.status(500).json({ error: 'Error al actualizar observaciones de iPanel', detail: err.message });
  }
}

// POST: crear/actualizar observaciones de un iPanel
//  -> POST /ipanel/:id/observaciones { observaciones: '...' }
app.post('/ipanel/:id/observaciones', upsertIpanelObservaciones);

// PUT: idem (idempotente)
//  -> PUT /ipanel/:id/observaciones { observaciones: '...' }
app.put('/ipanel/:id/observaciones', upsertIpanelObservaciones);

// POST: asignar/actualizar fecha planificada de LLEGADA del portón
// Body: { fecha_plan_entrega: 'YYYY-MM-DD' }  // puede ser null para limpiar
app.post('/portones/:id/fecha-plan-entrega', async (req, res) => {
  const { id } = req.params;
  let { fecha_plan_entrega } = req.body || {};

  try {
    if (fecha_plan_entrega !== null && fecha_plan_entrega !== undefined) {
      if (typeof fecha_plan_entrega !== 'string') {
        return res.status(400).json({
          error: 'fecha_plan_entrega debe ser string con formato YYYY-MM-DD o null'
        });
      }
      fecha_plan_entrega = fecha_plan_entrega.slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha_plan_entrega)) {
        return res.status(400).json({
          error: 'fecha_plan_entrega inválida. Use formato YYYY-MM-DD'
        });
      }
    }

    const { rows } = await pool.query(
      `UPDATE public.portones
       SET fecha_plan_entrega = $2
       WHERE id = $1
       RETURNING *;`,
      [id, fecha_plan_entrega ?? null]
    );

    if (!rows.length) {
      return res.status(404).json({ error: 'Portón no encontrado' });
    }
    return res.json(rows[0]);
  } catch (err) {
    console.error('set fecha_plan_entrega error:', err);
    return res.status(500).json({
      error: 'Error al actualizar fecha planificada de llegada',
      detail: err.message
    });
  }
});

// --------------------- Cierre prolijo ---------------------
process.on('SIGINT', async () => {
  await pool.end();
  if (sqlServerPool) {
    await sqlServerPool.close();
  }
  process.exit(0);
});
process.on('SIGTERM', async () => {
  await pool.end();
  if (sqlServerPool) {
    await sqlServerPool.close();
  }
  process.exit(0);
});

app.listen(PORT, () => {
  console.log(`Backend escuchando en http://localhost:${PORT}`);
});
