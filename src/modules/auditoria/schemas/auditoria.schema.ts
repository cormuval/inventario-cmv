import { z } from "zod";

export const filtroAuditoriaSchema = z.object({
    fechaDesde: z.string().optional(),
    fechaHasta: z.string().optional(),
    centroId: z.string().optional(),
    bodegaId: z.string().optional(),
    usuarioId: z.string().optional(),
    accion: z.enum(["todas", "crear", "actualizar", "eliminar"]).default("todas"),
    entidad: z.enum([
        "todas",
        "OrdenSalida",
        "OrdenEntrada",
        "Producto",
        "Usuario",
        "Centro",
        "Bodega",
        "Unidad"
    ]).default("todas"),
    pagina: z.coerce.number().int().positive().default(1),
    limite: z.coerce.number().int().positive().default(50)
});

export type FiltroAuditoriaInput = z.infer<typeof filtroAuditoriaSchema>;
