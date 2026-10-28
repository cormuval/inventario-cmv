import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { obtenerRangoHoyChile } from "@/shared/utils/fechas";

describe("Utilidad de Fechas - Zona Horaria Chile", () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("con el reloj simulado en 2026-10-22T01:30:00Z (= 21-10 a las 22:30 en Chile), el rango devuelto corresponde al 21 de octubre en Chile", () => {
        // En UTC son las 01:30 del 22 de octubre. En Chile (UTC-3 en verano) son las 22:30 del 21 de octubre.
        const fechaSimulada = new Date("2026-10-22T01:30:00Z");
        vi.setSystemTime(fechaSimulada);

        const rango = obtenerRangoHoyChile();

        // Valores ISO del rango en UTC:
        // 21 de octubre a las 00:00 en Chile (UTC-3) corresponde a las 03:00 UTC del 21 de octubre
        expect(rango.desde.toISOString()).toBe("2026-10-21T03:00:00.000Z");
        // 21 de octubre a las 23:59:59.999 en Chile (UTC-3) corresponde a las 02:59:59.999 UTC del 22 de octubre
        expect(rango.hasta.toISOString()).toBe("2026-10-22T02:59:59.999Z");

        // Cadenas para inputs datetime-local del formulario
        expect(rango.fechaInicioLocal).toBe("2026-10-21T00:00");
        expect(rango.fechaFinLocal).toBe("2026-10-21T23:59");
    });

    it("con milisegundos en la referencia, el rango no se desplaza", () => {
        vi.setSystemTime(new Date("2026-10-22T01:30:00.999Z"));

        const rango = obtenerRangoHoyChile();

        expect(rango.desde.toISOString()).toBe("2026-10-21T03:00:00.000Z");
        expect(rango.hasta.toISOString()).toBe("2026-10-22T02:59:59.999Z");
    });
});
