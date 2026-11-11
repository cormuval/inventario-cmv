import { z } from "zod";

export const tipoPedidoEnum = z.enum(["MENSUAL", "SUPLEMENTARIO"]);
export type TipoPedido = z.infer<typeof tipoPedidoEnum>;

export const estadoPedidoEnum = z.enum(["BORRADOR", "ENVIADO", "REVISADO", "ANULADO"]);
export type EstadoPedido = z.infer<typeof estadoPedidoEnum>;

export const pedidoDetalleInputSchema = z.object({
    productoId: z.coerce.number().int().positive("Producto inválido."),
    cantidadSolicitada: z.coerce.number().int().min(0, "La cantidad solicitada no puede ser negativa.")
});

export const crearPedidoSchema = z.object({
    centroId: z.string().min(1, "Debe seleccionar un centro."),
    bodegaId: z.string().optional().nullable(),
    tipo: tipoPedidoEnum,
    periodo: z.string().regex(/^\d{4}-\d{2}$/, "El período debe tener formato AAAA-MM.").optional().nullable(),
    observaciones: z.string().max(500, "Las observaciones no pueden exceder 500 caracteres.").optional().nullable(),
    detalles: z.array(pedidoDetalleInputSchema).min(1, "Debe incluir al menos un producto de aseo."),
    enviarInmediatamente: z.boolean().default(false)
});
export type CrearPedidoInput = z.infer<typeof crearPedidoSchema>;

export const guardarBorradorSchema = z.object({
    pedidoId: z.string().optional().nullable(),
    centroId: z.string().min(1, "Debe seleccionar un centro."),
    bodegaId: z.string().optional().nullable(),
    tipo: tipoPedidoEnum,
    periodo: z.string().regex(/^\d{4}-\d{2}$/, "El período debe tener formato AAAA-MM.").optional().nullable(),
    observaciones: z.string().max(500, "Las observaciones no pueden exceder 500 caracteres.").optional().nullable(),
    detalles: z.array(pedidoDetalleInputSchema)
});
export type GuardarBorradorInput = z.infer<typeof guardarBorradorSchema>;

export const ajusteDetalleSchema = z.object({
    detalleId: z.string().min(1),
    cantidadAprobada: z.coerce.number().int().min(0, "La cantidad aprobada no puede ser negativa."),
    observacionAjuste: z.string().max(255).optional().nullable()
});

export const revisarPedidoSchema = z.object({
    pedidoId: z.string().min(1, "ID de pedido requerido."),
    observacionesRevision: z.string().max(500, "Las observaciones de revisión no pueden exceder 500 caracteres.").optional().nullable(),
    ajustes: z.array(ajusteDetalleSchema).min(1, "Debe incluir el detalle de cantidades revisadas.")
});
export type RevisarPedidoInput = z.infer<typeof revisarPedidoSchema>;

export const anularPedidoSchema = z.object({
    pedidoId: z.string().min(1, "ID de pedido requerido."),
    motivo: z.string().trim().min(5, "El motivo de anulación debe tener al menos 5 caracteres.")
});
export type AnularPedidoInput = z.infer<typeof anularPedidoSchema>;

export const itemPlantillaSchema = z.object({
    productoId: z.coerce.number().int().positive(),
    cantidadHabitual: z.coerce.number().int().min(0)
});

export const guardarPlantillaSchema = z.object({
    centroId: z.string().min(1, "Debe indicar el centro."),
    items: z.array(itemPlantillaSchema)
});
export type GuardarPlantillaInput = z.infer<typeof guardarPlantillaSchema>;

