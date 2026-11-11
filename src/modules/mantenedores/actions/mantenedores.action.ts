"use server";

import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import { ZodError } from "zod";

// config
import { ROL_ADMINISTRADOR } from "@/config/auth";

// lib
import { puedeAdministrar, requireSessionUser } from "@/shared/lib/auth";
import { AuditLogger } from "@/shared/lib/logger";
import { prisma } from "@/shared/lib/prisma";

// schemas
import {
    bodegaSchema,
    centroSchema,
    editarBodegaSchema,
    editarCentroSchema,
    editarUnidadSchema,
    editarUsuarioSchema,
    unidadSchema,
    usuarioSchema
} from "@/modules/mantenedores/schemas/mantenedores.schema";

// types
import type { ActionState } from "@/shared/types/action-state";

export async function listarMantenedores() {
    const user = await requireSessionUser();
    if (!puedeAdministrar(user.rol)) {
        throw new Error("Solo administradores pueden acceder a los mantenedores.");
    }

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
            estado: formData.get("estado") === "on" || formData.get("estado") === "true"
        });
        const centro = await prisma.centro.create({ data: parsed });
        await AuditLogger.log({ usuarioId, centroId: centro.id, accion: "crear", entidad: "Centro", entidadId: centro.id });
        return "Centro creado.";
    });
}

export async function editarCentro(prevState: ActionState, formData: FormData): Promise<ActionState> {
    try {
        const user = await requireSessionUser();
        if (!puedeAdministrar(user.rol)) {
            return { ok: false, message: "Solo administradores pueden modificar centros." };
        }

        const estadoRaw = formData.get("estado");
        const estado = estadoRaw === "on" || estadoRaw === "true";
        const parsed = editarCentroSchema.parse({
            id: formData.get("id"),
            nombre: formData.get("nombre"),
            estado
        });

        const previo = await prisma.centro.findUnique({
            where: { id: parsed.id }
        });
        if (!previo) {
            return { ok: false, message: "Centro no encontrado." };
        }

        // Regla R-02: Bloqueo preventivo al desactivar Centro
        if (previo.estado && !parsed.estado) {
            const bodegasActivas = await prisma.bodega.count({
                where: { centroId: parsed.id, estado: true }
            });
            if (bodegasActivas > 0) {
                return {
                    ok: false,
                    message: `No se puede desactivar el centro porque contiene ${bodegasActivas} bodega(s) activa(s). Desactívelas primero.`
                };
            }

            const usuariosActivos = await prisma.usuario.count({
                where: { centroId: parsed.id, estado: true }
            });
            if (usuariosActivos > 0) {
                return {
                    ok: false,
                    message: `No se puede desactivar el centro porque contiene ${usuariosActivos} usuario(s) activo(s). Reasígnelos o desactívelos primero.`
                };
            }
        }

        const cambios: Record<string, { antes: unknown; despues: unknown }> = {};
        if (previo.nombre !== parsed.nombre) {
            cambios.nombre = { antes: previo.nombre, despues: parsed.nombre };
        }
        if (previo.estado !== parsed.estado) {
            cambios.estado = { antes: previo.estado, despues: parsed.estado };
        }

        await prisma.centro.update({
            where: { id: parsed.id },
            data: {
                nombre: parsed.nombre,
                estado: parsed.estado
            }
        });

        await AuditLogger.log({
            usuarioId: user.id,
            centroId: parsed.id,
            accion: "actualizar",
            entidad: "Centro",
            entidadId: parsed.id,
            detalle: { cambios: cambios as unknown as Prisma.InputJsonObject }
        });

        revalidatePath("/mantenedores");
        return { ok: true, message: "Centro actualizado exitosamente." };
    } catch (error) {
        return {
            ok: false,
            message: obtenerMensajeError(error, "Centro", "No se pudo actualizar el centro.")
        };
    }
}

export async function toggleEstadoCentro(prevState: ActionState, formData: FormData): Promise<ActionState> {
    try {
        const user = await requireSessionUser();
        if (!puedeAdministrar(user.rol)) {
            return { ok: false, message: "Solo administradores pueden modificar centros." };
        }

        const id = formData.get("id")?.toString();
        if (!id) {
            return { ok: false, message: "ID de centro requerido." };
        }

        const estadoRaw = formData.get("estado");
        const nuevoEstado = estadoRaw === "true" || estadoRaw === "on";

        const previo = await prisma.centro.findUnique({
            where: { id }
        });
        if (!previo) {
            return { ok: false, message: "Centro no encontrado." };
        }

        // Regla R-02: Bloqueo preventivo al desactivar Centro
        if (!nuevoEstado) {
            const bodegasActivas = await prisma.bodega.count({
                where: { centroId: id, estado: true }
            });
            if (bodegasActivas > 0) {
                return {
                    ok: false,
                    message: `No se puede desactivar el centro porque contiene ${bodegasActivas} bodega(s) activa(s). Desactívelas primero.`
                };
            }

            const usuariosActivos = await prisma.usuario.count({
                where: { centroId: id, estado: true }
            });
            if (usuariosActivos > 0) {
                return {
                    ok: false,
                    message: `No se puede desactivar el centro porque contiene ${usuariosActivos} usuario(s) activo(s). Reasígnelos o desactívelos primero.`
                };
            }
        }

        await prisma.centro.update({
            where: { id },
            data: { estado: nuevoEstado }
        });

        await AuditLogger.log({
            usuarioId: user.id,
            centroId: id,
            accion: "actualizar",
            entidad: "Centro",
            entidadId: id,
            detalle: {
                cambios: {
                    estado: { antes: previo.estado, despues: nuevoEstado }
                }
            }
        });

        revalidatePath("/mantenedores");
        return {
            ok: true,
            message: nuevoEstado ? "Centro activado exitosamente." : "Centro desactivado exitosamente."
        };
    } catch (error) {
        return {
            ok: false,
            message: obtenerMensajeError(error, "Centro", "No se pudo cambiar el estado del centro.")
        };
    }
}

export async function crearBodega(prevState: ActionState, formData: FormData): Promise<ActionState> {
    return ejecutarAdmin("Bodega", "/mantenedores", async (usuarioId) => {
        const parsed = bodegaSchema.parse({
            nombre: formData.get("nombre"),
            centroId: formData.get("centroId"),
            estado: formData.get("estado") === "on" || formData.get("estado") === "true"
        });
        const bodega = await prisma.bodega.create({ data: parsed });
        await AuditLogger.log({
            usuarioId,
            centroId: parsed.centroId,
            bodegaId: bodega.id,
            accion: "crear",
            entidad: "Bodega",
            entidadId: bodega.id
        });
        return "Bodega creada.";
    });
}

export async function editarBodega(prevState: ActionState, formData: FormData): Promise<ActionState> {
    try {
        const user = await requireSessionUser();
        if (!puedeAdministrar(user.rol)) {
            return { ok: false, message: "Solo administradores pueden modificar bodegas." };
        }

        const estadoRaw = formData.get("estado");
        const estado = estadoRaw === "on" || estadoRaw === "true";
        const parsed = editarBodegaSchema.parse({
            id: formData.get("id"),
            nombre: formData.get("nombre"),
            centroId: formData.get("centroId"),
            estado
        });

        const previo = await prisma.bodega.findUnique({
            where: { id: parsed.id }
        });
        if (!previo) {
            return { ok: false, message: "Bodega no encontrada." };
        }

        // Regla R-03: Bloqueo preventivo al desactivar bodega con stock disponible positivo
        if (previo.estado && !parsed.estado) {
            const stockPositivo = await prisma.stock.findFirst({
                where: { bodegaId: parsed.id, cantidadDisponible: { gt: 0 } }
            });
            if (stockPositivo) {
                return {
                    ok: false,
                    message: "No se puede desactivar la bodega porque mantiene existencias de stock disponibles. Debe realizar los traspasos o salidas correspondientes antes de darla de baja."
                };
            }
        }

        const cambios: Record<string, { antes: unknown; despues: unknown }> = {};
        if (previo.nombre !== parsed.nombre) {
            cambios.nombre = { antes: previo.nombre, despues: parsed.nombre };
        }
        if (previo.centroId !== parsed.centroId) {
            cambios.centroId = { antes: previo.centroId, despues: parsed.centroId };
        }
        if (previo.estado !== parsed.estado) {
            cambios.estado = { antes: previo.estado, despues: parsed.estado };
        }

        await prisma.bodega.update({
            where: { id: parsed.id },
            data: {
                nombre: parsed.nombre,
                centroId: parsed.centroId,
                estado: parsed.estado
            }
        });

        await AuditLogger.log({
            usuarioId: user.id,
            centroId: parsed.centroId,
            bodegaId: parsed.id,
            accion: "actualizar",
            entidad: "Bodega",
            entidadId: parsed.id,
            detalle: { cambios: cambios as unknown as Prisma.InputJsonObject }
        });

        revalidatePath("/mantenedores");
        return { ok: true, message: "Bodega actualizada exitosamente." };
    } catch (error) {
        return {
            ok: false,
            message: obtenerMensajeError(error, "Bodega", "No se pudo actualizar la bodega.")
        };
    }
}

export async function toggleEstadoBodega(prevState: ActionState, formData: FormData): Promise<ActionState> {
    try {
        const user = await requireSessionUser();
        if (!puedeAdministrar(user.rol)) {
            return { ok: false, message: "Solo administradores pueden modificar bodegas." };
        }

        const id = formData.get("id")?.toString();
        if (!id) {
            return { ok: false, message: "ID de bodega requerido." };
        }

        const estadoRaw = formData.get("estado");
        const nuevoEstado = estadoRaw === "true" || estadoRaw === "on";

        const previo = await prisma.bodega.findUnique({
            where: { id }
        });
        if (!previo) {
            return { ok: false, message: "Bodega no encontrada." };
        }

        // Regla R-03: Bloqueo preventivo al desactivar bodega
        if (!nuevoEstado) {
            const stockPositivo = await prisma.stock.findFirst({
                where: { bodegaId: id, cantidadDisponible: { gt: 0 } }
            });
            if (stockPositivo) {
                return {
                    ok: false,
                    message: "No se puede desactivar la bodega porque mantiene existencias de stock disponibles. Debe realizar los traspasos o salidas correspondientes antes de darla de baja."
                };
            }
        }

        await prisma.bodega.update({
            where: { id },
            data: { estado: nuevoEstado }
        });

        await AuditLogger.log({
            usuarioId: user.id,
            centroId: previo.centroId,
            bodegaId: id,
            accion: "actualizar",
            entidad: "Bodega",
            entidadId: id,
            detalle: {
                cambios: {
                    estado: { antes: previo.estado, despues: nuevoEstado }
                }
            }
        });

        revalidatePath("/mantenedores");
        return {
            ok: true,
            message: nuevoEstado ? "Bodega activada exitosamente." : "Bodega desactivada exitosamente."
        };
    } catch (error) {
        return {
            ok: false,
            message: obtenerMensajeError(error, "Bodega", "No se pudo cambiar el estado de la bodega.")
        };
    }
}

export async function crearUnidad(prevState: ActionState, formData: FormData): Promise<ActionState> {
    return ejecutarAdmin("Unidad", "/mantenedores", async (usuarioId) => {
        const estadoRaw = formData.get("estado");
        const estado = estadoRaw === null ? true : (estadoRaw === "on" || estadoRaw === "true");
        const parsed = unidadSchema.parse({
            descripcion: formData.get("descripcion"),
            estado
        });
        const unidad = await prisma.unidad.create({ data: parsed });
        await AuditLogger.log({ usuarioId, accion: "crear", entidad: "Unidad", entidadId: unidad.id });
        return "Unidad creada.";
    });
}

export async function editarUnidad(prevState: ActionState, formData: FormData): Promise<ActionState> {
    try {
        const user = await requireSessionUser();
        if (!puedeAdministrar(user.rol)) {
            return { ok: false, message: "Solo administradores pueden modificar unidades." };
        }

        const estadoRaw = formData.get("estado");
        const estado = estadoRaw === "on" || estadoRaw === "true";
        const parsed = editarUnidadSchema.parse({
            id: formData.get("id"),
            descripcion: formData.get("descripcion"),
            estado
        });

        const previo = await prisma.unidad.findUnique({
            where: { id: parsed.id }
        });
        if (!previo) {
            return { ok: false, message: "Unidad no encontrada." };
        }

        const cambios: Record<string, { antes: unknown; despues: unknown }> = {};
        if (previo.descripcion !== parsed.descripcion) {
            cambios.descripcion = { antes: previo.descripcion, despues: parsed.descripcion };
        }
        if (previo.estado !== parsed.estado) {
            cambios.estado = { antes: previo.estado, despues: parsed.estado };
        }

        await prisma.unidad.update({
            where: { id: parsed.id },
            data: {
                descripcion: parsed.descripcion,
                estado: parsed.estado
            }
        });

        await AuditLogger.log({
            usuarioId: user.id,
            accion: "actualizar",
            entidad: "Unidad",
            entidadId: parsed.id,
            detalle: { cambios: cambios as unknown as Prisma.InputJsonObject }
        });

        revalidatePath("/mantenedores");
        return { ok: true, message: "Unidad actualizada exitosamente." };
    } catch (error) {
        return {
            ok: false,
            message: obtenerMensajeError(error, "Unidad", "No se pudo actualizar la unidad.")
        };
    }
}

export async function toggleEstadoUnidad(prevState: ActionState, formData: FormData): Promise<ActionState> {
    try {
        const user = await requireSessionUser();
        if (!puedeAdministrar(user.rol)) {
            return { ok: false, message: "Solo administradores pueden modificar unidades." };
        }

        const id = formData.get("id")?.toString();
        if (!id) {
            return { ok: false, message: "ID de unidad requerido." };
        }

        const estadoRaw = formData.get("estado");
        const nuevoEstado = estadoRaw === "true" || estadoRaw === "on";

        const previo = await prisma.unidad.findUnique({
            where: { id }
        });
        if (!previo) {
            return { ok: false, message: "Unidad no encontrada." };
        }

        await prisma.unidad.update({
            where: { id },
            data: { estado: nuevoEstado }
        });

        await AuditLogger.log({
            usuarioId: user.id,
            accion: "actualizar",
            entidad: "Unidad",
            entidadId: id,
            detalle: {
                cambios: {
                    estado: { antes: previo.estado, despues: nuevoEstado }
                }
            }
        });

        revalidatePath("/mantenedores");
        return {
            ok: true,
            message: nuevoEstado ? "Unidad activada exitosamente." : "Unidad desactivada exitosamente."
        };
    } catch (error) {
        return {
            ok: false,
            message: obtenerMensajeError(error, "Unidad", "No se pudo cambiar el estado de la unidad.")
        };
    }
}

async function validarBodegasDelCentro(bodegaIds: string[], centroId: string): Promise<string[]> {
    const unicas = [...new Set(bodegaIds)];
    if (unicas.length === 0) return [];
    const validas = await prisma.bodega.findMany({
        where: { id: { in: unicas }, centroId, estado: true },
        select: { id: true }
    });
    if (validas.length !== unicas.length) {
        throw new Error("Una o más bodegas no están activas o no pertenecen al centro seleccionado.");
    }
    return unicas;
}

/** Mensaje por entidad cuando Prisma rechaza un valor duplicado (restriccion unica, codigo P2002). */
const MENSAJES_DUPLICADO: Partial<Record<string, string>> = {
    Usuario: "Ya existe un usuario con ese correo.",
    Unidad: "Ya existe una unidad con esa descripción.",
    Centro: "Ya existe un centro con ese nombre.",
    Bodega: "Ya existe una bodega con ese nombre."
};

/**
 * Traduce un error a un mensaje legible para el usuario:
 * - ZodError: el primer mensaje de validacion (no el JSON completo de issues).
 * - Prisma P2002: el mensaje de duplicado de la entidad indicada.
 */
function obtenerMensajeError(error: unknown, entidad: string, mensajePorDefecto: string): string {
    if (error instanceof ZodError) {
        return error.issues[0]?.message ?? mensajePorDefecto;
    }
    if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        (error as { code: string }).code === "P2002"
    ) {
        return MENSAJES_DUPLICADO[entidad] ?? `Ya existe un registro de ${entidad} con esos datos.`;
    }
    return error instanceof Error ? error.message : mensajePorDefecto;
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

        const bodegasValidadas = await validarBodegasDelCentro(parsed.bodegaIds, parsed.centroId);

        const usuario = await prisma.$transaction(async (tx) => {
            const nuevo = await tx.usuario.create({
                data: {
                    nombre: parsed.nombre,
                    apPaterno: parsed.apPaterno,
                    apMaterno: parsed.apMaterno,
                    rolId: parsed.rolId,
                    centroId: parsed.centroId,
                    bodegaId: bodegasValidadas[0] ?? null,
                    telefono: parsed.telefono,
                    email: parsed.email,
                    estado: parsed.estado
                }
            });

            if (bodegasValidadas.length > 0) {
                await tx.encargadosBodega.createMany({
                    data: bodegasValidadas.map((bId) => ({
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
            centroId: usuario.centroId,
            accion: "crear",
            entidad: "Usuario",
            entidadId: usuario.id,
            detalle: {
                email: usuario.email,
                rolId: usuario.rolId,
                centroId: usuario.centroId,
                bodegaIds: bodegasValidadas,
                estado: usuario.estado
            }
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
        if (parsed.id === user.id && parsed.rolId !== ROL_ADMINISTRADOR) {
            return { ok: false, message: "No puedes quitarte el rol de administrador." };
        }

        // Validar que las bodegas estén activas y pertenezcan al centro
        const bodegasValidadas = await validarBodegasDelCentro(parsed.bodegaIds, parsed.centroId);

        // Obtener datos previos para registrar cambios estructurados
        const previo = await prisma.usuario.findUnique({
            where: { id: parsed.id },
            include: { encargos: true }
        });

        if (!previo) {
            return { ok: false, message: "Usuario no encontrado." };
        }

        const cambios: Record<string, { antes: unknown; despues: unknown }> = {};
        if (previo.nombre !== parsed.nombre) {
            cambios.nombre = { antes: previo.nombre, despues: parsed.nombre };
        }
        if (previo.apPaterno !== parsed.apPaterno) {
            cambios.apPaterno = { antes: previo.apPaterno, despues: parsed.apPaterno };
        }
        if ((previo.apMaterno ?? null) !== (parsed.apMaterno ?? null)) {
            cambios.apMaterno = { antes: previo.apMaterno, despues: parsed.apMaterno ?? null };
        }
        if (previo.email !== parsed.email) {
            cambios.email = { antes: previo.email, despues: parsed.email };
        }
        if ((previo.telefono ?? null) !== (parsed.telefono ?? null)) {
            cambios.telefono = { antes: previo.telefono, despues: parsed.telefono ?? null };
        }
        if (previo.rolId !== parsed.rolId) {
            cambios.rolId = { antes: previo.rolId, despues: parsed.rolId };
        }
        if (previo.centroId !== parsed.centroId) {
            cambios.centroId = { antes: previo.centroId, despues: parsed.centroId };
        }
        if (previo.estado !== parsed.estado) {
            cambios.estado = { antes: previo.estado, despues: parsed.estado };
        }

        const bodegasPrevias = [...(previo.encargos ?? []).map((e) => e.bodegaId)].sort();
        const bodegasNuevas = [...bodegasValidadas].sort();
        if (
            bodegasPrevias.length !== bodegasNuevas.length ||
            !bodegasPrevias.every((id, idx) => id === bodegasNuevas[idx])
        ) {
            cambios.bodegaIds = { antes: bodegasPrevias, despues: bodegasNuevas };
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
                    bodegaId: bodegasValidadas[0] ?? null,
                    telefono: parsed.telefono ?? null,
                    email: parsed.email,
                    estado: parsed.estado
                }
            });

            await tx.encargadosBodega.deleteMany({
                where: { encargadoId: parsed.id }
            });

            if (bodegasValidadas.length > 0) {
                await tx.encargadosBodega.createMany({
                    data: bodegasValidadas.map((bodegaId) => ({
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
            centroId: parsed.centroId,
            accion: "actualizar",
            entidad: "Usuario",
            entidadId: parsed.id,
            detalle: { cambios: cambios as unknown as Prisma.InputJsonObject }
        });

        revalidatePath("/mantenedores");
        return { ok: true, message: "Usuario actualizado exitosamente." };
    } catch (error) {
        return {
            ok: false,
            message: obtenerMensajeError(error, "Usuario", "No se pudo actualizar el usuario.")
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

        const previo = await prisma.usuario.findUnique({
            where: { id },
            select: { estado: true, centroId: true }
        });

        if (!previo) {
            return { ok: false, message: "Usuario no encontrado." };
        }

        await prisma.usuario.update({
            where: { id },
            data: { estado: nuevoEstado }
        });

        await AuditLogger.log({
            usuarioId: user.id,
            centroId: previo.centroId,
            accion: "actualizar",
            entidad: "Usuario",
            entidadId: id,
            detalle: {
                cambios: {
                    estado: { antes: previo.estado, despues: nuevoEstado }
                }
            }
        });

        revalidatePath("/mantenedores");
        return {
            ok: true,
            message: nuevoEstado ? "Usuario activado exitosamente." : "Usuario desactivado exitosamente."
        };
    } catch (error) {
        return {
            ok: false,
            message: obtenerMensajeError(error, "Usuario", "No se pudo cambiar el estado del usuario.")
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
        return { ok: false, message: obtenerMensajeError(error, entidad, `No se pudo guardar ${entidad}.`) };
    }
}
