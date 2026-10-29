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

## 6. Migración de datos desde AppSheet (pendiente)

La base de producción actual (AppSheet) está en el VPS `46.202.151.191` y **no se modifica**. La migración se hará al final, tras validar el deploy:

1. Comparar el esquema de la base AppSheet con `prisma/schema.prisma` (las tablas y columnas ya usan los nombres de AppSheet: `Centro`, `Bodega`, `Encargados_Bodegas`, `ID_User`, …).
2. Script `migracion:appsheet` (mismo patrón que *gestión de la demanda*): lee el VPS con un usuario de solo lectura, simula sin `--ejecutar`, genera reporte e inserta por clave primaria original (`INSERT IGNORE`).
3. Ensayo en una base `inventario_ensayo` y validación de stock por bodega y lote.
4. Corte: AppSheet en solo lectura → migración final → apertura del sistema nuevo.

Los administradores creados por el seed quedan en el centro técnico `Administracion DAS`; tras migrar los centros reales se reasignan desde *Mantenedores*.
