# Actualización GitHub Web — v10.31

Aplicar sobre v10.30.

## Objetivo
Corregir el arancel anual para que se calcule con estudiantes completos por año activo, sin convertir personas en fracciones por semestre.

## D1
No existe una nueva migración. Se mantienen las 10 migraciones existentes.

## Cloudflare
No reemplazar `wrangler.jsonc`, variables ni Secrets.

## Validación posterior
`/api/version` debe informar:
- `version`: `1.0.41-d1-web`
- `release`: `v10.31`

En un presupuesto de tres semestres, el segundo año debe cobrar arancel anual completo sobre los estudiantes activos del primer semestre de ese año.
