# Hotfix v10.31 — sincronización del relato financiero

## Causa
El paquete incremental original de v10.31 actualizaba `scripts/source-audit.mjs`, pero no incluía `lib/export/financial-narrative.ts`.
Si el repositorio conservaba una copia anterior del relato, Cloudflare detenía `source:audit` con estos mensajes:

- falta `Análisis financiero y principales consideraciones`
- falta `Conclusión financiera`
- falta `equilibrio financiero de bajo margen`

## Corrección
Este hotfix fuerza la sincronización de:

- `lib/export/financial-narrative.ts`
- `scripts/source-audit.mjs`
- `tests/unit/v1018-features.test.ts`

No modifica el motor financiero, D1, migraciones, Prisma, bindings ni Secrets.
La versión continúa siendo `1.0.41-d1-web / v10.31`.
