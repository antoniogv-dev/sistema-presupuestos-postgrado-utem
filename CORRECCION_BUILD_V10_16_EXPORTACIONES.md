# Corrección de build v10.16

El build de Cloudflare se detenía en `source:audit` porque el paquete incremental v10.16 no incluía `lib/export/xlsx.ts` ni `lib/export/pdf.ts`, aunque la auditoría exigía las mejoras de exportación introducidas en v10.15.

Esta corrección agrega explícitamente:

- `lib/export/xlsx.ts`: primera hoja `Presupuesto completo`, parámetros completos visibles y hojas de trazabilidad.
- `lib/export/pdf.ts`: PDF A4 vertical completo, portada vertical y flujo dividido por bloques de años.
- `lib/export/download.ts`: integración con parámetros y portada.
- `public/Portada2026.jpg`: portada institucional.
- `scripts/source-audit.mjs`: auditoría acumulativa v10.16.

No modifica D1, migraciones, secretos ni `wrangler.jsonc`.

La versión permanece en `v10.16 / 1.0.26-d1-web` porque el despliegue anterior no alcanzó a completarse.
