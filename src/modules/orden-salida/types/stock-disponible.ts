import type { Stock } from "@prisma/client";

export interface StockDisponible extends Stock {
    producto: {
        descripcion: string;
    };
    bodega: {
        nombre: string;
    };
}
