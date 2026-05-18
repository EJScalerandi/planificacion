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

function showAdminAccionesPopup({ nv, nombre, detalle }) {
  if (typeof document === 'undefined') return;

  const prev = document.querySelector('[data-admin-acciones-popup="1"]');
  if (prev) prev.remove();

  const overlay = document.createElement('div');
  overlay.setAttribute('data-admin-acciones-popup', '1');
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.style.position = 'fixed';
  overlay.style.inset = '0';
  overlay.style.background = 'rgba(15,23,42,0.55)';
  overlay.style.display = 'flex';
  overlay.style.alignItems = 'center';
  overlay.style.justifyContent = 'center';
  overlay.style.padding = '16px';
  overlay.style.zIndex = '9999';

  const title = `Acciones administrativas${nv ? ` · NV ${escapeHtml(nv)}` : ''}${nombre ? ` · ${escapeHtml(nombre)}` : ''}`;

  overlay.innerHTML = `
    <div style="width:min(760px,100%);background:#fff;border-radius:14px;border:1px solid #f59e0b;box-shadow:0 18px 55px rgba(0,0,0,0.25);overflow:hidden;">
      <div style="padding:12px 14px;border-bottom:1px solid #fcd34d;display:flex;align-items:center;justify-content:space-between;gap:10px;background:#fffbeb;">
        <div style="font-weight:900;color:#92400e;">${title}</div>
        <button type="button" class="btn" data-admin-acciones-close="1">Cerrar</button>
      </div>
      <div style="padding:14px;">
        <div style="border:1px solid #fcd34d;background:#fffbeb;border-radius:12px;padding:12px;white-space:pre-wrap;line-height:1.45;color:#111827;">
          ${escapeHtml(detalle || 'Sin detalle cargado.')}
        </div>
      </div>
    </div>
  `;

  const close = () => overlay.remove();
  overlay.addEventListener('mousedown', (e) => {
    if (e.target === overlay) close();
  });
  overlay.querySelector('[data-admin-acciones-close="1"]')?.addEventListener('click', close);
  document.body.appendChild(overlay);
}

function readHeaderLabels(table) {
  const row = table?.tHead?.rows?.[0];
  return row ? Array.from(row.cells).map((cell) => normalizeText(cell.textContent)) : [];
}

function headerIndex(labels, candidates) {
  return labels.findIndex((label) => candidates.some((c) => label === c || label.includes(c)));
}

function makeInjectedTd(sourceCell) {
  const td = document.createElement('td');
  td.setAttribute('data-admin-acciones-public-cell', '1');
  td.style.borderBottom = sourceCell?.style?.borderBottom || '1px solid #f0f0f0';
  td.style.padding = sourceCell?.style?.padding || '8px';
  td.style.fontSize = sourceCell?.style?.fontSize || '12px';
  td.style.whiteSpace = sourceCell?.style?.whiteSpace || 'nowrap';
  td.style.verticalAlign = sourceCell?.style?.verticalAlign || 'top';
  td.style.color = sourceCell?.style?.color || '#111827';
  return td;
}

function renderAdminAccionesCell({ cell, record, nv, nombre, authCell }) {
  if (!cell) return;

  const info = record ? getAdminAccionesInfo(record) : { hasActions: false, detalle: '' };
  const canOpenAuth = Boolean(authCell?.querySelector('button'));
  const isInjected = cell.getAttribute('data-admin-acciones-public-cell') === '1';

  if (isInjected) {
    cell.innerHTML = '';
  } else {
    cell.querySelector('[data-admin-acciones-public-inline="1"]')?.remove();
  }

  const wrap = document.createElement('div');
  wrap.setAttribute('data-admin-acciones-public-inline', '1');
  wrap.style.display = 'inline-flex';
  wrap.style.alignItems = 'center';
  wrap.style.gap = '8px';
  wrap.style.flexWrap = 'wrap';
  if (!isInjected) wrap.style.marginLeft = '8px';

  const badge = document.createElement('span');
  badge.className = info.hasActions ? 'pp-badge pp-badge--pending' : 'pp-badge';
  badge.textContent = info.hasActions ? 'Acciones: Sí' : 'Acciones: No';
  badge.title = info.hasActions ? 'Tiene acciones administrativas cargadas' : 'No tiene acciones administrativas cargadas';
  if (!info.hasActions) {
    badge.style.background = '#f3f4f6';
    badge.style.color = '#374151';
  }
  wrap.appendChild(badge);

  if (info.hasActions) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pp-btnCell';
    btn.textContent = 'Ver';
    btn.title = 'Ver detalle de acciones administrativas';
    btn.style.borderColor = '#f59e0b';
    btn.style.background = '#fffbeb';
    btn.style.color = '#92400e';
    btn.style.fontWeight = '900';
    btn.setAttribute('data-admin-acciones-public-open', '1');
    btn.setAttribute('data-admin-acciones-nv', nv || '');
    btn.setAttribute('data-admin-acciones-nombre', nombre || '');
    btn.setAttribute('data-admin-acciones-detalle', info.detalle || '');
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      showAdminAccionesPopup({ nv, nombre, detalle: info.detalle });
    });
    wrap.appendChild(btn);
  } else if (canOpenAuth) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pp-btnCell';
    btn.textContent = 'Completar';
    btn.title = 'Abrir autorización administrativa y cargar acciones';
    btn.style.borderColor = '#f59e0b';
    btn.style.background = '#fffbeb';
    btn.style.color = '#92400e';
    btn.style.fontWeight = '900';
    btn.addEventListener('click', () => authCell?.querySelector('button')?.click());
    wrap.appendChild(btn);
  }

  cell.appendChild(wrap);
}

function applyAdminAccionesEnhancer(state) {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (window.location?.pathname !== '/a') return;

  const tables = Array.from(document.querySelectorAll('table.pp-table'));

  for (const table of tables) {
    const headRows = table.tHead?.rows ? Array.from(table.tHead.rows) : [];
    const bodyRows = table.tBodies?.[0]?.rows ? Array.from(table.tBodies[0].rows) : [];
    if (!headRows.length || !bodyRows.length) continue;

    const mainHead = headRows[0];
    const filterHead = headRows[1] || null;

    let labels = readHeaderLabels(table);
    const nvIdx = headerIndex(labels, ['nv']);
    if (nvIdx < 0) continue;

    let accionesIdx = labels.findIndex((label) => label === 'acciones');
    const authIdxBefore = headerIndex(labels, ['aut. admin', 'aut admin']);
    const distIdx = headerIndex(labels, ['distribuidor']);
    const insertIdx = authIdxBefore >= 0 ? authIdxBefore : distIdx >= 0 ? distIdx + 1 : nvIdx + 1;
    const shouldInjectColumn = accionesIdx < 0;

    if (shouldInjectColumn) {
      const th = document.createElement('th');
      th.className = mainHead.cells[Math.min(insertIdx, mainHead.cells.length - 1)]?.className || 'pp-th';
      th.textContent = 'Acciones';
      th.style.textAlign = 'left';
      th.style.whiteSpace = 'nowrap';
      th.style.color = '#111827';
      th.setAttribute('data-admin-acciones-public-col', '1');
      mainHead.insertBefore(th, mainHead.cells[insertIdx] || null);

      if (filterHead) {
        const fth = document.createElement('th');
        fth.className = filterHead.cells[Math.min(insertIdx, filterHead.cells.length - 1)]?.className || 'pp-th pp-th--filter';
        fth.setAttribute('data-admin-acciones-public-col', '1');
        fth.innerHTML = '<div style="font-size:12px;opacity:.75;padding:8px">Ver detalle</div>';
        filterHead.insertBefore(fth, filterHead.cells[insertIdx] || null);
      }

      labels = readHeaderLabels(table);
      accionesIdx = labels.findIndex((label) => label === 'acciones');
    }

    if (accionesIdx < 0) continue;

    const authIdx = headerIndex(labels, ['aut. admin', 'aut admin']);
    const nombreIdx = headerIndex(labels, ['nombre']);
    const currentNvIdx = headerIndex(labels, ['nv']);

    for (const tr of bodyRows) {
      if (shouldInjectColumn && !tr.cells[accionesIdx]?.matches?.('[data-admin-acciones-public-cell="1"]')) {
        const source = tr.cells[Math.max(0, accionesIdx - 1)] || tr.cells[0] || null;
        tr.insertBefore(makeInjectedTd(source), tr.cells[accionesIdx] || null);
      }

      const nv = parseNv(tr.cells[currentNvIdx]?.textContent);
      const nombre = nombreIdx >= 0 ? toText(tr.cells[nombreIdx]?.textContent) : '';
      const record = nv ? state.byNv.get(String(nv)) || null : null;
      const cell = tr.cells[accionesIdx] || null;
      const authCell = authIdx >= 0 ? tr.cells[authIdx] : null;

      renderAdminAccionesCell({ cell, record, nv, nombre, authCell });
    }
  }
}

function startAdminAccionesPublicEnhancer() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const flag = '__dg_admin_acciones_public_enhancer_v5';
  if (window[flag]) return;

  const state = {
    byNv: new Map(),
    loading: false,
    loaded: false,
    applying: false,
    applyTimer: 0,
    refreshTimer: 0,
  };
  window[flag] = state;

  const scheduleApply = (delay = 80) => {
    if (window.location?.pathname !== '/a') return;
    if (state.applyTimer) window.clearTimeout(state.applyTimer);
    state.applyTimer = window.setTimeout(() => {
      state.applyTimer = 0;
      if (state.applying) return;
      state.applying = true;
      try {
        applyAdminAccionesEnhancer(state);
      } finally {
        state.applying = false;
      }
    }, delay);
  };

  const refreshData = async () => {
    if (state.loading || window.location?.pathname !== '/a') return;
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
      scheduleApply(0);
    } catch {
      // No bloquea la tabla si falla la consulta auxiliar.
    } finally {
      state.loading = false;
    }
  };

  document.addEventListener(
    'click',
    (e) => {
      const btn = e.target?.closest?.('[data-admin-acciones-public-open="1"]');
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();
      showAdminAccionesPopup({
        nv: btn.getAttribute('data-admin-acciones-nv') || '',
        nombre: btn.getAttribute('data-admin-acciones-nombre') || '',
        detalle: btn.getAttribute('data-admin-acciones-detalle') || '',
      });
    },
    true
  );

  const setup = () => {
    // Una sola consulta inicial para armar el mapa NV -> acciones.
    refreshData();

    // Aplica sobre la tabla cuando React la termina de dibujar, sin volver a consultar backend.
    scheduleApply(0);

    const observer = new MutationObserver(() => {
      if (state.applying) return;
      scheduleApply(120);
    });
    observer.observe(document.body, { childList: true, subtree: true });

    // Refresco suave por si se autoriza algo desde otra sesión. No consulta en cada click ni cada render.
    state.refreshTimer = window.setInterval(() => {
      if (window.location?.pathname === '/a') refreshData();
    }, 60000);
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
