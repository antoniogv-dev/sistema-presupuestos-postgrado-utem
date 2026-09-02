# Verificación v12.1.1

## Pruebas ejecutadas

- Compilación del motor TypeScript: correcta.
- Suite funcional completa: **74/74 aprobadas**.
- Pruebas determinísticas nuevas: **12/12 aprobadas**.
- Simulación exhaustiva A: **1.000/1.000 escenarios aprobados**.
- Simulación exhaustiva B (Tesis/AFE académica): **1.000/1.000 escenarios aprobados**.
- Migraciones D1 aplicadas en SQLite de prueba: **14/14**.
- Columna `courseSectionOverrides`: verificada.
- Auditoría SQL: **0 APIs raw inseguras; 3 interpolaciones estructurales controladas**.
- Auditoría de aislamiento/identidad: **12/12 controles aprobados**.
- Auditoría de código: correcta.
- Sintaxis TS/TSX: **80 archivos, 0 errores sintácticos**.

## Casos cubiertos explícitamente

- Horas autónomas extremadamente altas no alteran costos ni horas docentes.
- Tesis y AFE son detectadas como `GRADUACION`.
- Electivos y especialización admiten secciones base y override de cohorte.
- Tesis de Magíster Académico usa una sección por estudiante activo.
- Tesis de Doctorado usa una sección por estudiante activo.
- Override manual de Tesis prevalece sobre el automático sin modificar la malla maestra.
- Tesis en programa profesional conserva la sección base hasta un override.
- Obligatorias siempre se calculan con una sección.
- Asincronía aplica el factor sobre horas directas × semanas × secciones.
- Competencias genéricas permanecen fuera del flujo.
- Cero estudiantes en Tesis académica produce cero secciones y cero costo docente.
- Secciones de electivos/especialización actualizan los contadores semestrales del presupuesto.

## Limitación del entorno

El entorno local de auditoría no dispone del registro npm completo para reinstalar todas las dependencias y ejecutar `next build`/OpenNext. Por ello, el deployment final debe ejecutar el pipeline productivo `npm install --include=dev --no-audit --no-fund && npm run build:cloudflare` y aplicar la migración 0014 antes de promover la versión.
