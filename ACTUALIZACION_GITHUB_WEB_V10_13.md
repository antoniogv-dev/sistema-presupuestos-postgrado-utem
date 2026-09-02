# Actualización v10.13 desde GitHub web

Versión de aplicación: `1.0.23-d1-web`  
Versión funcional: `v10.13`

## Actualización recomendada

Use el ZIP incremental v10.13 sobre la instalación v10.12. El paquete no incluye `wrangler.jsonc`, por lo que no reemplaza el binding D1, variables ni Secrets productivos.

1. Abra el repositorio en GitHub.
2. Suba/reemplace los archivos contenidos en el ZIP incremental conservando sus rutas.
3. Verifique especialmente que exista `public/Portada2026.jpg`.
4. Haga commit, por ejemplo: `feat: portada PDF y parámetros completos v10.13`.
5. Espere el build y deploy automático de Cloudflare.

## Verificación

Abra `/api/version`. Debe devolver:

```json
{
  "version": "1.0.23-d1-web",
  "release": "v10.13"
}
```

Después compruebe:

- un costo manual muestra `Quitar` directamente dentro del flujo;
- el PDF comienza con la portada institucional y los datos del programa;
- el PDF muestra un anexo reducido de parámetros principales/informados;
- el Excel contiene las hojas `Flujo presupuestario` y `Parámetros completos`;
- la segunda hoja incluye estudiantes, horas, aranceles, descuentos y demás inputs completos.

No hay una migración D1 nueva en esta versión.
