# Actualización GitHub web — v10.23

Versión: `1.0.33-d1-web`  
Release: `v10.23`

## Instalación recomendada

1. Parta desde la v10.22 corregida.
2. Suba el contenido del ZIP incremental v10.23 respetando las rutas.
3. No elimine ni reemplace su `wrangler.jsonc` productivo.
4. Haga commit y permita que Cloudflare ejecute el build normal.
5. Compruebe `/api/version` después del despliegue.

## Resultado esperado

```json
{
  "version": "1.0.33-d1-web",
  "release": "v10.23"
}
```

## Base de datos

No se agrega migración D1. La corrección es de identidad, selección, validación de APIs, plantillas, importación y workflow.

## Comprobación funcional inmediata

- Seleccione MGIB en `Programa`.
- La página debe cargar sólo una cohorte MGIB.
- `Identificación > Programa del presupuesto` debe mostrar `MGIB` y el nombre completo, sin selector editable.
- Cambiar de cohorte debe recargar toda la página desde D1.
- Una cohorte cuyo nombre comience con otro código de programa debe mostrar una advertencia de integridad y bloquear Guardar.
