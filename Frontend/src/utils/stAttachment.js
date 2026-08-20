// src/utils/stAttachment.js
//
// Adjuntos de Servicio Técnico (historial de solicitudes): mismo mecanismo
// que ya usa el Presupuestador para los tickets - el archivo se manda como
// base64 (data URL) y se guarda en una columna jsonb, sin storage externo.
// Compartido entre ServicioTecnicoSolicitudDetalleModal (historial de una
// solicitud existente) y ServicioTecnicoSolicitudesPage (adjuntar una foto
// al crear una solicitud nueva) para no duplicar la validación.
export const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024;
export const MAX_VIDEO_ATTACHMENT_BYTES = 5 * 1024 * 1024;
export const VIDEO_ATTACHMENT_TYPES = new Set(['video/mp4', 'video/quicktime', 'video/webm']);
export const ALLOWED_ATTACHMENT_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/gif', ...VIDEO_ATTACHMENT_TYPES]);

export function fileToAttachment(file) {
  return new Promise((resolve, reject) => {
    if (!ALLOWED_ATTACHMENT_TYPES.has(file.type)) { reject(new Error('El adjunto debe ser una imagen, un PDF o un video.')); return; }
    const maxBytes = VIDEO_ATTACHMENT_TYPES.has(file.type) ? MAX_VIDEO_ATTACHMENT_BYTES : MAX_ATTACHMENT_BYTES;
    if (file.size > maxBytes) { reject(new Error(`El archivo excede el tamaño permitido (máximo ${Math.round(maxBytes / (1024 * 1024))}MB).`)); return; }
    const reader = new FileReader();
    reader.onload = () => resolve({ name: file.name, type: file.type, size: file.size, data_url: String(reader.result || ''), uploaded_at: new Date().toISOString() });
    reader.onerror = () => reject(new Error('No se pudo leer el archivo.'));
    reader.readAsDataURL(file);
  });
}
