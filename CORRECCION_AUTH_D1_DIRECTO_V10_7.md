# Corrección v10.7 — autenticación directa con D1

## Diagnóstico
`/api/auth/health` devuelve `AUTH_READY`, pero el primer login devuelve `AUTH_INTERNAL_ERROR` y la consulta del administrador no devuelve filas. La ruta de login v10.6 consultaba Prisma antes de aprovisionar el usuario bootstrap, por lo que una excepción del adapter impedía crear el administrador.

## Cambio
La ruta crítica de autenticación ahora usa directamente el binding D1:
- lectura de usuarios y roles;
- aprovisionamiento de `BOOTSTRAP_ADMIN_EMAIL`;
- asignación de roles;
- lectura de sesiones internas;
- creación de sesión del login.

Prisma se mantiene para el resto de la aplicación. No hay cambios de esquema ni migración nueva.

## Diagnóstico adicional
`/api/auth/login` registra ahora la etapa exacta: `CHECK_DATABASE`, `BOOTSTRAP_ADMIN`, `READ_USER`, `VERIFY_PASSWORD`, `CREATE_SESSION` o `SET_COOKIE`.
