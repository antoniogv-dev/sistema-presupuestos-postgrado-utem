# Cambios v10 — mejoras funcionales solicitadas

## Resumen

Esta versión corrige los problemas detectados durante la implementación en Cloudflare D1 y reemplaza pantallas que aún dependían de datos demostrativos por operaciones reales contra D1.

## 1. Programas

### Alta de programas
- `Agregar programa` crea un registro real en D1.
- En la misma operación se guardan los aranceles anuales y la auditoría.
- Se valida código duplicado y los datos obligatorios.
- Los usuarios con rol `CREADOR`, `GESTOR` o `ADMIN` pueden crear.

### Modificación
- Se incorporó `Modificar programa` por fila.
- Permite editar código, nombre, tipo, facultad, director, duración, estado, centro de costo y aranceles.
- La modificación requiere `GESTOR` o `ADMIN`.

### Filtros
- Búsqueda por código, nombre, director o facultad.
- Selector de tipo y estado.
- Botón explícito `Aplicar filtros`.
- Botón `Limpiar`.

### Plantillas de arancel
Se puede seleccionar:
- Arancel propio.
- Plantilla Doctoral.
- Plantilla Magíster Académico.
- Plantilla Magíster Profesional.

D1 mantiene compatibilidad con el enum histórico mediante el nuevo campo `templateType`.

## 2. Parámetros generales

Todos los parámetros expuestos en la pantalla quedan editables y persistidos en D1:
- hora docente directa por año;
- hora docente de reemplazo;
- beca de manutención;
- matrícula anual;
- reajuste anual;
- horizonte de planificación;
- plantilla de arancel por tipo;
- dirección de programa;
- asistencia;
- gastos operativos;
- software/licencias;
- difusión/admisión;
- congresos/pasantías;
- guía de tesis;
- overhead central;
- overhead facultad;
- incobrabilidad.

Los valores académicos pueden mostrar overhead de referencia, pero el motor mantiene la regla de overhead 0 para doctorados y magísteres académicos.

## 3. Comparación de versiones

La pantalla ahora permite:
1. elegir un presupuesto;
2. elegir una versión base;
3. elegir una segunda versión;
4. pulsar `Comparar versiones`;
5. revisar diferencias de los snapshots persistidos.

## 4. Usuarios y roles

Se incorporan seis roles:
- `ADMIN` — Administrador;
- `CREADOR` — Creador;
- `LECTOR` — Lector;
- `GESTOR` — Gestor;
- `VISTO_BUENO` — V°B°;
- `APROBADOR` — Aprobación.

`Administración` permite al Administrador:
- crear usuarios;
- modificar nombre y correo;
- definir o cambiar contraseña;
- asignar varios roles;
- habilitar o deshabilitar usuarios.

### Administrador inicial
El usuario configurado en `BOOTSTRAP_ADMIN_EMAIL` se reconcilia con nombre **Antonio Gutiérrez** y roles `ADMIN`, `GESTOR`, `VISTO_BUENO` y `APROBADOR`.

La contraseña inicial opcional se lee desde `BOOTSTRAP_ADMIN_PASSWORD`. Debe configurarse como Secret en Cloudflare, nunca en GitHub ni en `wrangler.jsonc`.

### Contraseñas
- PBKDF2-SHA256.
- 120.000 iteraciones.
- sal aleatoria de 16 bytes.
- hash de 32 bytes.
- sesión interna mediante token aleatorio; D1 guarda sólo su hash SHA-256.
- cookie HTTP-only, SameSite=Lax y Secure en producción.

## 5. Exportaciones

Se habilitaron:
- presupuesto individual XLSX;
- presupuesto individual PDF;
- consolidado institucional XLSX;
- consolidado institucional CSV;
- auditoría de presupuesto CSV.

La descarga se ejecuta en el navegador mediante Blob y nombre de archivo normalizado.

## 6. Consolidado institucional

`Exportar consolidado` genera un XLSX real con:
- ingresos consolidados;
- egresos brutos;
- egresos normalizados;
- duplicidad evitada;
- flujo neto consolidado.

La vista utiliza presupuestos cargados desde D1 y mantiene las agrupaciones institucional, académica, profesional y por programa.

## 7. Presupuestos: nuevo orden

La formulación se reorganizó en once bloques:

1. Identificación.
2. Parámetros y plantillas.
3. Estudiantes y graduación.
4. Carga académica:
   - Horas docentes directas.
   - Horas docentes de reemplazo.
5. Becas.
6. Descuentos.
7. Ingresos extraordinarios.
8. Costos y gastos.
9. Resumen financiero.
10. Flujo de caja anual.
11. Revisión y aprobación.

Las horas directas y de reemplazo ya no se mezclan con estudiantes, becas y graduación.

## 8. D1 y migración 0003

`migrations/0003_functional_improvements.sql` incorpora:
- campos de contraseña en `User`;
- `UserSession`;
- `templateType` en `ProgramAnnualTuition`;
- roles nuevos;
- parámetros adicionales y sus valores iniciales.

La migración es incremental. No se debe borrar ni recrear una base que ya tenga 0001 y 0002.

## 9. Prevención de nuevos errores

El build de Cloudflare ejecuta antes de OpenNext:
- preflight;
- auditoría de fuentes;
- typecheck;
- ESLint;
- compilación independiente del motor;
- Vitest;
- pruebas autónomas.

La auditoría incluye regresiones específicas para los problemas corregidos en esta versión.
