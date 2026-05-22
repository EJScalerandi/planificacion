Reemplazo directo - QC automático + botón QC manual

Copiar el contenido de este zip sobre la raíz del repo planificacion y reemplazar archivos existentes.

Archivos incluidos:
- Frontend/src/App.jsx
- Frontend/src/components/StageColumn.jsx

Cambios:
- Se mantiene el QC automático al hacer Stop:
  - Si el servidor responde exitosamente, se abre automáticamente el modal de QC.
  - En este caso el modal es obligatorio: no se puede cerrar hasta confirmar QC correctamente.
- Se vuelve a agregar el botón QC manual en cada tarjeta.
  - Sirve para portones/iPanels que ya quedaron en Stop/Finalizado y necesitan completar QC.
  - Si se abre desde el botón QC manual, el modal sí se puede cerrar.
- Etiquetas de semana abreviadas:
  - Despacho: Semana N° X
  - Producción: Semana N° X

No se modifica backend.
