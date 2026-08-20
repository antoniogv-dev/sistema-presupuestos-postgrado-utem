# Actualización GitHub Web — v10.30

Aplicar sobre v10.29.

Cambios principales:
1. reemplazo de la carga cacheable de la plantilla XLSX por una plantilla física versionada;
2. verificación SHA-256 de la plantilla antes de exportar;
3. eliminación del fallback silencioso al XLSX antiguo para Magísteres Profesionales;
4. soporte de 13 asignaturas valorizables en el formato institucional.

No contiene ni requiere una nueva migración D1.
No reemplazar `wrangler.jsonc`, variables ni Secrets de producción.

Después del despliegue `/api/version` debe informar `1.0.40-d1-web` y `v10.30`.
