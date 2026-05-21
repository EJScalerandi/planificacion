Reemplazo directo - QC automático al hacer Stop

Copiar el contenido de este zip sobre la raíz del repo planificacion y reemplazar archivos existentes.

Archivos incluidos:
- Frontend/src/App.jsx
- Frontend/src/components/StageColumn.jsx

Cambios:
- Al hacer Stop, si el servidor responde exitosamente, se abre automáticamente el modal de QC.
- Se elimina el botón QC manual de cada tarjeta.
- El modal QC queda obligatorio: no muestra botón Cerrar y no se cierra tocando el fondo.
- El modal se cierra solo después de confirmar QC correctamente.
- Se mantiene el cambio anterior:
  - Despacho muestra "Semana despacho".
  - El resto muestra "Semana producción".

No se modifica backend.
