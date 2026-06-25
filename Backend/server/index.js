const path = require('path');

require('dotenv').config({
  path: path.join(__dirname, '..', '.env'),
});

const { app } = require('./app');
const { pool } = require('./db');

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
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Backend escuchando en http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('[migration] ERROR — el servidor no arrancó:', err.message);
    process.exit(1);
  });
