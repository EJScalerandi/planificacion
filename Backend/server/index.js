const path = require('path');

require('dotenv').config({
  path: path.join(__dirname, '..', '.env'),
});

const { app } = require('./app');
const { pool } = require('./db');

const PORT = process.env.PORT || 4000;

process.on('SIGINT', async () => {
  await pool.end();
  process.exit(0);
});
process.on('SIGTERM', async () => {
  await pool.end();
  process.exit(0);
});

app.listen(PORT, () => {
  console.log(`Backend escuchando en http://localhost:${PORT}`);
});
