import { z } from "zod";
import { esCodigoRecepcionValido } from "@/modules/orden-salida/utils/codigo-recepcion";

export const buscarPrestamoSchema = z.object({
    codigo: z.string().trim().refine(esCodigoRecepcionValido, {
        message: "El código no es válido. Debe tener 7 caracteres alfanuméricos válidos."
    })
});

export const confirmarRecepcionPrestamoSchema = z.object({
    codigo: z.string().trim().refine(esCodigoRecepcionValido, {
        message: "El código no es válido. Debe tener 7 caracteres alfanuméricos válidos."
    }),
    bodegaDestinoId: z.string().min(1, "Debe seleccionar la bodega de destino."),
    observacionRecepcion: z
        .string()
        .max(255, "Las observaciones no pueden superar los 255 caracteres.")
        .optional()
        .or(z.literal(""))
});

export type BuscarPrestamoInput = z.infer<typeof buscarPrestamoSchema>;
export type ConfirmarRecepcionPrestamoInput = z.infer<typeof confirmarRecepcionPrestamoSchema>;
