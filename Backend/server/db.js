const { Pool } = require('pg');

// USE_LOCAL_DB (ver dev-local.js): la copia local de Postgres no tiene SSL
// habilitado — Supabase sí lo exige. Sin USE_LOCAL_DB, comportamiento
// idéntico a siempre.
const pool = new Pool({
  connectionString: process.env.SUPABASE_DB_URL,
  ssl: process.env.USE_LOCAL_DB ? false : { rejectUnauthorized: false },
});

module.exports = { pool };
