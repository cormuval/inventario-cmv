import Link from "next/link";
import type * as React from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

// utils
import type { NodoCentro } from "@/modules/reporte/utils/arbol";
import { cn } from "@/shared/utils/cn";
import { crearHrefConParametros, type ValorParametro } from "@/shared/utils/paginacion";

interface ArbolCentrosProps {
    arbol: NodoCentro[];
    centroId: string | null;
    bodegaId: string | null;
    /** Parámetros a conservar (período, búsqueda), sin centroId, bodegaId ni pagina. */
    parametros: Record<string, ValorParametro>;
}

function claseNodo(activo: boolean): string {
    return cn(
        "flex items-center gap-1 rounded-md px-2 py-1.5 text-sm",
        activo ? "bg-teal-600 text-white" : "text-slate-700 hover:bg-teal-50"
    );
}

export function ArbolCentros({ arbol, centroId, bodegaId, parametros }: ArbolCentrosProps): React.ReactElement {
    const centroAbierto = centroId ?? arbol.find((centro) => centro.bodegas.some((bodega) => bodega.id === bodegaId))?.id ?? null;

    return (
        <nav aria-label="Centros y bodegas" className="space-y-1">
            <Link
                href={crearHrefConParametros("/reporte", parametros)}
                aria-current={!centroId && !bodegaId ? "page" : undefined}
                className={claseNodo(!centroId && !bodegaId)}
            >
                Todo
            </Link>
            <ul className="space-y-1">
                {arbol.map((centro) => {
                    const abierto = centro.id === centroAbierto;
                    const Icono = abierto ? ChevronDown : ChevronRight;

                    return (
                        <li key={centro.id}>
                            <Link
                                href={crearHrefConParametros("/reporte", { ...parametros, centroId: centro.id })}
                                aria-current={centroId === centro.id && !bodegaId ? "page" : undefined}
                                className={claseNodo(centroId === centro.id && !bodegaId)}
                            >
                                <Icono className="h-4 w-4 shrink-0" aria-hidden="true" />
                                <span className="truncate">{centro.nombre}</span>
                            </Link>
                            {abierto ? (
                                <ul className="ml-5 mt-1 space-y-1">
                                    {centro.bodegas.map((bodega) => (
                                        <li key={bodega.id}>
                                            <Link
                                                href={crearHrefConParametros("/reporte", { ...parametros, centroId: centro.id, bodegaId: bodega.id })}
                                                aria-current={bodegaId === bodega.id ? "page" : undefined}
                                                className={claseNodo(bodegaId === bodega.id)}
                                            >
                                                <span className="truncate">{bodega.nombre}</span>
                                            </Link>
                                        </li>
                                    ))}
                                </ul>
                            ) : null}
                        </li>
                    );
                })}
            </ul>
        </nav>
    );
}
