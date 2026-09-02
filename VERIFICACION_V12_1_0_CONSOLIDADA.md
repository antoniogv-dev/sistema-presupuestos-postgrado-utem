# Verificación final — v12.1.0 consolidada

Versión funcional: `v12.1.0`  
Versión técnica: `2.1.0-d1-web`

## Alcance consolidado

Esta entrega integra en una sola base la evolución funcional de v12.0.x y el sistema visual UTEM Finance Light. Mantiene el motor financiero semestral, compatibilidad histórica, estructura de cobro flexible, malla curricular, economías de escala, punto de equilibrio, consolidación institucional, exportaciones, flujos de aprobación, controles de coherencia y endurecimiento de seguridad SQL.

## Resultado de controles locales

- Motor TypeScript (`tsconfig.engine.json`): correcto.
- Pruebas funcionales Node: **60/60 aprobadas**.
- Sintaxis TS/TSX: **80 archivos, 0 errores**.
- Preflight: correcto; **13 migraciones D1** reconocidas.
- Auditoría de código: correcta; las advertencias observadas corresponden únicamente al `wrangler.jsonc` temporal usado durante la auditoría con valores ficticios.
- Auditoría de aislamiento e identidad: **12/12 controles aprobados**.
- Auditoría SQL estática: **0 APIs raw inseguras y 3 interpolaciones estructurales controladas**.
- Demo HTML: JavaScript sintácticamente válido.

## Decisión de arquitectura visual

- Light Mode es la experiencia predeterminada.
- Dark Mode se mantiene completo, persistente y seleccionable por usuario.
- Navegación lateral clara, superficies blancas, bordes finos y acento azul institucional.
- KPI financieros densos con números tabulares.
- Analítica ejecutiva integrada en dashboard.
- Formularios y tablas conservan alta densidad de información sin alterar lógica ni datos.

## Base de datos

La versión v12.1.0 **no agrega una migración D1 adicional**. Conserva la cadena de 13 migraciones existente en v12.0.2.

## Puerta final de despliegue

El despliegue productivo debe conservar su `wrangler.jsonc` real y ejecutar la cadena habitual `npm install --include=dev --no-audit --no-fund && npm run build:cloudflare`. La etapa OpenNext/Cloudflare debe finalizar correctamente antes de promover la versión a producción.
