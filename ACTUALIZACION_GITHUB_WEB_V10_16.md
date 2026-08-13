# Actualización v10.16 - Subtotales del flujo de caja

Versión: `1.0.26-d1-web` / `v10.16`.

## Aplicación

Use el paquete incremental acumulativo v10.16 sobre el repositorio actualmente desplegado. No reemplace `wrangler.jsonc`.

1. Copie/reemplace los archivos incluidos en el ZIP manteniendo sus rutas.
2. Haga commit en GitHub.
3. Espere el build y deploy automático de Cloudflare.
4. Verifique `/api/version`: debe informar `v10.16` y `1.0.26-d1-web`.
5. Abra un presupuesto y revise el flujo. Deben aparecer siempre los subtotales de Honorarios académicos, Honorarios no académicos y Otros gastos.
6. Agregue un costo con categoría `Equipamiento`: debe aparecer el subtotal Equipamientos. Al quitarlo y guardar, el subtotal desaparece si no queda otro equipamiento.
7. Agregue un costo con categoría `Becas y ayudas`: debe aparecer el subtotal Becas y ayudas. Si no existen becas o ayudas con monto, ese subtotal no debe mostrarse.

No se agrega una migración D1 en esta versión.
