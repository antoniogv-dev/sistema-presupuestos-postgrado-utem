# Actualización v10.12 desde GitHub web

Versión de aplicación: `1.0.22-d1-web`  
Versión funcional: `v10.12`

## Objetivo

Agregar trazabilidad completa de los parámetros utilizados en cada exportación individual XLSX y PDF, sin modificar las fórmulas financieras vigentes.

## Actualización recomendada

Use el ZIP incremental de v10.12 sobre la instalación v10.11 corregida. El paquete incremental no incluye `wrangler.jsonc`, por lo que no reemplaza el binding D1, variables ni Secrets productivos.

1. Descomprima el ZIP incremental.
2. Copie o cargue en GitHub los archivos manteniendo exactamente sus rutas.
3. Reemplace los archivos existentes cuando GitHub lo solicite.
4. Realice el commit, por ejemplo: `feat: exporta parámetros utilizados v10.12`.
5. Espere el build y deploy automático de Cloudflare.
6. Abra `/api/version` y confirme:

```json
{
  "version": "1.0.22-d1-web",
  "release": "v10.12"
}
```

## Validación funcional

En un presupuesto, exporte XLSX y PDF.

El XLSX debe contener:

- `Flujo presupuestario`.
- `Parámetros utilizados`.

El PDF debe contener primero el flujo presupuestario y luego páginas tituladas `Parámetros utilizados`.

No existe una migración D1 nueva en v10.12.
