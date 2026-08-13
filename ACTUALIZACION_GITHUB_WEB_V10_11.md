# Actualización v10.11 desde GitHub web

Versión de aplicación: `1.0.21-d1-web`  
Versión funcional: `v10.11`

## Paquete recomendado

Use el ZIP incremental de v10.11 sobre la instalación actual. El paquete **no incluye `wrangler.jsonc`**, por lo que no reemplaza el binding D1, variables ni Secrets productivos.

## Procedimiento

1. Descargue y descomprima el ZIP incremental v10.11.
2. En GitHub, abra el repositorio productivo.
3. Cargue los archivos y carpetas del ZIP respetando exactamente sus rutas.
4. Confirme que se incorpora `migrations/0007_cashflow_editable_staff_and_costs.sql`.
5. Realice el commit, por ejemplo: `feat: flujo editable y staff v10.11`.
6. Espere el build y deploy automático de Cloudflare.
7. Revise que el deploy aplique la migración 0007 y termine sin errores.
8. Abra `/api/version`; debe informar `1.0.21-d1-web` y `v10.11`.
9. Abra un presupuesto y verifique el flujo antes de editar valores productivos.

## Verificación visual mínima

En el flujo de caja:

- no debe aparecer `Honorarios académicos adicionales`;
- deben aparecer `Dirección`, `Asistencia de dirección`, `Otros honorarios no académicos` y luego `HONORARIOS NO ACADÉMICOS (SUBTOTAL)`;
- las nueve categorías operacionales deben mostrarse como campos editables por año cuando el presupuesto permita edición;
- un costo nominado agregado en “Costos y gastos” debe aparecer bajo su categoría como `Incluido: <nombre>`;
- no debe existir un bloque separado llamado `Detalle de costos y gastos registrados`.

## D1

No ejecute SQL manualmente si el deploy de Wrangler aplicó correctamente `0007`. El sistema conserva los datos existentes y normaliza únicamente nombres históricos de categorías.
