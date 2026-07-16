const axios = require('axios');

// Cliente Odoo propio de este backend (planificacion), independiente del presupuestador.
// Mismo protocolo (JSON-RPC) y mismas credenciales de Odoo, pero conexion propia:
// si esto falla, no afecta al presupuestador ni viceversa.
function createOdooClient({ url, db, username, password }) {
  const baseUrl = String(url || '').replace(/\/$/, '');
  const rootUrl = baseUrl.replace(/\/odoo$/, '');
  const jsonrpcUrl = `${rootUrl}/jsonrpc`;

  let uidCache = null;
  let uidCacheAt = 0;
  const UID_TTL_MS = 10 * 60 * 1000;

  async function jsonrpcCall(params) {
    const payload = { jsonrpc: '2.0', method: 'call', params, id: Date.now() };
    const { data } = await axios.post(jsonrpcUrl, payload, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 30000,
    });
    if (data && data.error) {
      const msg = (data.error.data && data.error.data.message) || data.error.message || 'Odoo JSON-RPC error';
      const err = new Error(msg);
      err.odoo = data.error;
      throw err;
    }
    return data.result;
  }

  async function getUid() {
    const now = Date.now();
    if (uidCache && now - uidCacheAt < UID_TTL_MS) return uidCache;
    const uid = await jsonrpcCall({
      service: 'common',
      method: 'authenticate',
      args: [db, username, password, {}],
    });
    if (!uid) throw new Error('No se pudo autenticar en Odoo (uid vacio).');
    uidCache = uid;
    uidCacheAt = now;
    return uid;
  }

  async function executeKw(model, method, args = [], kwargs = {}) {
    const uid = await getUid();
    return jsonrpcCall({
      service: 'object',
      method: 'execute_kw',
      args: [db, uid, password, model, method, Array.isArray(args) ? args : [], kwargs || {}],
    });
  }

  return { executeKw };
}

let sharedClient = null;
function getOdooClient() {
  if (sharedClient) return sharedClient;
  const { ODOO_URL, ODOO_DB, ODOO_USERNAME, ODOO_PASSWORD } = process.env;
  if (!ODOO_URL || !ODOO_DB || !ODOO_USERNAME || !ODOO_PASSWORD) return null;
  sharedClient = createOdooClient({ url: ODOO_URL, db: ODOO_DB, username: ODOO_USERNAME, password: ODOO_PASSWORD });
  return sharedClient;
}

module.exports = { createOdooClient, getOdooClient };
