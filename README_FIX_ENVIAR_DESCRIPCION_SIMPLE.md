# Fix: Enviar a produccion copia DescripcionSimple

Problema: los iPanels creados desde `/i` podian quedar con `public.ipanel.descripcion_simple = null` si se habia aplicado un reemplazo anterior que no copiaba ese campo.

## Archivos incluidos

- `Backend/server/routes/public/ipanelPreprod.js`
  - Al hacer `POST /preproduccion-valores-ipanels/:id/enviar-produccion`, copia `descripcion_simple` desde `preproduccion_valores_ipanels` y desde `data.DescripcionSimple`/`data.descripcion_simple` hacia `public.ipanel.descripcion_simple`.
- `Backend/server/routes/public/ipanel.js`
  - Si se crea un iPanel manualmente por `POST /ipanel`, tambien guarda `descripcion_simple`.
- `Backend/server/sql/ensure_and_backfill_ipanel_descripcion_simple.sql`
  - Asegura columnas y rellena iPanels ya creados con el dato simple desde preproduccion.

## Pasos

1. Copiar y reemplazar en el repo `planificacion`.
2. Ejecutar en Supabase:

```sql
-- Backend/server/sql/ensure_and_backfill_ipanel_descripcion_simple.sql
```

3. Validar backend:

```bash
cd Backend
node --check server/routes/public/ipanelPreprod.js
node --check server/routes/public/ipanel.js
npm start
```

## Workflow recomendado

Usar el campo `descripcion_simple`:

```json
{
  "all": [
    { "field": "descripcion_simple", "op": "=", "value": "MADERA" }
  ],
  "any": []
}
```

Y para aluminio:

```json
{
  "all": [
    { "field": "descripcion_simple", "op": "=", "value": "ALUMINIO" }
  ],
  "any": []
}
```
