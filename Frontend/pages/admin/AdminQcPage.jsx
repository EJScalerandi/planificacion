// pages/admin/AdminQcPage.jsx
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api, { clearAdminToken, getAdminToken } from '../../src/api';

const LINES = [
  { key: 'portones', label: 'Portones' },
  { key: 'ipanel', label: 'iPanel' },
];

const KINDS = [
  { key: 'OBSERVADO', label: 'OBSERVADO' },
  { key: 'RECHAZADO', label: 'RECHAZADO' },
];

// Stages conocidas (por lo que tenés hoy en back)
const STAGES_BY_LINE = {
  portones: [
    'diseno',
    'laser',
    'guillotina',
    'corte_revest',
    'plegadora',
    'plegado_revest',
    'armado_piernas',
    'armado_marco_piernas',
    'armado_hojas',
    'armado_primario',
    'revestimiento',
    'pintura',
    'inyeccion',
    'armado_final',
    'despacho',
  ],
  ipanel: [
    'diseno',
    'guillotina',
    'plegado',
    'pintura',
    'inyeccion',
    'despacho',
  ],
};

function toBool(v) { return v === true; }

function Modal({ open, title, onClose, children, footer }) {
  if (!open) return null;
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,.45)',
        display: 'grid',
        placeItems: 'center',
        zIndex: 9999,
        padding: 16
      }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          width: 'min(980px, 100%)',
          background: 'var(--surface)',
          borderRadius: 12,
          border: '1px solid var(--border)',
          boxShadow: '0 18px 55px rgba(0,0,0,0.25)',
          overflow: 'hidden'
        }}
      >
        <div style={{ padding: 12, borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', gap: 10 }}>
          <div style={{ fontWeight: 900 }}>{title}</div>
          <button className="btn" type="button" onClick={onClose}>Cerrar</button>
        </div>
        <div style={{ padding: 12 }}>
          {children}
        </div>
        {footer && (
          <div style={{ padding: 12, borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

function ScopeEditor({ value, onChange, disabled }) {
  const scopes = Array.isArray(value) ? value : [];

  // Representación: Map line -> Set(stage_key)
  const map = useMemo(() => {
    const m = new Map();
    for (const ln of Object.keys(STAGES_BY_LINE)) m.set(ln, new Set());
    for (const s of scopes) {
      const line = String(s?.line || '').trim();
      const stage_key = String(s?.stage_key || '').trim();
      const enabled = s?.enabled !== false;
      if (!line || !stage_key || !enabled) continue;
      if (!m.has(line)) m.set(line, new Set());
      m.get(line).add(stage_key);
    }
    return m;
  }, [JSON.stringify(scopes)]);

  const setChecked = (line, stage_key, checked) => {
    const nextMap = new Map(map);
    const set = new Set(nextMap.get(line) || []);
    if (checked) set.add(stage_key);
    else set.delete(stage_key);
    nextMap.set(line, set);

    // Convertir map a array scopes (enabled=true)
    const next = [];
    for (const [ln, stSet] of nextMap.entries()) {
      for (const sk of Array.from(stSet)) {
        next.push({ line: ln, stage_key: sk, enabled: true });
      }
    }
    onChange(next);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, opacity: disabled ? 0.6 : 1 }}>
      {LINES.map(ln => (
        <div key={ln.key} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 12 }}>
          <div style={{ fontWeight: 900, marginBottom: 8 }}>{ln.label}</div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8 }}>
            {(STAGES_BY_LINE[ln.key] || []).map(sk => {
              const checked = (map.get(ln.key) || new Set()).has(sk);
              return (
                <label key={`${ln.key}-${sk}`} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input
                    type="checkbox"
                    disabled={disabled}
                    checked={checked}
                    onChange={(e) => setChecked(ln.key, sk, e.target.checked)}
                  />
                  <span style={{ fontWeight: 700 }}>{sk}</span>
                </label>
              );
            })}
          </div>
        </div>
      ))}
      <div style={{ fontSize: 12, opacity: 0.7 }}>
        Si el usuario es GLOBAL, los scopes no son necesarios (pero podés dejarlos igual).
      </div>
    </div>
  );
}

export default function AdminQcPage() {
  const nav = useNavigate();

  // Guard simple por token
  useEffect(() => {
    const t = getAdminToken();
    if (!t) nav('/admin/login', { replace: true });
  }, [nav]);

  const logout = () => {
    clearAdminToken();
    nav('/admin/login', { replace: true });
  };

  // USERS
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [usersErr, setUsersErr] = useState('');
  const [users, setUsers] = useState([]);

  const reloadUsers = async () => {
    setUsersErr('');
    setLoadingUsers(true);
    try {
      const { data } = await api.get('/admin/qc/users');
      const list = data?.users || [];
      setUsers(list);
    } catch (e) {
      const msg = e?.response?.data?.error || e.message;
      setUsersErr(msg);
      if (e?.response?.status === 401) nav('/admin/login', { replace: true });
    } finally {
      setLoadingUsers(false);
    }
  };

  useEffect(() => { reloadUsers(); }, []);

  // MODAL create/edit user
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [userModalMode, setUserModalMode] = useState('create'); // create | edit
  const [editingUser, setEditingUser] = useState(null);

  const [uName, setUName] = useState('');
  const [uPin, setUPin] = useState('');
  const [uIsGlobal, setUIsGlobal] = useState(false);
  const [uIsActive, setUIsActive] = useState(true);
  const [uScopes, setUScopes] = useState([]);

  const [savingUser, setSavingUser] = useState(false);
  const [userFormErr, setUserFormErr] = useState('');

  const openCreateUser = () => {
    setUserModalMode('create');
    setEditingUser(null);
    setUName('');
    setUPin('');
    setUIsGlobal(false);
    setUIsActive(true);
    setUScopes([]);
    setUserFormErr('');
    setUserModalOpen(true);
  };

  const openEditUser = (u) => {
    setUserModalMode('edit');
    setEditingUser(u);
    setUName(u?.name || '');
    setUPin(''); // si querés cambiar
    setUIsGlobal(toBool(u?.is_global));
    setUIsActive(u?.is_active !== false);
    setUScopes(Array.isArray(u?.scopes) ? u.scopes : []);
    setUserFormErr('');
    setUserModalOpen(true);
  };

  const saveUser = async () => {
    setUserFormErr('');
    const nm = String(uName || '').trim();

    if (!nm) {
      setUserFormErr('El nombre es requerido.');
      return;
    }

    if (userModalMode === 'create') {
      const pin = String(uPin || '').trim();
      if (!/^\d{3,10}$/.test(pin)) {
        setUserFormErr('PIN inválido (3 a 10 dígitos numéricos).');
        return;
      }
    } else {
      // edit: pin opcional, si lo cargan debe ser válido
      const pin = String(uPin || '').trim();
      if (pin && !/^\d{3,10}$/.test(pin)) {
        setUserFormErr('PIN inválido (3 a 10 dígitos numéricos).');
        return;
      }
    }

    try {
      setSavingUser(true);

      if (userModalMode === 'create') {
        const payload = {
          name: nm,
          pin: String(uPin).trim(),
          is_global: uIsGlobal === true,
          is_active: uIsActive === true,
          scopes: Array.isArray(uScopes) ? uScopes : [],
        };
        await api.post('/admin/qc/users', payload);
        await reloadUsers();
        setUserModalOpen(false);
        return;
      }

      // edit
      const id = Number(editingUser?.id);
      if (!Number.isInteger(id)) throw new Error('Usuario inválido (id).');

      const patch = {
        name: nm,
        is_global: uIsGlobal === true,
        is_active: uIsActive === true,
      };
      const pin = String(uPin || '').trim();
      if (pin) patch.pin = pin;

      await api.put(`/admin/qc/users/${id}`, patch);

      // scopes (siempre los mandamos como reemplazo, así no hay drift)
      await api.put(`/admin/qc/users/${id}/scopes`, {
        scopes: Array.isArray(uScopes) ? uScopes : [],
      });

      await reloadUsers();
      setUserModalOpen(false);
    } catch (e) {
      setUserFormErr(e?.response?.data?.error || e.message);
    } finally {
      setSavingUser(false);
    }
  };

  // MOTIVES
  const [loadingMot, setLoadingMot] = useState(false);
  const [motErr, setMotErr] = useState('');
  const [motives, setMotives] = useState([]);

  const [mLine, setMLine] = useState('portones');
  const [mKind, setMKind] = useState('RECHAZADO');
  const [mStage, setMStage] = useState(''); // opcional ('' => null)

  const reloadMotives = async () => {
    setMotErr('');
    setLoadingMot(true);
    try {
      const { data } = await api.get('/admin/qc/motives', {
        params: {
          line: mLine || undefined,
          kind: mKind || undefined,
          stage: mStage ? mStage : undefined,
        }
      });
      setMotives(data?.motives || []);
    } catch (e) {
      setMotErr(e?.response?.data?.error || e.message);
    } finally {
      setLoadingMot(false);
    }
  };

  useEffect(() => { reloadMotives(); }, [mLine, mKind, mStage]);

  // Modal motive
  const [motModalOpen, setMotModalOpen] = useState(false);
  const [motModalMode, setMotModalMode] = useState('create'); // create|edit
  const [editingMotive, setEditingMotive] = useState(null);

  const [moLine, setMoLine] = useState('portones');
  const [moKind, setMoKind] = useState('RECHAZADO');
  const [moStage, setMoStage] = useState('');
  const [moLabel, setMoLabel] = useState('');
  const [moEnabled, setMoEnabled] = useState(true);
  const [moPriority, setMoPriority] = useState(100);

  const [savingMot, setSavingMot] = useState(false);
  const [motFormErr, setMotFormErr] = useState('');

  const openCreateMotive = () => {
    setMotModalMode('create');
    setEditingMotive(null);

    setMoLine(mLine || 'portones');
    setMoKind(mKind || 'RECHAZADO');
    setMoStage(mStage || '');
    setMoLabel('');
    setMoEnabled(true);
    setMoPriority(100);

    setMotFormErr('');
    setMotModalOpen(true);
  };

  const openEditMotive = (m) => {
    setMotModalMode('edit');
    setEditingMotive(m);

    setMoLine(m?.line || 'portones');
    setMoKind(m?.kind || 'RECHAZADO');
    setMoStage(m?.stage_key || '');
    setMoLabel(m?.label || '');
    setMoEnabled(m?.enabled !== false);
    setMoPriority(Number.isFinite(Number(m?.priority)) ? Number(m.priority) : 100);

    setMotFormErr('');
    setMotModalOpen(true);
  };

  const saveMotive = async () => {
    setMotFormErr('');
    const lb = String(moLabel || '').trim();
    if (!lb) {
      setMotFormErr('Label requerido.');
      return;
    }

    const stageKey = String(moStage || '').trim();
    const payloadStage = stageKey ? stageKey : null;

    try {
      setSavingMot(true);

      if (motModalMode === 'create') {
        await api.post('/admin/qc/motives', {
          line: moLine,
          kind: moKind,
          stage_key: payloadStage,
          label: lb,
          enabled: moEnabled === true,
          priority: Number(moPriority),
        });
        await reloadMotives();
        setMotModalOpen(false);
        return;
      }

      const id = Number(editingMotive?.id);
      if (!Number.isInteger(id)) throw new Error('Motivo inválido (id).');

      await api.put(`/admin/qc/motives/${id}`, {
        label: lb,
        enabled: moEnabled === true,
        priority: Number(moPriority),
        stage_key: payloadStage,
      });

      await reloadMotives();
      setMotModalOpen(false);
    } catch (e) {
      setMotFormErr(e?.response?.data?.error || e.message);
    } finally {
      setSavingMot(false);
    }
  };

  const usersSorted = useMemo(() => (users || []).slice().sort((a, b) => (a.id || 0) - (b.id || 0)), [users]);

  return (
    <div className="container" style={{ maxWidth: 1200 }}>
      <div className="header-row" style={{ alignItems: 'center' }}>
        <h2 className="h1">Admin – QC (Usuarios y Motivos)</h2>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link className="btn" to="/admin">Volver</Link>
          <Link className="btn" to="/">Inicio</Link>
          <button className="btn" type="button" onClick={reloadUsers}>Refrescar</button>
          <button className="btn" type="button" onClick={logout}>Salir</button>
        </div>
      </div>

      {/* USERS */}
      <div style={{ marginTop: 12, border: '1px solid var(--border)', borderRadius: 12, padding: 12, background: 'var(--surface)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ fontWeight: 900, fontSize: 16 }}>Usuarios QC</div>
          <button className="btn btn--brand" type="button" onClick={openCreateUser}>+ Nuevo usuario</button>
        </div>

        {usersErr && <div style={{ color: 'crimson', fontWeight: 800, marginTop: 10 }}>{usersErr}</div>}
        {loadingUsers ? (
          <div style={{ marginTop: 10 }}>Cargando usuarios…</div>
        ) : (
          <div style={{ overflowX: 'auto', marginTop: 10 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', borderBottom: '1px solid var(--border)', padding: 8 }}>ID</th>
                  <th style={{ textAlign: 'left', borderBottom: '1px solid var(--border)', padding: 8 }}>Nombre</th>
                  <th style={{ textAlign: 'left', borderBottom: '1px solid var(--border)', padding: 8 }}>Activo</th>
                  <th style={{ textAlign: 'left', borderBottom: '1px solid var(--border)', padding: 8 }}>Global</th>
                  <th style={{ textAlign: 'left', borderBottom: '1px solid var(--border)', padding: 8 }}>Scopes</th>
                  <th style={{ textAlign: 'left', borderBottom: '1px solid var(--border)', padding: 8 }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {usersSorted.map(u => {
                  const scopes = Array.isArray(u?.scopes) ? u.scopes : [];
                  const scopeCount = scopes.filter(s => s?.enabled !== false).length;

                  return (
                    <tr key={u.id}>
                      <td style={{ padding: 8, borderBottom: '1px solid #eee' }}>{u.id}</td>
                      <td style={{ padding: 8, borderBottom: '1px solid #eee', fontWeight: 800 }}>{u.name}</td>
                      <td style={{ padding: 8, borderBottom: '1px solid #eee' }}>{u.is_active !== false ? 'Sí' : 'No'}</td>
                      <td style={{ padding: 8, borderBottom: '1px solid #eee' }}>{u.is_global === true ? 'Sí' : 'No'}</td>
                      <td style={{ padding: 8, borderBottom: '1px solid #eee' }}>
                        {u.is_global === true ? (
                          <span style={{ fontWeight: 800 }}>GLOBAL</span>
                        ) : (
                          <span>{scopeCount} permisos</span>
                        )}
                      </td>
                      <td style={{ padding: 8, borderBottom: '1px solid #eee' }}>
                        <button className="btn btn--brand" type="button" onClick={() => openEditUser(u)}>
                          Editar
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {usersSorted.length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ padding: 10, opacity: 0.7 }}>Sin usuarios.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* MOTIVES */}
      <div style={{ marginTop: 14, border: '1px solid var(--border)', borderRadius: 12, padding: 12, background: 'var(--surface)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ fontWeight: 900, fontSize: 16 }}>Motivos QC</div>
          <button className="btn btn--brand" type="button" onClick={openCreateMotive}>+ Nuevo motivo</button>
        </div>

        <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 12, opacity: 0.75, fontWeight: 800 }}>Línea</span>
            <select className="btn" value={mLine} onChange={(e) => setMLine(e.target.value)}>
              {LINES.map(x => <option key={x.key} value={x.key}>{x.label}</option>)}
            </select>
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 12, opacity: 0.75, fontWeight: 800 }}>Tipo</span>
            <select className="btn" value={mKind} onChange={(e) => setMKind(e.target.value)}>
              {KINDS.map(x => <option key={x.key} value={x.key}>{x.label}</option>)}
            </select>
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 12, opacity: 0.75, fontWeight: 800 }}>Etapa (opcional)</span>
            <select className="btn" value={mStage} onChange={(e) => setMStage(e.target.value)}>
              <option value="">(Todas)</option>
              {(STAGES_BY_LINE[mLine] || []).map(sk => (
                <option key={sk} value={sk}>{sk}</option>
              ))}
            </select>
          </label>

          <button className="btn" type="button" onClick={reloadMotives} disabled={loadingMot}>
            {loadingMot ? 'Cargando…' : 'Refrescar'}
          </button>
        </div>

        {motErr && <div style={{ color: 'crimson', fontWeight: 800, marginTop: 10 }}>{motErr}</div>}

        <div style={{ overflowX: 'auto', marginTop: 10 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', borderBottom: '1px solid var(--border)', padding: 8 }}>ID</th>
                <th style={{ textAlign: 'left', borderBottom: '1px solid var(--border)', padding: 8 }}>Línea</th>
                <th style={{ textAlign: 'left', borderBottom: '1px solid var(--border)', padding: 8 }}>Tipo</th>
                <th style={{ textAlign: 'left', borderBottom: '1px solid var(--border)', padding: 8 }}>Etapa</th>
                <th style={{ textAlign: 'left', borderBottom: '1px solid var(--border)', padding: 8 }}>Label</th>
                <th style={{ textAlign: 'left', borderBottom: '1px solid var(--border)', padding: 8 }}>Enabled</th>
                <th style={{ textAlign: 'left', borderBottom: '1px solid var(--border)', padding: 8 }}>Prioridad</th>
                <th style={{ textAlign: 'left', borderBottom: '1px solid var(--border)', padding: 8 }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {(motives || []).map(m => (
                <tr key={m.id}>
                  <td style={{ padding: 8, borderBottom: '1px solid #eee' }}>{m.id}</td>
                  <td style={{ padding: 8, borderBottom: '1px solid #eee' }}>{m.line}</td>
                  <td style={{ padding: 8, borderBottom: '1px solid #eee', fontWeight: 800 }}>{m.kind}</td>
                  <td style={{ padding: 8, borderBottom: '1px solid #eee' }}>{m.stage_key || '—'}</td>
                  <td style={{ padding: 8, borderBottom: '1px solid #eee' }}>{m.label}</td>
                  <td style={{ padding: 8, borderBottom: '1px solid #eee' }}>{m.enabled !== false ? 'Sí' : 'No'}</td>
                  <td style={{ padding: 8, borderBottom: '1px solid #eee' }}>{m.priority}</td>
                  <td style={{ padding: 8, borderBottom: '1px solid #eee' }}>
                    <button className="btn btn--brand" type="button" onClick={() => openEditMotive(m)}>
                      Editar
                    </button>
                  </td>
                </tr>
              ))}
              {!loadingMot && (motives || []).length === 0 && (
                <tr>
                  <td colSpan={8} style={{ padding: 10, opacity: 0.7 }}>Sin motivos para el filtro actual.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL USER */}
      <Modal
        open={userModalOpen}
        title={userModalMode === 'create' ? 'Crear usuario QC' : `Editar usuario QC #${editingUser?.id}`}
        onClose={() => setUserModalOpen(false)}
        footer={
          <>
            <button className="btn" type="button" onClick={() => setUserModalOpen(false)} disabled={savingUser}>
              Cancelar
            </button>
            <button className="btn btn--brand" type="button" onClick={saveUser} disabled={savingUser}>
              {savingUser ? 'Guardando…' : 'Guardar'}
            </button>
          </>
        }
      >
        {userFormErr && <div style={{ color: 'crimson', fontWeight: 800, marginBottom: 10 }}>{userFormErr}</div>}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontWeight: 900 }}>Nombre</span>
            <input className="btn" value={uName} onChange={(e) => setUName(e.target.value)} />
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontWeight: 900 }}>
              PIN {userModalMode === 'edit' ? '(solo si querés cambiarlo)' : ''}
            </span>
            <input
              className="btn"
              value={uPin}
              onChange={(e) => setUPin(e.target.value)}
              inputMode="numeric"
              placeholder={userModalMode === 'edit' ? 'Dejar vacío para no cambiar' : '3 a 10 dígitos'}
            />
          </label>

          <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input type="checkbox" checked={uIsActive} onChange={(e) => setUIsActive(e.target.checked)} />
            <span style={{ fontWeight: 900 }}>Activo</span>
          </label>

          <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input type="checkbox" checked={uIsGlobal} onChange={(e) => setUIsGlobal(e.target.checked)} />
            <span style={{ fontWeight: 900 }}>GLOBAL</span>
          </label>
        </div>

        <div style={{ marginTop: 12 }}>
          <div style={{ fontWeight: 900, marginBottom: 8 }}>Permisos (scopes por etapa)</div>
          <ScopeEditor
            value={uScopes}
            onChange={setUScopes}
            disabled={false}
          />
        </div>
      </Modal>

      {/* MODAL MOTIVE */}
      <Modal
        open={motModalOpen}
        title={motModalMode === 'create' ? 'Crear motivo QC' : `Editar motivo QC #${editingMotive?.id}`}
        onClose={() => setMotModalOpen(false)}
        footer={
          <>
            <button className="btn" type="button" onClick={() => setMotModalOpen(false)} disabled={savingMot}>
              Cancelar
            </button>
            <button className="btn btn--brand" type="button" onClick={saveMotive} disabled={savingMot}>
              {savingMot ? 'Guardando…' : 'Guardar'}
            </button>
          </>
        }
      >
        {motFormErr && <div style={{ color: 'crimson', fontWeight: 800, marginBottom: 10 }}>{motFormErr}</div>}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontWeight: 900 }}>Línea</span>
            <select className="btn" value={moLine} onChange={(e) => setMoLine(e.target.value)} disabled={motModalMode === 'edit'}>
              {LINES.map(x => <option key={x.key} value={x.key}>{x.label}</option>)}
            </select>
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontWeight: 900 }}>Tipo</span>
            <select className="btn" value={moKind} onChange={(e) => setMoKind(e.target.value)} disabled={motModalMode === 'edit'}>
              {KINDS.map(x => <option key={x.key} value={x.key}>{x.label}</option>)}
            </select>
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontWeight: 900 }}>Etapa (opcional)</span>
            <select className="btn" value={moStage} onChange={(e) => setMoStage(e.target.value)}>
              <option value="">(Sin etapa específica)</option>
              {(STAGES_BY_LINE[moLine] || []).map(sk => (
                <option key={sk} value={sk}>{sk}</option>
              ))}
            </select>
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontWeight: 900 }}>Prioridad</span>
            <input
              className="btn"
              value={String(moPriority)}
              onChange={(e) => setMoPriority(e.target.value)}
              inputMode="numeric"
            />
          </label>

          <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input type="checkbox" checked={moEnabled} onChange={(e) => setMoEnabled(e.target.checked)} />
            <span style={{ fontWeight: 900 }}>Enabled</span>
          </label>

          <div />
        </div>

        <div style={{ marginTop: 12 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontWeight: 900 }}>Label</span>
            <input className="btn" value={moLabel} onChange={(e) => setMoLabel(e.target.value)} />
          </label>

          <div style={{ marginTop: 8, fontSize: 12, opacity: 0.7 }}>
            Recordatorio: en tu back, los motivos aplican solo a estados QC <b>OBSERVADO</b> y <b>RECHAZADO</b>.
          </div>
        </div>
      </Modal>
    </div>
  );
}
