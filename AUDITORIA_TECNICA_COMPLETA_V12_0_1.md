# Auditoría técnica completa — v12.0.1

Versión funcional: `v12.0.1`  
Versión técnica: `2.0.1-d1-web`

## 1. Alcance

Se volvió a revisar la evolución estructural v12 desde cuatro perspectivas:

1. arquitectura y coherencia del motor financiero;
2. persistencia D1, API y validaciones server-side;
3. regresión funcional y exportaciones;
4. sistema visual enterprise y consistencia light/dark.

## 2. Arquitectura financiera verificada

El precio académico queda separado del calendario presupuestario mediante:

`Programa → estructura de cobro → ledger semestral de ingresos → agregación anual → costos → overhead → flujo acumulado`.

El motor conserva compatibilidad con `ANNUAL_LEGACY` y soporta `PROGRAM_TOTAL`, matrícula anual, única/especial y semestral.

Se verificó que:

- el arancel total no cambia por iniciar en 1S o 2S;
- la distribución proporcional y personalizada conserva el 100 % del arancel;
- el número de cuotas no modifica los ingresos;
- los descuentos de matrícula y arancel permanecen separados;
- el ledger semestral concilia con el flujo anual;
- la lógica histórica de presupuestos anteriores conserva sus resultados principales.

## 3. Hallazgos reales detectados y corregidos en v12.0.1

### 3.1 Normalización duplicada de costos manuales compartidos

En v12.0.0 un costo manual compartido de una categoría también normalizada automáticamente podía participar en ambas bases. Se separaron las bases automática y manual para que cada costo compartido se normalice una sola vez.

### 3.2 Periodicidad de costos compartidos

La normalización manual utilizaba el monto unitario. Ahora usa el monto anual efectivo y respeta periodicidad `Único`, `Semestral` y `Anual`.

### 3.3 Validación de distribución personalizada en servidor

La UI ya impedía guardar distribuciones que no sumaran 100 %, pero una llamada directa a la API podía eludir el control. Se incorporó `lib/validation/billing-config.ts` y la validación se aplica también en creación y actualización de presupuestos vía API.

### 3.4 KPI institucional de presupuestos activos

Se alineó el KPI con el consolidado activo. Sólo considera `En revisión`, `Observado` y `Aprobado`; los borradores quedan fuera.

### 3.5 Contraste visual en modo claro

Se corrigió el badge neutral para mantener contraste suficiente sobre superficies claras.

### 3.6 Limpieza menor

Se retiró una validación duplicada del porcentaje de economía de escala.

## 4. Pruebas realizadas

- Motor financiero v12 + correcciones v12.0.1: **10/10**.
- Compatibilidad de arancel total y modalidades de matrícula: **7/7**.
- XLSX institucional: **10/10**.
- Regresiones funcionales restantes: **28/28**.
- Total de pruebas funcionales ejecutadas: **55/55**.
- Auditoría sintáctica TypeScript/TSX: **79 archivos, 0 errores**.
- Auditoría transversal de aislamiento/identidad: **12/12**.
- D1: **13 migraciones reconocidas**, sin migración nueva para v12.0.1.
- Prueba aleatoria de invariantes `PROGRAM_TOTAL`: **500 escenarios, 0 fallos**.
- Preflight: **OK**.
- Source audit: **OK**; sólo advertencias por variables productivas de Cloudflare sustituidas por valores de prueba durante la auditoría.

## 5. Prueba aleatoria de invariantes

Se generaron 500 combinaciones con:

- duraciones entre 2 y 8 semestres;
- inicio en 1S o 2S;
- matrícula anual, única/especial o semestral;
- distribución proporcional o personalizada;
- distintos aranceles totales, estudiantes y cantidades de cuotas.

En todos los casos auditados:

- las participaciones semestrales sumaron 100 %;
- la suma del arancel unitario semestral coincidió con el arancel total del programa;
- el arancel bruto del ledger semestral coincidió con el arancel bruto agregado por año.

Resultado: **500/500 escenarios coherentes**.

## 6. Diseño enterprise auditado

El demo visual v12.0.1 representa el sistema de diseño implementado:

- fondo oscuro profundo `#0B0F17`;
- superficies `#111827`;
- bordes finos de baja opacidad;
- azul cobalto institucional como acento;
- verde esmeralda para resultados positivos y carmesí para déficit;
- números tabulares;
- KPI compactos y jerarquizados;
- tablas densas;
- barra superior y navegación persistentes;
- estados mediante badges discretos;
- modo claro equivalente;
- transiciones cortas y sin animaciones invasivas.

El demo es estático y no se conecta a D1; su objetivo es revisar densidad, jerarquía y estilo antes del despliegue.

## 7. Limitación de la auditoría local

El entorno de revisión no logró completar `npm install --include=dev` dentro del tiempo disponible en intentos previos. Por ello no se ejecutó localmente la etapa final `opennextjs-cloudflare build` de esta revisión.

Sí fueron ejecutados el motor TypeScript, las pruebas funcionales, preflight, source audit, auditoría de aislamiento y las comprobaciones aleatorias descritas arriba.

La compilación de Cloudflare debe considerarse la última comprobación a nivel de empaquetado/despliegue. Si esa compilación reporta un error, debe analizarse antes de promover la versión a producción.

## 8. Conclusión técnica

Después de la segunda auditoría y las correcciones incorporadas, la estructura v12.0.1 es coherente con la separación de dominios propuesta y no presenta errores funcionales conocidos en las pruebas ejecutadas. Se recomienda desplegar **v12.0.1**, no v12.0.0.
