import {
    Archive,
    ArrowDownToLine,
    ArrowUpFromLine,
    Boxes,
    FileBarChart,
    History,
    ListOrdered,
    Package,
    PackageMinus,
    PackagePlus,
    SlidersHorizontal,
    type LucideIcon
} from "lucide-react";

// config
import { ROL_ADMINISTRADOR, ROLES_OPERAN_ENTRADA, ROLES_OPERAN_SALIDA } from "@/config/auth";

export interface EnlaceMenu {
    tipo: "enlace";
    href: string;
    label: string;
    icon: LucideIcon;
}

export interface GrupoMenu {
    tipo: "grupo";
    label: string;
    icon: LucideIcon;
    items: EnlaceMenu[];
}

export type ItemMenu = EnlaceMenu | GrupoMenu;

function enlace(href: string, label: string, icon: LucideIcon): EnlaceMenu {
    return { tipo: "enlace", href, label, icon };
}

function incluyeRol(roles: readonly string[], rolId: string): boolean {
    return roles.includes(rolId);
}

/** Menú lateral según el rol (`rolId`, p. ej. "R01"). Las subopciones "Nueva…" solo para quien puede registrar. */
export function construirMenu(rolId?: string): ItemMenu[] {
    const rol = rolId ?? "";
    const entrada: EnlaceMenu[] = [
        ...(incluyeRol(ROLES_OPERAN_ENTRADA, rol) ? [enlace("/entradas/nueva", "Nueva entrada", PackagePlus)] : []),
        enlace("/entradas/registros", "Registros de entrada", ListOrdered)
    ];
    const salida: EnlaceMenu[] = [
        ...(incluyeRol(ROLES_OPERAN_SALIDA, rol) ? [enlace("/salidas/nueva", "Nueva salida", PackageMinus)] : []),
        enlace("/salidas/registros", "Registros de salida", ListOrdered)
    ];

    return [
        enlace("/", "Resumen", Boxes),
        enlace("/stock", "Stock", Archive),
        enlace("/productos", "Productos", Package),
        { tipo: "grupo", label: "Gestión de entrada", icon: ArrowDownToLine, items: entrada },
        { tipo: "grupo", label: "Gestión de salida", icon: ArrowUpFromLine, items: salida },
        enlace("/reporte", "Reporte", FileBarChart),
        enlace("/mantenedores", "Mantenedores", SlidersHorizontal),
        ...(rol === ROL_ADMINISTRADOR ? [enlace("/auditoria", "Auditoría", History)] : [])
    ];
}

export function aplanarMenu(items: ItemMenu[]): EnlaceMenu[] {
    return items.flatMap((item) => (item.tipo === "grupo" ? item.items : [item]));
}

export function esRutaActiva(pathname: string | null | undefined, href: string): boolean {
    if (!pathname) {
        return false;
    }

    if (href === "/") {
        return pathname === "/";
    }

    return pathname === href || pathname.startsWith(`${href}/`);
}
