# Rechequeo técnico v12.0.2

La v12.0.2 mantiene el motor financiero y el design system de v12.0.1 y agrega controles de coherencia detectados en una segunda auditoría independiente.

## Endurecimientos aplicados

1. Cobertura de descuentos de matrícula <= estudiantes activos.
2. Periodos de descuentos ordenados cronológicamente.
3. Economías de escala con al menos dos programas distintos y presencia obligatoria del programa actual.
4. Asignaturas compartidas restringidas al horizonte académico real.
5. Selectores de periodo de la interfaz restringidos a combinaciones año-semestre efectivamente activas.
6. Eliminación de una comprobación duplicada de NOT_FOUND en la API de presupuesto.

No se modifican las fórmulas financieras, la forma de cálculo del overhead ni la persistencia D1.

## Resultado del rechequeo

- Motor TypeScript: compilación correcta.
- Pruebas Node totales: 60/60 aprobadas.
- Pruebas específicas v12.0.2: 5/5 aprobadas.
- Sintaxis TS/TSX: 80 archivos, 0 errores sintácticos.
- Imports locales: 80 archivos, 0 referencias faltantes.
- Preflight: correcto; 13 migraciones reconocidas.
- Source audit: correcto. Las únicas advertencias corresponden a valores deliberadamente ficticios del wrangler temporal de auditoría.
- Aislamiento e identidad: 12/12 controles aprobados.
- Demo HTML: sintaxis JavaScript correcta y carga HTTP local correcta.

## Límite de la verificación local

El entorno de auditoría no resuelve `registry.npmjs.org`, por lo que no fue posible reinstalar `node_modules` ni ejecutar aquí el `next build`/OpenNext completo. El pipeline `build:cloudflare` conserva como puerta final `db:generate`, `quality:cloudflare` y `opennextjs-cloudflare build`. El despliegue en Cloudflare debe confirmar esa última etapa antes de utilizar información oficial.
