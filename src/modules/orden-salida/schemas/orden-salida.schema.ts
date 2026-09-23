import { z } from "zod";

// utils
import { validarFechaSalida, esLoteCaducado } from "@/modules/stock/utils/movimientos";

export const ordenSalidaDetalleSchema = z.object({
    productoId: z.coerce.number().int().positive(),
    cantidad: z.coerce.number().int().positive("La cantidad debe ser positiva."),
    lote: z.string().trim().min(3, "El lote debe tener al menos 3 caracteres."),
    fechaCaducidad: z.coerce.date()
});

export const crearOrdenSalidaSchema = z.object({
    fecha: z.coerce.date().refine((fecha) => validarFechaSalida(fecha), {
        message: "La fecha debe estar entre hoy y los ultimos 7 dias."
    }),
    bodegaId: z.string().min(1),
    centroId: z.string().min(1),
    tipoSalida: z.string().min(1),
    destino: z.string().min(1),
    codigoSalida: z.string().optional(),
    correoDestino: z.string().email().optional().or(z.literal("")),
    detalles: z.array(ordenSalidaDetalleSchema).min(1, "Debe ingresar al menos un detalle.")
}).superRefine((data, ctx) => {
    const esMerma = data.tipoSalida.trim().toLowerCase() === "merma";

    if (esMerma) {
        if (data.destino.trim().length < 5) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "Para registrar una salida por Merma se requiere una justificación detallada de al menos 5 caracteres.",
                path: ["destino"]
            });
        }
    } else {
        data.detalles.forEach((detalle, index) => {
            if (esLoteCaducado(detalle.fechaCaducidad)) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: `El lote "${detalle.lote}" se encuentra caducado. Solo puede ser retirado mediante el tipo de salida "Merma".`,
                    path: ["detalles", index, "fechaCaducidad"]
                });
            }
        });
    }
});

export type CrearOrdenSalidaInput = z.infer<typeof crearOrdenSalidaSchema>;
export type OrdenSalidaDetalleInput = z.infer<typeof ordenSalidaDetalleSchema>;
