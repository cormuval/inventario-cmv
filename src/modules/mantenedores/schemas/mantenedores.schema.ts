import { z } from "zod";

// config
import { DOMINIO_INSTITUCIONAL } from "@/config/auth";

// utils
import { esCorreoInstitucional, normalizarEmail } from "@/modules/auth/utils/dominio";

export const centroSchema = z.object({
    nombre: z.string().min(3, "El nombre del centro debe tener al menos 3 caracteres."),
    estado: z.coerce.boolean().default(true)
});

export const editarCentroSchema = z.object({
    id: z.string().min(1, "ID de centro requerido."),
    nombre: z.string().min(3, "El nombre del centro debe tener al menos 3 caracteres."),
    estado: z.coerce.boolean().default(true)
});

export const bodegaSchema = z.object({
    nombre: z.string().min(3, "El nombre de la bodega debe tener al menos 3 caracteres."),
    centroId: z.string().min(1, "Debe seleccionar un centro de salud."),
    estado: z.coerce.boolean().default(true)
});

export const editarBodegaSchema = z.object({
    id: z.string().min(1, "ID de bodega requerido."),
    nombre: z.string().min(3, "El nombre de la bodega debe tener al menos 3 caracteres."),
    centroId: z.string().min(1, "Debe seleccionar un centro de salud."),
    estado: z.coerce.boolean().default(true)
});

export const unidadSchema = z.object({
    descripcion: z.string().min(2, "La descripción debe tener al menos 2 caracteres."),
    estado: z.coerce.boolean().default(true)
});

export const editarUnidadSchema = z.object({
    id: z.string().min(1, "ID de unidad requerido."),
    descripcion: z.string().min(2, "La descripción debe tener al menos 2 caracteres."),
    estado: z.coerce.boolean().default(true)
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
