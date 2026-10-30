// Tipos y constantes de la migración AppSheet -> Inventario CMV.
// Spec: docs/superpowers/specs/2026-10-29-migracion-appsheet-design.md

export const CENTRO_PRUEBA_ID = "3d3f9a13";
export const ROL_ADMIN_ASEO_ID = "dac3497d";
export const ROL_VISUALIZADOR_ID = "R04";
export const ROL_ENCARGADO_CENTRO_ID = "R02";
export const ROLES_DESTINO: readonly string[] = ["R01", "R02", "R03", "R06", "R07"];
export const CENTRO_ADMINISTRACION_ID = "centro-administracion-das";
export const USUARIO_TECNICO_ID = "migracion-appsheet";
export const USUARIO_TECNICO_EMAIL = "migracion-appsheet@cmvalparaiso.cl";
export const LOTE_SIN_LOTE = "SIN LOTE";
export const CADUCIDAD_SIN_FECHA = new Date(Date.UTC(2099, 11, 31));
export const TIPO_SALIDA_OTROS_CENTROS = "A Otros Centros";
export const DOMINIO_INSTITUCIONAL = "@cmvalparaiso.cl";

export const TABLAS = [
    "Centro",
    "Bodega",
    "Unidad",
    "Producto",
    "Usuario",
    "OrdenEntrada",
    "OrdenEntradaDetalle",
    "OrdenSalida",
    "OrdenSalidaDetalle",
    "Stock"
] as const;

export type Tabla = (typeof TABLAS)[number];

// Valor crudo tal como lo entrega $queryRawUnsafe (MySQL sin restricciones en el origen).
export type Valor = string | number | bigint | boolean | Date | null;

export interface Rechazo {
    tabla: Tabla;
    clave: string;
    regla: string;
    detalle: string;
}

export type Resultado<T> = { ok: true; data: T; advertencias: Rechazo[] } | { ok: false; rechazo: Rechazo };

export interface TablaTransformada<T> {
    leidos: number;
    aceptados: T[];
    rechazos: Rechazo[];
    advertencias: Rechazo[];
}

// ---- Origen (nombres de columna de AppSheet) ----

export interface CentroOrigen {
    ID_Centro: Valor;
    Nombre: Valor;
    Estado: Valor;
}

export interface BodegaOrigen {
    ID_Bodega: Valor;
    Bodega: Valor;
    ID_Centro: Valor;
    Estado: Valor;
}

export interface UnidadOrigen {
    ID_Unidad: Valor;
    Descripcion: Valor;
}

export interface ProductoOrigen {
    ID_Product: Valor;
    Linea: Valor;
    Descripcion: Valor;
}

export interface UsuarioOrigen {
    ID_User: Valor;
    Nombre: Valor;
    Ap_Paterno: Valor;
    Ap_Materno: Valor;
    Rol: Valor;
    ID_Bodega: Valor;
    Telefono: Valor;
    Email: Valor;
    ID_Centro: Valor;
    Estado: Valor;
}

export interface OrdenEntradaOrigen {
    ID_OrdenEntrada: Valor;
    Fecha: Valor;
    ID_User: Valor;
    Origen: Valor;
    GuiaDespacho: Valor;
    ID_Centro: Valor;
    ID_Bodega: Valor;
    Codigo_Recepcion: Valor;
}

export interface OrdenEntradaDetalleOrigen {
    ID_Entrada: Valor;
    ID_Product: Valor;
    Categoria: Valor;
    Fecha_Caducidad: Valor;
    Cantidad: Valor;
    Lote: Valor;
    ID_OrdenEntrada: Valor;
}

export interface OrdenSalidaOrigen {
    ID_OrdenSalida: Valor;
    Fecha: Valor;
    ID_User: Valor;
    ID_Bodega: Valor;
    Tipo_Salida: Valor;
    ID_Centro: Valor;
    Destino: Valor;
    Codigo_Salida: Valor;
    Enviar_Correo: Valor;
    Correo_Destino: Valor;
}

export interface OrdenSalidaDetalleOrigen {
    ID_Detalle: Valor;
    ID_Product: Valor;
    Cantidad: Valor;
    ID_OrdenSalida: Valor;
    Lote: Valor;
    Fecha_Caducidad: Valor;
}

export interface StockOrigen {
    ID_Stock: Valor;
    ID_Product: Valor;
    ID_Bodega: Valor;
    Cantidad_Disponible: Valor;
    Fecha_Ultima_Actualizacion: Valor;
    StockMinimo: Valor;
    Lote: Valor;
    Fecha_Caducidad: Valor;
}

export interface DatosOrigen {
    centros: CentroOrigen[];
    bodegas: BodegaOrigen[];
    unidades: UnidadOrigen[];
    productos: ProductoOrigen[];
    usuarios: UsuarioOrigen[];
    entradas: OrdenEntradaOrigen[];
    entradaDetalles: OrdenEntradaDetalleOrigen[];
    salidas: OrdenSalidaOrigen[];
    salidaDetalles: OrdenSalidaDetalleOrigen[];
    stock: StockOrigen[];
}

// ---- Destino (campos de los modelos Prisma) ----

export interface CentroDestino {
    id: string;
    nombre: string;
    estado: boolean;
}

export interface BodegaDestino {
    id: string;
    nombre: string;
    centroId: string;
    estado: boolean;
}

export interface UnidadDestino {
    id: string;
    descripcion: string;
}

export interface ProductoDestino {
    id: number;
    linea: string;
    descripcion: string;
    estado: boolean;
}

export interface UsuarioDestino {
    id: string;
    nombre: string;
    apPaterno: string | null;
    apMaterno: string | null;
    rolId: string;
    bodegaId: string | null;
    telefono: string | null;
    email: string;
    centroId: string;
    estado: boolean;
}

export interface OrdenEntradaDestino {
    id: string;
    fecha: Date;
    usuarioId: string;
    origen: string;
    guiaDespacho: string | null;
    centroId: string;
    bodegaId: string;
    codigoRecepcion: string | null;
}

export interface OrdenEntradaDetalleDestino {
    id: string;
    productoId: number;
    categoria: string;
    fechaCaducidad: Date;
    cantidad: number;
    lote: string;
    ordenEntradaId: string;
}

export interface OrdenSalidaDestino {
    id: string;
    fecha: Date;
    usuarioId: string;
    bodegaId: string;
    tipoSalida: string;
    centroId: string;
    destino: string;
    codigoSalida: string | null;
    enviarCorreo: boolean;
    correoDestino: string | null;
}

export interface OrdenSalidaDetalleDestino {
    id: string;
    productoId: number;
    cantidad: number;
    ordenSalidaId: string;
    lote: string;
    fechaCaducidad: Date;
}

export interface StockDestino {
    id: string;
    productoId: number;
    bodegaId: string;
    cantidadDisponible: number;
    fechaUltimaActualizacion: Date;
    stockMinimo: number;
    lote: string;
    fechaCaducidad: Date;
}

export interface UsuarioExistente {
    id: string;
    email: string;
}

export interface ContextoMigracion {
    usuariosDestino: UsuarioExistente[];
    ahora: Date;
}

export interface MigracionTransformada {
    Centro: TablaTransformada<CentroDestino>;
    Bodega: TablaTransformada<BodegaDestino>;
    Unidad: TablaTransformada<UnidadDestino>;
    Producto: TablaTransformada<ProductoDestino>;
    Usuario: TablaTransformada<UsuarioDestino>;
    OrdenEntrada: TablaTransformada<OrdenEntradaDestino>;
    OrdenEntradaDetalle: TablaTransformada<OrdenEntradaDetalleDestino>;
    OrdenSalida: TablaTransformada<OrdenSalidaDestino>;
    OrdenSalidaDetalle: TablaTransformada<OrdenSalidaDetalleDestino>;
    Stock: TablaTransformada<StockDestino>;
    // ID de usuario AppSheet -> ID de usuario en el destino
    reasignaciones: Record<string, string>;
}
