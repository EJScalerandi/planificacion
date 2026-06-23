const express = require('express');
const axios = require('axios');

const router = express.Router();

const REMITOS_BASE = 'https://remitos-c77t.onrender.com/api';

// GET /remitos-proxy/search-by-nv?nv=X
router.get('/remitos-proxy/search-by-nv', async (req, res) => {
  const { nv } = req.query;
  if (!nv) return res.status(400).json({ error: 'Falta parámetro nv' });
  try {
    const { data, status } = await axios.get(`${REMITOS_BASE}/remitos/search-by-nv`, {
      params: { nv },
      timeout: 30000,
    });
    return res.status(status).json(data);
  } catch (err) {
    const status = err.response?.status || 502;
    const data = err.response?.data || { error: 'Error contactando Remitos', detail: err.message };
    return res.status(status).json(data);
  }
});

// GET /remitos-proxy/:tipo/:sucursal/:numero/pdf
router.get('/remitos-proxy/:tipo/:sucursal/:numero/pdf', async (req, res) => {
  const { tipo, sucursal, numero } = req.params;
  try {
    const response = await axios.get(
      `${REMITOS_BASE}/remitos/${tipo}/${sucursal}/${numero}/pdf`,
      { responseType: 'arraybuffer', timeout: 30000 }
    );
    res.status(200)
      .set('Content-Type', 'application/pdf')
      .set('Content-Disposition', `inline; filename="remito-${tipo}-${sucursal}-${numero}.pdf"`)
      .send(response.data);
  } catch (err) {
    const status = err.response?.status || 502;
    const msg = err.response?.data
      ? Buffer.from(err.response.data).toString()
      : err.message;
    return res.status(status).json({ error: 'Error generando PDF', detail: msg });
  }
});

module.exports = router;
