# Sistema de Presupuestos de Postgrado UTEM — v10.32

Actualización recomendada desde v10.31:

`actualizacion-acumulativa-v10-32-importacion-parcial-github-web.zip`

La mejora hace tolerante la importación de presupuestos incompletos: los datos no reconocidos ya no bloquean la creación del Borrador y quedan señalados para revisión posterior.

Versión esperada después del despliegue:

- aplicación: `1.0.42-d1-web`
- release: `v10.32`
- migraciones D1: 10 (sin migración nueva)

No reemplace su `wrangler.jsonc` productivo. El paquete incremental no debe incluir ese archivo.
