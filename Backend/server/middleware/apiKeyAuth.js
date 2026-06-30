const IA_API_KEY = process.env.IA_API_KEY;

function apiKeyAuth(req, res, next) {
  if (!IA_API_KEY) {
    return res.status(503).json({ error: 'API key no configurada en el servidor' });
  }
  const fromHeader = (req.headers['x-api-key'] || '').trim();
  const fromBearer = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  const provided = fromHeader || fromBearer;

  if (!provided || provided !== IA_API_KEY) {
    return res.status(401).json({ error: 'API key inválida o no proporcionada' });
  }
  return next();
}

module.exports = { apiKeyAuth };
