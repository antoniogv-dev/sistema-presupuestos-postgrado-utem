# Corrección de dependencias para Cloudflare Workers Builds

## Error corregido

La versión `@cloudflare/workers-types@4.20260801.0` no existe en npm.
Además, `next@15.2.4` no cumple el rango recomendado por la versión actual de `@opennextjs/cloudflare`.

## Versiones aplicadas

- `next`: `15.5.20`
- `eslint-config-next`: `15.5.20`
- `@cloudflare/workers-types`: `5.20260728.1`
- `@opennextjs/cloudflare`: se mantiene en `1.20.2`

## Después de subir el cambio

1. En Cloudflare, abra el Worker.
2. Vaya a `Settings > Build > Build cache`.
3. Seleccione `Clear Cache`.
4. Vuelva a ejecutar el despliegue.

Si Cloudflare insiste en realizar la instalación automática con un gestor distinto de npm:

1. Vaya a `Settings > Build > Build variables and secrets`.
2. Agregue `SKIP_DEPENDENCY_INSTALL=1`.
3. Cambie el comando de construcción a:

```bash
npm install --include=dev && npm run build
```

El comando de despliegue se mantiene como:

```bash
npm run deploy
```
