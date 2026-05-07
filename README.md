# Cambio /i - DescripcionSimple

Reemplazo directo para Planificación.

## Archivo incluido

- `Frontend/src/components/IpanelPreproduccionValoresTable.jsx`

## Cambio

En la pantalla `/i`, la columna **Descripción** ahora muestra el valor simplificado:

- `descripcion_simple`
- `DescripcionSimple`
- `data.descripcion_simple`
- `data.DescripcionSimple`

Ya no muestra la descripción larga del producto en esa columna.

## Aplicar

Copiar el contenido del zip encima del repo `planificacion` y reemplazar el archivo.

Luego:

```bash
cd Frontend
npm run build
```
