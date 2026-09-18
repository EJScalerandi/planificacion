// src/components/modals/LogisticaWhatsappTemplatesModal.jsx
//
// Solo lectura: muestra las plantillas de mensaje de WhatsApp Business ya
// cargadas en Meta para esta cuenta - pedido explícito del usuario, para
// verlas desde acá en vez de entrar a WhatsApp Manager. Se gestionan
// (crear/editar/aprobar) siempre en Meta, acá no se puede tocar nada.
import React, { useEffect, useState } from 'react';
import { fetchLogisticaWhatsappTemplates } from '../../api';

const ESTADO_COLOR = {
  APPROVED: { bg: '#dcfce7', color: '#166534', label: 'Aprobada' },
  PENDING: { bg: '#fef9c3', color: '#854d0e', label: 'En revisión' },
  REJECTED: { bg: '#fee2e2', color: '#991b1b', label: 'Rechazada' },
  PAUSED: { bg: '#fee2e2', color: '#991b1b', label: 'Pausada' },
  DISABLED: { bg: '#f3f4f6', color: '#4b5563', label: 'Deshabilitada' },
};

function EstadoBadge({ status }) {
  const cfg = ESTADO_COLOR[status] || { bg: '#f3f4f6', color: '#4b5563', label: status || '—' };
  return (
    <span style={{ fontSize: 11, fontWeight: 800, padding: '2px 8px', borderRadius: 999, background: cfg.bg, color: cfg.color }}>
      {cfg.label}
    </span>
  );
}

function TemplateCard({ t }) {
  const header = t.components.find((c) => c.type === 'HEADER');
  const body = t.components.find((c) => c.type === 'BODY');
  const footer = t.components.find((c) => c.type === 'FOOTER');
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ fontWeight: 900, fontSize: 13 }}>{t.name}</div>
        <EstadoBadge status={t.status} />
        <span style={{ fontSize: 11, opacity: 0.6, marginLeft: 'auto' }}>{t.language} · {t.category}</span>
      </div>
      {header ? (
        <div style={{ fontSize: 11, opacity: 0.7 }}>
          📎 Header: {header.format === 'IMAGE' ? 'Imagen' : header.format === 'TEXT' ? `Texto — "${header.text}"` : header.format}
        </div>
      ) : null}
      {body ? (
        <div style={{ fontSize: 12, background: 'var(--surface-muted, #f9fafb)', borderRadius: 8, padding: 10, whiteSpace: 'pre-wrap' }}>
          {body.text}
        </div>
      ) : null}
      {footer ? <div style={{ fontSize: 11, opacity: 0.6, fontStyle: 'italic' }}>{footer.text}</div> : null}
    </div>
  );
}

export default function LogisticaWhatsappTemplatesModal({ open, onClose }) {
  const [templates, setTemplates] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!open) return;
    setTemplates(null);
    setErr('');
    fetchLogisticaWhatsappTemplates()
      .then((d) => setTemplates(d?.templates || []))
      .catch((e) => setErr(e?.response?.data?.error || e.message));
  }, [open]);

  if (!open) return null;

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
    >
      <div style={{ width: 'min(600px, 100%)', maxHeight: '85vh', overflowY: 'auto', background: 'var(--surface)', borderRadius: 14, border: '1px solid var(--border)', boxShadow: '0 12px 32px rgba(0,0,0,0.18)', padding: 12 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10 }}>
          <div style={{ fontWeight: 900 }}>Plantillas de WhatsApp</div>
          <button className="btn" style={{ marginLeft: 'auto' }} onClick={onClose}>Cerrar</button>
        </div>

        <div style={{ fontSize: 12, color: 'var(--muted, #6b7280)', marginBottom: 10 }}>
          Las que ya están cargadas y aprobadas (o en revisión) en Meta para esta cuenta. Se crean y
          editan siempre desde WhatsApp Manager, acá es solo para consultarlas.
        </div>

        {err ? <div style={{ color: 'crimson', fontWeight: 800, fontSize: 12, marginBottom: 8 }}>{err}</div> : null}

        {templates == null && !err ? (
          <div style={{ opacity: 0.7, fontSize: 13 }}>Cargando…</div>
        ) : templates && templates.length === 0 ? (
          <div style={{ opacity: 0.7, fontSize: 13 }}>No hay plantillas cargadas todavía.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {(templates || []).map((t) => <TemplateCard key={t.id} t={t} />)}
          </div>
        )}
      </div>
    </div>
  );
}
