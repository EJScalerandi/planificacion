// src/pages/PreproduccionPage.jsx
import React, { useEffect, useMemo, useState } from 'react';
import {
  getPreproduccion,
  syncPreproduccion,
  sendPreproduccionToProduccion,
  getPreproduccionLastSync,
} from '../src/api';

export default function PreproduccionPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  const [syncLoading, setSyncLoading] = useState(false);
  const [syncError, setSyncError] = useState('');
  const [syncSuccess, setSyncSuccess] = useState('');

  const [lastSyncAt, setLastSyncAt] = useState(null);

  const [searchText, setSearchText] = useState('');
  const [searchNLista, setSearchNLista] = useState('');

  const [selectedIds, setSelectedIds] = useState([]);

  // ==============================
  // Carga de datos
  // ==============================
  async function loadPreproduccion() {
    try {
      setLoading(true);
      const data = await getPreproduccion();
      setRows(data || []);
    } catch (err) {
      console.error('Error cargando preproducción', err);
    } finally {
      setLoading(false);
    }
  }

  async function loadLastSync() {
    try {
      const info = await getPreproduccionLastSync();
      // espero { lastSyncAt: '2025-11-25T15:38:30.000Z' } o null
      setLastSyncAt(info?.lastSyncAt || null);
    } catch (err) {
      console.error('Error leyendo última sync', err);
    }
  }

  useEffect(() => {
    // Solo leer lo que YA hay en Supabase
    loadPreproduccion();
    loadLastSync();
  }, []);

  // ==============================
  // Sincronización manual
  // ==============================
  async function handleSync() {
    try {
      setSyncError('');
      setSyncSuccess('');
      setSyncLoading(true);

      const result = await syncPreproduccion(); // POST /sync/preproduccion
      // result.ok, result.imported, result.lastSyncAt (si lo devolvés del back)

      await loadPreproduccion();
      await loadLastSync();

      setSyncSuccess(
        result?.imported != null
          ? `Sincronización completa. Importados ${result.imported} registros.`
          : 'Sincronización completa.'
      );
    } catch (err) {
      console.error('Error sync preproducción', err);
      setSyncError('Error sincronizando Pre_Produccion');
    } finally {
      setSyncLoading(false);
    }
  }

  // ==============================
  // Enviar seleccionados a producción
  // ==============================
  async function handleSendToProduccion() {
    if (!selectedIds.length) return;

    if (!window.confirm(`¿Enviar ${selectedIds.length} portones a producción?`)) {
      return;
    }

    try {
      setLoading(true);
      await sendPreproduccionToProduccion(selectedIds);
      setSelectedIds([]);
      await loadPreproduccion(); // ya no verás los enviados
    } catch (err) {
      console.error('Error enviando a producción', err);
      alert('Error enviando a producción. Revisar consola.');
    } finally {
      setLoading(false);
    }
  }

  // ==============================
  // Búsqueda / filtros
  // ==============================
  const filteredRows = useMemo(() => {
    const text = searchText.trim().toLowerCase();
    const nlista = searchNLista.trim();

    return rows.filter((r) => {
      // texto libre: NV, PARTIDA, RazSoc, Nombre, Dirección, Sistema
      if (text) {
        const hayTexto =
          String(r.nv ?? '').toLowerCase().includes(text) ||
          String(r.partida ?? '').toLowerCase().includes(text) ||
          String(r.razsoc ?? '').toLowerCase().includes(text) ||
          String(r.nombre ?? '').toLowerCase().includes(text) ||
          String(r.direccion ?? '').toLowerCase().includes(text) ||
          String(r.sistema ?? '').toLowerCase().includes(text);

        if (!hayTexto) return false;
      }

      // filtro N° de lista (si lo estás guardando en la tabla)
      if (nlista) {
        // si no tenés campo nlista en preproduccion, podés borrar esto
        if (String(r.nlista ?? '') !== nlista) return false;
      }

      return true;
    });
  }, [rows, searchText, searchNLista]);

  // ==============================
  // Selección de filas
  // ==============================
  function toggleSelect(id) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  function toggleSelectVisible() {
    const visibleIds = filteredRows.map((r) => r.id);
    const allVisibleSelected = visibleIds.every((id) => selectedIds.includes(id));

    if (allVisibleSelected) {
      // deseleccionar visibles
      setSelectedIds((prev) => prev.filter((id) => !visibleIds.includes(id)));
    } else {
      // agregar visibles a la selección
      setSelectedIds((prev) => Array.from(new Set([...prev, ...visibleIds])));
    }
  }

  function clearSelection() {
    setSelectedIds([]);
  }

  // ==============================
  // Render
  // ==============================
  function formatDate(d) {
    if (!d) return '-';
    const date = new Date(d);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleString('es-AR');
  }

  return (
    <div style={{ padding: '1.5rem' }}>
      <h1 style={{ fontSize: '2rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>
        Preproducción de Portones
      </h1>
      <p style={{ marginBottom: '1rem' }}>
        Sincroniza con SQL Server y envía portones seleccionados a producción.
      </p>

      <div style={{ marginBottom: '1rem' }}>
        <strong>Última sincronización</strong>
        <div>{lastSyncAt ? formatDate(lastSyncAt) : 'Sin datos'}</div>
      </div>

      <div style={{ marginBottom: '1rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <button onClick={handleSync} disabled={syncLoading}>
          {syncLoading ? 'Sincronizando...' : 'Sincronizar ahora'}
        </button>

        {syncError && (
          <span style={{ color: 'red', marginLeft: '0.5rem' }}>{syncError}</span>
        )}
        {syncSuccess && (
          <span style={{ color: 'green', marginLeft: '0.5rem' }}>{syncSuccess}</span>
        )}
      </div>

      <div style={{ marginBottom: '0.75rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <label>
          Buscar:{' '}
          <input
            type="text"
            placeholder="Buscar por NV, partida, cliente, dirección, sistema..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ minWidth: 250 }}
          />
        </label>

        <label>
          N° de lista:{' '}
          <input
            type="text"
            placeholder="N° de lista"
            value={searchNLista}
            onChange={(e) => setSearchNLista(e.target.value)}
            style={{ width: 120 }}
          />
        </label>
      </div>

      <div style={{ marginBottom: '0.75rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <button
          onClick={handleSendToProduccion}
          disabled={!selectedIds.length || loading}
        >
          A producción ({selectedIds.length})
        </button>
        <button onClick={clearSelection} disabled={!selectedIds.length}>
          Limpiar selección
        </button>
        <button onClick={toggleSelectVisible} disabled={!filteredRows.length}>
          Seleccionar visibles
        </button>
      </div>

      <div style={{ marginBottom: '0.5rem' }}>
        {loading ? (
          <span>Cargando...</span>
        ) : (
          <span>
            Mostrando {filteredRows.length} de {rows.length} registros
          </span>
        )}
      </div>

      <div style={{ overflowX: 'auto', maxHeight: '70vh', border: '1px solid #ddd' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
          <thead style={{ position: 'sticky', top: 0, background: '#f7f7f7', zIndex: 1 }}>
            <tr>
              <th style={{ border: '1px solid #ddd', padding: '4px' }}>Sel</th>
              <th style={{ border: '1px solid #ddd', padding: '4px' }}>NV</th>
              <th style={{ border: '1px solid #ddd', padding: '4px' }}>Partida</th>
              <th style={{ border: '1px solid #ddd', padding: '4px' }}>Cliente</th>
              <th style={{ border: '1px solid #ddd', padding: '4px' }}>Nombre</th>
              <th style={{ border: '1px solid #ddd', padding: '4px' }}>Dirección</th>
              <th style={{ border: '1px solid #ddd', padding: '4px' }}>Sistema</th>
              <th style={{ border: '1px solid #ddd', padding: '4px' }}>F. NV</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((r) => (
              <tr key={r.id}>
                <td style={{ border: '1px solid #ddd', padding: '4px', textAlign: 'center' }}>
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(r.id)}
                    onChange={() => toggleSelect(r.id)}
                  />
                </td>
                <td style={{ border: '1px solid #ddd', padding: '4px' }}>{r.nv}</td>
                <td style={{ border: '1px solid #ddd', padding: '4px' }}>{r.partida}</td>
                <td style={{ border: '1px solid #ddd', padding: '4px' }}>{r.razsoc}</td>
                <td style={{ border: '1px solid #ddd', padding: '4px' }}>{r.nombre}</td>
                <td style={{ border: '1px solid #ddd', padding: '4px' }}>{r.direccion}</td>
                <td style={{ border: '1px solid #ddd', padding: '4px' }}>{r.sistema}</td>
                <td style={{ border: '1px solid #ddd', padding: '4px' }}>
                  {r.fecha_nv ? new Date(r.fecha_nv).toLocaleDateString('es-AR') : '-'}
                </td>
              </tr>
            ))}

            {!filteredRows.length && !loading && (
              <tr>
                <td colSpan={8} style={{ textAlign: 'center', padding: '8px' }}>
                  No hay registros para mostrar.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
