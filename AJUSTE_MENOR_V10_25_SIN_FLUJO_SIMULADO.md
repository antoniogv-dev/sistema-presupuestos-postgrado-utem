# Ajuste menor v10.25 — Punto de equilibrio

Se elimina la expresión **“flujo simulado”** de la presentación de matrículas equivalentes y punto de equilibrio.

Cambios aplicados:

- Pantalla `Presupuestos > Resumen financiero`: ahora muestra sólo el umbral de matrículas equivalentes y su aproximación a estudiantes a arancel completo.
- Trazabilidad exportable: se conserva el umbral exacto, sin mostrar el flujo simulado.
- Relato financiero del PDF: se mantiene el punto de equilibrio y su equivalencia aproximada en estudiantes, sin mencionar flujo final simulado.
- El cálculo interno del punto de equilibrio no cambia.
- `source:audit` incorpora una barrera para impedir que la expresión vuelva a introducirse en estos tres componentes.

No hay cambios en D1, Prisma, migraciones, fórmulas financieras ni la exportación XLSX institucional v10.25.
