import { z } from "zod";

// utils
import { PRODUCTO_ID_MAXIMO } from "@/modules/productos/utils/productos-filtros";

export const productosFiltrosSchema = z.object({
    id: z.number().int().min(1).max(PRODUCTO_ID_MAXIMO).nullable(),
    linea: z.string().max(255),
    estado: z.enum(["todos", "activo", "inactivo"]),
    descripcion: z.string().max(255),
    pagina: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
    advertencias: z.array(z.string())
}).strict();
