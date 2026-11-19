export function formatDate(value: Date | string): string {
    return new Intl.DateTimeFormat("es-CL", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
    }).format(new Date(value));
}

/**
 * Formatea columnas `@db.Date` (Prisma las entrega a medianoche UTC) sin correrlas
 * un día atrás cuando el proceso corre en hora de Chile.
 */
export function formatFechaCalendario(value: Date | string): string {
    return new Intl.DateTimeFormat("es-CL", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        timeZone: "UTC"
    }).format(new Date(value));
}

export function formatDateTime(value: Date | string): string {
    return new Intl.DateTimeFormat("es-CL", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
        timeZone: "America/Santiago"
    }).format(new Date(value));
}

export function formatNumber(value: number): string {
    return new Intl.NumberFormat("es-CL").format(value);
}

export function toDateInputValue(value: Date = new Date()): string {
    return value.toISOString().slice(0, 10);
}
