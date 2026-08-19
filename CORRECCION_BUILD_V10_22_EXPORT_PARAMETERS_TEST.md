# Corrección de build v10.22 — export-parameters.test.ts

## Causa

La v10.22 cambió deliberadamente la regla de exportación para programas profesionales: el parámetro anual visible es `Valor hora docencia sincrónica` y no `Valor hora docencia presencial`.

El código productivo ya aplicaba correctamente esa regla, pero la primera prueba de `tests/unit/export-parameters.test.ts` conservaba la expectativa anterior y provocaba el único fallo del build de Cloudflare.

## Corrección

La prueba ahora exige:

- presencia de `Valor hora docencia sincrónica` para el presupuesto profesional de demostración;
- ausencia de `Valor hora docencia presencial` en ese mismo caso;
- conservación de las restantes verificaciones de trazabilidad del XLSX.

No cambia ninguna fórmula financiera, migración D1, API, UI, Prisma, secreto ni configuración de Cloudflare.

La versión permanece en `v10.22 / 1.0.32-d1-web`, ya que el despliegue anterior no llegó a completarse.

## Verificación local

Se compiló el motor/exportadores con TypeScript 5.8.3 en modo estricto y se ejecutaron las mismas aserciones de la prueba corregida sobre `demoBudget`. Resultado: `v10.22 export parameter assertions: OK`.
