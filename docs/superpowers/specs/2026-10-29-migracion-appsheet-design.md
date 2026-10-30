# Diseño: Migración de datos desde AppSheet

**Proyecto:** Inventario APS — Corporación Municipal de Valparaíso (CMV)
**Fecha:** 29 de octubre de 2026
**Estado:** Aprobado
**Relacionado:** `docs/guias/deploy-produccion.md` (sección 6), patrón `migracion:appsheet` de gestión de la demanda (`prisma/scripts/migracion-appsheet/`)

---

## 1. Problema

El inventario de los centros de salud se opera hoy en AppSheet, sobre MySQL 8.0 en el VPS `46.202.151.191` (base `inventario`). El sistema nuevo ya está desplegado en https://inventario.cmvalparaiso.cl (base `inventario_cmv` en server-das), pero solo tiene roles y administradores. Hay que traspasar los datos sin modificar la base AppSheet, que sigue en uso hasta el corte.

## 2. Objetivo

1. Un script repetible que migre **todo el histórico** de AppSheet al esquema Prisma: maestros, órdenes con su detalle y stock.
2. Cada fila que no entra queda en un reporte, con la regla que la rechazó.
3. Un **ensayo sobre producción**: cargar los datos reales en `inventario_cmv` y revisarlos en la URL real antes del corte. Después se vacía y se migra de nuevo con datos frescos.

## 3. Decisiones

| Tema | Decisión | Alternativa descartada |
|---|---|---|
| Alcance | Todo el histórico + stock | Solo maestros y stock vigente; histórico desde una fecha |
| Simulación | Ensayo directo en producción (`inventario_cmv`), que aún no está en uso, precedido por un ensayo local | Segunda instancia con subdominio (más infraestructura); base de ensayo vista solo en local |
| Fuente del stock | La tabla `Stock` de AppSheet, tal cual | Recalcular desde los movimientos: no cuadran (entradas − salidas = 719.114; `Stock` = 688.090) |
| Rol VISUALIZADOR (R04) | Se migra como R02 Encargado Centro | Migrarlo con un rol que la app no reconoce |
| Rol ADMIN ASEO (`dac3497d`) | No se migra (sus usuarios van a rechazos) | Rol equivalente aún no definido |
| Acceso al origen | Usuario MySQL `inventario_lectura` con `SELECT, SHOW VIEW` sobre `inventario.*`, restringido a las IPs de server-das (`200.54.81.50`) y del equipo del responsable (`190.161.230.43`) | Usar la cuenta `admin` |

## 4. Diagnóstico del origen (29/10/2026)

El esquema de origen usa los mismos nombres de tabla y columna que `prisma/schema.prisma`, pero **no tiene claves primarias ni restricciones**: todas las columnas aceptan `NULL`.

| Tabla | Filas | Tabla | Filas |
|---|---|---|---|
| Centro | 24 | OrdenEntrada / Detalle | ~2.900 / ~21.400 |
| Bodega | 99 | OrdenSalida / Detalle | ~14.100 / ~39.800 |
| Usuario | 235 | Stock | 18.642 (10.208 con saldo) |
| Producto | 1.194 | Rol / Unidad | 8 / 23 |

Diferencias de estructura:

- El destino agrega `Producto.Estado`, `OrdenSalida.ID_Bodega_Destino`, `Fecha_Envio_Correo` y `Error_Envio_Correo`, además de las tablas `Encargados_Bodegas` y `logs`.
- El origen tiene `Reporte` y la vista `vw_stock_consumo_mensual`, que no existen en el destino.
- Tipos que cambian:
  - `OrdenSalida.Enviar_Correo`: varchar (`NULL` o `"1"`) en el origen, booleano en el destino.
  - `Usuario.Telefono`: int en el origen, varchar en el destino.
  - `Stock.Fecha_Ultima_Actualizacion`: date en el origen, datetime en el destino.

Problemas de datos que resuelven las reglas de la sección 5:

- **Huérfanos:**
  - 677 detalles de entrada y 2 de salida sin su orden.
  - 69 salidas y 1 entrada con un usuario inexistente.
  - 5 entradas y 6 filas de stock con una bodega inexistente.
- **Nulos donde el destino exige valor:**
  - Lote vacío: 103 detalles de entrada, 120 de salida y 2 filas de stock.
  - Caducidad nula: 109 detalles de entrada, 3 de salida y 9 filas de stock.
  - Cantidad ≤ 0: 16 detalles de entrada.
- **Stock:** 15 claves `(producto, bodega, lote, caducidad)` duplicadas, que chocan con `stock_lote_unico`.
- **Usuarios:**
  - El correo `ccastillos@cmvalparaiso.cl` aparece con dos IDs activos.
  - Un usuario tiene correo de `alumnos.upla.cl`.
  - Los correos de los admins del seed pueden existir también en AppSheet.

## 5. Reglas de transformación

Cada regla devuelve la fila transformada (con advertencias opcionales) o un rechazo con `clave`, `regla` y `detalle`.

### 5.1 Maestros

- **Rol:** no se migra la tabla. El destino conserva los roles del seed (R01, R02, R03, R06, R07).
- **Centro:**
  - Se migra con su ID original.
  - "Centro Prueba" (`3d3f9a13`) se excluye, y con él sus bodegas, usuarios, órdenes y stock. Todo queda en rechazos con la regla `centro_prueba`.
- **Bodega:** se migra con su ID original. Si su centro fue excluido, se rechaza.
- **Unidad:** se migra con su ID original.
- **Producto:** se migra con su ID original y `Estado = true`.
- **Usuario:**
  - El rol R04 pasa a R02, con advertencia.
  - El rol `dac3497d` (ADMIN ASEO) se rechaza (`rol_no_migrado`).
  - Si el email (normalizado a minúsculas y sin espacios) **ya existe en el destino** (por ejemplo, un admin del seed), se conserva la fila del destino. El ID de AppSheet se registra en un mapa de reasignación hacia el ID del destino.
  - Si el email está **duplicado en el origen**, se conserva el ID con más órdenes (entradas más salidas) y el otro se reasigna a él, con advertencia.
  - Si el email no es del dominio `@cmvalparaiso.cl`, se migra con advertencia (no podrá iniciar sesión).
  - `Telefono` se convierte a texto; `0` o nulo pasan a `null`.
  - Un `ID_Bodega` vacío pasa a `null`.
- **Usuario técnico:** se crea `migracion-appsheet` ("Migración AppSheet", rol R01, centro "Administracion DAS", `Estado = false`). Recibe las órdenes cuyo usuario no existe.

### 5.2 Órdenes

- `ID_User` se resuelve con el mapa de reasignación. Si no existe, se usa el usuario técnico, con advertencia `usuario_inexistente`.
- **Orden de entrada o de salida** con bodega inexistente, o cuyo centro no coincide con el de la bodega: se rechaza.
- **Detalle sin su orden** (o cuya orden fue rechazada): se rechaza.
- **Detalle con producto inexistente** o cantidad nula o ≤ 0: se rechaza.
- **Lote vacío o nulo:** queda `"SIN LOTE"`, con advertencia.
- **Caducidad nula:** queda `2099-12-31`, con advertencia.
- **`OrdenSalida.Enviar_Correo`:** `"1"` pasa a `true` y cualquier otro valor a `false`.
- **Campos nuevos de salida:** `ID_Bodega_Destino`, `Fecha_Envio_Correo` y `Error_Envio_Correo` quedan en `null`.

### 5.3 Stock

- La tabla `Stock` es la fuente de verdad.
- Se migran todas las filas, incluidas las de saldo 0, porque conservan el `StockMinimo`.
- Lote vacío y caducidad nula siguen las reglas de 5.2.
- Las filas con la misma clave `(producto, bodega, lote, caducidad)`, ya normalizada, se **fusionan**:
  - se suman `Cantidad_Disponible`;
  - se toma el `StockMinimo` mayor;
  - se toma la `Fecha_Ultima_Actualizacion` más reciente;
  - se conserva el `ID_Stock` de la primera fila;
  - se registra una advertencia.
- Las filas con bodega inexistente o producto inexistente se rechazan, informando la cantidad.

### 5.4 Texto

- La conexión al origen usa `utf8mb4`.
- Los textos se recortan con `trim`, y un texto vacío pasa a `null` en los campos opcionales.

### 5.5 Fuera de alcance

- La tabla `Reporte`.
- La vista `vw_stock_consumo_mensual`.
- El rol ADMIN ASEO.
- Recalcular el stock desde los movimientos.

## 6. Arquitectura

### 6.1 Archivos

- **`prisma/scripts/migracion-appsheet/reglas.ts`:** funciones puras de transformación (sección 5), sin acceso a la base. Exporta los tipos de origen y destino y `Resultado<T>`.
- **`prisma/scripts/migracion-appsheet/migrar.ts`:** entrada y salida.
  - Lee el origen con `new PrismaClient({ datasourceUrl: ORIGEN_DATABASE_URL })`, usando `SELECT` crudos dentro de una sesión `SET SESSION TRANSACTION READ ONLY`.
  - Lee del destino los emails existentes, para la reasignación.
  - Aplica las reglas e inserta en `DESTINO_DATABASE_URL` en lotes de 1.000 con `createMany({ skipDuplicates: true })`, por clave primaria original.
  - Orden de inserción: Centro → Bodega → Unidad → Producto → Usuario → OrdenEntrada → OrdenEntradaDetalle → OrdenSalida → OrdenSalidaDetalle → Stock.
  - Al final escribe un registro en `logs`: `accion: "migracion"`, `entidad: "AppSheet"`, con el resumen en `detalle`.
- **Tests:** `src/__tests__/migracion-appsheet-reglas.test.ts` (Vitest solo incluye `src/**`).
- **`package.json`:** `"migracion:appsheet": "tsx prisma/scripts/migracion-appsheet/migrar.ts"`.
- **`.gitignore`:** `.env.migracion` (ya agregado).

### 6.2 Uso

```bash
# credenciales en .env.migracion (ORIGEN_DATABASE_URL) y .env (DATABASE_URL → destino por defecto)
npm run migracion:appsheet -- [--ejecutar] [--vaciar=<base_destino>] [--salida=<dir>]
```

- **Sin `--ejecutar`:** simula. Lee, transforma, valida y escribe el reporte sin tocar el destino.
- **`--vaciar=<base>`:**
  - exige `--ejecutar` y repetir el nombre exacto de la base de destino;
  - antes de cargar, en una transacción, borra los detalles, órdenes, stock, `logs`, productos, unidades, usuarios, bodegas y centros;
  - **conserva** los roles, el centro `centro-administracion-das` y los usuarios de ese centro (los admins del seed).
- **`--salida`:** directorio del reporte. Por defecto `migracion-appsheet-<timestamp>/`, que se ignora en git.

### 6.3 Reporte

- **`resumen.json`:** por tabla, leídos, aceptados, rechazados, advertencias e insertados.
- **`rechazos-<tabla>.csv` y `advertencias-<tabla>.csv`:** columnas `clave,regla,detalle`.
- **`validacion.json`:** comparación posterior a la carga (sección 7.2).

## 7. Flujo de ejecución

### 7.1 Etapas

1. **Ensayo local:**
   - origen VPS (`inventario_lectura`) y destino la base local de Docker (puerto 3308);
   - se itera hasta que el reporte solo contenga los rechazos esperados;
   - sin `RESEND_API_KEY` no se envían correos.
2. **Ensayo en producción:**
   - en server-das, desde el directorio del runner, con `.env.migracion` en el servidor (permisos 600);
   - primero se respalda con `mysqldump inventario_cmv`;
   - luego se simula, y después se ejecuta con `--ejecutar --vaciar=inventario_cmv`;
   - el responsable revisa https://inventario.cmvalparaiso.cl. La URL no se difunde hasta el corte, porque los usuarios migrados quedan activos.
3. **Corte:**
   - AppSheet pasa a solo lectura (lo hace el responsable en AppSheet);
   - respaldo;
   - `--ejecutar --vaciar=inventario_cmv`;
   - validación;
   - apertura a los usuarios.

### 7.2 Validación posterior automática

Tras `--ejecutar`, el script compara origen y destino:

- **Conteos por tabla:** destino = origen aceptados (más las filas que ya existían, en el caso de los usuarios).
- **Suma de `Cantidad_Disponible`** por bodega, y por bodega, producto, lote y caducidad: destino = origen − rechazados.

Las diferencias quedan en `validacion.json`, y el script termina con código distinto de 0 si existe alguna.

## 8. Pruebas y criterios de éxito

**Tests unitarios de `reglas.ts`:**
- R04 pasa a R02 y ADMIN ASEO se rechaza.
- Reasignación por email existente en el destino y por email duplicado en el origen.
- Usuario técnico para las órdenes con usuario inexistente.
- "SIN LOTE" y `2099-12-31`, con advertencia.
- Fusión de stock duplicado (suma, mínimo mayor, fecha más reciente).
- Exclusión de "Centro Prueba" en cascada.
- Rechazo de detalles huérfanos, producto inexistente y cantidad ≤ 0.
- Conversión de `Enviar_Correo` y `Telefono`.
- Normalización de textos.

**Test de opciones:** `--vaciar` sin `--ejecutar`, o con un nombre de base distinto, lanza error.

**Criterios de éxito del ensayo:**
1. Simular dos veces seguidas produce el mismo `resumen.json`.
2. Ejecutar dos veces no duplica filas.
3. `validacion.json` sin diferencias.
4. Revisión manual en producción:
   - stock por bodega;
   - historial de entradas y salidas;
   - descarga del comprobante de una salida antigua;
   - login de un usuario R03 y de uno ex-R04 (ve su centro completo).
5. El responsable valida los rechazos antes del corte.

## 9. Seguridad

- Ninguna credencial se versiona.
  - `ORIGEN_DATABASE_URL` vive en `.env.migracion` (local y servidor).
  - El destino de producción usa el `.env` del runner.
- El script nunca escribe en el origen:
  - el usuario solo tiene `SELECT, SHOW VIEW`;
  - la sesión es `READ ONLY`.
- Los reportes contienen correos de funcionarios: se generan fuera del repositorio o en un directorio ignorado, y no se comparten fuera del equipo.
