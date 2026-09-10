const express = require('express');
const router = express.Router();

const { adminAuth } = require('../../middleware/adminAuth');
const notasNodoDb = require('../../notasNodoDb');

// GET /admin/notas-nodo/:nodoId
router.get('/notas-nodo/:nodoId', adminAuth, async (req, res) => {
  try {
    const nota = await notasNodoDb.getNota(req.params.nodoId);
    return res.json(nota);
  } catch (err) {
    console.error('admin get notas-nodo error:', err);
    return res.status(500).json({ error: 'Error leyendo la nota', detail: err.message });
  }
});

// PUT /admin/notas-nodo/:nodoId  body: { nota }
router.put('/notas-nodo/:nodoId', adminAuth, async (req, res) => {
  try {
    const nota = await notasNodoDb.setNota(req.params.nodoId, req.body?.nota, req.admin?.username);
    return res.json(nota);
  } catch (err) {
    console.error('admin put notas-nodo error:', err);
    return res.status(500).json({ error: 'Error guardando la nota', detail: err.message });
  }
});

module.exports = router;
