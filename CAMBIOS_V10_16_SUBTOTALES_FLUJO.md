# Cambios v10.16 - Subtotales del flujo de caja

## Estructura de egresos

El flujo queda organizado en bloques de control:

1. Horas docentes directas, horas docentes de reemplazo y guía de tesis.
   - `HONORARIOS ACADÉMICOS (SUBTOTAL)`.
2. Dirección, asistencia de dirección y otros honorarios no académicos.
   - `HONORARIOS NO ACADÉMICOS (SUBTOTAL)`.
3. Gastos operacionales/bienes y servicios, software, difusión, congresos y pasantías, libros y publicaciones, pasajes y fletes, viáticos, alimentos y bebidas y otros costos y gastos.
   - `OTROS GASTOS (SUBTOTAL)`.
4. Equipamiento.
   - `EQUIPAMIENTOS (SUBTOTAL)` sólo si existe un monto de equipamiento.
5. Becas y ayudas monetarias.
   - `BECAS Y AYUDAS (SUBTOTAL)` sólo si existe un monto de becas/ayudas.
6. Overhead central y de facultad.
7. `TOTAL COSTOS Y GASTOS`.

Los subtotales no duplican montos: son agrupaciones de las líneas que ya conforman `totalExpenses`.

## Nuevas categorías

- `Equipamiento`.
- `Becas y ayudas`.

Ambas pueden utilizarse en costos manuales y plantillas. `Equipamiento` puede además marcarse como costo compartido entre cohortes.

## Exportaciones

`buildFinancialReport` utiliza la misma estructura, por lo que los subtotales se reproducen en XLSX y PDF. Los subtotales condicionales se omiten cuando no existe monto asociado.
