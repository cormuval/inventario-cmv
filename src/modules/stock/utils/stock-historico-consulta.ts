import { prisma } from "@/shared/lib/prisma";

export type TipoMovimientoHistorico =
    | "ENTRADA"
    | "SALIDA_CONSUMO"
    | "SALIDA_MERMA"
    | "TRASPASO_SALIDA"
    | "TRASPASO_ENTRADA"
    | "PRESTAMO_EMITIDO"
    | "PRESTAMO_RECEPCIONADO"
    | "PRESTAMO_ANULADO";

export interface MovimientoHistoricoRaw {
    id: string;
    fecha: Date;
    tipo: TipoMovimientoHistorico;
    documento: string;
    origen: string;
    destino: string;
    cantidad: number;
    lote?: string;
    fechaCaducidad?: Date;
    observaciones?: string;
}

export interface MovimientoHistorico extends MovimientoHistoricoRaw {
    saldoResultante: number;
    delta: number;
}

export interface CalculoEvolucionInput {
    stockActual: number;
    movimientosPosteriores: MovimientoHistoricoRaw[];
    movimientosRango: MovimientoHistoricoRaw[];
    fechaDesde: Date;
    fechaHasta: Date;
    fechaLimiteConocida?: Date | null;
}

export interface CalculoEvolucionResult {
    saldoInicial: number;
    saldoFinal: number;
    totalIngresos: number;
    totalEgresos: number;
    datosCompletos: boolean;
    fechaLimiteTrazabilidad?: Date | null;
    mensajeAdvertencia?: string;
    movimientos: MovimientoHistorico[];
}

export function esMovimientoIngreso(tipo: TipoMovimientoHistorico): boolean {
    return (
        tipo === "ENTRADA" ||
        tipo === "TRASPASO_ENTRADA" ||
        tipo === "PRESTAMO_RECEPCIONADO" ||
        tipo === "PRESTAMO_ANULADO"
    );
}

export function obtenerDeltaMovimiento(tipo: TipoMovimientoHistorico, cantidad: number): number {
    return esMovimientoIngreso(tipo) ? Math.abs(cantidad) : -Math.abs(cantidad);
}

/**
 * Reconstruye el saldo inicial, final y la evolución paso a paso para un producto/bodega.
 * Algoritmo puramente funcional testeable sin depender de base de datos.
 */
export function calcularEvolucionStock(input: CalculoEvolucionInput): CalculoEvolucionResult {
    const {
        stockActual,
        movimientosPosteriores,
        movimientosRango,
        fechaDesde,
        fechaHasta,
        fechaLimiteConocida
    } = input;

    // 1. Variación neta ocurrida después de fechaHasta
    const deltaPosterior = movimientosPosteriores.reduce((acumulado, m) => {
        return acumulado + obtenerDeltaMovimiento(m.tipo, m.cantidad);
    }, 0);

    // Saldo que existía al final del rango consultado
    const saldoFinal = stockActual - deltaPosterior;

    // 2. Ordenar cronológicamente los movimientos en el rango
    const ordenados = [...movimientosRango].sort((a, b) => {
        const diffTiempo = a.fecha.getTime() - b.fecha.getTime();
        if (diffTiempo !== 0) return diffTiempo;
        return a.id.localeCompare(b.id);
    });

    // 3. Variación neta ocurrida dentro del rango
    let totalIngresos = 0;
    let totalEgresos = 0;

    for (const m of ordenados) {
        if (esMovimientoIngreso(m.tipo)) {
            totalIngresos += m.cantidad;
        } else {
            totalEgresos += m.cantidad;
        }
    }

    const deltaRango = totalIngresos - totalEgresos;
    const saldoInicial = saldoFinal - deltaRango;

    // 4. Calcular el saldo resultante acumulado en cada paso
    let saldoAcumulado = saldoInicial;
    const movimientos: MovimientoHistorico[] = ordenados.map((m) => {
        const delta = obtenerDeltaMovimiento(m.tipo, m.cantidad);
        saldoAcumulado += delta;
        return {
            ...m,
            delta,
            saldoResultante: saldoAcumulado
        };
    });

    // 5. Verificar si la fecha de inicio del rango precede al límite conocido
    let datosCompletos = true;
    let mensajeAdvertencia: string | undefined;

    if (fechaLimiteConocida && fechaDesde.getTime() < fechaLimiteConocida.getTime()) {
        datosCompletos = false;
        const fechaFormateada = fechaLimiteConocida.toLocaleDateString("es-CL", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric"
        });
        mensajeAdvertencia = `Datos insuficientes para reconstruir el saldo exacto con anterioridad al ${fechaFormateada}. Se muestra la trazabilidad de los movimientos a partir de los registros disponibles.`;
    }

    return {
        saldoInicial,
        saldoFinal,
        totalIngresos,
        totalEgresos,
        datosCompletos,
        fechaLimiteTrazabilidad: fechaLimiteConocida,
        mensajeAdvertencia,
        movimientos
    };
}

export interface ConsultaStockHistoricoParams {
    productoId: number;
    bodegaIds: string[];
    fechaDesde: Date;
    fechaHasta: Date;
}

/**
 * Consulta la base de datos para obtener el stock actual y todos los movimientos relevantes
 * para la reconstrucción histórica.
 */
export async function consultarStockHistoricoDb(params: ConsultaStockHistoricoParams): Promise<CalculoEvolucionResult> {
    const { productoId, bodegaIds, fechaDesde, fechaHasta } = params;

    if (bodegaIds.length === 0) {
        return calcularEvolucionStock({
            stockActual: 0,
            movimientosPosteriores: [],
            movimientosRango: [],
            fechaDesde,
            fechaHasta
        });
    }

    // A. Stock actual consolidado para el producto en las bodegas
    const stockAgrupado = await prisma.stock.aggregate({
        where: {
            productoId,
            bodegaId: { in: bodegaIds }
        },
        _sum: {
            cantidadDisponible: true
        },
        _min: {
            fechaUltimaActualizacion: true
        }
    });
    const stockActual = stockAgrupado._sum.cantidadDisponible ?? 0;

    // B. Entradas ordinarias y recepciones de préstamos
    const entradasDetalles = await prisma.ordenEntradaDetalle.findMany({
        where: {
            productoId,
            ordenEntrada: {
                bodegaId: { in: bodegaIds },
                fecha: { gte: new Date("1970-01-01") }
            }
        },
        include: {
            ordenEntrada: {
                include: {
                    bodega: true
                }
            }
        }
    });

    // C. Salidas ordinarias, traspasos enviados y préstamos emitidos
    const salidasDetalles = await prisma.ordenSalidaDetalle.findMany({
        where: {
            productoId,
            ordenSalida: {
                bodegaId: { in: bodegaIds },
                fecha: { gte: new Date("1970-01-01") }
            }
        },
        include: {
            ordenSalida: {
                include: {
                    bodega: true,
                    centroDestino: true,
                    bodegaDestino: true
                }
            }
        }
    });

    // D. Traspasos internos RECIBIDOS desde otra bodega (tipoSalida = "A otra bodega")
    const traspasosRecibidos = await prisma.ordenSalidaDetalle.findMany({
        where: {
            productoId,
            ordenSalida: {
                tipoSalida: "A otra bodega",
                bodegaDestinoId: { in: bodegaIds },
                fecha: { gte: new Date("1970-01-01") }
            }
        },
        include: {
            ordenSalida: {
                include: {
                    bodega: true,
                    bodegaDestino: true
                }
            }
        }
    });

    // E. Anulaciones de préstamos emitidos desde estas bodegas
    const idsOrdenesSalida = salidasDetalles
        .map((d) => d.ordenSalida.id)
        .filter((id, i, arr) => arr.indexOf(id) === i);

    const logsAnulacion = idsOrdenesSalida.length > 0
        ? await prisma.log.findMany({
              where: {
                  accion: "anular",
                  entidad: "OrdenSalida",
                  entidadId: { in: idsOrdenesSalida }
              }
          })
        : [];

    const anulacionPorOrdenId = new Map(
        logsAnulacion
            .filter((l) => l.entidadId !== null)
            .map((l) => [l.entidadId as string, l.fecha])
    );

    // Consolidar todos los movimientos brutos
    const todosMovimientos: MovimientoHistoricoRaw[] = [];

    // Mapear entradas
    for (const d of entradasDetalles) {
        const esPrestamoRec = (d.ordenEntrada.origen ?? "").toLowerCase().includes("préstamo");
        const docRef = d.ordenEntrada.guiaDespacho ?? d.ordenEntrada.codigoRecepcion ?? d.ordenEntrada.id;
        todosMovimientos.push({
            id: `ent-${d.id}`,
            fecha: d.ordenEntrada.fecha,
            tipo: esPrestamoRec ? "PRESTAMO_RECEPCIONADO" : "ENTRADA",
            documento: docRef,
            origen: d.ordenEntrada.origen ?? "Proveedor / Externo",
            destino: d.ordenEntrada.bodega.nombre,
            cantidad: d.cantidad,
            lote: d.lote,
            fechaCaducidad: d.fechaCaducidad
        });
    }

    // Mapear salidas
    for (const d of salidasDetalles) {
        const orden = d.ordenSalida;
        let tipo: TipoMovimientoHistorico = "SALIDA_CONSUMO";
        let destino = orden.destino ?? "Consumo Interno";

        if (orden.tipoSalida === "A otra bodega") {
            tipo = "TRASPASO_SALIDA";
            destino = orden.bodegaDestino ? orden.bodegaDestino.nombre : orden.destino;
        } else if (orden.tipoSalida === "A otros centros") {
            tipo = "PRESTAMO_EMITIDO";
            destino = orden.centroDestino ? orden.centroDestino.nombre : orden.destino;
        } else if (orden.tipoSalida.toLowerCase() === "merma") {
            tipo = "SALIDA_MERMA";
        }

        todosMovimientos.push({
            id: `sal-${d.id}`,
            fecha: orden.fecha,
            tipo,
            documento: orden.codigoSalida ?? orden.id,
            origen: orden.bodega.nombre,
            destino,
            cantidad: d.cantidad,
            lote: d.lote,
            fechaCaducidad: d.fechaCaducidad
        });

        // Si la orden fue ANULADA, se generó un evento de restitución de stock a la bodega emisora
        if (orden.estadoPrestamo === "ANULADO") {
            const fechaAnulacion = anulacionPorOrdenId.get(orden.id) ?? orden.fechaRecepcion ?? orden.fecha;
            todosMovimientos.push({
                id: `anu-${d.id}`,
                fecha: fechaAnulacion,
                tipo: "PRESTAMO_ANULADO",
                documento: orden.codigoSalida ?? orden.id,
                origen: orden.centroDestino ? orden.centroDestino.nombre : "Destino préstamo",
                destino: orden.bodega.nombre,
                cantidad: d.cantidad,
                lote: d.lote,
                fechaCaducidad: d.fechaCaducidad,
                observaciones: orden.observacionRecepcion ?? "Préstamo anulado y restituido"
            });
        }
    }

    // Mapear traspasos recibidos
    for (const d of traspasosRecibidos) {
        const orden = d.ordenSalida;
        todosMovimientos.push({
            id: `tr-rec-${d.id}`,
            fecha: orden.fecha,
            tipo: "TRASPASO_ENTRADA",
            documento: orden.codigoSalida ?? orden.id,
            origen: orden.bodega.nombre,
            destino: orden.bodegaDestino ? orden.bodegaDestino.nombre : "Bodega Destino",
            cantidad: d.cantidad,
            lote: d.lote,
            fechaCaducidad: d.fechaCaducidad
        });
    }

    // Particionar movimientos:
    //  - posteriores: fecha > fechaHasta
    //  - en rango: fecha >= fechaDesde AND fecha <= fechaHasta
    const finRango = fechaHasta.getTime();
    const inicioRango = fechaDesde.getTime();

    const movimientosPosteriores = todosMovimientos.filter((m) => m.fecha.getTime() > finRango);
    const movimientosRango = todosMovimientos.filter((m) => {
        const t = m.fecha.getTime();
        return t >= inicioRango && t <= finRango;
    });

    // Calcular fecha límite conocida más antigua
    let fechaLimiteConocida: Date | null = stockAgrupado._min.fechaUltimaActualizacion;
    for (const m of todosMovimientos) {
        if (!fechaLimiteConocida || m.fecha.getTime() < fechaLimiteConocida.getTime()) {
            fechaLimiteConocida = m.fecha;
        }
    }

    return calcularEvolucionStock({
        stockActual,
        movimientosPosteriores,
        movimientosRango,
        fechaDesde,
        fechaHasta,
        fechaLimiteConocida
    });
}

