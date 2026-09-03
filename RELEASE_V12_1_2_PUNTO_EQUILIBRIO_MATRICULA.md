# Sistema de Presupuestos de Postgrado UTEM — v12.1.2

Versión técnica: `2.1.2-d1-web`.

## Corrección principal

Se corrige el punto de equilibrio de Magísteres Profesionales para incorporar la matrícula y para que la plataforma y el Excel institucional usen la misma regla financiera.

La fórmula de referencia es:

```excel
=LET(costosFijos;ABS(SUMA('FLUJO TOTAL'!B37:D37)-SUMA('FLUJO TOTAL'!B36:D36)-SUMA('FLUJO TOTAL'!B10:D10));aporteArancel;SUMAPRODUCTO(Parámetros!B4:D4;1-Parámetros!B12:D12;1-Parámetros!B13:D13-Parámetros!B14:D14);aporteMatricula;(SUMA(Parámetros!B5:D5)-SUMA(Parámetros!B8:D8))*(B6/B7);costosFijos/(aporteArancel+aporteMatricula))
```

En OOXML el archivo se guarda con nombres de funciones en inglés (`LET`, `SUM`, `SUMPRODUCT`) y separadores por coma; Excel lo localiza automáticamente al abrirlo.

## Mejoras incorporadas

1. **Horizonte completo:** se suman todos los años presupuestarios de la cohorte.
2. **Costos fijos correctos:** se excluyen overhead central, overhead de facultad y guía de tesis variable.
3. **Aporte de arancel:** arancel efectivo × (1-incobrabilidad) × (1-overhead central-overhead facultad).
4. **Aporte de matrícula:** matrícula total por estudiante menos guía de tesis unitaria, ajustada por estudiantes reales / matrículas equivalentes.
5. **Cohortes que parten en 2S:** el Excel usa el periodo que realmente cobra arancel para determinar estudiantes y equivalencias, evitando promedios semestrales artificiales.
6. **Consistencia plataforma–Excel:** el valor cacheado del XLSX se obtiene del mismo motor que la interfaz y la fórmula queda disponible para recálculo en Excel.
7. **Trazabilidad:** el desglose del punto de equilibrio expone costos fijos, aporte arancel y aporte matrícula.
8. **Sin falsos aportes:** ingresos extraordinarios, financiamiento institucional y arrastre no disminuyen el umbral.

No requiere una nueva migración D1.
