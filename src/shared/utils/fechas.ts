// config
import { ZONA_HORARIA } from "@/config/fechas";

export interface RangoFechaDia {
    desde: Date;
    hasta: Date;
    fechaInicioLocal: string; // "YYYY-MM-DDTHH:mm"
    fechaFinLocal: string;    // "YYYY-MM-DDTHH:mm"
}

/**
 * Devuelve el rango [desde, hasta] del día actual en la zona horaria especificada (por defecto "America/Santiago").
 * Respeta el horario de verano y de invierno en Chile usando Intl.DateTimeFormat con timeZone.
 */
export function obtenerRangoHoyChile(
    referencia: Date = new Date(),
    zonaHoraria: string = ZONA_HORARIA
): RangoFechaDia {
    const dtf = new Intl.DateTimeFormat("en-US", {
        timeZone: zonaHoraria,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23"
    });

    const parts = dtf.formatToParts(referencia);
    const getPart = (type: string) => {
        const val = parts.find((p) => p.type === type)?.value;
        return val ? parseInt(val, 10) : 0;
    };

    const anio = getPart("year");
    const mes = getPart("month"); // 1-12
    const dia = getPart("day");
    const hora = getPart("hour");
    const min = getPart("minute");
    const seg = getPart("second");

    const localTimeAsUtc = Date.UTC(anio, mes - 1, dia, hora, min, seg);
    const offsetMinutos = (localTimeAsUtc - referencia.getTime()) / 60000;

    const desdeEpoch = Date.UTC(anio, mes - 1, dia, 0, 0, 0, 0) - offsetMinutos * 60000;
    const hastaEpoch = Date.UTC(anio, mes - 1, dia, 23, 59, 59, 999) - offsetMinutos * 60000;

    const mesStr = String(mes).padStart(2, "0");
    const diaStr = String(dia).padStart(2, "0");

    return {
        desde: new Date(desdeEpoch),
        hasta: new Date(hastaEpoch),
        fechaInicioLocal: `${anio}-${mesStr}-${diaStr}T00:00`,
        fechaFinLocal: `${anio}-${mesStr}-${diaStr}T23:59`
    };
}
