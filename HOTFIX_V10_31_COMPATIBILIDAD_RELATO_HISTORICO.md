# Hotfix v10.31 — compatibilidad del relato financiero e histórico

Este hotfix corrige una incompatibilidad de interfaz entre `financial-narrative.ts` y las versiones actuales de `download.ts`, `pdf.ts` y las pruebas de exportación.

## Qué corrige

- Exporta `NarrativeTable`.
- Exporta `HistoricalCohortSnapshot`.
- Exporta `buildHistoricalCohortSnapshots(...)` con firma compatible entre revisiones.
- `FinancialNarrative` incorpora `comparisonTable` opcional.
- `buildFinancialNarrative(...)` admite un cuarto argumento opcional con fotografías históricas.
- Mantiene íntegro el relato financiero exigido por `source:audit`.
- No modifica motor financiero, D1, XLSX institucional, PDF renderer, `download.ts`, `pdf.ts`, Prisma ni migraciones.

## Instalación

Copiar únicamente:

`lib/export/financial-narrative.ts`

sobre el archivo del mismo nombre del repositorio actual.

La versión sigue siendo `1.0.41-d1-web / v10.31`.
