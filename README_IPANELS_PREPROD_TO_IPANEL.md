# Planificacion - iPanels: preproduccion_valores_ipanels -> ipanel

Este reemplazo corrige el flujo:

1. `public.preproduccion_valores_ipanels` es el equivalente de `public.preproduccion_valores`.
   - Contiene los datos sincronizados desde SQL Server.
   - Es el listado de logistica en `/i`.

2. El usuario de logistica carga:
   - `fecha_prod`
   - `fecha_plan_entrega`

3. Al presionar **Enviar a produccion**, se crea o actualiza el registro productivo en:
   - `public.ipanel`

4. El tablero productivo usa `public.ipanel` y el flow existente de iPanels:
   - diseno
   - guillotina
   - plegado
   - pintura
   - inyeccion
   - despacho

## Archivos incluidos

```txt
Backend/server/app.js
Backend/server/routes/public/ipanel.js
Backend/server/routes/public/ipanelPreprod.js
Backend/server/sql/alter_preproduccion_valores_ipanels_to_produccion.sql
Frontend/src/App.jsx
Frontend/pages/IndexPage.jsx
Frontend/src/api.js
Frontend/src/hooks/useIpanels.js
Frontend/src/components/IpanelPreproduccionValoresTable.jsx
```

## 1. Ejecutar SQL en Supabase

Ejecutar:

```sql
-- Backend/server/sql/alter_preproduccion_valores_ipanels_to_produccion.sql
```

Agrega a `preproduccion_valores_ipanels`:

```txt
fecha_prod
produccion_enviada
produccion_enviada_at
ipanel_id
```

## 2. Copiar y reemplazar

Copiar el contenido del zip encima del repo `planificacion` y reemplazar archivos.

## 3. Backend

```bash
cd Backend
node --check server/app.js
node --check server/routes/public/ipanel.js
node --check server/routes/public/ipanelPreprod.js
npm start
```

## 4. Frontend

```bash
cd Frontend
npm install
npm run build
```

## Rutas nuevas / modificadas

```txt
GET   /preproduccion-valores-ipanels
PATCH /preproduccion-valores-ipanels/:id
PUT   /preproduccion-valores-ipanels/:id
POST  /preproduccion-valores-ipanels/:id/enviar-produccion
GET   /ipanel?produccion=1
```

## Pantallas

```txt
/i      -> logistica iPanels desde preproduccion_valores_ipanels
/board  -> produccion; muestra iPanels ya enviados a public.ipanel
```
