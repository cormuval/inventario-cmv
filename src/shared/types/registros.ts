import type { Bodega, Centro } from "@prisma/client";

// utils
import type { Paginacion } from "@/shared/utils/paginacion";

export interface ResultadoRegistros<T> {
    filas: T[];
    paginacion: Paginacion;
    centros: Centro[];
    bodegas: Bodega[];
    centroId: string | null;
    bodegaId: string | null;
    puedeFiltrarCentro: boolean;
    puedeOperar: boolean;
}

export interface DetalleOrdenLinea {
    id: string;
    productoId: number;
    producto: string;
    lote: string;
    fechaCaducidad: Date;
    cantidad: number;
}

export interface DetalleOrdenResultado {
    ok: boolean;
    message: string;
    lineas: DetalleOrdenLinea[];
}

