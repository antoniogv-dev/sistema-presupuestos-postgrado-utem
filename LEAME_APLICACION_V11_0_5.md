# Aplicación hotfix v11.0.5

1. Copie el contenido del ZIP sobre la raíz del repositorio v11.0.4.
2. Conserve su `wrangler.jsonc` productivo; este paquete no lo incluye.
3. El despliegue debe aplicar la nueva migración D1 `0012_budget_bad_debt_rate.sql`.
4. Si su pipeline no aplica migraciones automáticamente, ejecute `wrangler d1 migrations apply DB --remote` antes de usar la nueva versión en producción.
5. Despliegue normalmente mediante el pipeline Cloudflare.

La nueva columna es nullable: los presupuestos históricos conservan la incobrabilidad institucional como fallback hasta que usted defina un porcentaje particular.
