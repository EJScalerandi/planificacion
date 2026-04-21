import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import usePortones from '../src/hooks/usePortones';

const STAGES = [
  { key: 'diseno', label: 'Diseño' },
  { key: 'laser', label: 'Laser' },
  { key: 'guillotina', label: 'Corte piernas' },
  { key: 'corte_revest', label: 'Corte revestimiento' },
  { key: 'plegadora', label: 'Plegado piernas' },
  { key: 'plegado_revest', label: 'Plegado revestimiento' },
  { key: 'armado_piernas', label: 'Prefabricados (armado de piernas)' },
  { key: 'armado_marco_piernas', label: 'Armado marco piernas' },
  { key: 'armado_hojas', label: 'Armado de hoja' },
  { key: 'armado_primario', label: 'Armado primario' },
  { key: 'revestimiento', label: 'Revestimiento' },
  { key: 'pintura', label: 'Pintura sistemas' },
  { key: 'pintura_revestimiento', label: 'Pintura revestimiento' },
  { key: 'inyeccion', label: 'Inyección' },
  { key: 'armado_final', label: 'Armado final' },
  { key: 'despacho', label: 'Despacho' },
];

function normalizeStatus(value) {
  const s = String(value ?? '').trim();
  return s || 'Sin registrar';
}

function firstDefined(obj, keys = [], fallback = '-') {
  for (const key of keys) {
    const value = obj?.[key];
    const text = String(value ?? '').trim();
    if (text) return text;
  }
  return fallback;
}

function getCliente(item) {
  return firstDefined(item, [
    'nombreCliente',
    'nombre_cliente',
    'NombreCliente',
    'Nombre_Cliente',
    'cliente',
    'Cliente',
    'cliente_nombre',
    'Cliente_Nombre',
    'Nombre',
    'nombre',
  ]);
}

function getDistribuidor(item) {
  return firstDefined(item, [
    'distribuidor',
    'Distribuidor',
    'razsoc',
    'RazSoc',
    'razon_social',
    'Razon_Social',
    'razonSocial',
  ]);
}

export default function PublicNvStatusPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialNv = String(searchParams.get('nv') ?? '').trim();

  const [inputNv, setInputNv] = useState(initialNv);
  const [searchedNv, setSearchedNv] = useState(initialNv);

  const { data, loading, err, refreshing, refresh } = usePortones({ pollMs: 0 });

  useEffect(() => {
    const nv = String(searchParams.get('nv') ?? '').trim();
    setInputNv(nv);
    setSearchedNv(nv);
  }, [searchParams]);

  const parsedNv = useMemo(() => {
    const n = Number(searchedNv);
    return Number.isInteger(n) ? n : null;
  }, [searchedNv]);

  const target = useMemo(() => {
    if (!Number.isInteger(parsedNv)) return null;
    return (Array.isArray(data) ? data : []).find((item) => Number(item?.nv) === parsedNv) || null;
  }, [data, parsedNv]);

  const rows = useMemo(() => {
    return STAGES.map((stage) => ({
      ...stage,
      status: normalizeStatus(target?.[stage.key]),
    }));
  }, [target]);

  const handleSubmit = (e) => {
    e.preventDefault();
    const nv = String(inputNv || '').trim();
    if (!nv) {
      setSearchParams({});
      return;
    }
    setSearchParams({ nv });
  };

  const hasQuery = String(searchedNv || '').trim() !== '';
  const invalidNv = hasQuery && !Number.isInteger(parsedNv);
  const shareUrl = hasQuery
    ? `${window.location.origin}${window.location.pathname}?nv=${encodeURIComponent(searchedNv)}`
    : '';

  return (
    <div className="container" style={{ maxWidth: 980, paddingTop: 24, paddingBottom: 32 }}>
      <div className="header-row" style={{ marginBottom: 12 }}>
        <h2 className="h1" style={{ borderColor: 'var(--brand)' }}>
          Consulta pública por NV
        </h2>

        <button className="btn btn--brand" type="button" onClick={refresh} disabled={refreshing}>
          {refreshing ? 'Actualizando…' : 'Refrescar'}
        </button>
      </div>

      <div
        style={{
          border: '1px solid var(--border)',
          borderRadius: 14,
          background: 'var(--surface)',
          padding: 16,
          marginBottom: 16,
        }}
      >
        <form
          onSubmit={handleSubmit}
          style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}
        >
          <input
            type="text"
            className="btn"
            inputMode="numeric"
            placeholder="Ingresar NV"
            value={inputNv}
            onChange={(e) => setInputNv(e.target.value)}
            style={{ minWidth: 220 }}
          />
          <button className="btn btn--brand" type="submit">
            Buscar
          </button>
          <button
            className="btn"
            type="button"
            onClick={() => {
              setInputNv('');
              setSearchParams({});
            }}
          >
            Limpiar
          </button>
        </form>

        <div style={{ marginTop: 10, fontSize: 13, opacity: 0.8 }}>
          Link público sugerido: <b>/estado-porton?nv=3995</b>
        </div>

        {shareUrl ? (
          <div style={{ marginTop: 6, fontSize: 13, wordBreak: 'break-all', opacity: 0.8 }}>
            URL actual: <b>{shareUrl}</b>
          </div>
        ) : null}
      </div>

      {loading ? <div>Cargando información…</div> : null}
      {err ? <div style={{ color: 'crimson', fontWeight: 800 }}>Error: {err}</div> : null}

      {!loading && !err && invalidNv ? (
        <div
          style={{
            border: '1px solid #fecaca',
            background: '#fff5f5',
            color: '#991b1b',
            borderRadius: 12,
            padding: 14,
            fontWeight: 700,
          }}
        >
          El NV debe ser numérico.
        </div>
      ) : null}

      {!loading && !err && hasQuery && !invalidNv && !target ? (
        <div
          style={{
            border: '1px solid #e5e7eb',
            background: '#fff',
            borderRadius: 12,
            padding: 14,
          }}
        >
          No se encontró ningún portón con NV <b>{searchedNv}</b>.
        </div>
      ) : null}

      {!loading && !err && target ? (
        <div
          style={{
            border: '1px solid var(--border)',
            borderRadius: 14,
            background: 'var(--surface)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              padding: '14px 16px',
              borderBottom: '1px solid var(--border)',
              background: '#f8fafc',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: 10,
            }}
          >
            <div><b>NV:</b> {target?.nv ?? '-'}</div>
            <div><b>Portón:</b> {target?.nlista ?? '-'}</div>
            <div><b>Partida:</b> {target?.partida ?? '-'}</div>
            <div><b>Cliente:</b> {getCliente(target)}</div>
            <div><b>Distribuidor:</b> {getDistribuidor(target)}</div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 520 }}>
              <thead>
                <tr style={{ background: '#ffffff' }}>
                  <th style={thStyle}>Sector</th>
                  <th style={thStyle}>Estado</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.key}>
                    <td style={tdStyle}>{row.label}</td>
                    <td style={tdStyle}>
                      <b>{row.status}</b>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}

const thStyle = {
  textAlign: 'left',
  padding: '12px 14px',
  borderBottom: '1px solid var(--border)',
  fontSize: 13,
};

const tdStyle = {
  padding: '12px 14px',
  borderBottom: '1px solid var(--border)',
  fontSize: 14,
};
