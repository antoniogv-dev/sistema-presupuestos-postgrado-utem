# Actualización v10.20 — Plantillas profesionales y matrícula

Versión: **v10.20 / 1.0.30-d1-web**

Esta actualización debe aplicarse sobre la v10.19.

## Cambios principales

1. Las plantillas de Magíster Profesional se pueden modificar y guardar nuevamente.
2. El guardado se verifica contra D1 antes de mostrar confirmación en pantalla.
3. Se corrige el cálculo de matrícula anual de programas profesionales.
4. La matrícula se cobra una sola vez por cada bloque de dos semestres desde el ingreso de la cohorte, incluso cuando el programa comienza en 2S.
5. Los descuentos se aplican sólo al arancel, nunca a la matrícula.
6. La matrícula continúa siendo informativa y no se suma a `INGRESOS TOTAL`.
7. Registros históricos con matrícula anual en cero recuperan la referencia anual correspondiente.

## GitHub web

Suba el contenido del ZIP incremental conservando la misma estructura de carpetas y acepte reemplazar los archivos existentes. El paquete **no contiene `wrangler.jsonc`**.

Commit sugerido:

`fix: corrige plantillas profesionales y matrícula v10.20`

## Cloudflare

No se requiere cambiar Variables, Secrets, D1 ni configuración de build. No existe una migración D1 nueva para esta versión.

Al terminar el despliegue, verifique:

`/api/version`

Debe devolver `1.0.30-d1-web` y `v10.20`.

## Comprobación funcional recomendada

- Abra una plantilla de Magíster Profesional, modifique un valor, pulse **Guardar cambios** y compruebe el mensaje de guardado verificado y el incremento de versión.
- Abra un presupuesto profesional de cuatro semestres y confirme que exista una matrícula por cada bloque anual de dos semestres.
- En una cohorte que inicia en 2S, compruebe que los cobros correspondan al semestre de ingreso y al mismo semestre del año siguiente, sin cobro adicional al tercer año parcial.
