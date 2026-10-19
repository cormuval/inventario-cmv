"use server";

import { revalidatePath } from "next/cache";

// lib
import { puedeAdministrar, requireSessionUser } from "@/shared/lib/auth";
import { AuditLogger } from "@/shared/lib/logger";
import { prisma } from "@/shared/lib/prisma";

// schemas
import {
    bodegaSchema,
    centroSchema,
    editarUsuarioSchema,
    unidadSchema,
    usuarioSchema
} from "@/modules/mantenedores/schemas/mantenedores.schema";

// types
import type { ActionState } from "@/shared/types/action-state";

export async function listarMantenedores() {
    const [centros, bodegas, roles, usuarios, unidades] = await Promise.all([
        prisma.centro.findMany({ orderBy: { nombre: "asc" } }),
        prisma.bodega.findMany({ include: { centro: true }, orderBy: { nombre: "asc" } }),
        prisma.rol.findMany({ orderBy: { id: "asc" } }),
        prisma.usuario.findMany({
            include: {
                rol: true,
                centro: true,
                bodega: true,
                encargos: { include: { bodega: true } }
            },
            orderBy: { nombre: "asc" }
        }),
        prisma.unidad.findMany({ orderBy: { descripcion: "asc" } })
    ]);

    return { centros, bodegas, roles, usuarios, unidades };
}

export async function crearCentro(prevState: ActionState, formData: FormData): Promise<ActionState> {
    return ejecutarAdmin("Centro", "/mantenedores", async (usuarioId) => {
        const parsed = centroSchema.parse({
            nombre: formData.get("nombre"),
            estado: formData.get("estado") === "on"
        });
        const centro = await prisma.centro.create({ data: parsed });
        await AuditLogger.log({ usuarioId, accion: "crear", entidad: "Centro", entidadId: centro.id });
        return "Centro creado.";
    });
}

export async function crearBodega(prevState: ActionState, formData: FormData): Promise<ActionState> {
    return ejecutarAdmin("Bodega", "/mantenedores", async (usuarioId) => {
        const parsed = bodegaSchema.parse({
            nombre: formData.get("nombre"),
            centroId: formData.get("centroId"),
            estado: formData.get("estado") === "on"
        });
        const bodega = await prisma.bodega.create({ data: parsed });
        await AuditLogger.log({ usuarioId, accion: "crear", entidad: "Bodega", entidadId: bodega.id });
        return "Bodega creada.";
    });
}

export async function crearUnidad(prevState: ActionState, formData: FormData): Promise<ActionState> {
    return ejecutarAdmin("Unidad", "/mantenedores", async (usuarioId) => {
        const parsed = unidadSchema.parse({ descripcion: formData.get("descripcion") });
        const unidad = await prisma.unidad.create({ data: parsed });
        await AuditLogger.log({ usuarioId, accion: "crear", entidad: "Unidad", entidadId: unidad.id });
        return "Unidad creada.";
    });
}

export async function crearUsuario(prevState: ActionState, formData: FormData): Promise<ActionState> {
    return ejecutarAdmin("Usuario", "/mantenedores", async (usuarioId) => {
        const rawBodegaIds = formData.getAll("bodegaIds").map(String).filter(Boolean);
        const singleBodegaId = formData.get("bodegaId")?.toString() || undefined;
        const bodegaIds = rawBodegaIds.length > 0 ? rawBodegaIds : (singleBodegaId ? [singleBodegaId] : []);

        const parsed = usuarioSchema.parse({
            nombre: formData.get("nombre"),
            apPaterno: formData.get("apPaterno"),
            apMaterno: formData.get("apMaterno")?.toString() || undefined,
            rolId: formData.get("rolId"),
            centroId: formData.get("centroId"),
            bodegaId: bodegaIds[0] ?? undefined,
            bodegaIds,
            telefono: formData.get("telefono")?.toString() || undefined,
            email: formData.get("email"),
            estado: formData.get("estado") === "on" || formData.get("estado") === "true"
        });

        if (parsed.bodegaIds.length > 0) {
            const bodegasValidas = await prisma.bodega.findMany({
                where: {
                    id: { in: parsed.bodegaIds },
                    centroId: parsed.centroId
                }
            });
            if (bodegasValidas.length !== parsed.bodegaIds.length) {
                throw new Error("Una o más bodegas no pertenecen al centro seleccionado.");
            }
        }

        const usuario = await prisma.$transaction(async (tx) => {
            const nuevo = await tx.usuario.create({
                data: {
                    nombre: parsed.nombre,
                    apPaterno: parsed.apPaterno,
                    apMaterno: parsed.apMaterno,
                    rolId: parsed.rolId,
                    centroId: parsed.centroId,
                    bodegaId: parsed.bodegaIds[0] ?? null,
                    telefono: parsed.telefono,
                    email: parsed.email,
                    estado: parsed.estado
                }
            });

            if (parsed.bodegaIds.length > 0) {
                await tx.encargadosBodega.createMany({
                    data: parsed.bodegaIds.map((bId) => ({
                        encargadoId: nuevo.id,
                        centroId: parsed.centroId,
                        bodegaId: bId,
                        rolId: parsed.rolId,
                        email: parsed.email
                    }))
                });
            }

            return nuevo;
        });

        await AuditLogger.log({
            usuarioId,
            accion: "crear",
            entidad: "Usuario",
            entidadId: usuario.id,
            detalle: `Usuario ${usuario.email} creado con ${parsed.bodegaIds.length} bodegas asignadas.`
        });
        return "Usuario creado.";
    });
}

export async function editarUsuario(prevState: ActionState, formData: FormData): Promise<ActionState> {
    try {
        const user = await requireSessionUser();
        if (!puedeAdministrar(user.rol)) {
            return { ok: false, message: "Solo administradores pueden modificar usuarios." };
        }

        const rawBodegaIds = formData.getAll("bodegaIds").map(String).filter(Boolean);
        const singleBodegaId = formData.get("bodegaId")?.toString() || undefined;
        const bodegaIds = rawBodegaIds.length > 0 ? rawBodegaIds : (singleBodegaId ? [singleBodegaId] : []);

        const parsed = editarUsuarioSchema.parse({
            id: formData.get("id"),
            nombre: formData.get("nombre"),
            apPaterno: formData.get("apPaterno"),
            apMaterno: formData.get("apMaterno")?.toString() || undefined,
            rolId: formData.get("rolId"),
            centroId: formData.get("centroId"),
            bodegaIds,
            telefono: formData.get("telefono")?.toString() || undefined,
            email: formData.get("email"),
            estado: formData.get("estado") === "on" || formData.get("estado") === "true"
        });

        // Protección contra auto-desactivación
        if (parsed.id === user.id && !parsed.estado) {
            return { ok: false, message: "No puedes desactivar tu propia cuenta de usuario." };
        }

        // Protección contra auto-degradación de rol R01
        if (parsed.id === user.id && parsed.rolId !== "R01") {
            return { ok: false, message: "No puedes quitarte el rol de administrador." };
        }

        // Validar que las bodegas correspondan al centro indicado
        if (parsed.bodegaIds.length > 0) {
            const bodegasValidas = await prisma.bodega.findMany({
                where: {
                    id: { in: parsed.bodegaIds },
                    centroId: parsed.centroId
                }
            });
            if (bodegasValidas.length !== parsed.bodegaIds.length) {
                return { ok: false, message: "Una o más bodegas no pertenecen al centro seleccionado." };
            }
        }

        await prisma.$transaction(async (tx) => {
            await tx.usuario.update({
                where: { id: parsed.id },
                data: {
                    nombre: parsed.nombre,
                    apPaterno: parsed.apPaterno,
                    apMaterno: parsed.apMaterno ?? null,
                    rolId: parsed.rolId,
                    centroId: parsed.centroId,
                    bodegaId: parsed.bodegaIds[0] ?? null,
                    telefono: parsed.telefono ?? null,
                    email: parsed.email,
                    estado: parsed.estado
                }
            });

            await tx.encargadosBodega.deleteMany({
                where: { encargadoId: parsed.id }
            });

            if (parsed.bodegaIds.length > 0) {
                await tx.encargadosBodega.createMany({
                    data: parsed.bodegaIds.map((bodegaId) => ({
                        encargadoId: parsed.id,
                        centroId: parsed.centroId,
                        bodegaId,
                        rolId: parsed.rolId,
                        email: parsed.email
                    }))
                });
            }
        });

        await AuditLogger.log({
            usuarioId: user.id,
            accion: "actualizar",
            entidad: "Usuario",
            entidadId: parsed.id,
            detalle: `Usuario ${parsed.email} actualizado con ${parsed.bodegaIds.length} bodegas.`
        });

        revalidatePath("/mantenedores");
        return { ok: true, message: "Usuario actualizado exitosamente." };
    } catch (error) {
        return {
            ok: false,
            message: error instanceof Error ? error.message : "No se pudo actualizar el usuario."
        };
    }
}

export async function toggleEstadoUsuario(prevState: ActionState, formData: FormData): Promise<ActionState> {
    try {
        const user = await requireSessionUser();
        if (!puedeAdministrar(user.rol)) {
            return { ok: false, message: "Solo administradores pueden modificar el estado de usuarios." };
        }

        const id = formData.get("id")?.toString();
        const estadoRaw = formData.get("estado");
        if (!id) {
            return { ok: false, message: "ID de usuario requerido." };
        }

        const nuevoEstado = estadoRaw === "true" || estadoRaw === "on";

        // Protección contra auto-desactivación
        if (id === user.id && !nuevoEstado) {
            return { ok: false, message: "No puedes desactivar tu propia cuenta de usuario." };
        }

        await prisma.usuario.update({
            where: { id },
            data: { estado: nuevoEstado }
        });

        await AuditLogger.log({
            usuarioId: user.id,
            accion: "actualizar",
            entidad: "Usuario",
            entidadId: id,
            detalle: `Estado de usuario cambiado a ${nuevoEstado ? "activo" : "inactivo"}.`
        });

        revalidatePath("/mantenedores");
        return {
            ok: true,
            message: nuevoEstado ? "Usuario activado exitosamente." : "Usuario desactivado exitosamente."
        };
    } catch (error) {
        return {
            ok: false,
            message: error instanceof Error ? error.message : "No se pudo cambiar el estado del usuario."
        };
    }
}

async function ejecutarAdmin(
    entidad: string,
    path: string,
    handler: (usuarioId: string) => Promise<string>
): Promise<ActionState> {
    try {
        const user = await requireSessionUser();
        if (!puedeAdministrar(user.rol)) {
            return { ok: false, message: `Solo administradores pueden modificar ${entidad}.` };
        }

        const message = await handler(user.id);
        revalidatePath(path);
        return { ok: true, message };
    } catch (error) {
        return { ok: false, message: error instanceof Error ? error.message : `No se pudo guardar ${entidad}.` };
    }
}
