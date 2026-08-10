# Corrección v10.5 — confirmar que GitHub despliega el login corregido

El log del 10-08-2026 identifica `sistema-presupuestos-postgrado-utem@1.0.13-d1-web` y falla exactamente en `app/login/page.tsx:15` con `return await response.json()...`.

Eso corresponde a v10.3, no a la v10.4 corregida. La v10.5 incorpora:

- `app/login/page.tsx` con type guard para `response.json(): unknown`.
- `package.json` versión `1.0.15-d1-web`.
- `preflight` que imprime la versión del proyecto y falla si detecta el login antiguo.
- `/api/version`, para verificar desde el navegador cuál release está realmente publicada.

Tras desplegar, el log debe contener:

`Versión del proyecto detectada: 1.0.15-d1-web`

Y la URL `/api/version` debe responder con `release: "v10.5"`.
