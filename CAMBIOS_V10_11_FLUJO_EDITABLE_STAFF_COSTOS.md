# Cambios funcionales v10.11

## 1. Estructura de honorarios

Se elimina la línea `Honorarios académicos adicionales` del flujo.

Los costos académicos visibles quedan limitados a:

- Horas docentes directas.
- Horas docentes de reemplazo.
- Guía de tesis.

`Honorarios no académicos` deja de ser un gasto independiente y pasa a ser un subtotal compuesto por:

- Dirección.
- Asistencia de dirección.
- Otros honorarios no académicos.

Los tres componentes se muestran individualmente antes del subtotal.

## 2. Otros honorarios no académicos

Se incorpora un valor anual específico para `Otros honorarios no académicos`. En programas profesionales puede marcarse como prorrateable y definir el porcentaje aplicable por año, con la misma lógica utilizada para Dirección y Asistencia de dirección.

## 3. Categorías editables directamente en el flujo

Quedan editables por año:

- Gastos operacionales / Bienes y servicios.
- Software y licencias.
- Difusión.
- Congresos y pasantías.
- Libros y publicaciones.
- Pasajes y fletes.
- Viáticos.
- Alimentos y bebidas.
- Otros costos y gastos.

El valor de cada celda representa el total anual de la categoría, incluyendo sus costos nominados.

## 4. Integración de costos nominados

La sección `Costos y gastos` sigue siendo el lugar para crear, nombrar, clasificar, periodificar o eliminar un costo específico. Sin embargo, la visualización financiera ya no utiliza una tabla de detalle separada.

Cada costo nominado se incorpora inmediatamente al subtotal de su categoría y se muestra debajo de ella en el propio flujo como una fila `Incluido:`. Esa fila es informativa: el monto ya está contenido en el subtotal y no se suma una segunda vez.

## 5. Persistencia

La migración `0007_cashflow_editable_staff_and_costs.sql` agrega a `BudgetAnnualOverride` las bases anuales editables y parámetros de Otros honorarios no académicos. Los presupuestos existentes conservan sus registros; los valores nuevos ausentes se reconstruyen desde los parámetros institucionales vigentes cuando corresponda.

## 6. Compatibilidad de categorías históricas

La migración y el mapper normalizan categorías antiguas, por ejemplo:

- `Honorarios no académicos` → `Otros honorarios no académicos`.
- `Asistencia` → `Asistencia de dirección`.
- `Gastos operacionales` / `Bienes y servicios` → `Gastos operacionales / Bienes y servicios`.
- `Software` → `Software y licencias`.
- `Congresos` / `Pasantías` → `Congresos y pasantías`.
- `Otros` → `Otros costos y gastos`.

Los antiguos `Honorarios académicos` manuales se preservan como `Otros costos y gastos` para no perder montos históricos, pero no generan una línea de honorarios académicos adicionales.

## 7. Exportaciones

El modelo XLSX/PDF se alinea con la estructura principal del flujo v10.11: staff desagregado con subtotal, categorías operacionales directas y ausencia de la línea eliminada.
