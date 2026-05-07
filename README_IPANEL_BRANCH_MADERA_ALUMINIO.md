# Fix workflow iPanels: MADERA saltea Pintura

## Problema

Para iPanels, la ruta:

- `plegado -> pintura` si `descripcion contains ALUMINIO`
- `plegado -> inyeccion` si `descripcion contains MADERA`

no funcionaba correctamente para MADERA cuando `inyeccion` seguia teniendo requisito `pintura = Finalizado`.

Tambien, si los registros de `public.ipanel` nacen con todas las etapas en `Pendiente`, no hay forma real de distinguir que etapa fue habilitada por workflow. Para que las bifurcaciones funcionen, las etapas futuras deben empezar en `NULL` y el QC debe habilitar solo la siguiente etapa correspondiente.

## Cambios incluidos

- Al enviar desde `/i` a produccion, se crea el `public.ipanel` con:
  - `diseno = 'Pendiente'`
  - `guillotina = null`
  - `plegado = null`
  - `pintura = null`
  - `inyeccion = null`
  - `despacho = null`
- Al aprobar QC, el backend habilita la siguiente etapa que corresponda segun `workflow_edge.condition_json`.
- `inyeccion` no debe requerir `pintura`, porque eso bloquea MADERA.
- `/i` guarda fechas en `preproduccion_valores_ipanels` antes de enviar a produccion.
- El boton `Enviar a produccion` queda deshabilitado hasta que haya `fecha_prod` guardada.
- QC de iPanels permite reutilizar usuarios/motivos de portones como fallback.
- Admin workflow expone `descripcion` como campo para condiciones en line `ipanel`.

## SQL recomendado

Ejecutar:

```sql
-- Backend/server/sql/seed_ipanel_workflow_madera_aluminio.sql
```

Si ya tenes iPanels de prueba creados antes de este cambio, ejecutar tambien:

```sql
-- Backend/server/sql/fix_existing_ipanel_stage_branching.sql
```

## Validar backend

```bash
cd Backend
node --check server/routes/public/ipanelPreprod.js
node --check server/routes/public/ipanel.js
node --check server/routes/public/qc.js
node --check server/routes/admin/workflow.js
npm start
```

## Validar frontend

```bash
cd Frontend
npm install
npm run build
```
