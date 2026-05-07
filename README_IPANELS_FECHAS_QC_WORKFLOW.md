# Fix iPanels: fechas, envío a producción, workflow y QC

## Qué corrige

1. En `/i`, **Guardar fechas** persiste `fecha_prod` y `fecha_plan_entrega` en `public.preproduccion_valores_ipanels`.
2. El botón **Enviar a producción** queda deshabilitado hasta que exista una `fecha_prod` guardada.
3. **Enviar a producción** crea/actualiza el registro productivo en `public.ipanel` recién en ese momento.
4. El workflow de iPanels se configura desde `/admin/workflow`, seleccionando `iPanels` en el selector.
5. QC para iPanels acepta los mismos PIN/códigos de portones:
   - backend permite scopes/motivos de `portones` como fallback para `ipanel`;
   - además se incluye SQL opcional para copiar scopes/motivos a `line='ipanel'`.

## Archivos incluidos

```txt
Backend/server/app.js
Backend/server/routes/admin/workflow.js
Backend/server/routes/public/ipanel.js
Backend/server/routes/public/ipanelPreprod.js
Backend/server/routes/public/qc.js
Backend/server/sql/alter_preproduccion_valores_ipanels_to_produccion.sql
Backend/server/sql/seed_ipanel_workflow.sql
Backend/server/sql/seed_ipanel_qc_same_codes.sql
Frontend/src/App.jsx
Frontend/pages/IndexPage.jsx
Frontend/src/api.js
Frontend/src/hooks/useIpanels.js
Frontend/src/components/IpanelPreproduccionValoresTable.jsx
```

## SQL a ejecutar en Supabase

```sql
-- 1) Estructura para fechas y vínculo preproducción -> producción
-- Backend/server/sql/alter_preproduccion_valores_ipanels_to_produccion.sql

-- 2) Workflow default de iPanels
-- Backend/server/sql/seed_ipanel_workflow.sql

-- 3) QC: mismos códigos/PIN y motivos que portones para iPanels
-- Backend/server/sql/seed_ipanel_qc_same_codes.sql
```

## Validación backend

```bash
cd Backend
node --check server/app.js
node --check server/routes/public/ipanel.js
node --check server/routes/public/ipanelPreprod.js
node --check server/routes/public/qc.js
node --check server/routes/admin/workflow.js
npm start
```

## Validación frontend

```bash
cd Frontend
npm install
npm run build
```

## Rutas relevantes

- `/i`: logística iPanels. Guarda fechas y permite enviar a producción cuando hay fecha de producción guardada.
- `/board`: tablero productivo, ya leyendo iPanels productivos desde `public.ipanel`.
- `/admin/workflow`: configuración de workflow. Usar el selector `iPanels`.
- `/admin/qc`: administración de QC si necesitás revisar usuarios/motivos.
