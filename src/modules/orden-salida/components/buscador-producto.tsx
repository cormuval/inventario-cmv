"use client";

import type * as React from "react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

// actions
import { buscarProductosAction, type ProductoBuscado } from "@/modules/orden-salida/actions/salidas-producto.action";

// components
import { Input } from "@/shared/components/ui/input";

// utils
import { crearHrefConParametros, type ValorParametro } from "@/shared/utils/paginacion";

const ESPERA_BUSQUEDA_MS = 300;

interface BuscadorProductoProps {
    productoActual: ProductoBuscado | null;
    /** Filtros a conservar al elegir un producto (sin `productoId` ni `pagina`). */
    parametros: Record<string, ValorParametro>;
}

export function BuscadorProducto({ productoActual, parametros }: BuscadorProductoProps): React.ReactElement {
    const router = useRouter();
    const [texto, setTexto] = useState("");
    const [opciones, setOpciones] = useState<ProductoBuscado[]>([]);
    const [buscando, setBuscando] = useState(false);

    useEffect(() => {
        const termino = texto.trim();

        if (termino.length < 2 && !/^\d+$/.test(termino)) {
            setOpciones([]);
            return;
        }

        let vigente = true;
        const temporizador = setTimeout(() => {
            setBuscando(true);
            buscarProductosAction(termino)
                .then((resultado) => {
                    if (vigente) {
                        setOpciones(resultado);
                    }
                })
                .finally(() => {
                    if (vigente) {
                        setBuscando(false);
                    }
                });
        }, ESPERA_BUSQUEDA_MS);

        return () => {
            vigente = false;
            clearTimeout(temporizador);
        };
    }, [texto]);

    function elegir(productoId: number): void {
        setTexto("");
        setOpciones([]);
        router.push(crearHrefConParametros("/salidas/por-producto", { ...parametros, productoId }));
    }

    return (
        <div className="space-y-2">
            <label className="block space-y-1 text-sm">
                <span>Producto</span>
                <Input
                    value={texto}
                    onChange={(evento) => setTexto(evento.currentTarget.value)}
                    placeholder={productoActual ? `${productoActual.descripcion} #${productoActual.id}` : "Busca por nombre o código"}
                    aria-label="Buscar producto"
                />
            </label>
            {buscando ? <p className="text-sm text-muted-foreground">Buscando…</p> : null}
            {opciones.length > 0 ? (
                <ul role="listbox" aria-label="Productos encontrados" className="max-h-64 overflow-auto rounded-md border bg-background">
                    {opciones.map((opcion) => (
                        <li key={opcion.id}>
                            <button
                                type="button"
                                role="option"
                                aria-selected={productoActual?.id === opcion.id}
                                onClick={() => elegir(opcion.id)}
                                className="w-full px-3 py-2 text-left text-sm hover:bg-teal-50"
                            >
                                {opcion.descripcion} <span className="text-muted-foreground">#{opcion.id} · {opcion.linea}</span>
                            </button>
                        </li>
                    ))}
                </ul>
            ) : null}
        </div>
    );
}
