# Corrección v10.4 — tipado seguro de respuesta de login

## Problema
TypeScript detuvo el build con `TS2322: Type 'unknown' is not assignable to type 'LoginResponseBody'` en `app/login/page.tsx`.

## Corrección
La respuesta de `response.json()` se captura explícitamente como `unknown` y se valida mediante `isLoginResponseBody` antes de retornarla.

También se agregó una regla a `scripts/source-audit.mjs` para impedir que vuelva a introducirse el patrón inseguro `return await response.json().catch(...)` en funciones con retorno tipado.

No requiere migración D1 ni cambios de secretos.
