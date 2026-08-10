# Verificación v10

Fecha de revisión técnica: 2026-08-10.

## Controles ejecutados localmente

### Estructura y auditoría preventiva
- `preflight.mjs`: correcto con marcadores productivos permitidos para el paquete descargable.
- `source-audit.mjs`: correcto; sólo informa los cuatro marcadores esperables de D1/Access en el paquete genérico.
- Revisión sintáctica TypeScript/TSX: **57 archivos, 0 errores sintácticos**.

### Motor financiero
- `tsc -p tsconfig.engine.json`: correcto.
- Pruebas autónomas del motor: **12/12 aprobadas**.
- Se mantiene la regla de overhead 0 para programas académicos.
- Se mantiene normalización de costos compartidos y alerta de duplicidades.

### Migraciones D1
Se ejecutaron secuencialmente en SQLite compatible:

```text
0001_initial.sql
0002_seed.sql
0003_functional_improvements.sql
```

Resultado:

```text
Tablas funcionales: 25
Roles: 6
Plantillas: 3
Ítems de plantilla: 5
Parámetros institucionales: 17
Valores de parámetros: 190
UserSession: creada
PRAGMA foreign_key_check: sin errores
```

Roles comprobados:

```text
ADMIN
APROBADOR
CREADOR
GESTOR
LECTOR
VISTO_BUENO
```

### Credenciales
Prueba del módulo de contraseña:

```text
PBKDF2: 120000 iteraciones
Contraseña correcta: true
Contraseña incorrecta: false
Token de sesión: 43 caracteres base64url
Hash de token: 43 caracteres base64url
```

### Exportaciones
Generación directa del motor de reportes:

```text
XLSX individual: 16603 bytes · firma PK
PDF individual: 15870 bytes · firma %PDF-
XLSX consolidado: 10172 bytes · firma PK
```

Esto verifica la generación binaria; la descarga final en navegador se ejecuta mediante Blob/anchor desde la interfaz.

## Controles funcionales incorporados al código

La auditoría previa al despliegue comprueba que:
- Programas no use el catálogo demo.
- Exista `Agregar programa`, `Modificar programa` y `Aplicar filtros`.
- Estén disponibles las tres plantillas de arancel.
- El alta de programa utilice una operación D1 agrupada con aranceles y auditoría.
- Parámetros generales tenga API PUT y botón de guardado.
- Versiones permita elegir dos snapshots.
- Exportaciones XLSX/PDF/consolidado estén conectadas.
- Administración contenga los seis roles.
- La migración 0003 contenga sesión y credenciales.
- El administrador inicial se aprovisione como Antonio Gutiérrez.
- Presupuestos separe estudiantes, horas directas, horas de reemplazo y becas.
- Panel, consolidado, exportaciones y comparación no utilicen presupuestos demo.

## Limitación de esta verificación

El entorno de trabajo utilizado para generar el paquete no dispone de acceso operativo al registro público npm, por lo que no fue posible ejecutar aquí el `npm install` completo ni el build final de Next.js/OpenNext con las dependencias reales.

Para reducir ese riesgo, el propio `build:cloudflare` obliga a ejecutar `typecheck`, ESLint y las pruebas antes de OpenNext. La compilación definitiva debe considerarse validada sólo cuando el pipeline de Cloudflare finalice correctamente con las dependencias reales.
