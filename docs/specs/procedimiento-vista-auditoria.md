# Especificación Técnica y de Interfaz: Vista de Auditoría de Acciones para Administradores

**Proyecto:** Sistema de Inventario APS — Corporación Municipal de Valparaíso (CMV)  
**Documento:** Especificación Funcional, de Seguridad y Usabilidad: Monitor de Trazabilidad y Logs de Auditoría  
**Versión:** 1.0 (Aprobada)  
**Fecha:** 22 de Octubre de 2026  
**Clasificación:** Seguridad, Trazabilidad Operativa y Auditoría (Prioridad Alta)  

---

## 1. Diagnóstico del Problema y Justificación de Negocio

### El Reporte y Requerimiento:
> *"Crear la vista de auditoría de acciones para el administrador  
> Origen: borrador de requerimientos, punto 7 (monitoreo válido).  
> Situación actual: las acciones ya se registran en la tabla Log (AuditLogger), pero no existe una pantalla para consultarlas.  
> Qué se espera:  
> - Vista solo para el Administrador (R01) que permita responder, por ejemplo: '¿Qué órdenes de salida o entrada ingresó el usuario X hoy?'.  
> - Filtros por usuario, rango de fechas, acción (crear, actualizar, eliminar) y entidad.  
> - Mostrar el detalle registrado (bodega de origen y destino, tipo de salida, etc.)."*

### Causa Raíz Detectada en Código:
1. **Trazabilidad Oculta Sin Interfaz de Consulta:**
   - La clase `AuditLogger` (`src/shared/lib/logger.ts`) registra fielmente cada mutación relevante (`crear`, `actualizar`, `eliminar`) sobre `OrdenSalida`, `OrdenEntrada`, `Producto`, `Centro`, `Bodega`, etc. en la tabla `logs`.
   - Sin embargo, no existía ninguna ruta para consultar estos registros.
2. **Carencia de Timestamp y Ubicación Territorial en el Modelo `Log`:**
   - En `prisma/schema.prisma`, la tabla `Log` carecía de `fecha` e índices cronológicos, así como de las columnas `centroId` y `bodegaId` para reflejar la ubicación real donde ocurrió cada movimiento.
   - Sin estas columnas, filtrar por bodega dependía erróneamente de los funcionarios asignados actualmente a esa bodega, provocando que si un usuario cambiaba de bodega, su historial histórico "se mudaba" con él, o que las acciones de administradores centrales en una bodega específica no aparecieran.
3. **Falta de Acceso Controlado R01:**
   - Se requiere garantizar por diseño (RBAC) que esta vista sea de acceso exclusivo para el rol `R01` (`ROL_ADMINISTRADOR`), protegiendo la confidencialidad de la actividad del personal.

---

## 2. Reglas de Interfaz y Negocio

```
                     [ ACCESO A AUDITORÍA: ROL R01 EXCLUSIVO ]
                                         │
                    ┌────────────────────┴────────────────────┐
                    ▼                                         ▼
            [ BARRA LATERAL ]                         [ ACCESO DIRECTO URL ]
            • Visible solo si                         • Validación de sesión con
              usuario.rol === ROL_ADMINISTRADOR         puedeAdministrar(user.rol)
            • Icono: History                          • Si no es R01: redirección
            • Ruta: /auditoria                          a inicio (/)
                    │
                    └────────────────────┬────────────────────┘
                                         ▼
                               [ VISTA: /auditoria ]
            ┌─────────────────────────────────────────────────────────┐
            │ FILTROS:                                                │
            │ • Fecha Desde y Hasta (Zona Horaria America/Santiago)   │
            │ • Filtros Territoriales Directos y Combinables:         │
            │   - Centro de Salud (ID_Centro real del evento)         │
            │   - Bodega (ID_Bodega real del evento)                  │
            │   - Usuario (combinable con centro/bodega en Y lógico)  │
            │ • Acción (Todas, crear, actualizar, eliminar)           │
            │ • Entidad (Todas, OrdenSalida, OrdenSalidaDetalle, ...) │
            └────────────────────────────┬────────────────────────────┘
                                         ▼
            ┌─────────────────────────────────────────────────────────┐
            │ RESULTADOS:                                             │
            │ • Tabla ordenada cronológicamente descendente           │
            │ • Fecha y Hora | Usuario | Acción (Badge) | Entidad     │
            │ • Fila expandible con visor estructurado:               │
            │   - Tabla 3 columnas (Campo | Antes | Después) para     │
            │     objetos con formato { cambios }                     │
            │   - Pares clave-valor para objetos planos               │
            │   - Texto legible para detalles string/primitivos       │
            └─────────────────────────────────────────────────────────┘
```

### Regla R-01: Control de Acceso y Visibilidad Exclusiva (R01)
- La vista `/auditoria` es de acceso estrictamente reservado para administradores (`puedeAdministrar(user.rol)` / `ROL_ADMINISTRADOR`).
- **Navegación:**
  - En `src/shared/components/layout/app-sidebar-shell.tsx`, la opción "Auditoría" se renderiza condicionalmente si `profile.rol === ROL_ADMINISTRADOR`.
  - Icono: `History` de `lucide-react`.
- **Protección de Ruta:**
  - En `src/app/auditoria/page.tsx`, se valida la sesión mediante `requireSessionUser()`. Si `!puedeAdministrar(sessionUser.rol)`, se redirige automáticamente al inicio (`/`).

### Regla R-02: Extensión del Modelo `Log` (Fecha, Centro y Bodega con Índices)
- Se extiende el modelo `Log` en `prisma/schema.prisma`:
  ```prisma
  model Log {
      id        String   @id @default(cuid()) @map("ID_Log") @db.VarChar(255)
      usuarioId String?  @map("ID_User") @db.VarChar(255)
      centroId  String?  @map("ID_Centro") @db.VarChar(255)
      bodegaId  String?  @map("ID_Bodega") @db.VarChar(255)
      accion    String   @map("Accion") @db.VarChar(255)
      entidad   String   @map("Entidad") @db.VarChar(255)
      entidadId String?  @map("Entidad_ID") @db.VarChar(255)
      detalle   Json?    @map("Detalle")
      fecha     DateTime @default(now()) @map("Fecha")
      usuario   Usuario? @relation(fields: [usuarioId], references: [id])

      @@index([usuarioId])
      @@index([centroId])
      @@index([bodegaId])
      @@index([fecha])
      @@index([entidad])
      @@map("logs")
  }
  ```
- **Migración de base de datos:** Se aplica con `npm run db:push`.
- **Registros antiguos:** Los logs anteriores quedan con `centroId: null` y `bodegaId: null`. Aparecen en consultas globales sin filtro territorial.

### Regla R-03: Ubicación Real del Evento y Filtros Combinables (Y Lógico)
- Cada llamada a `AuditLogger.log` registra la ubicación donde ocurrió la acción:
  - En órdenes de entrada y sus detalles (`OrdenEntrada`, `OrdenEntradaDetalle`): se guarda el `centroId` y `bodegaId` de la orden receptora.
  - En órdenes de salida y sus detalles (`OrdenSalida`, `OrdenSalidaDetalle`): se guarda el `centroId` y el `bodegaId` de origen (la bodega de destino en traspasos se mantiene en el detalle estructurado).
  - En mantenedores de bodega: se guarda el `centroId` y `bodegaId`.
  - En mantenedores de usuario: se guarda el `centroId` del usuario afectado.
- En la consulta `consultarLogsAuditoria`, el filtro territorial busca directamente sobre `where.bodegaId` y `where.centroId`, y es combinable con `where.usuarioId` en un Y lógico (`where.bodegaId && where.usuarioId`).

### Regla R-04: Catálogo Centralizado de Entidades Auditables
- Se define en `src/modules/auditoria/constants/entidades.ts`:
  - `OrdenEntrada` ("Orden de entrada")
  - `OrdenEntradaDetalle` ("Detalle de orden de entrada")
  - `OrdenSalida` ("Orden de salida")
  - `OrdenSalidaDetalle` ("Detalle de orden de salida")
  - `Producto` ("Producto")
  - `Usuario` ("Usuario")
  - `Centro` ("Centro de salud")
  - `Bodega` ("Bodega")
  - `Unidad` ("Unidad")
- El schema Zod `filtroAuditoriaSchema` y el componente `AuditoriaFiltros` consumen este catálogo centralizado, garantizando sincronización sin duplicación manual.

### Regla R-05: Rango Inicial con Zona Horaria de Chile (`America/Santiago`)
- La constante `ZONA_HORARIA = "America/Santiago"` (`src/config/fechas.ts`) y la función utilitaria `obtenerRangoHoyChile()` (`src/shared/utils/fechas.ts`) calculan el inicio (`00:00:00.000`) y fin (`23:59:59.999`) del día actual en Chile mediante `Intl.DateTimeFormat`.
- Respeta automáticamente las transiciones entre horario de verano (UTC-3) e invierno (UTC-4).
- La página `page.tsx` utiliza este rango en el servidor y lo transfiere a los filtros iniciales del cliente, asegurando coherencia visual y de datos.

### Regla R-06: Visor Polimórfico de Detalles (`AuditoriaDetalleVisor`)
- Soporta todos los tipos posibles de la columna `Detalle`:
  1. `null` o `undefined`: *"Sin detalle adicional registrado."*
  2. `string`, `number` o `boolean`: Despliega el valor como texto legible en un párrafo.
  3. `Array`: Despliega lista formateada con contador de elementos y bloque de código.
  4. Objeto con `{ cambios }`: Despliega una tabla de 3 columnas: **Campo | Antes | Después**, formateando valores nulos, booleanos y listas de IDs.
  5. Objeto plano: Mapeo de pares clave-valor en cuadrícula responsiva con botón para alternar vista JSON cruda.

### Regla R-07: Paginación y Restricciones
- Paginación estricta (`limite` máximo de 100, por defecto 50) para proteger la memoria del cliente y el rendimiento de la base de datos.
- Tipado estricto `Prisma.LogWhereInput` y cero uso de `any` en todo el módulo.

---

## 3. Plan de Pruebas y Verificación

1. **Pruebas de Acciones del Servidor (`src/__tests__/auditoria.action.test.ts`):**
   - Rechazo de acceso a usuarios no administradores.
   - Consulta filtrada por fecha, acción y usuario para administradores.
   - Filtro por bodega genera `where: { bodegaId }` directo sin consultar encargados.
   - Filtro combinado usuario + bodega aplica ambas cláusulas a la vez.
   - Datos de catálogo para selectores en cascada.
2. **Pruebas del Visor de Detalles (`src/__tests__/auditoria-detalle-visor.test.tsx`):**
   - Manejo de `null` / `undefined`.
   - Renderizado de cadenas de texto y valores primitivos.
   - Renderizado de objetos clave-valor planos.
   - Renderizado de tabla de 3 columnas (Campo | Antes | Después) para objetos con `{ cambios }`.
3. **Pruebas de Filtros y Schema (`src/__tests__/auditoria-filtros.test.tsx`):**
   - Aceptación de `OrdenSalidaDetalle` y `OrdenEntradaDetalle` en el schema.
   - Renderizado de las opciones de detalle en el `<select>` de entidades.
   - Dependencia en cascada Centro → Bodega → Usuario.
4. **Pruebas de Zona Horaria (`src/__tests__/fechas.test.ts`):**
   - Simulación con reloj en `2026-10-22T01:30:00Z` comprobando que devuelve el rango del 21 de octubre en Chile.
5. **Pruebas de Órdenes (`src/__tests__/traspaso-bodega.test.ts`):**
   - Comprobación de que `AuditLogger.log` recibe `centroId` y `bodegaId` al crear, actualizar y eliminar salidas.

---

## 4. Criterios de Aceptación (Definición de Terminado)

- [x] **CA-1: Restricción Estricta de Acceso:** Solo usuarios administradores (`ROL_ADMINISTRADOR`) pueden ver el menú lateral y acceder a `/auditoria`. Otros roles son redirigidos de inmediato.
- [x] **CA-2: Columnas Territoriales e Índices en Logs:** Modelo `Log` cuenta con `centroId` y `bodegaId` indexados para ubicar espacialmente cada evento.
- [x] **CA-3: Filtro Territorial Directo y Combinable:** La búsqueda por bodega o centro refleja dónde ocurrió la acción y se combina con el filtro por usuario.
- [x] **CA-4: Entidades de Detalle Disponibles:** `OrdenEntradaDetalle` y `OrdenSalidaDetalle` son seleccionables en el filtro y validadas en el schema.
- [x] **CA-5: Zona Horaria America/Santiago:** El rango inicial del día se calcula en la zona horaria chilena respetando cambios estacionales.
- [x] **CA-6: Visor Polimórfico de Detalles:** Se muestran adecuadamente detalles de texto, primitivos, objetos planos y tablas de cambios antes/después.
- [x] **CA-7: Tipado Estricto:** Código libre de `any` en `src/modules/auditoria` y `src/app/auditoria`.
- [x] **CA-8: Cero Regresiones:** 100% de tests aprobados (`npx vitest run`), TypeScript estricto (`npx tsc --noEmit`) y build de producción exitoso (`npx next build`).
