# Evolución estructural v12.0.0

## Arquitectura financiera

La versión v12 reemplaza el enfoque de cálculo anual monolítico por una secuencia estable:

1. **Precio académico:** define arancel anual histórico o arancel total del programa.
2. **Distribución semestral:** genera la participación de cada semestre activo.
3. **Ledger de ingresos:** valoriza por semestre arancel, descuentos, becas, incobrabilidad y matrícula.
4. **Reconocimiento anual:** agrega el ledger según el año calendario de cada semestre, sin modificar el precio.
5. **Motor de costos:** calcula docencia, tesis, staff, costos operacionales, becas y economías de escala.
6. **Política de overhead:** se aplica exclusivamente sobre la base institucional definida para arancel.
7. **Flujo:** integra ingresos, egresos, arrastre y saldo acumulado.

`budget-engine.ts` actúa como orquestador y mantiene la API pública `calculateBudget`.

## Diseño visual

El sistema adopta un design system enterprise/fintech: fondo `#0B0F17`, tarjetas `#111827`, azul cobalto `#2563EB`, verde `#10B981`, carmesí `#F43F5E`, texto secundario `#94A3B8`, bordes blancos al 8%, números tabulares, tablas compactas, barra superior con blur y transiciones máximas de 150–200 ms.

Se incorpora modo claro opcional sin alterar la preferencia dark premium por defecto.

## Compatibilidad

No se agrega migración D1. Los presupuestos históricos continúan usando `ANNUAL_LEGACY` y `ANNUAL`; una prueba de regresión compara valores clave de v11.1.0 y v12.0.0.
