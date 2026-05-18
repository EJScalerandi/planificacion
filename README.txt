ipanel_admin_ipanels_en_i_reemplazo_directo_v4

Cambios:
- /i conserva el flujo normal para usuarios no administrativos: fecha produccion, fecha despacho, guardar fecha y enviar a produccion.
- Si el usuario no tiene scope preproduccion:admin, no se muestran las columnas Aut. Admin ni Acciones admin.
- Si el usuario tiene scope preproduccion:admin, se muestran Aut. Admin y Acciones admin, y puede autorizar igual que en /a.
- Se mantiene el bloqueo backend de la version anterior: no se puede modificar auth_admin/admin_acciones sin token administrativo.

Aplicacion:
1) Copiar el contenido del zip sobre la raiz del repo.
2) Frontend: cd Frontend && npm run build
3) Backend: redeploy si todavia no aplicaste la version anterior con cambios backend.
