# Decisiones y asuntos pendientes

## Decisiones implementadas

- Un presupuesto representa una cohorte.
- El arancel propio del programa prevalece sobre la plantilla correspondiente.
- La incobrabilidad se aplica después de descuentos y becas internas y no se registra como egreso.
- La matrícula se mantiene separada y no recibe incobrabilidad ni overhead.
- Doctorados y magísteres académicos no aplican overhead central ni de facultad.
- La guía de tesis se calcula por estudiantes en graduación y queda parametrizada por año y tipo de programa.
- Para evitar duplicidad anual, se utiliza el máximo de estudiantes en graduación informado entre los semestres del año.
- Los costos compartidos se normalizan por programa, año y categoría.
- La eliminación de producción es lógica y auditada.
- El rendimiento operacional anual corresponde a flujo neto anual ÷ total de ingresos del año.
- La persistencia productiva utiliza Cloudflare D1 y no PostgreSQL.
- Las migraciones D1 versionadas son la fuente de verdad del esquema.
- Las escrituras que afectan varias tablas utilizan batches atómicos nativos D1.
- Prisma no utiliza `$transaction` con D1.
- La primera instalación se administra desde GitHub web y Cloudflare web.
- La rama `main` es la única rama productiva durante la puesta en marcha inicial.

## Validaciones institucionales pendientes

- Valor oficial de guía de tesis por tipo de programa y año.
- Diferenciación contable definitiva entre guía de tesis y una eventual revisión externa de tesis.
- Regla definitiva cuando dos cohortes presentan montos distintos para un mismo costo compartido.
- Política de reconocimiento de matrícula ante retiros y suspensiones.
- Membrete, firmas y folio oficial para reportes finales.
- Personas concretas que asumirán V°B° y aprobación en producción.
- Política de respaldo, retención y recuperación de D1.
- Dominio institucional definitivo para Cloudflare Access.
- Revisión de seguridad y cumplimiento institucional antes de ingresar datos oficiales.
- Evaluación futura de una base D1 y Worker independientes para pruebas.
- Seguimiento de la condición Preview de Prisma con D1 antes de actualizaciones mayores.
