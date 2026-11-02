export interface NodoCentro {
    id: string;
    nombre: string;
    bodegas: Array<{ id: string; nombre: string }>;
}

export function construirArbol(
    centros: Array<{ id: string; nombre: string }>,
    bodegas: Array<{ id: string; nombre: string; centroId: string }>
): NodoCentro[] {
    return centros.map((centro) => ({
        id: centro.id,
        nombre: centro.nombre,
        bodegas: bodegas
            .filter((bodega) => bodega.centroId === centro.id)
            .map((bodega) => ({ id: bodega.id, nombre: bodega.nombre }))
    }));
}
