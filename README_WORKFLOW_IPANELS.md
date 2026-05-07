# Workflow iPanels - Planificacion

Este paquete configura el workflow productivo de iPanels usando `public.ipanel`.

## Flujo default

1. Diseño iPanel
2. Corte iPanel
3. Plegado iPanel
4. Pintura iPanel
5. Inyección iPanel
6. Despacho iPanel

Cada etapa posterior exige que la anterior esté `Finalizado`.

## Archivos incluidos

```txt
Backend/server/routes/admin/workflow.js
Backend/server/sql/seed_ipanel_workflow.sql
```

## Pasos

1. Copiar el contenido del zip encima del repo.
2. Ejecutar en Supabase SQL Editor:

```sql
-- Backend/server/sql/seed_ipanel_workflow.sql
```

3. Reiniciar backend:

```bash
cd Backend
node --check server/routes/admin/workflow.js
npm start
```

## Nota

El script SQL resetea solo la línea `ipanel` en:

- `workflow_stage`
- `workflow_edge`
- `workflow_requirement`

No toca el workflow de `portones` ni elimina registros de `public.ipanel`.
