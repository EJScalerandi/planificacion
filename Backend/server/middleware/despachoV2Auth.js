// middleware/despachoV2Auth.js
//
// Sesión de /despacho_v2 (login de cuadrilla: nombre QC + PIN) - secreto
// PROPIO, distinto del de admin (DESPACHO_V2_JWT_SECRET vs ADMIN_JWT_SECRET)
// a propósito: un token de acá nunca debe poder usarse como token de admin
// ni viceversa, son audiencias completamente distintas (un integrante de
// cuadrilla no es un usuario admin).
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.DESPACHO_V2_JWT_SECRET || 'dev_change_me_despacho_v2_secret';

// 30 días: pensado para que el celular de la cuadrilla quede logueado, no
// para reingresar el PIN en cada uso.
function signDespachoV2Token({ qc_user_id, name }) {
  return jwt.sign({ qc_user_id, name }, JWT_SECRET, { expiresIn: '30d' });
}

function despachoV2Auth(req, res, next) {
  const auth = req.headers.authorization || '';
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m) return res.status(401).json({ error: 'No autorizado' });
  try {
    const decoded = jwt.verify(m[1], JWT_SECRET);
    req.despachoUser = { qc_user_id: decoded.qc_user_id, name: decoded.name };
    return next();
  } catch {
    return res.status(401).json({ error: 'Sesión inválida o vencida - volvé a entrar' });
  }
}

module.exports = { signDespachoV2Token, despachoV2Auth };
