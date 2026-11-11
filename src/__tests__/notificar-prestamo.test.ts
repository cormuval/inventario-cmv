import { beforeEach, describe, expect, it, vi } from "vitest";

// lib
import * as correoLib from "@/shared/lib/correo";
import { AuditLogger } from "@/shared/lib/logger";
import { prisma } from "@/shared/lib/prisma";
import * as authLib from "@/shared/lib/auth";

// utils & actions
import {
    construirCorreoNotificacionPrestamo,
    type DatosCorreoNotificacionPrestamo
} from "@/modules/orden-salida/utils/correo-notificacion-prestamo";
import {
    notificarPrestamoEnviado,
    resolverDestinatariosPrestamo
} from "@/modules/orden-salida/utils/notificar-prestamo";
import { crearOrdenSalida } from "@/modules/orden-salida/actions/orden-salida.action";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/shared/lib/logger", () => ({
    AuditLogger: { log: vi.fn() }
}));

vi.mock("@/shared/lib/correo", () => ({
    enviarCorreo: vi.fn()
}));

vi.mock("@/shared/lib/inventario-alcance", () => ({
    validarCentroBodegaEnAlcance: vi.fn().mockResolvedValue(undefined)
}));

vi.mock("@/shared/lib/auth", async (importOriginal) => {
    const original = await importOriginal<typeof import("@/shared/lib/auth")>();
    return {
        ...original,
        requireSessionUser: vi.fn(),
        puedeOperarSalida: vi.fn().mockReturnValue(true)
    };
});

vi.mock("@/shared/lib/prisma", () => ({
    prisma: {
        $transaction: vi.fn(),
        centro: { findUnique: vi.fn() },
        bodega: { findUnique: vi.fn() },
        encargadosBodega: { findMany: vi.fn() },
        usuario: { findMany: vi.fn() },
        ordenSalida: { findUnique: vi.fn(), update: vi.fn() },
        stock: { findUnique: vi.fn(), update: vi.fn() }
    }
}));

describe("construirCorreoNotificacionPrestamo", () => {
    const datosBase: DatosCorreoNotificacionPrestamo = {
        ordenId: "ord-12345",
        codigoRecepcion: "K94J2Q8",
        fecha: new Date("2026-11-15T10:00:00Z"),
        fechaLimiteRecepcion: new Date("2026-11-22T10:00:00Z"),
        centroOrigen: "CESFAM Barón",
        bodegaOrigen: "Farmacia Central Barón",
        centroDestino: "CESFAM Playa Ancha",
        bodegaDestino: "Farmacia Playa Ancha",
        emisorNombre: "María González",
        emisorEmail: "maria.gonzalez@cmvalparaiso.cl",
        para: "farmacia.playaancha@cmvalparaiso.cl",
        detalles: [
            {
                productoDescripcion: "Paracetamol 500mg comprimidos",
                cantidad: 200,
                lote: "L-PARA-2026",
                fechaCaducidad: new Date("2027-05-30")
            },
            {
                productoDescripcion: "Amoxicilina 500mg cápsulas",
                cantidad: 100,
                lote: "L-AMOX-2026",
                fechaCaducidad: new Date("2027-08-15")
            }
        ]
    };

    it("incluye el código de 7 caracteres de forma prominente en asunto, texto y HTML", () => {
        const correo = construirCorreoNotificacionPrestamo(datosBase);

        expect(correo.asunto).toContain("K94J2Q8");
        expect(correo.asunto).toContain("CESFAM Barón");
        expect(correo.texto).toContain("CÓDIGO DE RECEPCIÓN: K94J2Q8");
        expect(correo.html).toContain("K94J2Q8");
        expect(correo.html).toContain("Código de Recepción (7 caracteres)");
    });

    it("incluye el origen, destino y plazo vigente de 7 días con fecha límite", () => {
        const correo = construirCorreoNotificacionPrestamo(datosBase);

        expect(correo.texto).toContain("CESFAM Barón");
        expect(correo.texto).toContain("Farmacia Central Barón");
        expect(correo.texto).toContain("CESFAM Playa Ancha");
        expect(correo.texto).toContain("Farmacia Playa Ancha");
        expect(correo.texto).toContain("7 días corridos");
        expect(correo.texto).toContain("22-11-2026");

        expect(correo.html).toContain("CESFAM Barón");
        expect(correo.html).toContain("CESFAM Playa Ancha");
        expect(correo.html).toContain("7 días corridos");
        expect(correo.html).toContain("22-11-2026");
    });

    it("incluye el listado de insumos con cantidades, lotes y vencimientos", () => {
        const correo = construirCorreoNotificacionPrestamo(datosBase);

        expect(correo.texto).toContain("Paracetamol 500mg comprimidos");
        expect(correo.texto).toContain("Cantidad: 200");
        expect(correo.texto).toContain("L-PARA-2026");

        expect(correo.html).toContain("Paracetamol 500mg comprimidos");
        expect(correo.html).toContain("Amoxicilina 500mg cápsulas");
    });

    it("asigna el emisor institucional en responderA", () => {
        const correo = construirCorreoNotificacionPrestamo(datosBase);

        expect(correo.responderA).toBe("maria.gonzalez@cmvalparaiso.cl");
    });
});

describe("resolverDestinatariosPrestamo", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("utiliza el correo explícito si es válido", async () => {
        const correos = await resolverDestinatariosPrestamo({
            correoDestino: "receptor@cmvalparaiso.cl",
            centroDestinoId: "centro-2"
        });

        expect(correos).toEqual(["receptor@cmvalparaiso.cl"]);
        expect(prisma.encargadosBodega.findMany).not.toHaveBeenCalled();
    });

    it("rechaza y no hace fallback si el correo explícito es inválido", async () => {
        const correos = await resolverDestinatariosPrestamo({
            correoDestino: "no-es-correo-valido",
            centroDestinoId: "centro-2"
        });

        expect(correos).toEqual([]);
        expect(prisma.encargadosBodega.findMany).not.toHaveBeenCalled();
    });

    it("resuelve encargados de la bodega de destino si no hay correo explícito", async () => {
        vi.mocked(prisma.encargadosBodega.findMany).mockResolvedValueOnce([
            { email: "bodeguero@cmvalparaiso.cl" } as never
        ]);

        const correos = await resolverDestinatariosPrestamo({
            centroDestinoId: "centro-2",
            bodegaDestinoId: "bodega-destino-1"
        });

        expect(correos).toEqual(["bodeguero@cmvalparaiso.cl"]);
        expect(prisma.encargadosBodega.findMany).toHaveBeenCalledWith({
            where: { bodegaId: "bodega-destino-1" },
            select: { email: true }
        });
    });

    it("resuelve encargados del centro de destino si la bodega no tiene encargados", async () => {
        vi.mocked(prisma.encargadosBodega.findMany)
            .mockResolvedValueOnce([]) // bodegaDestinoId
            .mockResolvedValueOnce([{ email: "jefe.bodega@cmvalparaiso.cl" } as never]); // centroId

        const correos = await resolverDestinatariosPrestamo({
            centroDestinoId: "centro-2",
            bodegaDestinoId: "bodega-destino-1"
        });

        expect(correos).toEqual(["jefe.bodega@cmvalparaiso.cl"]);
    });

    it("resuelve usuarios activos autorizados del centro si no hay encargados registrados", async () => {
        vi.mocked(prisma.encargadosBodega.findMany).mockResolvedValue([]);
        vi.mocked(prisma.usuario.findMany).mockResolvedValueOnce([
            { email: "director.centro@cmvalparaiso.cl" } as never
        ]);

        const correos = await resolverDestinatariosPrestamo({
            centroDestinoId: "centro-2"
        });

        expect(correos).toEqual(["director.centro@cmvalparaiso.cl"]);
        expect(prisma.usuario.findMany).toHaveBeenCalledWith({
            where: {
                centroId: "centro-2",
                estado: true,
                rolId: { in: ["R01", "R02", "R03", "R06", "R07"] }
            },
            select: { email: true }
        });
    });
});

describe("notificarPrestamoEnviado", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    const ordenEjemplo = {
        id: "ord-prestamo-1",
        fecha: new Date("2026-11-15T09:00:00Z"),
        fechaLimiteRecepcion: new Date("2026-11-22T09:00:00Z"),
        tipoSalida: "A otros centros",
        destino: "CESFAM Playa Ancha",
        centroId: "centro-1",
        centroDestinoId: "centro-2",
        bodegaId: "bod-1",
        bodegaDestinoId: "bod-2",
        codigoRecepcion: "R99J2Q8",
        correoDestino: "receptor@cmvalparaiso.cl",
        usuarioId: "user-emisor",
        centro: { id: "centro-1", nombre: "CESFAM Barón" },
        centroDestino: { id: "centro-2", nombre: "CESFAM Playa Ancha" },
        bodega: { id: "bod-1", nombre: "Farmacia Barón" },
        bodegaDestino: { id: "bod-2", nombre: "Farmacia Playa Ancha" },
        usuario: { id: "user-emisor", nombre: "Juan", apPaterno: "Pérez", email: "juan.perez@cmvalparaiso.cl" },
        detalles: [
            {
                id: "det-1",
                cantidad: 50,
                lote: "LOT-A",
                fechaCaducidad: new Date("2027-10-10"),
                producto: { id: 101, descripcion: "Ibuprofeno 400mg" }
            }
        ]
    };

    it("envía exitosamente el correo con el código de 7 caracteres y registra auditoría", async () => {
        vi.mocked(prisma.ordenSalida.findUnique).mockResolvedValue(ordenEjemplo as never);
        vi.mocked(correoLib.enviarCorreo).mockResolvedValue({ ok: true, id: "email-resend-123" });
        vi.mocked(prisma.ordenSalida.update).mockResolvedValue({} as never);

        const res = await notificarPrestamoEnviado("ord-prestamo-1");

        expect(res.ok).toBe(true);
        expect(correoLib.enviarCorreo).toHaveBeenCalledWith(
            expect.objectContaining({
                para: "receptor@cmvalparaiso.cl",
                asunto: expect.stringContaining("R99J2Q8"),
                html: expect.stringContaining("R99J2Q8")
            })
        );
        expect(prisma.ordenSalida.update).toHaveBeenCalledWith({
            where: { id: "ord-prestamo-1" },
            data: expect.objectContaining({
                enviarCorreo: true,
                errorEnvioCorreo: null
            })
        });
        expect(AuditLogger.log).toHaveBeenCalledWith(
            expect.objectContaining({
                accion: "notificar",
                entidad: "OrdenSalida",
                entidadId: "ord-prestamo-1",
                detalle: expect.objectContaining({
                    codigoRecepcion: "R99J2Q8",
                    resultadoEnvio: "enviado"
                })
            })
        );
    });

    it("captura fallo de Resend sin lanzar excepción y actualiza el error en la orden y auditoría", async () => {
        vi.mocked(prisma.ordenSalida.findUnique).mockResolvedValue(ordenEjemplo as never);
        vi.mocked(correoLib.enviarCorreo).mockResolvedValue({
            ok: false,
            error: "Error de conexión con Resend"
        });
        vi.mocked(prisma.ordenSalida.update).mockResolvedValue({} as never);

        const res = await notificarPrestamoEnviado("ord-prestamo-1");

        expect(res.ok).toBe(false);
        if (!res.ok) {
            expect(res.error).toBe("Error de conexión con Resend");
        }
        expect(prisma.ordenSalida.update).toHaveBeenCalledWith({
            where: { id: "ord-prestamo-1" },
            data: expect.objectContaining({
                enviarCorreo: false,
                errorEnvioCorreo: "Error de conexión con Resend"
            })
        });
        expect(AuditLogger.log).toHaveBeenCalledWith(
            expect.objectContaining({
                accion: "notificar",
                detalle: expect.objectContaining({
                    resultadoEnvio: "fallido",
                    error: "Error de conexión con Resend"
                })
            })
        );
    });

    it("maneja caso sin destinatario resoluble registrando fallo en auditoría y orden sin lanzar", async () => {
        vi.mocked(prisma.ordenSalida.findUnique).mockResolvedValue({
            ...ordenEjemplo,
            correoDestino: null
        } as never);
        vi.mocked(prisma.encargadosBodega.findMany).mockResolvedValue([]);
        vi.mocked(prisma.usuario.findMany).mockResolvedValue([]);
        vi.mocked(prisma.ordenSalida.update).mockResolvedValue({} as never);

        const res = await notificarPrestamoEnviado("ord-prestamo-1");

        expect(res.ok).toBe(false);
        if (!res.ok) {
            expect(res.error).toContain("No se encontró un destinatario");
        }
        expect(correoLib.enviarCorreo).not.toHaveBeenCalled();
        expect(prisma.ordenSalida.update).toHaveBeenCalledWith({
            where: { id: "ord-prestamo-1" },
            data: expect.objectContaining({
                enviarCorreo: false,
                errorEnvioCorreo: expect.stringContaining("No se encontró un destinatario")
            })
        });
    });
});

describe("Integración con crearOrdenSalida al emitir préstamos", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(authLib.requireSessionUser).mockResolvedValue({
            id: "user-emisor",
            nombre: "Operador",
            apPaterno: "Emisor",
            email: "emisor@cmvalparaiso.cl",
            rol: "R07",
            centroId: "centro-1",
            bodegaId: "b1"
        });
        vi.mocked(prisma.centro.findUnique).mockResolvedValue({
            id: "centro-2",
            nombre: "CESFAM Playa Ancha",
            estado: true
        } as never);
        vi.mocked(prisma.bodega.findUnique).mockResolvedValue({
            id: "b2",
            nombre: "Farmacia Playa Ancha",
            centroId: "centro-2",
            estado: true
        } as never);
    });

    function crearFormDataPrestamo(correoDestino?: string): FormData {
        const fd = new FormData();
        fd.append("fecha", new Date().toISOString().split("T")[0]);
        fd.append("centroId", "centro-1");
        fd.append("bodegaId", "b1");
        fd.append("tipoSalida", "A Otros Centros");
        fd.append("destino", "CESFAM Playa Ancha");
        fd.append("centroDestinoId", "centro-2");
        fd.append("bodegaDestinoId", "b2");
        if (correoDestino) {
            fd.append("correoDestino", correoDestino);
        }
        fd.append("productoId", "101");
        fd.append("cantidad", "5");
        fd.append("lote", "LOT-1");
        fd.append("fechaCaducidad", "2027-10-10");
        return fd;
    }

    it("registra la orden, descuenta stock y envía la notificación con el código", async () => {
        const stockActual = {
            id: "stk-1",
            productoId: 101,
            bodegaId: "b1",
            cantidadDisponible: 20,
            lote: "LOT-1",
            fechaCaducidad: new Date("2027-10-10")
        };
        const ordenCreada = {
            id: "ord-creada-ok",
            codigoRecepcion: "A1B2C3D",
            estadoPrestamo: "EN_TRANSITO"
        };

        vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
            const tx = {
                ordenSalida: { create: vi.fn().mockResolvedValue(ordenCreada) },
                stock: {
                    findUnique: vi.fn().mockResolvedValue(stockActual),
                    update: vi.fn().mockResolvedValue({ ...stockActual, cantidadDisponible: 15 })
                },
                ordenSalidaDetalle: { create: vi.fn() }
            };
            return callback(tx as never);
        });

        vi.mocked(prisma.ordenSalida.findUnique).mockResolvedValue({
            id: "ord-creada-ok",
            codigoRecepcion: "A1B2C3D",
            centroDestinoId: "centro-2",
            bodegaDestinoId: "b2",
            correoDestino: "receptor@cmvalparaiso.cl",
            fecha: new Date("2026-11-15"),
            fechaLimiteRecepcion: new Date("2026-11-22"),
            tipoSalida: "A otros centros",
            destino: "CESFAM Playa Ancha",
            usuarioId: "user-emisor",
            centro: { id: "centro-1", nombre: "CESFAM Barón" },
            centroDestino: { id: "centro-2", nombre: "CESFAM Playa Ancha" },
            bodega: { id: "b1", nombre: "Farmacia Barón" },
            bodegaDestino: { id: "b2", nombre: "Farmacia Playa Ancha" },
            usuario: { id: "user-emisor", nombre: "Operador", apPaterno: "Emisor", email: "emisor@cmvalparaiso.cl" },
            detalles: [
                {
                    id: "det-1",
                    cantidad: 5,
                    lote: "LOT-1",
                    fechaCaducidad: new Date("2027-10-10"),
                    producto: { id: 101, descripcion: "Ibuprofeno" }
                }
            ]
        } as never);

        vi.mocked(correoLib.enviarCorreo).mockResolvedValue({ ok: true, id: "email-resend-999" });
        vi.mocked(prisma.ordenSalida.update).mockResolvedValue({} as never);

        const fd = crearFormDataPrestamo("receptor@cmvalparaiso.cl");
        const res = await crearOrdenSalida({ ok: false, message: "" }, fd);

        expect(res.ok).toBe(true);
        expect(res.id).toBe("ord-creada-ok");
        expect(res.codigoRecepcion).toBeDefined();
        expect(res.codigoRecepcion).toHaveLength(7);
        expect(res.advertencia).toBeUndefined();
        expect(correoLib.enviarCorreo).toHaveBeenCalled();
    });

    it("cuando el correo falla, NO revierte la orden ni el stock, y entrega advertencia de feedback al emisor", async () => {
        const stockActual = {
            id: "stk-1",
            productoId: 101,
            bodegaId: "b1",
            cantidadDisponible: 20,
            lote: "LOT-1",
            fechaCaducidad: new Date("2027-10-10")
        };
        const ordenCreada = {
            id: "ord-creada-failmail",
            codigoRecepcion: "Z9Y8X7W",
            estadoPrestamo: "EN_TRANSITO"
        };

        const updateStockSpy = vi.fn().mockResolvedValue({ ...stockActual, cantidadDisponible: 15 });

        vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
            const tx = {
                ordenSalida: { create: vi.fn().mockResolvedValue(ordenCreada) },
                stock: {
                    findUnique: vi.fn().mockResolvedValue(stockActual),
                    update: updateStockSpy
                },
                ordenSalidaDetalle: { create: vi.fn() }
            };
            return callback(tx as never);
        });

        vi.mocked(prisma.ordenSalida.findUnique).mockResolvedValue({
            id: "ord-creada-failmail",
            codigoRecepcion: "Z9Y8X7W",
            centroDestinoId: "centro-2",
            bodegaDestinoId: "b2",
            correoDestino: "receptor@cmvalparaiso.cl",
            fecha: new Date("2026-11-15"),
            fechaLimiteRecepcion: new Date("2026-11-22"),
            tipoSalida: "A otros centros",
            destino: "CESFAM Playa Ancha",
            usuarioId: "user-emisor",
            centro: { id: "centro-1", nombre: "CESFAM Barón" },
            centroDestino: { id: "centro-2", nombre: "CESFAM Playa Ancha" },
            bodega: { id: "b1", nombre: "Farmacia Barón" },
            bodegaDestino: { id: "b2", nombre: "Farmacia Playa Ancha" },
            usuario: { id: "user-emisor", nombre: "Operador", apPaterno: "Emisor", email: "emisor@cmvalparaiso.cl" },
            detalles: [
                {
                    id: "det-1",
                    cantidad: 5,
                    lote: "LOT-1",
                    fechaCaducidad: new Date("2027-10-10"),
                    producto: { id: 101, descripcion: "Ibuprofeno" }
                }
            ]
        } as never);

        // Simulamos fallo del servicio de correo Resend
        vi.mocked(correoLib.enviarCorreo).mockResolvedValue({
            ok: false,
            error: "Límite de envíos diarios alcanzado en Resend"
        });
        vi.mocked(prisma.ordenSalida.update).mockResolvedValue({} as never);

        const fd = crearFormDataPrestamo("receptor@cmvalparaiso.cl");
        const res = await crearOrdenSalida({ ok: false, message: "" }, fd);

        // La salida y el stock NO se revierten
        expect(res.ok).toBe(true);
        expect(res.id).toBe("ord-creada-failmail");
        expect(res.codigoRecepcion).toBeDefined();
        expect(res.codigoRecepcion).toHaveLength(7);
        expect(updateStockSpy).toHaveBeenCalled();

        // Se entrega feedback inmediato en advertencia al emisor
        expect(res.advertencia).toBeDefined();
        expect(res.advertencia).toContain("Límite de envíos diarios alcanzado en Resend");
        expect(res.advertencia).toContain("Por favor comunique el código manualmente");
    });
});
