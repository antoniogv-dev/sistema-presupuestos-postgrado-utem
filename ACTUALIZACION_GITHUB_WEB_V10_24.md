# Actualización GitHub web — v10.24

Versión: `1.0.34-d1-web`  
Release: `v10.24`

## Objetivo

Corregir el flujo Programa → Presupuesto para que todo programa activo quede disponible en Presupuestos y evitar que un programa sin cohorte mantenga datos visibles del presupuesto anterior. Además compacta y moderniza la interfaz institucional.

## Despliegue

Suba el contenido del ZIP incremental respetando las rutas. El paquete incremental no incluye `wrangler.jsonc`.

No hay migración D1 nueva.

Después del despliegue, `/api/version` debe mostrar `v10.24` y `1.0.34-d1-web`.
