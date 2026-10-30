// Reporte de la migración y validación posterior a la carga (spec, secciones 6.3 y 7.2).

// migracion
import { TABLAS, type MigracionTransformada, type Rechazo, type Tabla } from "./tipos";

export interface ResumenTabla {
    tabla: Tabla;
    leidos: number;
    aceptados: number;
    rechazados: number;
    advertencias: number;
    insertados: number | null;
}

export interface Diferencia {
    tabla: Tabla;
    clave: string;
    detalle: string;
}

export interface DestinoCargado {
    ids: Record<Tabla, string[]>;
    stock: { id: string; cantidadDisponible: number }[];
}

export function construirResumen(migracion: MigracionTransformada, insertados: Partial<Record<Tabla, number>> | null): ResumenTabla[] {
    return TABLAS.map((tabla) => {
        const datos = migracion[tabla];
        return {
            tabla,
            leidos: datos.leidos,
            aceptados: datos.aceptados.length,
            rechazados: datos.rechazos.length,
            advertencias: datos.advertencias.length,
            insertados: insertados === null ? null : (insertados[tabla] ?? 0)
        };
    });
}

function celda(valor: string): string {
    return `"${valor.replace(/"/g, '""')}"`;
}

export function aCsv(filas: Rechazo[]): string {
    const lineas = filas.map((fila) => [fila.clave, fila.regla, fila.detalle].map(celda).join(","));
    return ["clave,regla,detalle", ...lineas].join("\n") + "\n";
}

export function validarCarga(migracion: MigracionTransformada, destino: DestinoCargado): Diferencia[] {
    const diferencias: Diferencia[] = [];
    for (const tabla of TABLAS) {
        const presentes = new Set(destino.ids[tabla]);
        for (const fila of migracion[tabla].aceptados) {
            const clave = String(fila.id);
            if (!presentes.has(clave)) diferencias.push({ tabla, clave, detalle: "Fila aceptada que no está en el destino" });
        }
    }
    const cantidades = new Map(destino.stock.map((fila) => [fila.id, fila.cantidadDisponible]));
    for (const fila of migracion.Stock.aceptados) {
        const obtenida = cantidades.get(fila.id);
        if (obtenida !== undefined && obtenida !== fila.cantidadDisponible) {
            diferencias.push({ tabla: "Stock", clave: fila.id, detalle: `Cantidad esperada ${fila.cantidadDisponible}, obtenida ${obtenida}` });
        }
    }
    return diferencias;
}

function json(valor: unknown): string {
    return JSON.stringify(valor, null, 4) + "\n";
}

export function archivosReporte(migracion: MigracionTransformada, resumen: ResumenTabla[], diferencias: Diferencia[] | null): Record<string, string> {
    const archivos: Record<string, string> = { "resumen.json": json(resumen), "reasignaciones.json": json(migracion.reasignaciones) };
    for (const tabla of TABLAS) {
        const datos = migracion[tabla];
        if (datos.rechazos.length > 0) archivos[`rechazos-${tabla}.csv`] = aCsv(datos.rechazos);
        if (datos.advertencias.length > 0) archivos[`advertencias-${tabla}.csv`] = aCsv(datos.advertencias);
    }
    if (diferencias !== null) archivos["validacion.json"] = json({ diferencias: diferencias.length, detalle: diferencias });
    return archivos;
}
