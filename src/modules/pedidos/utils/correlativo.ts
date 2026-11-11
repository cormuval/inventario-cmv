import type { Prisma } from "@prisma/client";

/**
 * Genera un código correlativo único para un pedido de aseo.
 * Formato: PED-YYYY-0001
 */
export async function generarNumeroPedido(
    tx: Prisma.TransactionClient,
    año: number = new Date().getFullYear()
): Promise<string> {
    const prefijo = `PED-${año}-`;

    const ultimoPedido = await tx.pedido.findFirst({
        where: {
            numero: {
                startsWith: prefijo
            }
        },
        orderBy: {
            numero: "desc"
        },
        select: {
            numero: true
        }
    });

    let siguienteSecuencia = 1;

    if (ultimoPedido && ultimoPedido.numero) {
        const partes = ultimoPedido.numero.split("-");
        const ultimoNumeroStr = partes[partes.length - 1];
        const ultimoNumero = parseInt(ultimoNumeroStr, 10);
        if (!isNaN(ultimoNumero)) {
            siguienteSecuencia = ultimoNumero + 1;
        }
    }

    const secuenciaPadded = String(siguienteSecuencia).padStart(4, "0");
    return `${prefijo}${secuenciaPadded}`;
}

