// lib/logisticaAdjuntosStorage.js
//
// Adjuntos de Logística (DNI, certificado de reincidencia que piden algunos
// countrys, etc.) - pedido explícito del usuario. Van a un bucket PRIVADO de
// Supabase Storage (mismo proyecto que ya usa la base) - nunca públicos, se
// sirven siempre por URL firmada de corta duración a través de un endpoint
// que ya exige el mismo login/scopes de Preproducción que el resto de esta
// app (no un link fijo que quede dando vueltas por ahí con datos personales).
//
// No se guardan en la base (BYTEA) a propósito: fotos de DNI/PDFs pueden
// pesar varios MB cada uno y esa base es compartida con el Presupuestador -
// mejor un storage pensado para archivos.
const { createClient } = require('@supabase/supabase-js');

const BUCKET = 'logistica-adjuntos';

let client = null;
function getClient() {
  if (client) return client;
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return null;
  client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return client;
}

function requireClient() {
  const supabase = getClient();
  if (!supabase) throw new Error('Supabase Storage no está configurado en este entorno (falta SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)');
  return supabase;
}

async function subirArchivo(path, buffer, contentType) {
  const supabase = requireClient();
  const { error } = await supabase.storage.from(BUCKET).upload(path, buffer, { contentType, upsert: false });
  if (error) throw error;
}

// segundos: corta duración a propósito (se regenera en cada listado/consulta,
// no hace falta que dure - son datos personales).
async function urlFirmada(path, segundos = 300) {
  const supabase = requireClient();
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, segundos);
  if (error) throw error;
  return data.signedUrl;
}

async function borrarArchivo(path) {
  const supabase = getClient();
  if (!supabase || !path) return; // si Storage no está configurado no rompe el borrado del registro de la base
  await supabase.storage.from(BUCKET).remove([path]);
}

module.exports = { subirArchivo, urlFirmada, borrarArchivo, BUCKET };
