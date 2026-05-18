admin_acciones_reemplazo_directo_v5

Reemplazo directo para corregir la lentitud del boton Ver en /a.

Archivo incluido:
- Frontend/src/components/modals/AdminAuthModal.jsx

Que cambia:
- Quita el polling agresivo que disparaba GET /preproduccion-valores continuamente.
- El popup Ver abre con los datos ya guardados en el boton, sin esperar una consulta al hacer click.
- Mantiene la carga de Acciones por Administracion.
- No toca /despacho.

Aplicacion:
Copiar el contenido del zip sobre la raiz del repo planificacion y reemplazar archivos.
Luego correr:
cd Frontend
npm run build
