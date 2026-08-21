# Actualización GitHub Web — v10.31

Versión: `1.0.41-d1-web`  
Release: `v10.31`

## Instalación

Aplique el ZIP incremental v10.31 sobre v10.30 respetando las rutas del repositorio.

No reemplace `wrangler.jsonc`, variables ni Secrets de producción. No existe una migración D1 nueva.

El paquete incorpora como nuevo archivo estático:

`public/templates/memorandum-presupuesto-base-v10-31.docx`

Después del despliegue confirme en `/api/version`:

```json
{
  "version": "1.0.41-d1-web",
  "release": "v10.31"
}
```

## Comprobación funcional recomendada

1. Abra una cohorte y presione `Generar memorándum`.
2. Confirme que el DOCX conserva el formato institucional y que el nombre descargado no contiene `%20`.
3. Presione `Exportar PDF`.
4. Confirme portada, flujo, relato económico-financiero y parámetros principales.
5. En un programa con una cohorte anterior aprobada, confirme la aparición de la tabla histórica.
6. En un programa sin historia aprobada, confirme que el PDF declare la ausencia de cohortes comparables sin inventar valores.
