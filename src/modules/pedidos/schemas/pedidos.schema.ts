import { z } from "zod";

export const tipoPedidoEnum = z.enum(["MENSUAL", "SUPLEMENTARIO"]);
export type TipoPedido = z.infer<typeof tipoPedidoEnum>;

export const estadoPedidoEnum = z.enum(["BORRADOR", "FINALIZADO", "ANULADO"]);
export type EstadoPedido = z.infer<typeof estadoPedidoEnum>;

export const pedidoDetalleInputSchema = z.object({
    productoId: z.coerce.number().int().positive("Producto inválido."),
    cantidadSolicitada: z.coerce
        .number()
        .int("La cantidad debe ser un número entero.")
        .min(0, "La cantidad solicitada no puede ser negativa.")
        .max(1_000_000, "La cantidad solicitada es demasiado alta.")
});

function sinProductosRepetidos(detalles: Array<{ productoId: number }>): boolean {
    return new Set(detalles.map((d) => d.productoId)).size === detalles.length;
}

/** Guarda un borrador nuevo o existente; con `finalizar` lo deja en estado FINALIZADO. */
export const guardarPedidoSchema = z
    .object({
        pedidoId: z.string().min(1).optional().nullable(),
        centroId: z.string().min(1, "Debe seleccionar un centro."),
        bodegaId: z.string().optional().nullable(),
        tipo: tipoPedidoEnum,
        periodo: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "El período debe tener formato AAAA-MM.").optional().nullable(),
        observaciones: z.string().trim().max(500, "Las observaciones no pueden exceder 500 caracteres.").optional().nullable(),
        detalles: z.array(pedidoDetalleInputSchema).refine(sinProductosRepetidos, "Hay productos repetidos en el pedido."),
        finalizar: z.boolean().default(false)
    })
    .superRefine((data, ctx) => {
        if (data.tipo === "MENSUAL" && !data.periodo) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Debe indicar el período del pedido mensual.", path: ["periodo"] });
        }
        if (data.finalizar && !data.detalles.some((d) => d.cantidadSolicitada > 0)) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "Debe solicitar al menos un producto con cantidad mayor a 0.",
                path: ["detalles"]
            });
        }
    });
export type GuardarPedidoInput = z.input<typeof guardarPedidoSchema>;

export const anularPedidoSchema = z.object({
    pedidoId: z.string().min(1, "ID de pedido requerido."),
    motivo: z.string().trim().min(5, "El motivo de anulación debe tener al menos 5 caracteres.").max(255, "El motivo no puede exceder 255 caracteres.")
});

export const itemPlantillaSchema = z.object({
    productoId: z.coerce.number().int().positive(),
    cantidadHabitual: z.coerce.number().int().min(0).max(1_000_000)
});

export const guardarPlantillaSchema = z.object({
    centroId: z.string().min(1, "Debe indicar el centro."),
    items: z.array(itemPlantillaSchema).refine(sinProductosRepetidos, "Hay productos repetidos en la plantilla.")
});
export type GuardarPlantillaInput = z.input<typeof guardarPlantillaSchema>;
