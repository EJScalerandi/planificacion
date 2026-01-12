const express = require('express');
const { getWorkflowConfig } = require('../../lib/workflow');

const router = express.Router();

// GET /workflow/config (read-only)
router.get('/workflow/config', async (req, res) => {
  try {
    const line = String(req.query.line || '').trim();
    if (!['portones', 'ipanel'].includes(line)) return res.status(400).json({ error: 'line debe ser portones o ipanel' });

    const cfg = await getWorkflowConfig(line);
    res.setHeader('Cache-Control', 'no-store');
    return res.json({ ok: true, ...cfg });
  } catch (err) {
    console.error('public workflow config error:', err);
    return res.status(500).json({ error: 'Error leyendo workflow', detail: err.message });
  }
});

module.exports = router;
