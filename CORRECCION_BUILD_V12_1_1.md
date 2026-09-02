# Corrección de despliegue v12.1.1 — integridad del repositorio

El build de Cloudflare informado el 2 de septiembre de 2026 se detuvo en `source:audit` porque el repositorio clonado no contenía `lib/finance/revenue-engine.ts`.

El archivo forma parte de la arquitectura v12 y sí está incluido en esta entrega completa. `lib/calculations/budget-engine.ts` depende de él, por lo que no debe eliminarse ni omitirse al subir el proyecto a GitHub.

## Corrección

1. Se entrega nuevamente el repositorio **completo**, no sólo el parche incremental.
2. Se incorpora `npm run repository:audit` al pipeline `quality:cloudflare`.
3. La auditoría verifica la presencia de los archivos críticos del motor financiero, malla curricular v12.1.1, Planes Anuales y migraciones 0013/0014 antes de continuar.
4. Si un upload a GitHub queda incompleto, el build informará la lista exacta de archivos faltantes.

## Importante

El parche incremental `v12.1.0 → v12.1.1` sólo debe aplicarse cuando el repositorio base sea efectivamente la v12.1.0 consolidada. Si existe cualquier duda sobre la base de GitHub, use el ZIP completo corregido.
