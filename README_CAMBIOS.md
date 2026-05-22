# Cambios para EJScalerandi/planificacion

Archivos modificados:

- `Frontend/src/components/IpanelPreproduccionValoresTable.jsx`
  - En `/i`, la Fecha Producción sigue bloqueada cuando el iPanel ya fue enviado a producción.
  - La Fecha Despacho (`fecha_plan_entrega`) queda editable incluso cuando el iPanel ya está en producción.
  - El botón `Guardar fecha` ya no se bloquea por `enviado`; se habilita cuando hay cambios pendientes.

- `Backend/server/routes/public/ipanelPreprod.js`
  - Cuando se guardan fechas de un iPanel ya enviado a producción, se sincronizan `fecha_prod` y `fecha_plan_entrega` contra `public.ipanel` usando `ipanel_id`, `partida` o `nv`.
  - Esto asegura que el cambio de Fecha Despacho se vea también en el tablero productivo.

- `Backend/server/routes/admin/auth.js`
  - El login admin ahora busca el usuario con `lower(username) = lower($1)`, por lo que `Diego`, `DIEGO` y `dIEGO` validan contra el mismo usuario.

Aplicación:

Copiar estos archivos sobre las mismas rutas del repo y redeployar backend/frontend.
