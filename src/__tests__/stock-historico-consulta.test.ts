import { describe, expect, it } from "vitest";

// utils
import {
    calcularEvolucionStock,
    type MovimientoHistoricoRaw
} from "@/modules/stock/utils/stock-historico-consulta";

describe("calcularEvolucionStock", () => {
    const fechaDesde = new Date("2026-10-01T00:00:00.000Z");
    const fechaHasta = new Date("2026-10-31T23:59:59.999Z");

    it("reconstruye saldo inicial y final con saldo actual conocido y movimientos en el rango", () => {
        // Stock actual hoy = 50
        // No hay movimientos posteriores a fechaHasta
        // En el rango [01-10, 31-10]:
        //  05-10: Entrada de 30
        //  10-10: Salida de 10
        //  15-10: Entrada de 20
        //  20-10: Salida de 15
        // Total variación en rango: +30 - 10 + 20 - 15 = +25
        // Si al final del rango había 50, al inicio debía haber: 50 - 25 = 25.
        const movimientosRango: MovimientoHistoricoRaw[] = [
            {
                id: "e1",
                fecha: new Date("2026-10-05T10:00:00.000Z"),
                tipo: "ENTRADA",
                documento: "FAC-1",
                origen: "Proveedor Cenabast",
                destino: "Bodega Farmacia",
                cantidad: 30,
                lote: "L01",
                fechaCaducidad: new Date("2027-10-05")
            },
            {
                id: "s1",
                fecha: new Date("2026-10-10T11:00:00.000Z"),
                tipo: "SALIDA_CONSUMO",
                documento: "ORD-1",
                origen: "Bodega Farmacia",
                destino: "Box 1",
                cantidad: 10,
                lote: "L01",
                fechaCaducidad: new Date("2027-10-05")
            },
            {
                id: "e2",
                fecha: new Date("2026-10-15T12:00:00.000Z"),
                tipo: "ENTRADA",
                documento: "FAC-2",
                origen: "Proveedor Cenabast",
                destino: "Bodega Farmacia",
                cantidad: 20,
                lote: "L02",
                fechaCaducidad: new Date("2027-12-05")
            },
            {
                id: "s2",
                fecha: new Date("2026-10-20T09:00:00.000Z"),
                tipo: "SALIDA_MERMA",
                documento: "ORD-2",
                origen: "Bodega Farmacia",
                destino: "Merma",
                cantidad: 15,
                lote: "L01",
                fechaCaducidad: new Date("2027-10-05")
            }
        ];

        const resultado = calcularEvolucionStock({
            stockActual: 50,
            movimientosPosteriores: [],
            movimientosRango,
            fechaDesde,
            fechaHasta,
            fechaLimiteConocida: new Date("2026-09-01T00:00:00.000Z")
        });

        expect(resultado.saldoFinal).toBe(50);
        expect(resultado.saldoInicial).toBe(25);
        expect(resultado.totalIngresos).toBe(50);
        expect(resultado.totalEgresos).toBe(25);
        expect(resultado.datosCompletos).toBe(true);
        expect(resultado.movimientos).toHaveLength(4);

        // Verificamos saldos acumulados paso a paso
        // Inicio: 25
        // e1 (+30) -> 55
        // s1 (-10) -> 45
        // e2 (+20) -> 65
        // s2 (-15) -> 50
        expect(resultado.movimientos[0].saldoResultante).toBe(55);
        expect(resultado.movimientos[1].saldoResultante).toBe(45);
        expect(resultado.movimientos[2].saldoResultante).toBe(65);
        expect(resultado.movimientos[3].saldoResultante).toBe(50);
    });

    it("descuenta movimientos posteriores a fechaHasta para obtener el saldo a esa fecha", () => {
        // Stock actual hoy = 80
        // Movimientos posteriores a fechaHasta (ej. noviembre):
        //   - Entrada de 40 (+40)
        //   - Salida de 10 (-10)
        //   Neto posterior = +30
        // Saldo a fechaHasta (31-10) = 80 - 30 = 50.
        // Movimientos en rango (octubre):
        //   - Entrada de 20 (+20)
        // Saldo a fechaDesde (01-10) = 50 - 20 = 30.
        const movimientosPosteriores: MovimientoHistoricoRaw[] = [
            {
                id: "e-post",
                fecha: new Date("2026-11-02T10:00:00.000Z"),
                tipo: "ENTRADA",
                documento: "FAC-POST",
                origen: "Cenabast",
                destino: "Farmacia",
                cantidad: 40
            },
            {
                id: "s-post",
                fecha: new Date("2026-11-05T10:00:00.000Z"),
                tipo: "SALIDA_CONSUMO",
                documento: "ORD-POST",
                origen: "Farmacia",
                destino: "Box",
                cantidad: 10
            }
        ];

        const movimientosRango: MovimientoHistoricoRaw[] = [
            {
                id: "e-oct",
                fecha: new Date("2026-10-15T10:00:00.000Z"),
                tipo: "ENTRADA",
                documento: "FAC-OCT",
                origen: "Cenabast",
                destino: "Farmacia",
                cantidad: 20
            }
        ];

        const resultado = calcularEvolucionStock({
            stockActual: 80,
            movimientosPosteriores,
            movimientosRango,
            fechaDesde,
            fechaHasta,
            fechaLimiteConocida: new Date("2026-09-01T00:00:00.000Z")
        });

        expect(resultado.saldoFinal).toBe(50);
        expect(resultado.saldoInicial).toBe(30);
        expect(resultado.totalIngresos).toBe(20);
        expect(resultado.totalEgresos).toBe(0);
        expect(resultado.movimientos[0].saldoResultante).toBe(50);
    });

    it("maneja traspasos a otra bodega y préstamos intercentros (emisión, recepción y anulación)", () => {
        // En bodega A:
        //  02-10: TRASPASO_SALIDA hacia bodega B de 15 (-15)
        //  05-10: PRESTAMO_EMITIDO a otro centro de 10 (-10)
        //  10-10: PRESTAMO_ANULADO devuelto a bodega A de 10 (+10)
        //  12-10: TRASPASO_ENTRADA recibido desde bodega C de 25 (+25)
        //  15-10: PRESTAMO_RECEPCIONADO recibido en bodega A de 30 (+30)
        // Saldo final = 60
        // Saldo inicial = 60 - (-15 - 10 + 10 + 25 + 30) = 60 - 40 = 20
        const movimientosRango: MovimientoHistoricoRaw[] = [
            {
                id: "tr-salida",
                fecha: new Date("2026-10-02T10:00:00.000Z"),
                tipo: "TRASPASO_SALIDA",
                documento: "ORD-TR-1",
                origen: "Bodega A",
                destino: "Bodega B",
                cantidad: 15
            },
            {
                id: "prestamo-em",
                fecha: new Date("2026-10-05T10:00:00.000Z"),
                tipo: "PRESTAMO_EMITIDO",
                documento: "ORD-PR-1",
                origen: "Bodega A",
                destino: "CESFAM Cordillera",
                cantidad: 10
            },
            {
                id: "prestamo-an",
                fecha: new Date("2026-10-10T10:00:00.000Z"),
                tipo: "PRESTAMO_ANULADO",
                documento: "ORD-PR-1",
                origen: "CESFAM Cordillera",
                destino: "Bodega A",
                cantidad: 10
            },
            {
                id: "tr-entrada",
                fecha: new Date("2026-10-12T10:00:00.000Z"),
                tipo: "TRASPASO_ENTRADA",
                documento: "ORD-TR-2",
                origen: "Bodega C",
                destino: "Bodega A",
                cantidad: 25
            },
            {
                id: "pr-rec",
                fecha: new Date("2026-10-15T10:00:00.000Z"),
                tipo: "PRESTAMO_RECEPCIONADO",
                documento: "ENT-PR-1",
                origen: "CESFAM Esperanza",
                destino: "Bodega A",
                cantidad: 30
            }
        ];

        const resultado = calcularEvolucionStock({
            stockActual: 60,
            movimientosPosteriores: [],
            movimientosRango,
            fechaDesde,
            fechaHasta,
            fechaLimiteConocida: new Date("2026-09-01T00:00:00.000Z")
        });

        expect(resultado.saldoInicial).toBe(20);
        expect(resultado.saldoFinal).toBe(60);
        expect(resultado.totalIngresos).toBe(65); // 10 + 25 + 30
        expect(resultado.totalEgresos).toBe(25);  // 15 + 10
        expect(resultado.movimientos[0].saldoResultante).toBe(5);   // 20 - 15
        expect(resultado.movimientos[1].saldoResultante).toBe(-5);  // 5 - 10
        expect(resultado.movimientos[2].saldoResultante).toBe(5);   // -5 + 10
        expect(resultado.movimientos[3].saldoResultante).toBe(30);  // 5 + 25
        expect(resultado.movimientos[4].saldoResultante).toBe(60);  // 30 + 30
    });

    it("identifica datos insuficientes cuando la fecha desde es anterior a la fecha límite conocida", () => {
        const fechaLimite = new Date("2026-10-15T00:00:00.000Z");
        const fechaDesdeInvalida = new Date("2026-09-01T00:00:00.000Z");

        const resultado = calcularEvolucionStock({
            stockActual: 10,
            movimientosPosteriores: [],
            movimientosRango: [],
            fechaDesde: fechaDesdeInvalida,
            fechaHasta,
            fechaLimiteConocida: fechaLimite
        });

        expect(resultado.datosCompletos).toBe(false);
        expect(resultado.fechaLimiteTrazabilidad).toEqual(fechaLimite);
        expect(resultado.mensajeAdvertencia).toContain("Datos insuficientes");
    });
});

