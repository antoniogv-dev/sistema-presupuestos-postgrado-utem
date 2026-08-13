# Cambios funcionales v10.12

## 1. XLSX con segunda hoja de trazabilidad

La exportación individual incorpora una hoja adicional llamada `Parámetros utilizados`, organizada por sección, parámetro, periodo, valor y unidad/detalle.

Se incluyen los valores efectivos usados por el motor financiero, no sólo los valores institucionales de referencia.

## 2. Parámetros incluidos

### Identificación y controles

Programa, código, tipo, facultad, director, centro de costo, cohorte, inicio, duración, estudiantes iniciales, estado, etapa, versión del programa, revisión interna, responsable, fuente del arancel, plantilla aplicada, becas habilitadas, reconocimiento de matrícula, arrastre y controles de costos compartidos.

### Parámetros anuales

Arancel, matrícula, hora docente directa, hora docente de reemplazo, guía de tesis, beca de manutención cuando corresponda, incobrabilidad, dirección, asistencia, otros honorarios no académicos, sus porcentajes de prorrateo, gastos operacionales, software, difusión, congresos y pasantías, libros y publicaciones, pasajes y fletes, viáticos, alimentos y bebidas, otros costos, overhead central, overhead de facultad, semestres activos y factor anual de arancel.

### Parámetros semestrales

Estudiantes activos, estudiantes en graduación, horas docentes directas, horas de reemplazo, electivos, secciones, cursos especializados y parámetros de becas cuando estén habilitadas.

### Descuentos, ingresos y costos

Cada descuento de arancel con porcentaje, estudiantes y vigencia; cada ingreso extraordinario con monto unitario, estudiantes, fuente y periodo; y cada costo/gasto manual con categoría, periodicidad, tipo y periodo.

## 3. PDF

El PDF mantiene el flujo presupuestario como primer bloque y agrega al final un anexo paginado de `Parámetros utilizados` con la misma información de trazabilidad del XLSX.

## 4. Alcance financiero

v10.12 no cambia las fórmulas financieras de v10.11. La mejora es documental y de auditoría de los datos que alimentan el cálculo.
