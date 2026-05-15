REEMPLAZO DIRECTO - admin acciones v2

Copiar la carpeta Frontend sobre la raiz del repo planificacion y reemplazar archivos.

Archivos incluidos:
- Frontend/src/components/modals/AdminAuthModal.jsx
- Frontend/src/components/StageColumn.jsx

Cambios:
- En /a con usuario Administracion se muestra columna Acciones antes de Aut. Admin.
- En esa columna, Completar abre la misma autorizacion administrativa.
- Dentro del popup de autorizacion esta el campo Acciones, por defecto No.
- Si Acciones = Si, se habilita y exige el detalle.
- En /despacho, si falta autorizacion pero Acciones = Si, el porton se muestra amarillo y aparece boton Acciones con popup de detalle.

Luego de copiar, correr:
cd Frontend
npm run build
