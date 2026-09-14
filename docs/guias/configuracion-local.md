# Guía de Configuración Inicial del Entorno Local

Esta guía contiene el paso a paso detallado para configurar, preparar y ejecutar el proyecto **Inventario APS** por primera vez en un entorno local de desarrollo. Diseñada tanto para desarrolladores como para agentes autónomos.

---

## 1. Requisitos Previos del Sistema

Asegurarse de tener instaladas las siguientes herramientas en la máquina anfitriona:

- **Node.js**: versión `20.x`, `22.x` o compatible (`npm` v10+)
- **Docker** y **Docker Compose**: instalados y con el **demonio/servicio de Docker en ejecución** (ej. Docker Desktop abierto).
- **Git**: para control de versiones.

---

## 2. Instalación de Dependencias

Ejecutar en la raíz del repositorio:

```bash
npm install
```

---

## 3. Configuración de Variables de Entorno (`.env`)

1. Copiar el archivo de plantilla `.env.example` a `.env` (si aún no existe):

   ```bash
   cp .env.example .env
   ```

2. Generar el secreto para NextAuth (`AUTH_SECRET`):

   ```bash
   npx auth secret
   ```
   *(Este comando genera una clave aleatoria y la inyecta automáticamente en tu `.env` o la imprime en pantalla para copiarla).*

3. Abrir el archivo `.env` y completar los valores requeridos:

   ```env
   # Base de datos MySQL en Docker (puerto 3308 en local)
   DATABASE_URL="mysql://inventario:inventario@localhost:3308/inventario"

   # Secreto de NextAuth generado en el paso previo
   AUTH_SECRET="<tu_auth_secret_generado>"

   # Credenciales OAuth de Google Cloud Console
   AUTH_GOOGLE_ID="<tu_client_id>.apps.googleusercontent.com"
   AUTH_GOOGLE_SECRET="<tu_client_secret>"

   # URL pública de la aplicación en desarrollo
   AUTH_URL="http://localhost:3000"
   AUTH_TRUST_HOST="true"
   ```

### ⚠️ Requisito de Google Cloud Console:
En el proyecto de Google Cloud (APIs & Services > Credentials > OAuth 2.0 Client IDs):
- **Authorized redirect URIs**: debe incluir obligatoriamente:
  `http://localhost:3000/api/auth/callback/google`
- **Restricción de acceso**: El sistema solo autoriza inicio de sesión con cuentas del dominio `@cmvalparaiso.cl` que se encuentren registradas y con `Estado = true` en la base de datos.

---

## 4. Levantar la Base de Datos con Docker

1. Iniciar Docker Desktop o asegurarse de que el demonio esté activo.
2. Levantar el contenedor de MySQL 8.4:

   ```bash
   npm run services:up
   ```

   *Nota: El servicio corre en segundo plano mapeado al puerto **3308**.*
   *Para detener el contenedor en el futuro: `npm run services:down`.*

---

## 5. Preparar la Base de Datos (Prisma)

Con el contenedor de MySQL corriendo, ejecutar en orden:

```bash
# 1. Generar el cliente de Prisma
npm run db:generate

# 2. Sincronizar el esquema con la base de datos MySQL
npm run db:push

# 3. Cargar roles, menús y usuarios administradores iniciales
npm run db:seed

# 4. Cargar datos de referencia reales (unidades, productos, centros, bodegas)
npm run db:seed:ref
```

> **Usuarios administradores precargados**:
> El seed crea automáticamente con rol `R01` (Administrador):
> - `rvergara@cmvalparaiso.cl`
> - `dsantibanez@cmvalparaiso.cl`

---

## 6. Ejecutar la Aplicación

Iniciar el servidor de desarrollo de Next.js:

```bash
npm run dev
```

La app estará disponible en: [http://localhost:3000](http://localhost:3000)

---

## 7. Comandos de Verificación y Utilidades

- **Pruebas unitarias**: `npm test`
- **Inspección visual de la Base de Datos**: `npm run db:studio` (abre Prisma Studio en el navegador).
- **Compilación de producción**: `npm run build`
