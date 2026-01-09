import React, { useEffect, useMemo, useState } from 'react';

export default function ComercialAuthModal({ open, row, busy, onClose, onSubmit }) {
  const d = row?.data || {};

  // Si querés permitir reabrir para ver, pero NO editar una vez autorizado:
  const isAlreadyAuthorized = Boolean(d.auth_comercial);

  // Estado local del form
  const [okComercial, setOkComercial] = useState(null); // null | true | false

  useEffect(() => {
    if (!open) return;

    // Si ya existe un valor guardado, lo precargamos
    const saved = d.comercial_ok;
    if (typeof saved === 'boolean') setOkComercial(saved);
    else setOkComercial(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, row?.id]);

  const canSubmit = useMemo(() => {
    if (busy) return false;
    if (isAlreadyAuthorized) return false; // no editable post autorización (según tu criterio)
    return okComercial === true; // solo autoriza si responde "sí"
  }, [busy, okComercial, isAlreadyAuthorized]);

  if (!open) return null;

  return (
    <div className="pp-modalOverlay" role="dialog" aria-modal="true">
      <div className="pp-modal">
        <div className="pp-modalHeader">
          <div>
            <div className="pp-modalTitle">Autorización Comercial</div>
            <div className="pp-modalSub">
              NV: <b>{String(d.NV ?? d.nv ?? '')}</b> · Cliente: <b>{String(d.Nombre ?? '') || '-'}</b>
            </div>
          </div>

          <button className="pp-modalClose" onClick={onClose} disabled={busy}>
            ×
          </button>
        </div>

        <div className="pp-modalBody">
          <div className="pp-formGroup">
            <label className="pp-label">
              El portón se encuentra en condiciones comerciales de ser producido?
              <span className="pp-required"> (obligatorio)</span>
            </label>

            <div className="pp-radioRow">
              <button
                type="button"
                className={`pp-chip ${okComercial === true ? 'pp-chip--on' : ''}`}
                onClick={() => setOkComercial(true)}
                disabled={busy || isAlreadyAuthorized}
              >
                Sí
              </button>

              <button
                type="button"
                className={`pp-chip ${okComercial === false ? 'pp-chip--on' : ''}`}
                onClick={() => setOkComercial(false)}
                disabled={busy || isAlreadyAuthorized}
              >
                No
              </button>
            </div>

            {okComercial === false ? (
              <div className="pp-inlineWarn">
                Si la respuesta es <b>No</b>, no se podrá autorizar.
              </div>
            ) : null}
          </div>

          {isAlreadyAuthorized ? (
            <div className="pp-inlineOk">
              Esta autorización ya fue otorgada y no se puede editar.
            </div>
          ) : null}
        </div>

        <div className="pp-modalFooter">
          <button className="btn" onClick={onClose} disabled={busy}>
            Cancelar
          </button>

          <button
            className={`btn btn--brand ${!canSubmit ? 'pp-btnDisabled' : ''}`}
            onClick={() =>
              onSubmit({
                // Guardamos respuesta
                comercial_ok: true,
                // Autorización final
                auth_comercial: true,
                // Auditoría opcional
                auth_comercial_at: new Date().toISOString(),
              })
            }
            disabled={!canSubmit}
            title={
              isAlreadyAuthorized
                ? 'Ya está autorizado'
                : okComercial !== true
                  ? 'Debés responder “Sí” para autorizar'
                  : ''
            }
          >
            Autorizar
          </button>
        </div>
      </div>
    </div>
  );
}
