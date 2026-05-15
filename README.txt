ZIP de reemplazo directo para repo planificacion.

Copiar y reemplazar estos archivos en la raíz del repo:

- Frontend/src/components/modals/AdminAuthModal.jsx
- Frontend/src/components/StageColumn.jsx

Cambios incluidos:
1. En /a, dentro de Autorización Administración, agrega campo Acciones.
   - Por defecto queda en No.
   - Si se marca Sí, habilita detalle / observación y lo exige antes de autorizar.
   - Guarda en preproduccion_valores.data:
     - admin_acciones
     - admin_acciones_detalle

2. En /despacho, para portones:
   - Si falta autorización administrativa y el portón tiene admin_acciones=true, se muestra amarillo en lugar de rojo.
   - Agrega botón Acciones para abrir popup con el detalle cargado.
   - Si no tiene acciones, mantiene comportamiento rojo existente.

Después de copiar, ejecutar el build del frontend antes de deployar.
