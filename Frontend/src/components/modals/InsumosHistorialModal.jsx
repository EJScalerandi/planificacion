import { useEffect, useState } from 'react';
import { adminListInsumosItems, fetchInsumosSecciones } from '../../api';

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
function daysAgoStr(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}
function formatQty(n) {
  if (n === null || n === undefined || n === '') return '—';
  const v = Number(n);
  return Number.isInteger(v) ? String(v) : v.toFixed(2);
}

export default function InsumosHistorialModal({ open, onClose }) {
  const [secciones, setSecciones] = useState([]);
  const [seccion, setSeccion] = useState('');
  const [desde, setDesde] = useState(daysAgoStr(7));
  const [hasta, setHasta] = useState(todayStr());

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [exporting, setExporting] = useState(false);
  const [searched, setSearched] = useState(false);

  useEffect(() => {
    if (!open) return;
    fetchInsumosSecciones().then(({ data }) => setSecciones(data || [])).catch(() => {});
  }, [open]);

  async function buscar() {
    setErr('');
    setLoading(true);
    try {
      const { data } = await adminListInsumosItems({ desde, hasta, seccion: seccion || undefined });
      setItems(Array.isArray(data) ? data : []);
      setSearched(true);
    } catch (e) {
      setErr(e?.response?.data?.error || e.message || 'Error buscando el historial');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    buscar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function seccionLabelFor(slug) {
    return secciones.find((s) => s.slug === slug)?.label || slug;
  }

  async function exportarExcel() {
    setExporting(true);
    setErr('');
    try {
      const xlsxMod = await import('xlsx');
      const XLSX = xlsxMod.default || xlsxMod;

      const header = ['Fecha', 'Sección', 'Producto', 'Código', 'Cant. pedida', 'Cant. entregada', 'Unidad', 'Sin stock', 'Nota sin stock', 'Confirmado por'];
      const dataRows = items.map((it) => [
        String(it.fecha || '').slice(0, 10),
        seccionLabelFor(it.seccion),
        it.producto_nombre || '',
        it.producto_codigo || '',
        Number(it.cantidad_pedida || 0),
        it.cantidad_entregada != null ? Number(it.cantidad_entregada) : '',
        it.unidad || '',
        it.no_disponible ? 'Sí' : 'No',
        it.no_disponible_note || '',
        it.confirmed_by_name || '',
      ]);

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet([header, ...dataRows]);
      ws['!cols'] = [
        { wch: 12 }, { wch: 18 }, { wch: 32 }, { wch: 14 },
        { wch: 12 }, { wch: 14 }, { wch: 10 }, { wch: 10 }, { wch: 24 }, { wch: 20 },
      ];
      XLSX.utils.book_append_sheet(wb, ws, 'Historial insumos');

      const pad = (n) => String(n).padStart(2, '0');
      const now = new Date();
      const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;
      const seccionPart = seccion ? `_${seccion}` : '';
      XLSX.writeFile(wb, `insumos_historial_${desde}_a_${hasta}${seccionPart}_${stamp}.xlsx`);
    } catch (e) {
      setErr(e?.message || 'Error exportando el Excel');
    } finally {
      setExporting(false);
    }
  }

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, zIndex: 9999 }}
    >
      <div style={{ width: 'min(1100px, 100%)', maxHeight: '90vh', overflow: 'auto', background: 'var(--surface)', borderRadius: 14, border: '1px solid var(--border)', boxShadow: '0 18px 55px rgba(0,0,0,0.25)' }}>
        <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, background: 'var(--surface)', position: 'sticky', top: 0, zIndex: 1 }}>
          <div style={{ fontWeight: 900 }}>Historial de pedidos de insumos</div>
          <button className="btn" type="button" onClick={onClose}>Cerrar</button>
        </div>

        <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {err && <div style={{ color: 'crimson', fontWeight: 800 }}>{err}</div>}

          <div style={{ display: 'flex', gap: 10, alignItems: 'end', flexWrap: 'wrap', border: '1px solid var(--border)', borderRadius: 12, padding: 12 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontWeight: 800, fontSize: 13 }}>Sección</span>
              <select className="btn" value={seccion} onChange={(e) => setSeccion(e.target.value)}>
                <option value="">Todas</option>
                {secciones.map((s) => <option key={s.slug} value={s.slug}>{s.label}</option>)}
              </select>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontWeight: 800, fontSize: 13 }}>Desde</span>
              <input className="btn" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontWeight: 800, fontSize: 13 }}>Hasta</span>
              <input className="btn" type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
            </label>
            <button className="btn btn--brand" type="button" onClick={buscar} disabled={loading}>
              {loading ? 'Buscando…' : 'Buscar'}
            </button>
            <button className="btn" type="button" onClick={exportarExcel} disabled={exporting || loading || items.length === 0}>
              {exporting ? 'Exportando…' : 'Exportar a Excel'}
            </button>
          </div>

          {loading ? (
            <div style={{ opacity: 0.8 }}>Cargando…</div>
          ) : !searched ? null : items.length === 0 ? (
            <div style={{ opacity: 0.75 }}>No hay pedidos para este filtro.</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', borderBottom: '1px solid var(--border)', padding: 6 }}>Fecha</th>
                    <th style={{ textAlign: 'left', borderBottom: '1px solid var(--border)', padding: 6 }}>Sección</th>
                    <th style={{ textAlign: 'left', borderBottom: '1px solid var(--border)', padding: 6 }}>Producto</th>
                    <th style={{ textAlign: 'right', borderBottom: '1px solid var(--border)', padding: 6 }}>Pedido</th>
                    <th style={{ textAlign: 'right', borderBottom: '1px solid var(--border)', padding: 6 }}>Entregado</th>
                    <th style={{ textAlign: 'left', borderBottom: '1px solid var(--border)', padding: 6 }}>Sin stock</th>
                    <th style={{ textAlign: 'left', borderBottom: '1px solid var(--border)', padding: 6 }}>Confirmó</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it) => (
                    <tr key={it.id}>
                      <td style={{ padding: 6, borderBottom: '1px solid #eee' }}>{String(it.fecha || '').slice(0, 10)}</td>
                      <td style={{ padding: 6, borderBottom: '1px solid #eee' }}>{seccionLabelFor(it.seccion)}</td>
                      <td style={{ padding: 6, borderBottom: '1px solid #eee' }}>
                        {it.producto_nombre}
                        {it.producto_codigo ? <span style={{ opacity: 0.6 }}> ({it.producto_codigo})</span> : null}
                      </td>
                      <td style={{ padding: 6, borderBottom: '1px solid #eee', textAlign: 'right' }}>{formatQty(it.cantidad_pedida)} {it.unidad || ''}</td>
                      <td style={{ padding: 6, borderBottom: '1px solid #eee', textAlign: 'right' }}>{formatQty(it.cantidad_entregada)} {it.cantidad_entregada != null ? (it.unidad || '') : ''}</td>
                      <td style={{ padding: 6, borderBottom: '1px solid #eee', color: it.no_disponible ? '#b91c1c' : undefined, fontWeight: it.no_disponible ? 800 : 400 }}>
                        {it.no_disponible ? 'Sí' : 'No'}
                      </td>
                      <td style={{ padding: 6, borderBottom: '1px solid #eee' }}>{it.confirmed_by_name || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ marginTop: 8, fontSize: 12, opacity: 0.7 }}>{items.length} ítems.</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
