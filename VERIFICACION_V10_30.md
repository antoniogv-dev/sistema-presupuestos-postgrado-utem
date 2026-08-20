# Verificación v10.30

- Compilación estricta del motor TypeScript (`tsc -p tsconfig.engine.json`): OK.
- Pruebas standalone ejecutadas: 25/25 OK.
- Prueba de huella SHA-256 de la plantilla versionada: OK.
- Prueba XLSX institucional con 13 asignaturas valorizables: OK.
- Prueba XLSX institucional con fórmulas y malla curricular: OK.
- `preflight`: OK con configuración temporal de prueba.
- `source:audit`: OK.
- Auditoría transversal de aislamiento e identidad: 12/12 OK.
- Plantilla v10.30 y plantilla mejorada v10.26: mismo SHA-256.
- La URL antigua no se utiliza para la descarga institucional.
- El flujo profesional ya no cae silenciosamente al exportador XLSX general.

La validación integral Next/OpenNext seguirá siendo ejecutada por Cloudflare durante el despliegue, porque el entorno local no conserva `node_modules`.
