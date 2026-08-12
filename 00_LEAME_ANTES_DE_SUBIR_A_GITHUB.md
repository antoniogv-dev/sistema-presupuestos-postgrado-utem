# Sistema de Presupuestos de Postgrado UTEM — v10.8

Para actualizar una instalación v10.7 ya operativa, use preferentemente:

`actualizacion-v10-8-parametros-profesionales-github-web.zip`

La guía exacta está en:

`ACTUALIZACION_GITHUB_WEB_V10_8.md`

La versión esperada después del despliegue es:

- aplicación: `1.0.18-d1-web`
- release: `v10.8`
- migraciones D1: `0001` a `0004`

La actualización conserva las correcciones de producción ya estabilizadas:

- PBKDF2: `100_000` iteraciones;
- Prisma: `prisma generate` sin `--no-engine`;
- binding D1: `DB`;
- autenticación y sesiones existentes.

No reemplace su `wrangler.jsonc` productivo si usa el paquete completo como referencia. El paquete incremental no incluye ese archivo.
