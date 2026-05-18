REEMPLAZO DIRECTO - admin acciones v3

Copiar la carpeta Frontend sobre la raiz del repo planificacion y reemplazar archivos.

Archivos incluidos:
- Frontend/src/components/modals/AdminAuthModal.jsx
- Frontend/src/components/StageColumn.jsx

Cambios:
- Administracion puede crear Acciones desde la autorizacion administrativa.
- El dato queda en public.preproduccion_valores.data como JSONB:
  - auth_admin
  - auth_admin_at
  - admin_cliente_en_regla
  - admin_acciones
  - admin_acciones_detalle
- En /a, cualquier usuario que vea la tabla puede consultar el detalle con un boton Ver.
- En /a, si el usuario es Administracion y falta autorizar, tambien aparece Completar para abrir el popup y cargar Acciones.
- En /despacho, si falta autorizacion pero Acciones = Si, el porton se muestra amarillo y aparece boton Acciones con popup de detalle.

Luego de copiar, correr:
cd Frontend
npm run build
