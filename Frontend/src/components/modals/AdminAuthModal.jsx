import React, { useEffect, useMemo, useState } from 'react';
import BaseModal from './BaseModal';
import { fetchPreproduccionValores } from '../../api';

function normalizeText(v) {
  return String(v ?? '').trim().toLowerCase();
}

function toText(v) {
  return String(v ?? '').trim();
}

function isTruthySi(v) {
  if (v === true) return true;
  const s = normalizeText(v);
  return ['si', 'sí', 'true', '1', 'yes'].includes(s);
}

function getAny(obj, keys = []) {
  if (!obj || typeof obj !== 'object') return null;

  for (const k of keys) {
    if (Object.prototype.hasOwnProperty.call(obj, k) && obj[k] != null) return obj[k];
  }

  const map = {};
  for (const k of Object.keys(obj)) map[String(k).toLowerCase()] = k;

  for (const k of keys) {
    const realKey = map[String(k).toLowerCase()];
    if (realKey && obj[realKey] != null) return obj[realKey];
  }

  return null;
}

function parseNv(v) {
  const s = String(v ?? '').trim();
  if (!s) return '';
  const m = s.match(/\d+/);
  return m ? m[0] : s;
}

function getNvFromRecord(record) {
  const d = record?.data || {};
  return parseNv(record?.nv ?? record?.NV ?? d?.NV ?? d?.nv ?? getAny(d, ['NV', 'nv']));
}

function getAdminAccionesInfo(record) {
  const d = record?.data || {};
  const accionesRaw = getAny(d, ['admin_acciones', 'Admin_Acciones', 'acciones_admin']);
  const detalleRaw = getAny(d, [
    'admin_acciones_detalle',
    'admin_acciones_observacion',
    'admin_acciones_observacion_imput',
    'acciones_detalle',
    'acciones_observacion',
  ]);
  const detalle = toText(detalleRaw);
  const hasActions = isTruthySi(accionesRaw) || Boolean(detalle);

  return {
    hasActions,
    detalle,
  };
}

function escapeHtml(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function readHeaderLabels(table) {
  const row = table?.tHead?.rows?.[0];
  return row ? Array.from(row.cells).map((cell) => normalizeText(cell.textContent)) : [];
}

function headerIndex(labels, candidates) {
  return labels.findIndex((label) => candidates.some((c) => label === c || label.includes(c)));
}

function fixedHeaderCell(th) {
  if (!th) return;
  th.style.width = '210px';
  th.style.minWidth = '210px';
  th.style.maxWidth = '210px';
}

function makeInjectedTh(sourceTh, text, filter = false) {
  const th = document.createElement('th');
  th.className = sourceTh?.className || (filter ? 'pp-th pp-th--filter' : 'pp-th');
  th.setAttribute('data-admin-acciones-public-col', '1');
  th.style.textAlign = 'left';
  th.style.whiteSpace = 'nowrap';
  th.style.color = '#111827';
  fixedHeaderCell(th);
  if (filter) {
    th.innerHTML = '<div style="font-size:12px;opacity:.65;padding:8px">Detalle</div>';
  } else {
    th.textContent = text;
  }
  return th;
}

function makeInjectedTd(sourceCell) {
  const td = document.createElement('td');
  td.setAttribute('data-admin-acciones-public-cell', '1');
  td.style.borderBottom = sourceCell?.style?.borderBottom || '1px solid #f0f0f0';
  td.style.padding = sourceCell?.style?.padding || '8px';
  td.style.fontSize = sourceCell?.style?.fontSize || '12px';
  td.style.whiteSpace = 'normal';
  td.style.verticalAlign = sourceCell?.style?.verticalAlign || 'top';
  td.style.color = sourceCell?.style?.color || '#111827';
  td.style.width = '210px';
  td.style.minWidth = '210px';
  td.style.maxWidth = '210px';
  return td;
}

function shortText(text) {
  const s = toText(text);
  if (s.length <= 42) return s;
  return `${s.slice(0, 42)}…`;
}

function renderAdminAccionesCell({ cell, record }) {
  if (!cell || cell.getAttribute('data-admin-acciones-public-cell') !== '1') return;

  const info = record ? getAdminAccionesInfo(record) : { hasActions: false, detalle: '' };
  const expanded = cell.getAttribute('data-admin-acciones-expanded') === '1';
  const detalle = info.detalle || '';
  const signature = JSON.stringify({ has: info.hasActions, detalle, expanded });
  if (cell.getAttribute('data-admin-acciones-signature') === signature) return;
  cell.setAttribute('data-admin-acciones-signature', signature);

  if (!info.hasActions) {
    cell.innerHTML = '<span class="pp-badge" style="background:#f3f4f6;color:#374151;">No</span>';
    return;
  }

  const shown = expanded ? detalle : shortText(detalle || 'Sin detalle cargado.');
  const help = expanded ? 'Click para contraer' : 'Click para expandir';

  cell.innerHTML = `
    <div style="width:210px;max-width:210px;display:flex;flex-direction:column;gap:4px;">
      <span class="pp-badge pp-badge--pending" style="width:max-content;">Sí</span>
      <button
        type="button"
        data-admin-acciones-toggle="1"
        title="${escapeHtml(help)}"
        style="
          width:100%;
          text-align:left;
          border:1px solid #f59e0b;
          background:#fffbeb;
          color:#92400e;
          border-radius:8px;
          padding:4px 7px;
          font-size:11px;
          font-weight:700;
          cursor:pointer;
          white-space:${expanded ? 'pre-wrap' : 'nowrap'};
          overflow:hidden;
          text-overflow:ellipsis;
          line-height:1.25;
        "
      >${escapeHtml(shown)}</button>
    </div>
  `;
}

function ensureAccionesColumn(table) {
  const headRows = table.tHead?.rows ? Array.from(table.tHead.rows) : [];
  if (!headRows.length) return null;

  const mainHead = headRows[0];
  const filterHead = headRows[1] || null;

  let labels = readHeaderLabels(table);
  const nvIdx = headerIndex(labels, ['nv']);
  if (nvIdx < 0) return null;

  let accionesIdx = labels.findIndex((label) => label === 'acciones admin');
  const oldAccionesIdx = labels.findIndex((label) => label === 'acciones');
  const authIdx = headerIndex(labels, ['aut. admin', 'aut admin']);
  const nombreIdx = headerIndex(labels, ['nombre']);
  const insertIdx = nombreIdx >= 0 ? nombreIdx : authIdx >= 0 ? authIdx : nvIdx + 1;

  if (accionesIdx < 0 && oldAccionesIdx >= 0) {
    accionesIdx = oldAccionesIdx;
    mainHead.cells[accionesIdx].textContent = 'Acciones admin';
    mainHead.cells[accionesIdx].setAttribute('data-admin-acciones-public-col', '1');
    fixedHeaderCell(mainHead.cells[accionesIdx]);
    if (filterHead?.cells?.[accionesIdx]) fixedHeaderCell(filterHead.cells[accionesIdx]);
  }

  if (accionesIdx < 0) {
    const sourceMain = mainHead.cells[Math.min(insertIdx, Math.max(0, mainHead.cells.length - 1))] || null;
    mainHead.insertBefore(makeInjectedTh(sourceMain, 'Acciones admin'), mainHead.cells[insertIdx] || null);

    if (filterHead) {
      const sourceFilter = filterHead.cells[Math.min(insertIdx, Math.max(0, filterHead.cells.length - 1))] || null;
      filterHead.insertBefore(makeInjectedTh(sourceFilter, 'Detalle', true), filterHead.cells[insertIdx] || null);
    }

    labels = readHeaderLabels(table);
    accionesIdx = labels.findIndex((label) => label === 'acciones admin');
  }

  if (accionesIdx < 0) return null;
  fixedHeaderCell(mainHead.cells[accionesIdx]);
  if (filterHead?.cells?.[accionesIdx]) fixedHeaderCell(filterHead.cells[accionesIdx]);

  return { accionesIdx };
}

function ensureBodyCell(tr, accionesIdx) {
  const current = tr.cells[accionesIdx] || null;
  if (current?.getAttribute?.('data-admin-acciones-public-cell') === '1') return current;

  // Si el índice ya tiene una celda real (por ejemplo Nombre), insertamos ANTES.
  // Esto evita que el nombre caiga dentro de Acciones admin.
  const source = tr.cells[Math.max(0, accionesIdx - 1)] || tr.cells[0] || null;
  const td = makeInjectedTd(source);
  tr.insertBefore(td, current || null);
  return td;
}

function applyAdminAccionesEnhancer(state) {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (window.location?.pathname !== '/a') return;

  const tables = Array.from(document.querySelectorAll('table.pp-table'));

  for (const table of tables) {
    const bodyRows = table.tBodies?.[0]?.rows ? Array.from(table.tBodies[0].rows) : [];
    if (!bodyRows.length) continue;

    const col = ensureAccionesColumn(table);
    if (!col) continue;

    const labels = readHeaderLabels(table);
    const nvIdx = headerIndex(labels, ['nv']);
    if (nvIdx < 0) continue;

    for (const tr of bodyRows) {
      const cell = ensureBodyCell(tr, col.accionesIdx);
      const nv = parseNv(tr.cells[nvIdx]?.textContent);
      const record = nv ? state.byNv.get(String(nv)) || null : null;
      renderAdminAccionesCell({ cell, record });
    }
  }
}

function startAdminAccionesPublicEnhancer() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const flag = '__dg_admin_acciones_public_enhancer_v8';
  if (window[flag]) return;

  const state = {
    byNv: new Map(),
    loading: false,
    loaded: false,
  };
  window[flag] = state;

  let raf = 0;
  const scheduleApply = () => {
    if (window.location?.pathname !== '/a') return;
    if (raf) cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => applyAdminAccionesEnhancer(state));
  };

  const refreshDataOnce = async () => {
    if (state.loading || state.loaded || window.location?.pathname !== '/a') return;
    state.loading = true;
    try {
      const res = await fetchPreproduccionValores();
      const list = Array.isArray(res?.data) ? res.data : res?.data ? [res.data] : [];
      const byNv = new Map();
      for (const record of list) {
        const nv = getNvFromRecord(record);
        if (nv) byNv.set(String(nv), record);
      }
      state.byNv = byNv;
      state.loaded = true;
    } catch {
      state.byNv = new Map();
      state.loaded = true;
    } finally {
      state.loading = false;
      scheduleApply();
    }
  };

  document.addEventListener(
    'click',
    (e) => {
      const btn = e.target?.closest?.('[data-admin-acciones-toggle="1"]');
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();
      const cell = btn.closest('[data-admin-acciones-public-cell="1"]');
      if (!cell) return;
      const expanded = cell.getAttribute('data-admin-acciones-expanded') === '1';
      cell.setAttribute('data-admin-acciones-expanded', expanded ? '0' : '1');
      cell.removeAttribute('data-admin-acciones-signature');
      scheduleApply();
    },
    true
  );

  const setup = () => {
    refreshDataOnce();
    scheduleApply();
    const observer = new MutationObserver(() => scheduleApply());
    observer.observe(document.body, { childList: true, subtree: true });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setup, { once: true });
  } else {
    setup();
  }
}

startAdminAccionesPublicEnhancer();

export default function AdminAuthModal({ open, row, onClose, onSubmit, busy }) {
  const data = row?.data || {};

  const KEYS = useMemo(
    () => ({
      enRegla: 'admin_cliente_en_regla',
      acciones: 'admin_acciones',
      accionesDetalle: 'admin_acciones_detalle',
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
      auth_admin: true,
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
