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
    // Catch-up: si el proceso se reinició después de las 20:00 AR de un día hábil,
    // cierra ya lo que quedó abierto en vez de esperar al cron del día siguiente.
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
