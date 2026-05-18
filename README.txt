Reemplazo directo v7 - Acciones administrativas en /a

Copiar el contenido del zip sobre la raíz del repo planificacion.

Incluye:
- Frontend/src/components/modals/AdminAuthModal.jsx

Cambios:
- /a muestra una columna exclusiva "Acciones admin".
- La columna tiene ancho fijo para no deformar la tabla.
- El comentario aparece recortado en una línea.
- Click sobre el comentario expande/contrae el texto completo dentro de la misma celda.
- No usa popup para consultar el detalle en /a.
- No toca /despacho.

Luego ejecutar:
cd Frontend
npm run build
