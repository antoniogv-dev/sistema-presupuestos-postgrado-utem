# Actualización GitHub web v10.26

Versión: `v10.26 / 1.0.36-d1-web`.

## Objetivo

Incorporar la malla curricular como dato maestro del programa, permitir su importación/edición, derivar la carga docente desde ella y utilizar el Excel institucional mejorado como plantilla de exportación para los Magísteres Profesionales compatibles.

## Actualización recomendada

1. Sobrescribir en GitHub los archivos incluidos en `actualizacion-acumulativa-v10-26-malla-curricular-importacion-github-web.zip`.
2. No reemplazar `wrangler.jsonc` ni Secrets de Cloudflare.
3. Aplicar la migración D1 `0010_program_curriculum.sql` a la base de producción antes de utilizar la edición/importación de mallas.
4. Ejecutar el despliegue habitual de Cloudflare.
5. Confirmar `/api/version`: debe informar `1.0.36-d1-web` y `v10.26`.

## Migración D1

La compilación `npm run build:cloudflare` valida la existencia de la migración, pero no sustituye la aplicación de la migración a la base remota. Debe ejecutar el procedimiento de migraciones que ya utiliza el proyecto (por ejemplo `npm run db:migrations:apply`, cuando el entorno Wrangler esté configurado) o aplicar `migrations/0010_program_curriculum.sql` desde D1.

La migración crea `ProgramCourse` y no elimina ni transforma presupuestos existentes.

## Compatibilidad

Los programas existentes pueden continuar sin malla. Para los programas nuevos, la interfaz exige incorporar al menos un registro curricular antes de crear el programa. Los presupuestos existentes sólo adoptan la malla cuando se utiliza `Aplicar malla curricular`; no se reescriben silenciosamente.

## XLSX institucional

Se conserva el modelo institucional de cinco hojas. El formato exacto se utiliza en Magísteres Profesionales que caben en la geometría del modelo (hasta 12 asignaturas con costo y 3 competencias genéricas). Si una malla excede esa capacidad, la plataforma usa la exportación general para no truncar información.
