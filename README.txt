ipanel_admin_ipanels_en_i_reemplazo_directo_v3.zip

Aplicacion:
1) Copiar el contenido del zip sobre la raiz del repo planificacion.
2) Reemplazar archivos existentes cuando el sistema lo pida.
3) Build frontend:
   cd Frontend
   npm run build
4) Redeployar backend porque se modifica Backend/server/routes/public/ipanelPreprod.js.

Cambio v3:
- /i mantiene la autorizacion administrativa para iPanels.
- Solo usuarios con scope preproduccion:admin ven el boton Autorizar y pueden abrir/cargar el modal.
- Usuarios sin ese scope solo ven el estado Pendiente admin o Autorizado, y pueden consultar Acciones admin si existen.
- Backend bloquea cambios de auth_admin/admin_acciones si el token no tiene preproduccion:admin.
- No toca la logica de /despacho agregada en v2.

Archivos incluidos:
- Frontend/src/App.jsx
- Frontend/src/components/IpanelPreproduccionValoresTable.jsx
- Frontend/src/components/StageColumn.jsx
- Frontend/src/components/modals/AdminAuthModal.jsx
- Backend/server/routes/public/ipanelPreprod.js
- Backend/server/routes/public/ipanel.js
