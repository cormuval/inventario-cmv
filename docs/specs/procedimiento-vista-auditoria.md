# Especificación Técnica y de Interfaz: Vista de Auditoría de Acciones para Administradores

**Proyecto:** Sistema de Inventario APS — Corporación Municipal de Valparaíso (CMV)  
**Documento:** Especificación Funcional, de Seguridad y Usabilidad: Monitor de Trazabilidad y Logs de Auditoría  
**Versión:** 1.0 (Borrador para Aprobación)  
**Fecha:** 14 de Octubre de 2026  
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
   - Sin embargo, no existe ninguna ruta ni página web para consultar estos registros, obligando al equipo de soporte o jefatura a recurrir a consultas manuales en base de datos.
2. **Carencia de Timestamp Nativo en el Modelo `Log`:**
   - En [`prisma/schema.prisma`](file:///c:/Users/benja/OneDrive/Escritorio/inventario-cmv-main/prisma/schema.prisma), la tabla `Log` carece de una columna explícita de fecha y hora (`fecha DateTime @default(now())`), lo que impide de forma natural filtrar consultas por fechas ("hoy", "rango entre fecha inicio y fecha fin") e indexar cronológicamente.
3. **Falta de Acceso Controlado R01:**
   - Se requiere garantizar por diseño (RBAC) que esta vista sea de acceso exclusivo para el rol `R01` (Administrador Central), protegiendo la confidencialidad de los registros de actividad del personal.

---

## 2. Reglas de Interfaz y Negocio

```
                     [ ACCESO A AUDITORÍA: ROL R01 EXCLUSIVO ]
                                         │
                    ┌────────────────────┴────────────────────┐
                    ▼                                         ▼
            [ BARRA LATERAL ]                         [ ACCESO DIRECTO URL ]
            • Visible solo si                         • Validación de sesión con
              usuario.rol === R01                       puedeAdministrar(user.rol)
            • Icono: History                          • Si no es R01: redirección
            • Ruta: /auditoria                          o 403 Forbidden
                    │
                    └────────────────────┬────────────────────┘
                                         ▼
                               [ VISTA: /auditoria ]
            ┌─────────────────────────────────────────────────────────┐
            │ FILTROS:                                                │
            │ • Fecha Desde y Hasta (Por defecto: Hoy)                │
            │ • Filtros Territoriales Dependientes en Cascada:        │
            │   - Centro de Salud -> Bodega activa -> Usuario activo  │
            │ • Acción (Todas, crear, actualizar, eliminar)           │
            │ • Entidad (Todas, OrdenSalida, OrdenEntrada, ...)       │
            └────────────────────────────┬────────────────────────────┘
                                         ▼
            ┌─────────────────────────────────────────────────────────┐
            │ RESULTADOS:                                             │
            │ • Tabla ordenada cronológicamente descendente           │
            │ • Fecha y Hora | Usuario | Acción (Badge) | Entidad     │
            │ • Fila expandible con detalle humano (Bodegas, tipo, ...)│
            └─────────────────────────────────────────────────────────┘
```

### Regla R-01: Control de Acceso y Visibilidad Exclusiva (R01)
- La vista `/auditoria` es de acceso estrictamente reservado para usuarios con rol `R01` (`ROL_ADMINISTRADOR`).
- **Navegación:**
  - En [`src/shared/components/layout/app-sidebar-shell.tsx`](file:///c:/Users/benja/OneDrive/Escritorio/inventario-cmv-main/src/shared/components/layout/app-sidebar-shell.tsx), el enlace a "Auditoría" se renderiza condicionalmente **únicamente si el rol del usuario conectado es R01**.
  - Icono asignado: `History` de `lucide-react`.
- **Protección de Ruta:**
  - En `src/app/auditoria/page.tsx`, se valida la sesión mediante `requireSessionUser()`. Si `user.rol !== ROL_ADMINISTRADOR`, se redirige automáticamente al inicio (`/`).

### Regla R-02: Extensión del Modelo `Log` con Timestamp Cronológico
- Se añade al modelo `Log` en `prisma/schema.prisma` la columna:
  ```prisma
  model Log {
      id        String   @id @default(cuid()) @map("ID_Log") @db.VarChar(255)
      usuarioId String?  @map("ID_User") @db.VarChar(255)
      accion    String   @map("Accion") @db.VarChar(255)
      entidad   String   @map("Entidad") @db.VarChar(255)
      entidadId String?  @map("Entidad_ID") @db.VarChar(255)
      detalle   Json?    @map("Detalle")
      fecha     DateTime @default(now()) @map("Fecha")
      usuario   Usuario? @relation(fields: [usuarioId], references: [id])

      @@index([usuarioId])
      @@index([fecha])
      @@index([entidad])
      @@map("logs")
  }
  ```
- Al persistir cada evento, se almacena la marca temporal precisa con zona horaria local.

### Regla R-03: Panel de Filtros Multidimensional con Dependencia Territorial (Centro → Bodega → Usuario)
La pantalla de auditoría dispondrá de un formulario de filtros en la parte superior con validación y dependencia en cascada:
1. **Rango de Fechas:**
   - `Fecha Desde` (por defecto: fecha de hoy `00:00:00`).
   - `Fecha Hasta` (por defecto: fecha de hoy `23:59:59`).
2. **Filtros Dependientes en Cascada (Territorial y Funcionario):**
   - **Centro de Salud:** Selector que permite elegir un centro de salud del catálogo activo (con opción *"Todos los centros"*).
   - **Bodega:** Selector dependiente del centro de salud seleccionado. Al seleccionar un centro, muestra únicamente las bodegas activas asociadas a dicho centro (con opción *"Todas las bodegas"*). Si no se ha elegido centro, muestra todas las bodegas activas o se restringe a *"Todos"*.
   - **Usuario:** Selector dependiente del centro y de la bodega seleccionada. Al seleccionar una bodega, muestra únicamente los usuarios activos asociados al centro de salud y a la bodega seleccionada (a través de la asignación en `EncargadosBodega` o `Usuario.bodegaId`), ordenados alfabéticamente (con opción *"Todos los usuarios"*). Si se cambia el centro o la bodega, la lista de usuarios se actualiza dinámicamente y se resetea la selección de usuario para evitar inconsistencias territoriales.
3. **Acción Realizada:**
   - Selector: *"Todas las acciones"*, `crear`, `actualizar`, `eliminar`.
4. **Entidad Afectada:**
   - Selector: *"Todas las entidades"*, `OrdenSalida`, `OrdenEntrada`, `Producto`, `Usuario`, `Centro`, `Bodega`, `Unidad`.
5. **Botones de Control:**
   - Botón *"Filtrar"* (aplica filtros via Server Action / SearchParams).
   - Botón *"Limpiar"* (restablece a la fecha de hoy y reinicia los selectores en cascada).

### Regla R-04: Tabla de Resultados y Visualizador de Detalle Enriquecido
- Los registros se despliegan en orden cronológico inverso (`fecha DESC`).
- **Columnas principales:**
  1. **Fecha y Hora:** Formato legible `DD/MM/AAAA HH:mm:ss`.
  2. **Usuario:** Nombre completo y correo del funcionario responsable (o *"Sistema"* si no hay `usuarioId`).
  3. **Acción:** Insignia visual (`Badge`):
     - `crear`: Tono éxito (`success` / verde).
     - `actualizar`: Tono información (`info` / azul).
     - `eliminar`: Tono alerta/peligro (`destructive` / rojo).
  4. **Entidad e Identificador:** Nombre de la entidad y su ID recortado o referencial.
  5. **Detalle / Resumen:** Botón interactivo *"Ver detalle"* (`ChevronDown`).
- **Expansión de Detalle Humano (Fila Expandible):**
  - Al expandir la fila, se interpretan los campos del JSON `Detalle` y se presentan en etiquetas estructuradas:
    - Para `OrdenSalida`: Tipo de salida (ej. *Consumo Interno*, *Merma*, *A otra bodega*), Destino, Bodega Origen, Bodega Destino (si aplica) y cantidad de líneas.
    - Para `OrdenEntrada`: Guía de despacho, Origen, Bodega receptora, cantidad de líneas.
    - Para `Usuario`: Rol asignado, Centro, Bodegas asignadas, Estado.
  - Se incluye un visor plegable de código JSON crudo para análisis técnico avanzado.

### Regla R-05: Paginación y Rendimiento
- Paginación eficiente (`take: 50`, `skip: ...`) para evitar transferir miles de eventos a la memoria del navegador.
- Contador superior: *"Mostrando X eventos de auditoría encontrados"*.

---

## 3. Impacto en Componentes y Archivos

| Archivo | Tipo de Cambio | Descripción |
|---|---|---|
| `prisma/schema.prisma` | Modelo de Datos | Incorporación del campo `fecha` e índices por fecha y entidad en `model Log`. |
| `src/shared/components/layout/app-sidebar-shell.tsx` | UI / Navegación | Inclusión condicional de la opción *"Auditoría"* con icono `History` únicamente para `R01`. |
| `src/modules/auditoria/actions/auditoria.action.ts` | Server Actions | Consultas filtradas a la tabla `Log` con validación estricta de rol R01. |
| `src/modules/auditoria/components/auditoria-filtros.tsx` | Componente UI | Barra de filtros por usuario, fechas, acción y entidad. |
| `src/modules/auditoria/components/auditoria-tabla.tsx` | Componente UI | Tabla interactiva con badges de acción y filas expandibles de detalle estructurado. |
| `src/app/auditoria/page.tsx` | Nueva Página | Ruta protegida `/auditoria` para Administrador Central. |
| `src/__tests__/auditoria.test.ts` (y test UI) | Pruebas | Validación de control de acceso, filtros cronológicos y renderizado de detalles. |

---

## 4. Criterios de Aceptación (Definición de Terminado)

- [x] **CA-1: Restricción Estricta de Acceso:** Solo usuarios con rol R01 pueden ver el menú lateral de Auditoría y acceder a `/auditoria`. Otros roles son redirigidos de inmediato.
- [x] **CA-2: Registro con Fecha y Hora:** Cada evento registrado por `AuditLogger` almacena automáticamente su fecha y hora precisa en la columna `Fecha`.
- [x] **CA-3: Filtro por Rango Temporal:** El administrador puede consultar los eventos ocurridos en el día de hoy, o especificar cualquier rango de fechas.
- [x] **CA-4: Filtros en Cascada (Centro → Bodega → Usuario):** Al seleccionar un centro se filtran las bodegas asociadas, y al seleccionar una bodega se filtran los usuarios activos asociados a dicho centro y bodega, permitiendo aislar con exactitud los movimientos de ese funcionario.
- [x] **CA-5: Detalle Estructurado y Legible:** Al expandir el detalle de una orden de salida o entrada, se visualiza la bodega origen/destino, tipo de salida y cantidad de productos en un formato claro para el usuario.
- [x] **CA-6: Paginación Fluida:** Las consultas masivas se presentan paginadas de forma ágil sin sobrecargar la base de datos.
- [x] **CA-7: Cero Regresiones:** Compilación limpia con TypeScript (`npx tsc --noEmit`) y 100% de la suite de pruebas aprobada (`npx vitest run`).

---

## 5. Plan de Verificación y Pruebas

1. **Pruebas de Acceso y Autorización:**
   - Verificar que un usuario R02, R03 o R07 no puede acceder a `/auditoria` ni ve el botón en la barra lateral.
   - Verificar que un usuario R01 accede normalmente.
2. **Pruebas de Consultas y Filtros:**
   - Registrar eventos de prueba y validar que el filtro por rango de fechas devuelve únicamente los eventos en el intervalo.
   - Probar filtro por usuario específico y por tipo de acción (`crear`, `actualizar`, `eliminar`).
3. **Pruebas de Renderizado e Interacción:**
   - Verificar la expansión de la fila y la interpretación de los datos JSON en español.
4. **Regresión General:**
   - Ejecutar la suite completa para asegurar que `AuditLogger.log` sigue funcionando en todos los módulos existentes sin alterar su comportamiento previo.
