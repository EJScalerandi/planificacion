const { Pool } = require('pg');

// DB_SSL=false permite apagar SSL para un Postgres local de desarrollo (no lo soporta).
// En produccion (Supabase) no se define esta variable, asi que sigue usando SSL como antes.
const useSsl = process.env.DB_SSL !== 'false';

const pool = new Pool({
  connectionString: process.env.SUPABASE_DB_URL,
  ssl: useSsl ? { rejectUnauthorized: false } : false,
});

module.exports = { pool };
