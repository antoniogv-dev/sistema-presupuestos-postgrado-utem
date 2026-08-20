# Actualización GitHub web — v10.25

Versión: `1.0.35-d1-web`  
Release: `v10.25`

## Aplicación
Reemplace los archivos incluidos en el paquete incremental sobre v10.24 corregida y haga commit. No se incorpora una migración D1 nueva.

## Verificación en Cloudflare
El build ejecutará adicionalmente `test:institutional-xlsx`, que valida el libro institucional antes del build OpenNext.

Después del despliegue, `/api/version` debe indicar `v10.25` y `1.0.35-d1-web`.
