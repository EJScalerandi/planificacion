const path = require('path');

require('dotenv').config({
  path: path.join(__dirname, '..', '.env'),
});

const { app } = require('./app');
const { pool } = require('./db');
const { startInsumosScheduler, runDailyClose } = require('./lib/insumosScheduler');

const PORT = process.env.PORT || 4000;

// Migraciones aditivas — seguras de correr en cada inicio (IF NOT EXISTS).
// Agregar nuevas migraciones al final del array; nunca modificar las existentes.
const MIGRATIONS = [
  {
    name: 'refabricacion_columns',
    sql: `
      ALTER TABLE public.portones
        ADD COLUMN IF NOT EXISTS tipo TEXT NOT NULL DEFAULT 'normal',
        ADD COLUMN IF NOT EXISTS parent_id INTEGER,
        ADD COLUMN IF NOT EXISTS revision_ok BOOLEAN NOT NULL DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS detalle_refabricacion TEXT;
    `,
  },
  {
    name: 'refabricacion_indexes',
    sql: `
      CREATE INDEX IF NOT EXISTS idx_portones_parent_id ON public.portones(parent_id);
      CREATE INDEX IF NOT EXISTS idx_portones_tipo ON public.portones(tipo);
    `,
  },
  {
    name: 'refabricacion_revision_ok_at',
    sql: `
      ALTER TABLE public.portones
        ADD COLUMN IF NOT EXISTS revision_ok_at TIMESTAMPTZ;
    `,
  },
  {
    name: 'fix_nv_nlista_partial_unique',
    sql: `
      ALTER TABLE public.portones DROP CONSTRAINT IF EXISTS portones_nv_nlista_uniq;
      CREATE UNIQUE INDEX IF NOT EXISTS portones_nv_nlista_normal_uniq
        ON public.portones(nv, nlista)
        WHERE tipo = 'normal';
    `,
  },
  {
    // GET /portones (server/routes/public/portones.js) hace un LEFT JOIN
    // LATERAL contra presupuestador_quotes para resolver el nombre del
    // cliente. Sin estos índices, cada uno de los ~430 portones escaneaba
    // casi toda la tabla de quotes: la consulta pasó de ~1.2s a ~35-50ms.
    name: 'idx_presupuestador_quotes_sale_order_name',
    sql: `
      CREATE INDEX IF NOT EXISTS idx_pq_final_sale_order_name_original
        ON public.presupuestador_quotes (final_sale_order_name, id)
        WHERE quote_kind = 'original';
      CREATE INDEX IF NOT EXISTS idx_pq_odoo_sale_order_name_original
        ON public.presupuestador_quotes (odoo_sale_order_name, id)
        WHERE quote_kind = 'original';
    `,
  },
  {
    name: 'fix_parent_id_to_uuid',
    sql: `
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'portones'
            AND column_name = 'parent_id' AND data_type = 'integer'
        ) THEN
          ALTER TABLE public.portones DROP COLUMN parent_id;
          ALTER TABLE public.portones ADD COLUMN parent_id UUID;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'portones'
            AND column_name = 'parent_id'
        ) THEN
          ALTER TABLE public.portones ADD COLUMN parent_id UUID;
        END IF;
      END $$;
    `,
  },
  {
    // Cache de coordenadas resueltas a partir de end_customer.maps_url (Mapa
    // de portones por semana/viaje en Logística de Viajes y Planificación de
    // Fechas). presupuestador_quotes es tabla del Presupuestador, pero Planta
    // ya lee/escribe directo ahí (preproduccion.js, logisticaConsultasDb.js) -
    // mismo patrón. Ver server/lib/geocoding.js y server/lib/logisticaMapa.js.
    name: 'presupuestador_quotes_geo_cols',
    sql: `
      ALTER TABLE public.presupuestador_quotes
        ADD COLUMN IF NOT EXISTS geo_lat DOUBLE PRECISION,
        ADD COLUMN IF NOT EXISTS geo_lng DOUBLE PRECISION,
        ADD COLUMN IF NOT EXISTS geo_source TEXT,
        ADD COLUMN IF NOT EXISTS geo_updated_at TIMESTAMPTZ;
    `,
  },
  {
    // Zonas que una RUTA (no un portón individual) atraviesa - pedido del
    // usuario: un viaje a Bahía Blanca puede "pasar por" Santa Fe o Gral
    // Pico sin tener ninguna parada ahí, detectado por el corredor entre
    // depósito/paradas (ver server/lib/logisticaRutaZonas.js), no por la
    // clasificación de zona de cada portón (esa sigue igual, es otra cosa).
    // habilitada = para una integración futura con el Presupuestador (avisar
    // cupo de entrega disponible en una zona si el viaje llega antes que la
    // producción) - se guarda ya, se usa después.
    name: 'logistica_viaje_zonas',
    sql: `
      CREATE TABLE IF NOT EXISTS public.logistica_viaje_zonas (
        viaje_id INTEGER NOT NULL REFERENCES public.logistica_viajes(id) ON DELETE CASCADE,
        zona_id INTEGER NOT NULL REFERENCES public.logistica_zonas(id) ON DELETE CASCADE,
        habilitada BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (viaje_id, zona_id)
      );
    `,
  },
  {
    // Zona dibujada a mano en el mapa (polígono) en vez de (o además de)
    // localidades de referencia - pedido del usuario ("pintar zonas a
    // gusto"). [[lat,lng], ...] en orden, sin cerrar el anillo (el primer y
    // último punto no se repiten). Si una zona tiene polígono, la
    // clasificación usa "¿el punto cae adentro?" antes que "referencia más
    // cercana" (logisticaZonificacion.js) - compatible con las zonas viejas
    // que solo tienen referencias, esas siguen funcionando igual.
    name: 'logistica_zonas_poligono',
    sql: `
      ALTER TABLE public.logistica_zonas
        ADD COLUMN IF NOT EXISTS poligono JSONB;
    `,
  },
  {
    // Paradas que no son un portón - pedido del usuario, ej. alojamiento de
    // la cuadrilla en un viaje largo. Catálogo reutilizable (logistica_
    // puntos_extra: nombre + maps_url + coords ya resueltas, ej. "Hotel San
    // Vicente") para no volver a pegar la misma URL cada vez - y una tabla
    // de asignación por viaje (logistica_viaje_paradas_extra) con `orden` en
    // el MISMO espacio numérico que logistica_viaje_portones.orden, para
    // poder mezclar portones y paradas extra en una sola secuencia de ruta.
    name: 'logistica_puntos_extra',
    sql: `
      CREATE TABLE IF NOT EXISTS public.logistica_puntos_extra (
        id SERIAL PRIMARY KEY,
        nombre TEXT NOT NULL,
        maps_url TEXT NOT NULL,
        lat DOUBLE PRECISION,
        lng DOUBLE PRECISION,
        activo BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS public.logistica_viaje_paradas_extra (
        id SERIAL PRIMARY KEY,
        viaje_id INTEGER NOT NULL REFERENCES public.logistica_viajes(id) ON DELETE CASCADE,
        punto_extra_id INTEGER NOT NULL REFERENCES public.logistica_puntos_extra(id) ON DELETE CASCADE,
        orden INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (viaje_id, punto_extra_id)
      );
    `,
  },
  {
    // Ruta REAL por calle (no línea recta) - pedido del usuario: "que la
    // ruta respete las rutas reales, donde se mueve el camión". Se calcula
    // con OpenRouteService (perfil driving-hgv, camión de carga - más
    // realista que auto para portones) y se cachea acá: geometría +
    // distancia/duración reales, recalculada solo cuando cambian las
    // paradas/el orden de la ruta (mismo trigger que las zonas del
    // corredor, ver server/lib/logisticaRuteo.js).
    name: 'logistica_viajes_ruta_real',
    sql: `
      ALTER TABLE public.logistica_viajes
        ADD COLUMN IF NOT EXISTS ruta_real JSONB;
    `,
  },
  {
    // Hora de salida del viaje (ademas de la fecha) - pedido del usuario:
    // con esto + los tiempos reales por tramo que ya devuelve OpenRouteService
    // (ruta_real ahora tambien guarda segmentos_horas, uno por tramo entre
    // paradas consecutivas) se calcula el horario estimado de llegada a
    // cada parada.
    name: 'logistica_viajes_hora_salida',
    sql: `
      ALTER TABLE public.logistica_viajes
        ADD COLUMN IF NOT EXISTS hora_salida TIME;
    `,
  },
];

async function runMigrations() {
  const client = await pool.connect();
  try {
    for (const m of MIGRATIONS) {
      console.log(`[migration] running: ${m.name}`);
      await client.query(m.sql);
      console.log(`[migration] ok: ${m.name}`);
    }
  } finally {
    client.release();
  }
}

process.on('SIGINT', async () => {
  await pool.end();
  process.exit(0);
});
process.on('SIGTERM', async () => {
  await pool.end();
  process.exit(0);
});

runMigrations()
  .then(async () => {
    app.listen(PORT, () => {
      console.log(`Backend escuchando en http://localhost:${PORT}`);
    });
    startInsumosScheduler();
    // Catch-up: si el proceso se reinició después del horario de cierre de
    // alguna sección (configurable, ver insumosSeccionCierreDb.js), cierra ya
    // lo que quedó abierto en vez de esperar al próximo tick del cron.
    try {
      await runDailyClose();
    } catch (err) {
      console.error('[insumos] catch-up al arrancar falló:', err.message);
    }
  })
  .catch((err) => {
    console.error('[migration] ERROR — el servidor no arrancó:', err.message);
    process.exit(1);
  });
