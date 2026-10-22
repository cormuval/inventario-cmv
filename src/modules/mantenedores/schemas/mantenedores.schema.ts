import { z } from "zod";

// config
import { DOMINIO_INSTITUCIONAL } from "@/config/auth";

// utils
import { esCorreoInstitucional, normalizarEmail } from "@/modules/auth/utils/dominio";

export const centroSchema = z.object({
    nombre: z.string().min(3),
    estado: z.coerce.boolean().default(true)
});

export const bodegaSchema = z.object({
    nombre: z.string().min(3),
    centroId: z.string().min(1),
    estado: z.coerce.boolean().default(true)
});

export const unidadSchema = z.object({
    descripcion: z.string().min(2)
});

export const usuarioSchema = z.object({
    nombre: z.string().min(2),
    apPaterno: z.string().min(2),
    apMaterno: z.string().optional(),
    rolId: z.string().min(1),
    centroId: z.string().min(1),
    bodegaId: z.string().optional(),
    bodegaIds: z.array(z.string()).default([]),
    telefono: z.string().optional(),
    email: z
        .string()
        .email()
        .transform(normalizarEmail)
        .refine(esCorreoInstitucional, {
            message: `El correo debe ser institucional (@${DOMINIO_INSTITUCIONAL}).`
        }),
    estado: z.coerce.boolean().default(true)
});

export const editarUsuarioSchema = z.object({
    id: z.string().min(1),
    nombre: z.string().min(2),
    apPaterno: z.string().min(2),
    apMaterno: z.string().optional(),
    rolId: z.string().min(1),
    centroId: z.string().min(1),
    bodegaIds: z.array(z.string()).default([]),
    telefono: z.string().optional(),
    email: z
        .string()
        .email()
        .transform(normalizarEmail)
        .refine(esCorreoInstitucional, {
            message: `El correo debe ser institucional (@${DOMINIO_INSTITUCIONAL}).`
        }),
    estado: z.coerce.boolean().default(true)
});
