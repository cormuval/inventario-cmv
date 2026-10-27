/**
 * Convierte una cadena base64 a Blob binario y dispara la descarga en el navegador.
 */
export function descargarArchivoBase64(
    base64: string,
    filename: string,
    mimeType = "application/pdf"
): void {
    if (typeof window === "undefined") return;

    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }

    const blob = new Blob([bytes], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}
