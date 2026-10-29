import { describe, expect, it } from "vitest";
import { construirCorreoComprobante } from "@/modules/orden-salida/utils/correo-comprobante";
import type { OrdenSalidaPDFData } from "@/modules/orden-salida/utils/pdf-comprobante";

const orden: OrdenSalidaPDFData = {
    id: "sal-1",
    fecha: new Date("2026-10-29T12:00:00Z"),
    tipoSalida: "Consumo Interno",
    destino: "Box <1>",
    codigoSalida: null,
    centro: { nombre: "CESFAM Barón" },
    bodega: { nombre: "Bodega Farmacia" },
    bodegaDestino: null,
    usuario: { nombre: "Carla", apPaterno: "Rojas", email: "crojas@cmvalparaiso.cl" },
    detalles: [
        { id: "d1", cantidad: 5, lote: "L1", fechaCaducidad: new Date("2027-01-01"), producto: { descripcion: "Paracetamol" } },
        { id: "d2", cantidad: 2, lote: "L2", fechaCaducidad: new Date("2027-01-01"), producto: { descripcion: "Gasa" } }
    ]
};

describe("construirCorreoComprobante", () => {
    it("arma asunto, destinatario, respuesta al emisor y adjunto PDF", () => {
        const pdf = Buffer.from("pdf");

        const correo = construirCorreoComprobante(orden, pdf, "destino@cmvalparaiso.cl");

        expect(correo.para).toBe("destino@cmvalparaiso.cl");
        expect(correo.asunto).toBe("Comprobante de salida N° sal-1 — CESFAM Barón");
        expect(correo.responderA).toBe("crojas@cmvalparaiso.cl");
        expect(correo.adjuntos).toEqual([{ nombre: "comprobante-salida-sal-1.pdf", contenido: pdf }]);
    });

    it("incluye el resumen en texto y en HTML escapado", () => {
        const correo = construirCorreoComprobante(orden, Buffer.from("pdf"), "destino@cmvalparaiso.cl");

        expect(correo.texto).toContain("Bodega Farmacia");
        expect(correo.texto).toContain("Box <1>");
        expect(correo.texto).toContain("2 productos");
        expect(correo.texto).toContain("Carla Rojas");
        expect(correo.html).toContain("Box &lt;1&gt;");
        expect(correo.html).not.toContain("Box <1>");
    });

    it("usa la bodega destino como destino en traspasos", () => {
        const correo = construirCorreoComprobante(
            { ...orden, tipoSalida: "A otra bodega", bodegaDestino: { nombre: "Bodega Vacunatorio" } },
            Buffer.from("pdf"),
            "destino@cmvalparaiso.cl"
        );

        expect(correo.texto).toContain("Destino: Bodega Vacunatorio");
    });
});
