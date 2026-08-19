# Verificación técnica v10.22

Versión: **1.0.32-d1-web / v10.22**

## Validaciones ejecutadas

1. `tsc -p tsconfig.engine.json`: correcto.
2. Tipado estricto aislado del importador (`budget-file-import.ts`): correcto.
3. Tipado estricto del conjunto de pruebas del motor con declaraciones mínimas de Vitest: correcto.
4. Sintaxis TypeScript/TSX de BudgetWorkspace, Importar/Exportar, importador, motor, reporte y versión: correcta.
5. `preflight`: correcto con 9 migraciones.
6. `source:audit`: correcto; sólo advertencias de configuración local deliberadamente usada para la verificación.
7. 12/12 pruebas autónomas del motor (`demo/tests/engine.test.mjs`): aprobadas.
8. Migraciones 0001 a 0009 aplicadas secuencialmente sobre SQLite limpio: correctas.
9. Migración 0009 probada sobre presupuesto profesional histórico:
   - matrícula 2027: 201.758 -> 192.150;
   - matrícula 2028: 211.846 -> 201.758;
   - gastos operacionales, software y difusión sembrados -> 0.
10. Cálculo profesional:
   - matrícula 2027 = 192.150;
   - matrícula 2028 = 201.758;
   - manutención mensual = 0;
   - tarifa profesional interna sincronizada a la tarifa sincrónica visible.
11. Punto de equilibrio de prueba:
   - umbral exacto ≈ 5,0135 matrículas equivalentes;
   - umbral operativo = 5,02;
   - ≈ 6 estudiantes a arancel completo;
   - flujo simulado con 5,02 = $34.211, no negativo y cercano a cero.
12. Importación CSV genérica:
   - reconocimiento de programa, cohorte, año, semestre, duración, estudiantes y tabla semestral: correcto.
13. Importación CSV con tablas independientes:
   - descuento: reconocido;
   - costo `Alimentos y bebidas`: reconocido;
   - ingreso extraordinario: reconocido.

## Validación pendiente deliberada
La muestra externa de presupuesto anunciada por el usuario aún no está incorporada a esta versión. Cuando sea proporcionada, debe utilizarse para añadir alias y pruebas de regresión específicas del formato real, sin sustituir las reglas genéricas existentes.

## Build integral
No se pudo completar `npm install` dentro del tiempo del entorno local. El build completo Next.js/OpenNext queda como validación final de Cloudflare.
