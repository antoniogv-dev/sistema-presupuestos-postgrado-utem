# Actualización v10.9 desde GitHub web + Cloudflare

1. Use el paquete incremental `actualizacion-v10-9-flujo-costos-arancel-github-web.zip`.
2. Copie/reemplace los archivos en el repositorio conservando el `wrangler.jsonc` productivo actual.
3. Haga commit y espere el build/deploy de Cloudflare.
4. El deploy ejecutará la nueva migración `0005_cashflow_costs_and_annual_tuition.sql` mediante `db:migrations:apply`.
5. Compruebe `/api/version`: debe indicar `1.0.19-d1-web`.
6. Abra un presupuesto y verifique:
   - categoría Alimentos y bebidas;
   - arancel anual en todos los años activos;
   - ausencia de Descuentos matrícula y Matrícula neta en el flujo;
   - presencia de todas las categorías de costos y gastos en el flujo.

No reemplace los Secrets del Worker ni vuelva a ejecutar manualmente las migraciones ya aplicadas.
