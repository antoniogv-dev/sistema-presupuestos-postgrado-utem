# Corrección de autenticación v10.2

Esta versión corrige dos problemas de diagnóstico y uno de runtime:

1. `PrismaClient` ya no se conserva en `globalThis`. Cada llamada obtiene un cliente asociado al binding D1 del request actual, evitando reutilizar objetos de I/O entre invocaciones de Cloudflare Workers.
2. El login distingue respuestas JSON, respuestas HTML/no JSON, errores HTTP y errores de red.
3. Se agrega `GET /api/auth/health` para comprobar sin exponer secretos si D1, la migración 0003, los roles y las variables bootstrap están disponibles.

Después del despliegue, abra `/api/auth/health`. El estado esperado es `AUTH_READY`.
