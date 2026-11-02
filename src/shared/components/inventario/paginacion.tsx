import Link from "next/link";
import type * as React from "react";

// utils
import { formatNumber } from "@/shared/utils/format";
import { crearHrefConParametros, type Paginacion as DatosPaginacion, type ValorParametro } from "@/shared/utils/paginacion";

interface PaginacionProps {
    ruta: string;
    parametros: Record<string, ValorParametro>;
    paginacion: DatosPaginacion;
}

interface EnlacePaginacion {
    etiqueta: string;
    destino: number;
    deshabilitado: boolean;
}

export function Paginacion({ ruta, parametros, paginacion }: PaginacionProps): React.ReactElement {
    const { pagina, paginasTotales, total, desde, hasta } = paginacion;
    const enlaces: EnlacePaginacion[] = [
        { etiqueta: "Primera", destino: 1, deshabilitado: pagina === 1 },
        { etiqueta: "Anterior", destino: pagina - 1, deshabilitado: pagina === 1 },
        { etiqueta: "Siguiente", destino: pagina + 1, deshabilitado: pagina === paginasTotales },
        { etiqueta: "Última", destino: paginasTotales, deshabilitado: pagina === paginasTotales }
    ];

    return (
        <nav aria-label="Paginación" className="flex flex-wrap items-center justify-between gap-3 pt-4 text-sm">
            <p className="text-muted-foreground">
                {total === 0 ? "Sin resultados" : `Mostrando ${formatNumber(desde)}–${formatNumber(hasta)} de ${formatNumber(total)}`}
            </p>
            <div className="flex flex-wrap items-center gap-1">
                {enlaces.map((enlace) =>
                    enlace.deshabilitado ? (
                        <span
                            key={enlace.etiqueta}
                            aria-disabled="true"
                            className="rounded-md border px-3 py-1.5 text-muted-foreground opacity-50"
                        >
                            {enlace.etiqueta}
                        </span>
                    ) : (
                        <Link
                            key={enlace.etiqueta}
                            href={crearHrefConParametros(ruta, { ...parametros, pagina: enlace.destino })}
                            className="rounded-md border px-3 py-1.5 text-slate-700 hover:bg-teal-50"
                        >
                            {enlace.etiqueta}
                        </Link>
                    )
                )}
                <span className="px-2 text-muted-foreground">
                    Página {formatNumber(pagina)} de {formatNumber(paginasTotales)}
                </span>
            </div>
        </nav>
    );
}

