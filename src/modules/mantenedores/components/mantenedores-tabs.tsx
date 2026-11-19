"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { Bodega, Centro, Rol, Unidad } from "@prisma/client";
import { Building2, Layers, Users, Warehouse } from "lucide-react";

// components
import { BodegasTabla, type BodegaConCentro } from "@/modules/mantenedores/components/bodegas/bodegas-tabla";
import { CentrosTabla } from "@/modules/mantenedores/components/centros/centros-tabla";
import { UnidadesTabla } from "@/modules/mantenedores/components/unidades/unidades-tabla";
import { UsuariosTabla, type UsuarioTablaItem } from "@/modules/mantenedores/components/usuarios/usuarios-tabla";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { cn } from "@/shared/utils/cn";

export type TabKey = "usuarios" | "centros" | "bodegas" | "unidades";

interface MantenedoresTabsProps {
    centros: Centro[];
    bodegas: BodegaConCentro[];
    roles: Rol[];
    usuarios: UsuarioTablaItem[];
    unidades: Unidad[];
    currentUserId: string;
}

export function MantenedoresTabs({
    centros,
    bodegas,
    roles,
    usuarios,
    unidades,
    currentUserId
}: MantenedoresTabsProps): React.ReactElement {
    const router = useRouter();
    const searchParams = useSearchParams();
    const tabParam = searchParams.get("tab") as TabKey | null;

    const [activeTab, setActiveTab] = React.useState<TabKey>(() => {
        if (tabParam && ["usuarios", "centros", "bodegas", "unidades"].includes(tabParam)) {
            return tabParam;
        }
        return "usuarios";
    });

    React.useEffect(() => {
        if (tabParam && ["usuarios", "centros", "bodegas", "unidades"].includes(tabParam)) {
            setActiveTab(tabParam);
        }
    }, [tabParam]);

    function cambiarTab(tab: TabKey): void {
        setActiveTab(tab);
        const params = new URLSearchParams(searchParams.toString());
        params.set("tab", tab);
        router.replace(`/mantenedores?${params.toString()}`, { scroll: false });
    }

    const tabs = [
        {
            key: "usuarios" as const,
            label: "Usuarios",
            icon: Users,
            count: usuarios.length,
            title: "Gestión de Usuarios",
            description: "Control de cuentas institucionales, asignación de roles y bodegas autorizadas."
        },
        {
            key: "centros" as const,
            label: "Centros de Salud",
            icon: Building2,
            count: centros.length,
            title: "Centros de Salud (CESFAM / SAPU)",
            description: "Establecimientos de salud primaria de la red comunal Valparaíso."
        },
        {
            key: "bodegas" as const,
            label: "Bodegas",
            icon: Warehouse,
            count: bodegas.length,
            title: "Bodegas y Almacenes",
            description: "Dependencias físicas de custodia de fármacos e insumos clínicos."
        },
        {
            key: "unidades" as const,
            label: "Unidades y Servicios",
            icon: Layers,
            count: unidades.length,
            title: "Unidades y Servicios Clínicos",
            description: "Puntos asistenciales de destino para consumo interno y causales de merma."
        }
    ];

    const currentTabInfo = tabs.find((t) => t.key === activeTab) ?? tabs[0];

    return (
        <div className="space-y-6">
            {/* Navegación por pestañas estandarizada */}
            <div className="flex border-b border-border overflow-x-auto gap-2">
                {tabs.map((tab) => {
                    const Icon = tab.icon;
                    const isActive = activeTab === tab.key;
                    return (
                        <button
                            key={tab.key}
                            type="button"
                            onClick={() => cambiarTab(tab.key)}
                            className={cn(
                                "flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-all whitespace-nowrap",
                                isActive
                                    ? "border-primary text-primary font-semibold"
                                    : "border-transparent text-muted-foreground hover:border-muted-foreground/30 hover:text-foreground"
                            )}
                            aria-selected={isActive}
                            role="tab"
                        >
                            <Icon className={cn("h-4 w-4", isActive ? "text-primary" : "text-muted-foreground")} />
                            <span>{tab.label}</span>
                            <span
                                className={cn(
                                    "ml-1 rounded-full px-2 py-0.5 text-[11px]",
                                    isActive
                                        ? "bg-primary/10 text-primary font-bold"
                                        : "bg-muted text-muted-foreground"
                                )}
                            >
                                {tab.count}
                            </span>
                        </button>
                    );
                })}
            </div>

            {/* Contenedor de la pestaña activa */}
            <Card>
                <CardHeader>
                    <CardTitle>{currentTabInfo.title}</CardTitle>
                    <p className="text-sm text-muted-foreground">{currentTabInfo.description}</p>
                </CardHeader>
                <CardContent>
                    {activeTab === "usuarios" && (
                        <UsuariosTabla
                            usuarios={usuarios}
                            currentUserId={currentUserId}
                            centros={centros}
                            bodegas={bodegas}
                            roles={roles}
                        />
                    )}
                    {activeTab === "centros" && <CentrosTabla centros={centros} />}
                    {activeTab === "bodegas" && <BodegasTabla bodegas={bodegas} centros={centros} />}
                    {activeTab === "unidades" && <UnidadesTabla unidades={unidades} />}
                </CardContent>
            </Card>
        </div>
    );
}
