# Verificación de build — v12.1.1 corregida

## Incidencia detectada

El despliegue de Cloudflare del 2 de septiembre de 2026 se detuvo en `source:audit` con:

`ENOENT: no such file or directory, open '/opt/buildhome/repo/lib/finance/revenue-engine.ts'`

La causa corresponde a una carga incompleta del repositorio: `lib/calculations/budget-engine.ts` importa `lib/finance/revenue-engine.ts`, por lo que dicho archivo es obligatorio en la arquitectura v12.

## Corrección aplicada

- Se entrega nuevamente el repositorio completo v12.1.1.
- Se incluye explícitamente `lib/finance/revenue-engine.ts` y `lib/finance/cost-engine.ts`.
- Se agrega `npm run repository:audit` antes de `source:audit` en `quality:cloudflare`.
- La auditoría comprueba 16 archivos críticos de la arquitectura v12.1.1 antes de continuar el build.

## Resultado de verificación local

- Versión: `2.1.1-d1-web`.
- Motor TypeScript: compilación correcta.
- Pruebas funcionales totales: **73/73 PASS**.
- Prueba determinística de malla/graduación/secciones: incluida y aprobada.
- Simulación masiva: **2.500 cohortes** incluidas en la suite y aprobadas.
- Sintaxis TS/TSX: **80 archivos, 0 errores**.
- Preflight: correcto; **14 migraciones D1**.
- Integridad de repositorio: **16/16 archivos críticos presentes**.
- Auditoría de código: correcta.
- Aislamiento e identidad: **12/12**.
- Seguridad SQL: **0 APIs raw inseguras y 3 interpolaciones estructurales controladas**.

Las tres advertencias del `source:audit` local corresponden únicamente a valores ficticios del `wrangler.jsonc` temporal utilizado para auditar el paquete.

## Recomendación de despliegue

Si el repositorio GitHub actual se construyó aplicando parches incrementales sobre una base anterior o incierta, reemplazarlo por el ZIP completo corregido. No aplicar el parche v12.1.0 → v12.1.1 sobre una base anterior a v12.1.0 consolidada.
