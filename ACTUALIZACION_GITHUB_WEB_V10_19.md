# Actualización GitHub Web v10.19

Versión: `1.0.29-d1-web`  
Release: `v10.19`

## Forma recomendada

1. Parta desde la v10.18 corregida que ya está en su repositorio.
2. Descomprima `actualizacion-acumulativa-v10-19-consolidado-proyeccion-base-github-web.zip`.
3. Suba/reemplace los archivos conservando exactamente sus carpetas.
4. **No reemplace `wrangler.jsonc`.** El paquete incremental no lo contiene.
5. Haga commit, por ejemplo: `feat: v10.19 consolidado por estado y proyección base`.
6. Espere el build de Cloudflare.
7. Verifique `/api/version`; debe informar `1.0.29-d1-web` y `v10.19`.

## Verificaciones funcionales después del deploy

### Consolidado

- `Consolidado institucional · Aprobados`: sólo presupuestos Aprobados.
- `Consolidado institucional · Activos`: En revisión + Observado + Aprobado.
- Un Borrador no debe modificar ninguno de esos consolidados.

### Plantillas

1. Abra una plantilla existente.
2. En una fila inicial, por ejemplo `Asistencia de dirección`, elija el año base.
3. Cambie el valor base (por ejemplo de `$2.000.000` a `$3.000.000`).
4. Defina el reajuste anual.
5. Pulse `Proyectar reajuste desde valor base`.
6. Compruebe que los años posteriores se recalculan desde el nuevo monto, no desde el valor institucional anterior.
