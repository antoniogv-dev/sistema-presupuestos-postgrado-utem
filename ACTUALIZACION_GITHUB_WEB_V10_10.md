# Actualización acumulativa v10.10 desde GitHub web + Cloudflare

Esta actualización es **acumulativa**: vuelve a incluir las correcciones de v10.9 y agrega las de v10.10. Está pensada precisamente para evitar un despliegue parcial donde el Worker quede ejecutando componentes antiguos.

## Pasos

1. Use el paquete `actualizacion-acumulativa-v10-10-flujo-arancel-costos-github-web.zip`.
2. Copie/reemplace todos sus archivos en el repositorio actual.
3. **No reemplace `wrangler.jsonc`**: el paquete incremental no lo contiene.
4. Haga commit y espere el build/deploy de Cloudflare.
5. El deploy aplicará, si corresponde, las migraciones pendientes `0005` y `0006` mediante `db:migrations:apply`.
6. Compruebe `/api/version`. Debe responder `1.0.20-d1-web` y `v10.10`.
7. En la barra lateral debe verse `Versión Cloudflare D1 · v10.10`.
8. Abra un presupuesto de dos años y verifique:
   - `Alimentos y bebidas` aparece en Categoría de Costos y gastos;
   - `Matrícula anual (informativa, sin descuentos)` aparece una sola vez;
   - no existen `Descuentos matrícula` ni `Matrícula neta`;
   - los descuentos se aplican a `Arancel bruto` y no a matrícula;
   - `Arancel bruto` e `INGRESOS TOTAL (sin matrícula)` tienen valor en todos los años activos;
   - debajo del flujo aparece `Detalle de costos y gastos registrados`, con cada costo guardado y su impacto anual.

No modifique los Secrets del Worker ni los bindings D1 que ya están operativos.
