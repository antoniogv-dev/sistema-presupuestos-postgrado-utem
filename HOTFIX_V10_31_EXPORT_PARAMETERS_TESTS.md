# Hotfix v10.31 — pruebas de exportación alineadas con el PDF actual

## Diagnóstico

El código productivo supera `preflight`, `source:audit`, `integrity:audit`, `typecheck`, `lint`, `test:engine`, `test:institutional-xlsx`, `test:curriculum` y `test:form-defaults`.

El build se detiene únicamente en `tests/unit/export-parameters.test.ts` por dos expectativas obsoletas:

1. La prueba antigua exigía que el PDF compacto excluyera por completo `Parámetros semestrales`. La implementación actual conserva sólo los parámetros semestrales significativos (por ejemplo estudiantes y horas docentes), coherente con el anexo de parámetros principales y valores con información.
2. La prueba antigua buscaba el título `Análisis económico-financiero de la cohorte` (y una sección histórica anterior). El PDF actual utiliza `Análisis financiero y principales consideraciones`, conforme al instructivo vigente del relato financiero.

## Alcance

Este hotfix reemplaza exclusivamente:

- `tests/unit/export-parameters.test.ts`

No modifica:

- motor financiero;
- fórmulas;
- PDF productivo;
- XLSX;
- D1;
- Prisma;
- migraciones;
- UI;
- `wrangler.jsonc`.

La versión permanece en v10.31 / 1.0.41-d1-web.
