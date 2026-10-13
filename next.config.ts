import type { NextConfig } from "next";

const nextConfig: NextConfig = {
    experimental: {
        serverActions: {
            bodySizeLimit: "2mb"
        }
    },
    async redirects() {
        return [
            // Ruta historica del modulo, renombrado a "Mantenedores": conserva marcadores y enlaces antiguos.
            {
                source: "/configuraciones",
                destination: "/mantenedores",
                permanent: true
            }
        ];
    }
};

export default nextConfig;
