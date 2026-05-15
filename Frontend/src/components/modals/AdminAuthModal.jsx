import React, { useEffect, useMemo, useState } from 'react';
import BaseModal from './BaseModal';

function normalizeText(v) {
  return String(v ?? '').trim().toLowerCase();
}

function ensureAdminAccionesColumn() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (window.location?.pathname !== '/a') return;

  const tables = Array.from(document.querySelectorAll('table.pp-table'));
  for (const table of tables) {
    const headRows = table.tHead?.rows ? Array.from(table.tHead.rows) : [];
    const bodyRows = table.tBodies?.[0]?.rows ? Array.from(table.tBodies[0].rows) : [];
    if (!headRows.length || !bodyRows.length) continue;

    const mainHead = headRows[0];
    const filterHead = headRows[1] || null;
    const labels = Array.from(mainHead.cells).map((cell) => normalizeText(cell.textContent));
    const authIdx = labels.findIndex((label) => label === 'aut. admin' || label === 'aut admin' || label.includes('aut. admin'));
    if (authIdx < 0) continue;

    let accionesIdx = labels.findIndex((label) => label === 'acciones');
    if (accionesIdx >= 0 && mainHead.cells[accionesIdx]?.getAttribute('data-admin-acciones-col') !== '1') {
      // Si la tabla ya trae una columna Acciones real desde React, no tocamos nada.
      continue;
    }
    if (accionesIdx < 0) {
      const th = document.createElement('th');
      th.className = mainHead.cells[authIdx]?.className || 'pp-th';
      th.textContent = 'Acciones';
      th.style.textAlign = 'left';
      th.style.whiteSpace = 'nowrap';
      th.style.color = '#111827';
      th.setAttribute('data-admin-acciones-col', '1');
      mainHead.insertBefore(th, mainHead.cells[authIdx] || null);
      accionesIdx = authIdx;

      if (filterHead) {
        const fth = document.createElement('th');
        fth.className = filterHead.cells[authIdx]?.className || 'pp-th pp-th--filter';
        fth.setAttribute('data-admin-acciones-col', '1');
        fth.innerHTML = '<div style="font-size:12px;opacity:.75;padding:8px">(desde Autorizar)</div>';
        filterHead.insertBefore(fth, filterHead.cells[authIdx] || null);
      }
    }

    for (const tr of bodyRows) {
      if (tr.querySelector('td[data-admin-acciones-cell="1"]')) continue;

      const currentLabels = Array.from(mainHead.cells).map((cell) => normalizeText(cell.textContent));
      const currentAuthIdx = currentLabels.findIndex((label) => label === 'aut. admin' || label === 'aut admin' || label.includes('aut. admin'));
      const insertIdx = currentAuthIdx >= 0 ? currentAuthIdx : tr.cells.length;
      const authCell = currentAuthIdx >= 0 ? tr.cells[currentAuthIdx] : null;
      const authText = normalizeText(authCell?.textContent);
      const canOpen = Boolean(authCell?.querySelector('button'));

      const td = document.createElement('td');
      td.setAttribute('data-admin-acciones-cell', '1');
      td.style.borderBottom = '1px solid #f0f0f0';
      td.style.padding = '8px';
      td.style.fontSize = '12px';
      td.style.whiteSpace = 'nowrap';
      td.style.verticalAlign = 'top';
      td.style.color = '#111827';

      if (canOpen) {
        const wrap = document.createElement('div');
        wrap.style.display = 'flex';
        wrap.style.alignItems = 'center';
        wrap.style.gap = '8px';

        const badge = document.createElement('span');
        badge.className = 'pp-badge pp-badge--pending';
        badge.textContent = 'No';
        badge.title = 'Por defecto queda en No. Se cambia desde Autorizar.';

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'pp-btnCell';
        btn.textContent = 'Completar';
        btn.title = 'Abrir autorización administrativa y cargar Acciones';
        btn.style.borderColor = '#f59e0b';
        btn.style.background = '#fffbeb';
        btn.style.color = '#92400e';
        btn.style.fontWeight = '900';
        btn.addEventListener('click', () => {
          const originalButton = authCell?.querySelector('button');
          if (originalButton) originalButton.click();
        });

        wrap.appendChild(badge);
        wrap.appendChild(btn);
        td.appendChild(wrap);
      } else {
        const span = document.createElement('span');
        span.className = 'pp-badge pp-badge--ok';
        span.textContent = authText.includes('autorizado') ? 'Guardado' : '—';
        span.title = 'La acción administrativa se carga antes de autorizar.';
        td.appendChild(span);
      }

      tr.insertBefore(td, tr.cells[insertIdx] || null);
    }
  }
}

function useVisibleAdminAccionesColumn() {
  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return undefined;
    if (window.location?.pathname !== '/a') return undefined;

    let raf = 0;
    const run = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => ensureAdminAccionesColumn());
    };

    run();
    const interval = window.setInterval(run, 800);
    const observer = new MutationObserver(run);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.clearInterval(interval);
      observer.disconnect();
    };
  }, []);
}

export default function AdminAuthModal({ open, row, onClose, onSubmit, busy }) {
  useVisibleAdminAccionesColumn();

  const data = row?.data || {};

  // Keys persistidas para la respuesta del form
  const KEYS = useMemo(
    () => ({
      enRegla: 'admin_cliente_en_regla', // boolean
      acciones: 'admin_acciones', // boolean
      accionesDetalle: 'admin_acciones_detalle', // string | null
    }),
    []
  );

  const [enRegla, setEnRegla] = useState(false);
  const [acciones, setAcciones] = useState(false);
  const [accionesDetalle, setAccionesDetalle] = useState('');
  const [touched, setTouched] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    if (!open) return;

    // Prefill: si ya estaba guardado, lo traemos.
    // Acciones queda por defecto en No cuando no existe dato previo.
    setEnRegla(Boolean(data[KEYS.enRegla]));
    setAcciones(Boolean(data[KEYS.acciones]));
    setAccionesDetalle(String(data[KEYS.accionesDetalle] ?? ''));
    setTouched(false);
    setFormError('');
  }, [open, data, KEYS]);

  const detalleAcciones = acciones ? String(accionesDetalle || '').trim() : '';
  const canAuthorize = Boolean(enRegla) && (!acciones || Boolean(detalleAcciones));

  const submit = async () => {
    setFormError('');
    setTouched(true);

    if (!enRegla) {
      setFormError('Para autorizar, el cliente debe estar en regla (responder “Sí”).');
      return;
    }

    if (acciones && !detalleAcciones) {
      setFormError('Si marcás Acciones en “Sí”, cargá el detalle.');
      return;
    }

    const patch = {
      [KEYS.enRegla]: true,
      [KEYS.acciones]: Boolean(acciones),
      [KEYS.accionesDetalle]: acciones ? detalleAcciones : null,

      // bandera final
      auth_admin: true,

      // auditoría opcional
      auth_admin_at: new Date().toISOString(),
    };

    await onSubmit?.(patch);
  };

  return (
    <BaseModal
      open={open}
      onClose={busy ? undefined : onClose}
      title="Autorización Administración"
      subtitle={row?.id ? `ID: ${row.id}` : ''}
    >
      <form
        className="pp-form"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="pp-field">
          <div className="pp-label">
            ¿El cliente tiene todo en regla para poder comenzar el despacho del producto? <span className="pp-req">*</span>
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button
              type="button"
              className={`pp-btnCell ${enRegla ? 'pp-btnCell--brand' : ''}`}
              onClick={() => {
                setEnRegla(true);
                setTouched(true);
                setFormError('');
              }}
              disabled={busy}
              title="Sí, está en regla"
            >
              Sí
            </button>

            <button
              type="button"
              className={`pp-btnCell ${!enRegla ? 'pp-btnCell--danger' : ''}`}
              onClick={() => {
                setEnRegla(false);
                setTouched(true);
              }}
              disabled={busy}
              title="No está en regla"
            >
              No
            </button>
          </div>

          <div className="pp-help">
            Solo se puede autorizar si la respuesta es <b>Sí</b>.
          </div>

          {touched && !enRegla ? (
            <div className="pp-errorText">Debe estar marcado “Sí” para autorizar.</div>
          ) : null}
        </div>

        <div className="pp-field">
          <div className="pp-label">Acciones</div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button
              type="button"
              className={`pp-btnCell ${acciones ? 'pp-btnCell--brand' : ''}`}
              onClick={() => {
                setAcciones(true);
                setTouched(true);
                setFormError('');
              }}
              disabled={busy}
              title="Sí, requiere acciones"
            >
              Sí
            </button>

            <button
              type="button"
              className={`pp-btnCell ${!acciones ? 'pp-btnCell--danger' : ''}`}
              onClick={() => {
                setAcciones(false);
                setAccionesDetalle('');
                setTouched(true);
                setFormError('');
              }}
              disabled={busy}
              title="No requiere acciones"
            >
              No
            </button>
          </div>

          <div className="pp-help">
            Por defecto queda en <b>No</b>. Si se marca <b>Sí</b>, se habilita el detalle.
          </div>

          {acciones ? (
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
              <span className="pp-label" style={{ margin: 0 }}>
                Detalle / observación de acciones <span className="pp-req">*</span>
              </span>
              <textarea
                className="pp-input"
                value={accionesDetalle}
                onChange={(e) => setAccionesDetalle(e.target.value)}
                disabled={busy}
                rows={4}
                placeholder="Escribí el detalle de las acciones administrativas..."
                style={{ width: '100%', resize: 'vertical', minHeight: 84 }}
              />
            </label>
          ) : null}

          {touched && acciones && !detalleAcciones ? (
            <div className="pp-errorText">Cargá el detalle para guardar Acciones en “Sí”.</div>
          ) : null}
        </div>

        {formError ? <div className="pp-errorText">{formError}</div> : null}

        <div className="pp-modal__footer">
          <button type="button" className="btn pp-btnCell" onClick={onClose} disabled={busy}>
            Cancelar
          </button>
          <button type="submit" className="btn btn--brand pp-btnCell" disabled={busy || !canAuthorize}>
            {busy ? 'Guardando…' : 'Autorizar'}
          </button>
        </div>
      </form>
    </BaseModal>
  );
}
