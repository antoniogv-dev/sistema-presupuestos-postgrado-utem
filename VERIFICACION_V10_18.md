# Verificación técnica v10.18

Versión: `1.0.28-d1-web` / `v10.18`.

## Pruebas realizadas

- Migraciones D1 0001 a 0008 aplicadas secuencialmente sobre SQLite limpio: correcto.
- Migración 0008 comprobada: 5 plantillas base, filas `PARAMETRO_ANUAL`, `SharedCourseEconomy`, `BudgetNotification`, modalidad y columnas sync/async: correcto.
- `node --test demo/tests/engine.test.mjs`: 12/12 pruebas aprobadas.
- Compilación TypeScript estricta del motor financiero, plantillas y exportadores: correcta.
- `preflight`: correcto con 8 migraciones usando configuración temporal de validación.
- `source:audit`: correcto; sólo advertencias esperadas de configuración temporal/placeholder.
- Prueba financiera específica: modalidad semipresencial con valores hora sincrónicos/asíncrónicos diferenciados: correcta.
- Economía de escala: una regla con un solo programa produce $0 de ahorro; al incluir dos programas, aplica el ahorro según porcentaje imputado: correcto.
- Generación XLSX real v10.18: importada correctamente; parámetros de modalidad y valores hora presentes; 0 errores `#REF!`, `#DIV/0!`, `#VALUE!`, `#NAME?` o `#N/A`.
- Generación PDF real v10.18: 5 páginas, A4 vertical, abrible y renderizada correctamente.
- Orden PDF verificado: portada, flujo, análisis financiero, parámetros.
- Relato financiero verificado visualmente: identificación, ingresos/incobrabilidad, costos, prorrateos/ajustes, resultado y conclusión.

## Limitación de validación local

No fue posible ejecutar el build integral Next.js + Prisma + OpenNext en este entorno porque `npm install` no completó dentro del tiempo disponible. Por ello, el build de Cloudflare continúa siendo la validación integral final de `typecheck`, `lint`, `vitest`, Next.js y OpenNext.
