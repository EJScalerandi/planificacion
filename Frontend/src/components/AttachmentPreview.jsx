// src/components/AttachmentPreview.jsx
//
// Preview de un adjunto (imagen inline, o link de descarga para PDF/video).
// Compartido entre ServicioTecnicoSolicitudDetalleModal y
// ServicioTecnicoSolicitudesPage.
export default function AttachmentPreview({ attachment }) {
  if (!attachment) return null;
  if (attachment.type?.startsWith('image/')) {
    return <img src={attachment.data_url} alt={attachment.name} style={{ maxWidth: '100%', maxHeight: 160, borderRadius: 6, marginTop: 4, display: 'block' }} />;
  }
  return (
    <a href={attachment.data_url} download={attachment.name} style={{ fontSize: 10, display: 'block', marginTop: 4 }}>
      📎 {attachment.name}
    </a>
  );
}
