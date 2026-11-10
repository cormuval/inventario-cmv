"use client";

import type * as React from "react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

// actions
import {
    buscarProductosHistoricoAction,
    type ProductoBusquedaResult
} from "@/modules/stock/actions/stock-historico.action";

// components
import { Input } from "@/shared/components/ui/input";

// utils
import { crearHrefConParametros, type ValorParametro } from "@/shared/utils/paginacion";

const ESPERA_BUSQUEDA_MS = 300;

interface StockHistoricoBuscadorProps {
    productoActual: { id: number; descripcion: string; linea?: string } | null;
    parametros: Record<string, ValorParametro>;
}

export function StockHistoricoBuscador({
    productoActual,
    parametros
}: StockHistoricoBuscadorProps): React.ReactElement {
    const router = useRouter();
    const [texto, setTexto] = useState("");
    const [opciones, setOpciones] = useState<ProductoBusquedaResult[]>([]);
    const [buscando, setBuscando] = useState(false);

    useEffect(() => {
        const termino = texto.trim();

        if (termino.length < 2 && !/^\d+$/.test(termino)) {
            setBuscando(false);
            setOpciones([]);
            return;
        }

        let vigente = true;
        const temporizador = setTimeout(() => {
            setBuscando(true);
            buscarProductosHistoricoAction(termino)
                .then((resultado) => {
                    if (vigente) {
                        setOpciones(resultado);
                    }
                })
                .catch(() => {
                    if (vigente) {
                        toast.error("No fue posible buscar productos.");
                        setOpciones([]);
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
        router.push(crearHrefConParametros("/stock/historico", { ...parametros, productoId }));
    }

    return (
        <div className="space-y-2">
            <label className="block text-sm font-medium">Producto a consultar</label>
            <div className="relative">
                <Input
                    type="search"
                    placeholder="Buscar por código o descripción de producto..."
                    value={texto}
                    onChange={(e) => setTexto(e.target.value)}
                    aria-label="Buscar producto para stock histórico"
                />
                {buscando ? (
                    <span className="absolute right-3 top-2.5 text-xs text-muted-foreground animate-pulse">
                        Buscando...
                    </span>
                ) : null}
                {opciones.length > 0 ? (
                    <ul className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md">
                        {opciones.map((op) => (
                            <li key={op.id}>
                                <button
                                    type="button"
                                    onClick={() => elegir(op.id)}
                                    className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground rounded-sm"
                                >
                                    <span>
                                        <strong className="font-mono text-muted-foreground mr-2">#{op.id}</strong>
                                        {op.descripcion}
                                    </span>
                                    <span className="text-xs text-muted-foreground">{op.linea}</span>
                                </button>
                            </li>
                        ))}
                    </ul>
                ) : null}
            </div>
            {productoActual ? (
                <div className="flex items-center gap-2 rounded-md bg-muted px-3 py-2 text-sm">
                    <span className="font-semibold text-foreground">Seleccionado:</span>
                    <span>
                        #{productoActual.id} — {productoActual.descripcion}
                    </span>
                    {productoActual.linea ? (
                        <span className="rounded bg-background px-2 py-0.5 text-xs text-muted-foreground">
                            {productoActual.linea}
                        </span>
                    ) : null}
                </div>
            ) : null}
        </div>
    );
}

