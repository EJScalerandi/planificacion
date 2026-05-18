admin_acciones_reemplazo_directo_v6

Copiar el contenido del ZIP sobre la raiz del repo planificacion y reemplazar archivos.

Incluye:
- Frontend/src/components/modals/AdminAuthModal.jsx

Cambios:
- /a deja de abrir popup para consultar acciones.
- El detalle de acciones queda escrito directamente en la tabla.
- Se elimina el click "Ver" y el listener global asociado.
- Se elimina el refresco auxiliar periodico de 60 segundos.
- /despacho no se toca.

Luego ejecutar:
cd Frontend
npm run build
