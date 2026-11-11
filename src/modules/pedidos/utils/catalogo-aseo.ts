import { prisma } from "@/shared/lib/prisma";

export interface ItemCatalogoAseo {
    productoId: number;
    descripcion: string;
    linea: string;
    stockDisponible: number;
    stockMinimo: number;
    estadoStock: "sin_stock" | "bajo_minimo" | "ok";
    sugerencia: number;
    cantidadHabitual: number;
}

export interface CatalogoAseoInput {
    centroId: string;
    bodegaId?: string | null;
}

export async function obtenerCatalogoAseo(input: CatalogoAseoInput): Promise<ItemCatalogoAseo[]> {
    const { centroId, bodegaId } = input;

    // 1. Obtener todos los productos activos de la línea ASEO
    const productosAseo = await prisma.producto.findMany({
        where: {
            linea: "ASEO",
            estado: true
        },
        orderBy: {
            descripcion: "asc"
        },
        select: {
            id: true,
            descripcion: true,
            linea: true
        }
    });

    if (productosAseo.length === 0) {
        return [];
    }

    const productoIds = productosAseo.map((p) => p.id);

    // 2. Determinar las bodegas a considerar
    let bodegaIds: string[] = [];
    if (bodegaId) {
        bodegaIds = [bodegaId];
    } else {
        const bodegasCentro = await prisma.bodega.findMany({
            where: { centroId, estado: true },
            select: { id: true }
        });
        bodegaIds = bodegasCentro.map((b) => b.id);
    }

    // 3. Consultar stock disponible y stock mínimo consolidado
    const stocks = bodegaIds.length > 0
        ? await prisma.stock.findMany({
              where: {
                  productoId: { in: productoIds },
                  bodegaId: { in: bodegaIds }
              },
              select: {
                  productoId: true,
                  cantidadDisponible: true,
                  stockMinimo: true
              }
          })
        : [];

    const stockPorProducto = new Map<number, { disponible: number; minimo: number }>();
    for (const s of stocks) {
        const actual = stockPorProducto.get(s.productoId) ?? { disponible: 0, minimo: 0 };
        stockPorProducto.set(s.productoId, {
            disponible: actual.disponible + s.cantidadDisponible,
            minimo: Math.max(actual.minimo, s.stockMinimo)
        });
    }

    // 4. Consultar plantilla habitual del centro
    const plantillas = await prisma.pedidoPlantillaAseo.findMany({
        where: {
            centroId,
            productoId: { in: productoIds }
        },
        select: {
            productoId: true,
            cantidadHabitual: true
        }
    });

    const habitualPorProducto = new Map<number, number>(
        plantillas.map((item) => [item.productoId, item.cantidadHabitual])
    );

    // 5. Consolidar catálogo con semáforos y sugerencias
    return productosAseo.map((p) => {
        const infoStock = stockPorProducto.get(p.id) ?? { disponible: 0, minimo: 0 };
        const cantidadHabitual = habitualPorProducto.get(p.id) ?? 0;

        let estadoStock: "sin_stock" | "bajo_minimo" | "ok" = "ok";
        if (infoStock.disponible <= 0) {
            estadoStock = "sin_stock";
        } else if (infoStock.disponible <= infoStock.minimo) {
            estadoStock = "bajo_minimo";
        }

        // Sugerencia: si hay cantidad habitual configurada, priorizarla;
        // en su defecto, si el stock está bajo o en 0, calcular reposición al doble del mínimo.
        let sugerencia = 0;
        if (cantidadHabitual > 0) {
            sugerencia = cantidadHabitual;
        } else if (infoStock.disponible <= infoStock.minimo) {
            const baseMinimo = infoStock.minimo > 0 ? infoStock.minimo * 2 : 10;
            sugerencia = Math.max(0, baseMinimo - infoStock.disponible);
        }

        return {
            productoId: p.id,
            descripcion: p.descripcion,
            linea: p.linea,
            stockDisponible: infoStock.disponible,
            stockMinimo: infoStock.minimo,
            estadoStock,
            sugerencia,
            cantidadHabitual
        };
    });
}

