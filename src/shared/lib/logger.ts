// lib
import type { Prisma } from "@prisma/client";
import { prisma } from "@/shared/lib/prisma";

export interface AuditInput {
    usuarioId?: string;
    centroId?: string | null;
    bodegaId?: string | null;
    accion: string;
    entidad: string;
    entidadId?: string;
    detalle?: Prisma.InputJsonValue;
}

export class AuditLogger {
    static async log(input: AuditInput): Promise<void> {
        await prisma.log.create({
            data: {
                usuarioId: input.usuarioId,
                centroId: input.centroId,
                bodegaId: input.bodegaId,
                accion: input.accion,
                entidad: input.entidad,
                entidadId: input.entidadId,
                detalle: input.detalle
            }
        });
    }
}
