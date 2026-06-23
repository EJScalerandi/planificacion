const express = require('express');
const https = require('https');
const http = require('http');

const router = express.Router();

const REMITOS_BASE = 'https://remitos.onrender.com/api';

function fetchRemote(url) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    mod.get(url, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
      res.on('error', reject);
    }).on('error', reject);
  });
}

// GET /remitos-proxy/search-by-nv?nv=X
router.get('/remitos-proxy/search-by-nv', async (req, res) => {
  const nv = req.query.nv;
  if (!nv) return res.status(400).json({ error: 'Falta parámetro nv' });
  try {
    const r = await fetchRemote(`${REMITOS_BASE}/remitos/search-by-nv?nv=${encodeURIComponent(nv)}`);
    res.status(r.status).set('Content-Type', 'application/json').send(r.body);
  } catch (err) {
    console.error('remitos-proxy search error:', err);
    res.status(502).json({ error: 'Error contactando el servidor de Remitos', detail: err.message });
  }
});

// GET /remitos-proxy/:tipo/:sucursal/:numero/pdf
router.get('/remitos-proxy/:tipo/:sucursal/:numero/pdf', async (req, res) => {
  const { tipo, sucursal, numero } = req.params;
  try {
    const r = await fetchRemote(`${REMITOS_BASE}/remitos/${encodeURIComponent(tipo)}/${encodeURIComponent(sucursal)}/${encodeURIComponent(numero)}/pdf`);
    if (r.status !== 200) {
      return res.status(r.status).set('Content-Type', 'application/json').send(r.body);
    }
    res.status(200)
      .set('Content-Type', 'application/pdf')
      .set('Content-Disposition', `inline; filename="remito-${tipo}-${sucursal}-${numero}.pdf"`)
      .send(r.body);
  } catch (err) {
    console.error('remitos-proxy pdf error:', err);
    res.status(502).json({ error: 'Error contactando el servidor de Remitos', detail: err.message });
  }
});

module.exports = router;
