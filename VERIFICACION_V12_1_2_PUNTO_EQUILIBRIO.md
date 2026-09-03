# Verificación v12.1.2 — Punto de equilibrio con matrícula

Versión funcional: `v12.1.2`  
Versión técnica: `2.1.2-d1-web`

## Corrección verificada

El punto de equilibrio de Magísteres Profesionales queda definido como:

- `costos fijos`: costos totales del horizonte menos overhead central, overhead de facultad y guía de tesis variable;
- `aporte arancel`: arancel efectivo por año × (1 − incobrabilidad) × (1 − overhead central − overhead facultad);
- `aporte matrícula`: (matrícula del horizonte − guía de tesis por estudiante) × (estudiantes reales / matrículas equivalentes);
- `punto de equilibrio`: costos fijos / (aporte arancel + aporte matrícula).

El XLSX institucional conserva al menos el rango `B:D` solicitado por Postgrado y exporta la fórmula OOXML equivalente:

```text
LET(costosFijos,ABS(SUM('FLUJO TOTAL'!B37:D37)-SUM('FLUJO TOTAL'!B36:D36)-SUM('FLUJO TOTAL'!B10:D10)),aporteArancel,SUMPRODUCT(Parámetros!B4:D4,1-Parámetros!B12:D12,1-Parámetros!B13:D13-Parámetros!B14:D14),aporteMatricula,(SUM(Parámetros!B5:D5)-SUM(Parámetros!B8:D8))*(B6/B7),costosFijos/(aporteArancel+aporteMatricula))
```

Excel mostrará los nombres de funciones y separadores de acuerdo con la configuración regional del usuario.

## Controles ejecutados

- Compilación TypeScript del motor (`tsconfig.engine.json`): **correcta**.
- Pruebas específicas v12.1.2 del motor: **3/3 aprobadas**.
- Pruebas del XLSX institucional: **10/10 aprobadas**.
- Pruebas históricas del motor, facturación, cohorte, consolidación y currículo: **59/59 aprobadas**.
- Total de pruebas Node ejecutadas: **72/72 aprobadas**.
- Caso controlado: **9,45 matrículas equivalentes → 10 estudiantes**, aprobado.
- Preflight: **correcto**, Node 22 y **14 migraciones D1** reconocidas.
- Auditoría de fuentes: **correcta** usando una configuración local no productiva de `wrangler.jsonc` sólo para validación.
- Auditoría transversal: **12/12 controles aprobados**.
- Auditoría SQL: **0 APIs raw inseguras; 3 interpolaciones estructurales controladas**.
- Auditoría de integridad de repositorio: **18/18 archivos críticos presentes**.

## Nota de despliegue

El ZIP base v12.1.1 verificado no incluía `wrangler.jsonc`; por seguridad se mantiene el mismo criterio en esta entrega. Antes de reemplazar el repositorio, conserve su `wrangler.jsonc` productivo y los secrets de Cloudflare y restáurelos después de copiar la v12.1.2.

No existe una migración D1 nueva en esta versión.

La comprobación completa `tsc --noEmit` de la aplicación Next.js requiere instalar las dependencias del proyecto (`node_modules`); en el entorno de empaquetado no fue posible completar esa instalación. El motor financiero y los módulos de exportación sí fueron compilados y probados directamente.
