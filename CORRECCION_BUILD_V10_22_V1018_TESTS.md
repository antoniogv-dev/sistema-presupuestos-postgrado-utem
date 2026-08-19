# Corrección build v10.22 – pruebas heredadas de v10.18

Cloudflare completó correctamente Prisma, preflight, auditoría, typecheck, lint, compilación del motor y 53 de 55 pruebas. El único bloqueo correspondía a dos expectativas antiguas en `tests/unit/v1018-features.test.ts`.

## Causa

Desde v10.22, en programas profesionales la referencia horaria efectiva y visible es `Hora sincrónica`. Por ello, valores históricos distintos en `directTeachingHourValue` o `asynchronousTeachingHourValue` no deben alterar el cálculo profesional. Las pruebas heredadas de v10.18 todavía esperaban tarifas distintas.

## Corrección

- La prueba semipresencial ahora verifica que las horas sincrónicas y asincrónicas utilizan la tarifa sincrónica efectiva del programa profesional.
- La prueba de economía de escala presencial ahora verifica que el ahorro usa la misma tarifa profesional visible, sin depender de un valor directo oculto.

No se modifica el motor financiero, D1, migraciones, Prisma, `wrangler.jsonc` ni Secrets.

La versión permanece en `v10.22 / 1.0.32-d1-web` porque el despliegue no había finalizado.
