"use server";

import type { Prisma, Producto } from "@prisma/client";
import { revalidatePath } from "next/cache";

// lib
import { puedeAdministrar, requireSessionUser } from "@/shared/lib/auth";
import { AuditLogger } from "@/shared/lib/logger";
import { prisma } from "@/shared/lib/prisma";

// schemas
import { productoSchema } from "@/modules/productos/schemas/producto.schema";

// types
import type { ActionState } from "@/shared/types/action-state";
import type { ProductosFiltros } from "@/modules/productos/utils/productos-filtros";

// utils
import { calcularPaginacion, type Paginacion } from "@/shared/utils/paginacion";

export const TAMANO_PAGINA_PRODUCTOS = 100;

export interface ListarProductosResult {
    productos: Producto[];
    paginacion: Paginacion;
}

export async function listarProductos() {
    return prisma.producto.findMany({
        orderBy: [{ linea: "asc" }, { descripcion: "asc" }]
    });
}

export async function listarProductosActivos() {
    return prisma.producto.findMany({
        where: { estado: true },
        orderBy: [{ linea: "asc" }, { descripcion: "asc" }]
    });
}

export async function listarLineasProductos(): Promise<string[]> {
    const productos = await prisma.producto.findMany({
        distinct: ["linea"],
        select: { linea: true },
        orderBy: { linea: "asc" }
    });

    return productos.map((producto) => producto.linea);
}

export async function listarProductosPaginados(filtros: ProductosFiltros): Promise<ListarProductosResult> {
    const where: Prisma.ProductoWhereInput = {};
    const descripcion = filtros.descripcion.trim();

    if (filtros.id !== null) {
        where.id = filtros.id;
    }
    if (filtros.linea !== "") {
        where.linea = filtros.linea;
    }
    if (filtros.estado !== "todos") {
        where.estado = filtros.estado === "activo";
    }
    if (descripcion !== "") {
        where.descripcion = { contains: descripcion };
    }

    const total = await prisma.producto.count({ where });
    const paginacion = calcularPaginacion(filtros.pagina, total, TAMANO_PAGINA_PRODUCTOS);
    const productos = await prisma.producto.findMany({
        where,
        orderBy: [{ linea: "asc" }, { descripcion: "asc" }, { id: "asc" }],
        skip: paginacion.skip,
        take: TAMANO_PAGINA_PRODUCTOS
    });

    return { productos, paginacion };
}

export async function crearProducto(prevState: ActionState, formData: FormData): Promise<ActionState> {
    try {
        const user = await requireSessionUser();
        if (!puedeAdministrar(user.rol)) {
            return { ok: false, message: "Solo administradores pueden crear productos." };
        }

        const parsed = productoSchema.parse({
            linea: formData.get("linea"),
            descripcion: formData.get("descripcion"),
            estado: formData.get("estado") === "on"
        });

        const producto = await prisma.producto.create({ data: parsed });
        await AuditLogger.log({ usuarioId: user.id, accion: "crear", entidad: "Producto", entidadId: String(producto.id) });
        revalidatePath("/productos");
        return { ok: true, message: "Producto creado." };
    } catch (error) {
        return { ok: false, message: error instanceof Error ? error.message : "No se pudo crear el producto." };
    }
}

