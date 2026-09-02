# Sistema de Presupuestos de Postgrado UTEM — v12.1.0 consolidada

Versión técnica: `2.1.0-d1-web`.

## Decisión de versión

La v12.1.0 es una **entrega completa y autosuficiente**. Reemplaza la necesidad de instalar secuencialmente v12.0.0, v12.0.1 y v12.0.2. Su base funcional es v12.0.2 y conserva todas las correcciones de la serie v12.

## Motor financiero incluido

- Ledger semestral de ingresos.
- Motor anual de costos.
- Arancel anual legacy y arancel total del programa.
- Matrícula anual, única/especial y semestral.
- Distribución proporcional y personalizada del arancel.
- Descuentos diferenciados de arancel y matrícula.
- Incobrabilidad ajustable.
- Reconocimiento de matrícula.
- Financiamiento institucional.
- Overhead sobre la base institucional definida.
- Punto de equilibrio y matrículas equivalentes.
- Economías de escala entre programas.
- Malla curricular, carga docente, horas presenciales/sincrónicas/asincrónicas y factores.
- Planes anuales con uno o múltiples inicios para programas profesionales.
- Consolidación institucional aprobada y activa sin borradores.
- Exportaciones XLSX, PDF y memorándum.

## Coherencia y seguridad

- Control de aislamiento entre presupuestos.
- Descuentos de matrícula no pueden superar estudiantes activos.
- Rangos de descuento cronológicamente válidos.
- Economías de escala requieren al menos dos programas e incluyen el programa actual.
- Asignaturas compartidas restringidas al horizonte real.
- Selectores de periodo restringidos a semestres activos.
- Auditoría SQL integrada al pipeline mediante `npm run security:sql`.
- Prohibición automática de `$queryRawUnsafe` y `$executeRawUnsafe`.
- Sólo tres interpolaciones estructurales SQL permitidas y auditadas; los valores siguen parametrizados mediante `?` y `.bind(...)`.

## Nuevo sistema visual UTEM Finance Light

- Light Mode predeterminado.
- Dark Mode completo y persistente por usuario.
- Navegación lateral blanca, compacta e iconográfica.
- Barra superior translúcida con buscador funcional de módulos.
- KPIs financieros compactos con números tabulares.
- Panel ejecutivo de ingresos/egresos y estado del portafolio.
- Alertas visuales y progreso de aprobación.
- Tablas densas, badges compactos y campos más limpios.
- Azul institucional como acento principal, verde financiero y ámbar de advertencia.
- Bordes finos, sombras de baja intensidad y transiciones de 150 ms.

## Base de datos

No requiere una migración D1 adicional respecto de v12.0.2. Mantiene las 13 migraciones existentes.

## Despliegue recomendado

Usar este ZIP completo como fuente del repositorio. Conservar el `wrangler.jsonc` productivo del entorno y ejecutar el pipeline habitual:

`npm install --include=dev --no-audit --no-fund && npm run build:cloudflare`
