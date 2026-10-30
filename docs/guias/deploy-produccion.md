# Guía de Deploy a Producción

Describe cómo se publica **Inventario CMV** en producción y qué hay configurado en el servidor.

---

## 1. Arquitectura

| Elemento | Valor |
|---|---|
| Servidor | `server-das` (`informesdiarios`, Tailscale `100.107.10.105`) |
| Dominio | `https://inventario.cmvalparaiso.cl` |
| Proxy | nginx (`/etc/nginx/sites-available/inventario`) → `127.0.0.1:3030`, TLS con Certbot |
| Proceso | pm2, app `inventario-cmv` (`ecosystem.config.js`, `next start -p 3030`) |
| Base de datos | MySQL nativo del servidor, base `inventario_cmv`, usuario `inventario@localhost` |
| Runner | GitHub Actions self-hosted en `/var/www/inventario-aps/actions-runner`, labels `self-hosted, produccion` |
| Código desplegado | `/var/www/inventario-aps/actions-runner/_work/inventario-cmv/inventario-cmv` |

---

## 2. Pipeline (`.github/workflows/deploy.yml`)

Se ejecuta en el runner del propio servidor, por lo que se conecta a MySQL por `localhost`.

1. Checkout del repositorio.
2. Genera `.env` desde el secret `ENV_PRODUCTION` (environment `produccion`).
3. `npm ci` y `prisma generate`.
4. `tsc --noEmit` y `npm test`: si fallan, no se publica.
5. `prisma migrate deploy`: aplica las migraciones pendientes.
6. Seed estructural con `SEED_DEMO=false`: roles y administradores, **sin datos de prueba**. No sobrescribe administradores existentes.
7. `next build`.
8. `pm2 startOrReload ecosystem.config.js --update-env` y `pm2 save`.

El deploy se dispara con cada **push a `main`** (incluida la fusión de un PR) y también manualmente: *Actions → Deploy Produccion → Run workflow*.

Los **PR contra `main`** no despliegan: el workflow `.github/workflows/ci.yml` corre `tsc`, tests y `next build` en un runner de GitHub para validar el cambio antes de fusionarlo.

---

## 3. Secret `ENV_PRODUCTION`

Contenido (una variable por línea; los valores reales solo viven en GitHub):

```
DATABASE_URL="mysql://inventario:<password>@localhost:3306/inventario_cmv"
AUTH_SECRET="<npx auth secret>"
AUTH_GOOGLE_ID="<client id>"
AUTH_GOOGLE_SECRET="<client secret>"
AUTH_URL="https://inventario.cmvalparaiso.cl"
AUTH_TRUST_HOST="true"
RESEND_API_KEY="<api key de Resend del proyecto>"
CORREO_REMITENTE="Inventario CMV <inventario@gi.cmvalparaiso.cl>"
```

El envío de correos (comprobante de salida) usa Resend. El subdominio `gi.cmvalparaiso.cl` está verificado en la cuenta de Resend (el remitente debe usar ese subdominio); sin `RESEND_API_KEY` la app funciona igual pero no envía correos (queda registrado como `omitido` en auditoría).

Para modificarlo: *Settings → Environments → produccion → ENV_PRODUCTION* (se reemplaza completo).

En Google Cloud, el cliente OAuth debe tener registrada la URI de redirección
`https://inventario.cmvalparaiso.cl/api/auth/callback/google`.

---

## 4. Cambios de esquema

- Cada cambio en `prisma/schema.prisma` debe venir con su migración: `npm run db:migrate -- --name <descripcion>`.
- La migración inicial `0_init` crea el esquema completo. Las bases creadas antes con `db push` se marcan una vez con `npx prisma migrate resolve --applied 0_init`.
- Nunca usar `db push` contra producción.

---

## 5. Operación

```bash
ssh informesdiarios
pm2 status inventario-cmv
pm2 logs inventario-cmv --lines 100
pm2 restart inventario-cmv
```

---

## 6. Migración de datos desde AppSheet

La base de producción actual (AppSheet) está en el VPS de AppSheet y **no se modifica**. Se lee con el usuario `inventario_lectura` (`SELECT, SHOW VIEW` sobre `inventario.*`), restringido a las IPs de server-das y del equipo del responsable. Diseño: `docs/superpowers/specs/2026-10-29-migracion-appsheet-design.md`.

```bash
# .env.migracion (no se versiona):
# ORIGEN_DATABASE_URL="mysql://inventario_lectura:<password>@<host VPS>:3306/inventario"
npm run migracion:appsheet                                   # simulación: solo reporte
npm run migracion:appsheet -- --ejecutar --vaciar=<base>     # vacía lo migrado y carga
```

- **Destino:** `DATABASE_URL` de `.env`, o `DESTINO_DATABASE_URL` si existe.
- **Reporte:** `migracion-appsheet-<fecha>/`, o la ruta de `--salida`. Contiene `resumen.json`, `rechazos-*.csv`, `advertencias-*.csv`, `reasignaciones.json` y `validacion.json`. El script termina con error si la validación encuentra diferencias.
- **`--vaciar`:** conserva los roles, el centro `Administracion DAS` y sus usuarios. **No reasignar a los administradores del seed a centros reales antes del corte**, porque `--vaciar` los borraría.

### 6.1 Ensayo local

```bash
SEED_DEMO=false npm run db:seed        # crea el centro técnico si la base local no lo tiene
npm run migracion:appsheet
npm run migracion:appsheet -- --ejecutar --vaciar=inventario
```

### 6.2 Ensayo y corte en producción (server-das)

`actions/checkout` limpia el directorio de trabajo, así que las credenciales y los reportes viven fuera de él, en `/var/www/inventario-aps/migracion/`.

Antes de empezar, confirmar en GitHub Actions que "Deploy Produccion" no está en ejecución y **no hacer merge a `main` durante la migración**: un deploy limpia el directorio del runner y reescribe `.env`.

```bash
ssh informesdiarios
cd /var/www/inventario-aps/actions-runner/_work/inventario-cmv/inventario-cmv
M=/var/www/inventario-aps/migracion
F=$(date +%F-%H%M)
R=$M/reporte-$F
B=$M/respaldo-$F.sql
# Ensayo (solo reporte):
npm run migracion:appsheet -- --origen-env=$M/.env.migracion --salida=$R-simulacion
# Carga: el respaldo condiciona el vaciado (credenciales de mysqldump en ~/.my.cnf)
mysqldump --no-tablespaces inventario_cmv > "$B" && test -s "$B" && \
    npm run migracion:appsheet -- --origen-env=$M/.env.migracion --salida=$R-carga --ejecutar --vaciar=inventario_cmv
```

Si la carga falla: repetir el último comando (`--ejecutar --vaciar=inventario_cmv`; el vaciado deja la base lista para reintentar) o restaurar el respaldo con `mysql inventario_cmv < "$B"`.

Pasos:
1. **Ensayo:** se ejecuta y se revisa https://inventario.cmvalparaiso.cl. La URL no se difunde hasta el corte, porque los usuarios migrados quedan activos.
2. **Corte:**
   - AppSheet pasa a solo lectura;
   - respaldo;
   - `--ejecutar --vaciar=inventario_cmv`;
   - se revisa `validacion.json`;
   - apertura a los usuarios.
3. **Después del corte:** reasignar desde *Mantenedores* a los administradores del centro técnico `Administracion DAS`.
