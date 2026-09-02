# Verificación v12.1.1

- Versión: `v12.1.1 · 2.1.1-d1-web`.
- Motor TypeScript: compila correctamente.
- Suite Node completa: **73/73 PASS**.
- Pruebas curriculares determinísticas: **12/12 PASS**.
- Simulación masiva curricular: **2.500/2.500 cohortes PASS**.
- Migraciones SQLite/D1: **14 aplicadas correctamente** en base de prueba.
- Nuevo tipo `GRADUACION`: persistencia probada.
- Campo `curriculumSectionOverrides`: persistencia probada.
- Preflight: correcto.
- Source audit: correcto.
- Integridad de aislamiento e identidad: **12/12 PASS**.
- Auditoría SQL: correcta.

La prueba masiva verifica específicamente que las horas autónomas, incluso con valores extremos, no alteren la carga docente presupuestaria.
