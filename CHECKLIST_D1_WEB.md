# Checklist de puesta en marcha — GitHub web + Cloudflare web + D1

## Preparación

- [ ] Pack descomprimido.
- [ ] `package.json` visible en la raíz de la carpeta.
- [ ] Cuenta GitHub disponible.
- [ ] Cuenta Cloudflare y Zero Trust disponibles.
- [ ] Correo UTEM del administrador inicial confirmado.

## D1

- [ ] Base `postgrado-presupuestos-prod` creada desde D1 SQL Database.
- [ ] Ubicación Automatic seleccionada, salvo instrucción institucional distinta.
- [ ] Database ID copiado.
- [ ] `wrangler.jsonc` actualizado con el Database ID.
- [ ] No se ejecutaron manualmente `0001_initial.sql` ni `0002_seed.sql`.

## GitHub web

- [ ] Repositorio privado creado.
- [ ] Contenido del pack cargado, no el ZIP.
- [ ] `package.json` y `wrangler.jsonc` están en la raíz.
- [ ] `.github/workflows/ci.yml` está presente.
- [ ] Carga inicial confirmada en `main`.
- [ ] Workflow Verificación continua ejecutado.

## Cloudflare Workers Builds

- [ ] Repositorio conectado desde Workers & Pages.
- [ ] Worker name: `sistema-presupuestos-postgrado-utem`.
- [ ] Production branch: `main`.
- [ ] Root directory: `/`.
- [ ] Build command: `npm run build`.
- [ ] Deploy command: `npm run deploy`.
- [ ] Primer despliegue completado.
- [ ] `/api/health` responde `status: ok`.

## Migraciones y datos base

- [ ] `0001_initial.sql` aplicada por Cloudflare.
- [ ] `0002_seed.sql` aplicada por Cloudflare.
- [ ] 24 tablas funcionales verificadas.
- [ ] 3 roles verificados.
- [ ] 3 plantillas verificadas.
- [ ] 5 ítems de plantilla verificados.
- [ ] 15 parámetros institucionales verificados.

## Cloudflare Access

- [ ] Aplicación Self-hosted creada.
- [ ] Dominio del Worker o dominio institucional agregado.
- [ ] Política Allow restringida a usuarios UTEM autorizados.
- [ ] MFA configurado cuando corresponde.
- [ ] Team domain copiado.
- [ ] Application AUD copiado.
- [ ] `CLOUDFLARE_ACCESS_TEAM_DOMAIN` actualizado.
- [ ] `CLOUDFLARE_ACCESS_AUD` actualizado.
- [ ] `BOOTSTRAP_ADMIN_EMAIL` actualizado.
- [ ] Segundo despliegue completado.

## Usuarios y roles

- [ ] Administrador inicial ingresó correctamente.
- [ ] Usuario Gestor creado.
- [ ] Usuario V°B° creado.
- [ ] Usuario Aprobador creado.
- [ ] Roles del administrador inicial reducidos después de la configuración.
- [ ] Usuario no registrado recibe acceso denegado.

## Prueba funcional

- [ ] Programa creado.
- [ ] Arancel propio configurado.
- [ ] Presupuesto creado y modificado.
- [ ] Plantilla Doctoral probada.
- [ ] Plantilla Magíster Académico probada.
- [ ] Plantilla Magíster Profesional probada.
- [ ] Descuento agregado y modificado.
- [ ] Ingreso extraordinario agregado y modificado.
- [ ] Costo único agregado.
- [ ] Costo compartido agregado.
- [ ] Normalización probada.
- [ ] Alerta de duplicidad probada.
- [ ] Arrastre autorizado probado.
- [ ] XLSX exportado.
- [ ] PDF exportado.
- [ ] Flujo Gestor → V°B° → Aprobación completado.
- [ ] Auditoría y versiones revisadas.
- [ ] Consolidados revisados.

## Gobierno y continuidad

- [ ] Protección de rama `main` activada.
- [ ] Pull request obligatorio para cambios posteriores.
- [ ] Workflow obligatorio antes de fusionar.
- [ ] Despliegues de ramas no productivas desactivados o conectados a una D1 distinta.
- [ ] Procedimiento de respaldo y recuperación D1 documentado.
- [ ] Responsable técnico y responsable funcional designados.
