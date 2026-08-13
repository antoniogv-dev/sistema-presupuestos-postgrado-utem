# LEA ANTES DE SUBIR — v10.10 acumulativa

Este paquete vuelve a incluir las correcciones de v10.9 y agrega v10.10.

- Reemplace todos los archivos incluidos en su repositorio actual.
- No elimine archivos no incluidos.
- Este paquete **NO contiene `wrangler.jsonc`** para proteger el binding D1 y los Secrets productivos.
- Después del deploy revise `/api/version`: debe indicar `1.0.20-d1-web` / `v10.10`.
- La barra lateral debe mostrar `Versión Cloudflare D1 · v10.10`.
- Si sigue viendo `Descuentos matrícula` o `Matrícula neta`, el deployment aún no está usando v10.10.
