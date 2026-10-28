import { z } from "zod";
import { VALORES_ENTIDADES_AUDITORIA } from "@/modules/auditoria/constants/entidades";

export const filtroAuditoriaSchema = z.object({
    fechaDesde: z.string().optional(),
    fechaHasta: z.string().optional(),
    centroId: z.string().optional(),
    bodegaId: z.string().optional(),
    usuarioId: z.string().optional(),
    accion: z.enum(["todas", "crear", "actualizar", "eliminar"]).default("todas"),
    entidad: z.enum(VALORES_ENTIDADES_AUDITORIA).default("todas"),
    pagina: z.coerce.number().int().positive().default(1),
    limite: z.coerce.number().int().positive().max(100).default(50)
});

export type FiltroAuditoriaInput = z.infer<typeof filtroAuditoriaSchema>;
