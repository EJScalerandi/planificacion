const express = require('express');
const cors = require('cors');
const morgan = require('morgan');

const healthRoutes = require('./routes/health');

const adminAuthRoutes = require('./routes/admin/auth');
const adminUsersRoutes = require('./routes/admin/users');
const adminQcRoutes = require('./routes/admin/qc');
const adminWorkflowRoutes = require('./routes/admin/workflow');

const plantaRoutes = require('./routes/public/planta');
const despacharRoutes = require('./routes/public/despachar');
const preproduccionRoutes = require('./routes/public/preproduccion');
const qcRoutes = require('./routes/public/qc');
const workflowRoutes = require('./routes/public/workflow');
const portonesRoutes = require('./routes/public/portones');
const ipanelRoutes = require('./routes/public/ipanel');

const { errorHandler } = require('./middleware/errorHandler');

const app = express();

// Para que caches/CDN varíen por Origin
app.use((req, res, next) => { res.header('Vary', 'Origin'); next(); });

const defaultOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'https://planificacion-pi.vercel.app',
];

const envOrigins = (process.env.FRONTEND_ORIGINS || '')
  .split(',')
  .map((s) => s.trim().replace(/\/$/, ''))
  .filter(Boolean);

const allowedOrigins = Array.from(new Set([...envOrigins, ...defaultOrigins]));
app.use(cors({
  origin(origin, cb) {
    if (!origin) return cb(null, true);
    const clean = origin.replace(/\/$/, '');
    if (allowedOrigins.includes(clean)) return cb(null, true);
    // En desarrollo permitimos cualquier localhost/127.0.0.1 (Vite, etc.)
    if (process.env.NODE_ENV !== 'production') {
      if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(clean)) {
        return cb(null, true);
      }
    }
    return cb(new Error(`CORS bloqueado para: ${origin}`));
  },
}));
app.options('*', cors());

app.use(express.json());
app.use(morgan('dev'));

// Routes
app.use('/', healthRoutes);

app.use('/admin', adminAuthRoutes);
app.use('/admin', adminUsersRoutes);
app.use('/admin', adminQcRoutes);
app.use('/admin', adminWorkflowRoutes);

// ---------------------------------------------------------------------------
// Backward-compat aliases (legacy frontend)
// ---------------------------------------------------------------------------
// Algunos clientes antiguos consumen /users y /scopes (sin prefijo /admin).
// Montamos el mismo router también en la raíz para evitar 404.
// Nota: siguen protegidas por adminAuth (401 si falta token).
app.use('/', adminUsersRoutes);

app.use('/', plantaRoutes);
app.use('/', despacharRoutes);
app.use('/', preproduccionRoutes);
app.use('/', qcRoutes);
app.use('/', workflowRoutes);
app.use('/', portonesRoutes);
app.use('/', ipanelRoutes);

app.use(errorHandler);

module.exports = { app };