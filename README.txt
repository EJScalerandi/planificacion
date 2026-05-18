admin_acciones_reemplazo_directo_v4.zip

Copiar el contenido del zip sobre la raiz del repo planificacion y reemplazar archivos.

Archivos incluidos:
- Frontend/src/components/modals/AdminAuthModal.jsx
- Frontend/src/components/StageColumn.jsx

Cambios v4:
- /despacho conserva el rojo existente cuando falta autorizacion administrativa y la salida esta vencida.
- /despacho ahora pone amarillo cuando auth_admin = true y admin_acciones = true.
- /despacho muestra boton Acciones solo en ese caso amarillo.
- /a refuerza el boton Ver de acciones con apertura directa del popup para evitar clicks perdidos por refrescos de tabla.

Datos usados:
- auth_admin: autorizacion final de Administracion.
- admin_acciones: accion administrativa marcada en Si.
- admin_acciones_detalle: comentario/detalle visible en popup.

Despues de copiar:
cd Frontend
npm run build
