"use client";

import Link from "next/link";
import type * as React from "react";

// types
import type { ActionState } from "@/shared/types/action-state";

interface ActionMessageProps {
    state: ActionState;
    /** Enlace que se muestra junto al mensaje cuando la acción terminó bien. */
    enlaceExito?: { href: string; etiqueta: string };
}

export function ActionMessage({ state, enlaceExito }: ActionMessageProps): React.ReactElement | null {
    if (!state.message) {
        return null;
    }

    return (
        <p className={state.ok ? "text-sm text-emerald-700" : "text-sm text-red-700"} role="status">
            {state.message}
            {state.ok && enlaceExito ? (
                <>
                    {" "}
                    <Link href={enlaceExito.href} className="font-medium underline underline-offset-4">
                        {enlaceExito.etiqueta}
                    </Link>
                </>
            ) : null}
        </p>
    );
}
