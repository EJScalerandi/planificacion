function errorHandler(err, _req, res, _next) {
  console.error('Unhandled error:', err);
  return res.status(500).json({ error: 'Internal error', detail: err?.message || String(err) });
}

module.exports = { errorHandler };
