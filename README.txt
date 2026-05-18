Cambios incluidos:

- La autorizacion administrativa de iPanels queda en /i, no en /b.
- /b vuelve a quedar como Administracion de Usuarios.
- Tambien queda disponible /usuarios como acceso alternativo a Administracion de Usuarios.
- En /i se agregan Aut. Admin y Acciones admin para iPanels, usando el mismo usuario administrativo que autoriza en /a.
- La autorizacion administrativa de iPanels se guarda en public.preproduccion_valores_ipanels.data.
- GET /ipanel expone auth_admin, admin_acciones y admin_acciones_detalle desde la preproduccion de iPanels.
- En /despacho, iPanels se comportan como portones:
  * rojo si fecha despacho vencida y falta auth_admin
  * amarillo si auth_admin=true y admin_acciones=true
  * boton Acciones para ver el detalle
  * muestra semana despacho y fecha despacho

Reemplazar copiando el contenido de este zip sobre la raiz del repo.
Luego ejecutar:
cd Frontend
npm run build

Si desplegas backend separado, redeployar tambien el Backend.
