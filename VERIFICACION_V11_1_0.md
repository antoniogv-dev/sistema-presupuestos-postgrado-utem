# Verificación v11.1.0 — Arancel total y modalidades de matrícula

Versión técnica: `1.2.0-d1-web`.

## Controles ejecutados

- Compilación TypeScript del motor financiero: correcta.
- Transpilación sintáctica de UI, APIs, mappers, exportaciones y validaciones: correcta.
- Suite funcional Node: 45/45 pruebas aprobadas.
- Casos específicos de estructura de cobro: 7/7 pruebas aprobadas.
- XLSX institucional histórico: pruebas aprobadas; se conserva para `ANNUAL_LEGACY`.
- Preflight: Node 22, Prisma/OpenNext y 13 migraciones verificados.
- Source audit: correcto.
- Auditoría de aislamiento e identidad: 12/12 controles aprobados.
- Cadena de migraciones SQLite 0001–0013: correcta.

## Casos financieros comprobados

1. Programa de 3 semestres, inicio 1S, arancel total $6.000.000: 2/3 del ingreso en el primer año y 1/3 en el segundo.
2. Mismo programa con inicio 2S: 1/3 del ingreso en el primer año y 2/3 en el segundo.
3. Matrícula semestral: se cobra en cada semestre sin modificar el arancel total.
4. Matrícula única/especial: se cobra sólo al inicio.
5. Descuento de arancel no reduce matrícula; descuento de matrícula no reduce arancel.
6. Distribución personalizada 40%/35%/25% conserva el 100% del arancel total.
7. Cambiar el número de cuotas no altera el ingreso total.
8. Un presupuesto histórico sin los nuevos campos mantiene la lógica anual anterior.

## Migración requerida

Debe aplicarse `migrations/0013_program_total_billing.sql` a D1 antes de utilizar la nueva estructura de cobro en producción.
