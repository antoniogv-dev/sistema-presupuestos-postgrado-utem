# Actualización GitHub Web — v10.32

Versión: `1.0.42-d1-web`  
Release: `v10.32`

## Objetivo

Hacer que la importación de presupuestos sea tolerante a información incompleta. Un archivo puede importarse igualmente como `Borrador` cuando falten datos que no pudieron reconocerse automáticamente, dejando trazabilidad explícita de esos pendientes para completarlos posteriormente.

## Aplicación

Aplique el ZIP incremental v10.32 sobre v10.31 respetando las rutas del repositorio.

No reemplace `wrangler.jsonc`, variables ni Secrets de Cloudflare. Esta versión no agrega migraciones D1.

## Resultado esperado

1. Al analizar un archivo, el sistema intenta inferir el año de inicio desde la cohorte, nombre del archivo, semestres reconocidos o primer año de parámetros anuales.
2. Si faltan estudiantes iniciales, duración o semestre, la vista previa lo informa pero no bloquea la importación.
3. El botón cambia a `Importar como borrador con pendientes` cuando quedan campos no reconocidos.
4. El presupuesto se crea en estado `Borrador` utilizando valores provisionales seguros cuando son necesarios.
5. Los campos faltantes se escriben en las notas del presupuesto y se muestran como advertencia visible al abrir la formulación.
6. Si el alta inicial del Borrador funciona pero falla parte del detalle importado, el Borrador se conserva y el sistema informa qué parte requiere revisión, en vez de reportar falsamente que toda la importación falló.
7. Cuando el programa no fue reconocido automáticamente pero se selecciona manualmente, deja de mostrarse como pendiente de programa.

## Verificación

Después del despliegue, `/api/version` debe informar:

```json
{
  "version": "1.0.42-d1-web",
  "release": "v10.32"
}
```
