// Migración de datos AppSheet -> Inventario CMV.
// Spec: docs/superpowers/specs/2026-10-29-migracion-appsheet-design.md
//
// Uso:
//   npm run migracion:appsheet -- [--ejecutar] [--vaciar=<base_destino>] [--salida=<dir>] [--origen-env=<ruta>]
//
// - Origen: ORIGEN_DATABASE_URL desde .env.migracion (o --origen-env). Usuario de solo lectura.
// - Destino: DESTINO_DATABASE_URL, o DATABASE_URL de .env.
// - Sin --ejecutar solo simula: lee, transforma y escribe el reporte, sin tocar el destino.
// - --vaciar=<base> borra los datos migrados del destino antes de cargar (conserva roles, el centro
//   técnico y sus administradores); exige --ejecutar y repetir el nombre de la base.
// - Re-ejecutar no duplica: se inserta por clave primaria original (skipDuplicates).

// lib
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadEnvFile } from "node:process";
import { PrismaClient, type Prisma } from "@prisma/client";

// migracion
import { leerOpciones, nombreBase, validarOpciones } from "./opciones";
import { archivosReporte, construirResumen, validarCarga, type DestinoCargado, type Diferencia } from "./reporte";
import { transformarTodo } from "./transformar";
import { CENTRO_ADMINISTRACION_ID, ROLES_DESTINO, type DatosOrigen, type MigracionTransformada, type Tabla } from "./tipos";

const LOTE = 1000;

const CONSULTAS: Record<keyof DatosOrigen, string> = {
    centros: "SELECT ID_Centro, Nombre, CAST(Estado AS SIGNED) AS Estado FROM Centro ORDER BY ID_Centro",
    bodegas: "SELECT ID_Bodega, Bodega, ID_Centro, CAST(Estado AS SIGNED) AS Estado FROM Bodega ORDER BY ID_Bodega",
    unidades: "SELECT ID_Unidad, Descripcion FROM Unidad ORDER BY ID_Unidad",
    productos: "SELECT ID_Product, Linea, Descripcion FROM Producto ORDER BY ID_Product",
    usuarios:
        "SELECT ID_User, Nombre, Ap_Paterno, Ap_Materno, Rol, ID_Bodega, Telefono, Email, ID_Centro, CAST(Estado AS SIGNED) AS Estado FROM Usuario ORDER BY ID_User",
    entradas:
        "SELECT ID_OrdenEntrada, Fecha, ID_User, Origen, GuiaDespacho, ID_Centro, ID_Bodega, Codigo_Recepcion FROM OrdenEntrada ORDER BY ID_OrdenEntrada",
    entradaDetalles:
        "SELECT ID_Entrada, ID_Product, Categoria, Fecha_Caducidad, Cantidad, Lote, ID_OrdenEntrada FROM OrdenEntradaDetalle ORDER BY ID_Entrada",
    salidas:
        "SELECT ID_OrdenSalida, Fecha, ID_User, ID_Bodega, Tipo_Salida, ID_Centro, Destino, Codigo_Salida, Enviar_Correo, Correo_Destino FROM OrdenSalida ORDER BY ID_OrdenSalida",
    salidaDetalles: "SELECT ID_Detalle, ID_Product, Cantidad, ID_OrdenSalida, Lote, Fecha_Caducidad FROM OrdenSalidaDetalle ORDER BY ID_Detalle",
    stock:
        "SELECT ID_Stock, ID_Product, ID_Bodega, Cantidad_Disponible, Fecha_Ultima_Actualizacion, StockMinimo, Lote, Fecha_Caducidad FROM Stock ORDER BY ID_Stock"
};

function requerirEnv(nombre: string): string {
    const valor = process.env[nombre];
    if (!valor) throw new Error(`Falta la variable de entorno ${nombre}`);
    return valor;
}

// Una sola conexión para que SET SESSION aplique a todas las consultas del origen.
function conUnaConexion(url: string): string {
    const resultado = new URL(url);
    resultado.searchParams.set("connection_limit", "1");
    return resultado.toString();
}

async function leerOrigen(origen: PrismaClient): Promise<DatosOrigen> {
    await origen.$executeRawUnsafe("SET SESSION TRANSACTION READ ONLY");
    const datos = {} as Record<keyof DatosOrigen, unknown[]>;
    for (const [clave, consulta] of Object.entries(CONSULTAS) as [keyof DatosOrigen, string][]) {
        datos[clave] = await origen.$queryRawUnsafe<unknown[]>(consulta);
    }
    return datos as unknown as DatosOrigen;
}

async function verificarDestino(destino: PrismaClient): Promise<void> {
    const [centro, roles] = await Promise.all([
        destino.centro.findUnique({ where: { id: CENTRO_ADMINISTRACION_ID } }),
        destino.rol.findMany({ select: { id: true } })
    ]);
    if (centro === null) {
        throw new Error(`Falta el centro ${CENTRO_ADMINISTRACION_ID} en el destino: ejecuta SEED_DEMO=false npm run db:seed`);
    }
    const faltantes = ROLES_DESTINO.filter((rol) => !roles.some((existente) => existente.id === rol));
    if (faltantes.length > 0) throw new Error(`Faltan roles en el destino: ${faltantes.join(", ")}`);
}

// Conserva roles, el centro técnico y sus usuarios (administradores del seed y usuario técnico).
async function vaciarDestino(destino: PrismaClient): Promise<void> {
    await destino.$transaction([
        destino.ordenSalidaDetalle.deleteMany(),
        destino.ordenEntradaDetalle.deleteMany(),
        destino.ordenSalida.deleteMany(),
        destino.ordenEntrada.deleteMany(),
        destino.stock.deleteMany(),
        destino.encargadosBodega.deleteMany(),
        destino.log.deleteMany(),
        destino.usuario.updateMany({ where: { centroId: CENTRO_ADMINISTRACION_ID }, data: { bodegaId: null } }),
        destino.usuario.deleteMany({ where: { centroId: { not: CENTRO_ADMINISTRACION_ID } } }),
        destino.producto.deleteMany(),
        destino.unidad.deleteMany(),
        destino.bodega.deleteMany({ where: { centroId: { not: CENTRO_ADMINISTRACION_ID } } }),
        destino.centro.deleteMany({ where: { id: { not: CENTRO_ADMINISTRACION_ID } } })
    ]);
}

async function insertarEnLotes<T>(filas: T[], insertar: (lote: T[]) => Promise<{ count: number }>): Promise<number> {
    let total = 0;
    for (let i = 0; i < filas.length; i += LOTE) {
        total += (await insertar(filas.slice(i, i + LOTE))).count;
    }
    return total;
}

async function insertar(destino: PrismaClient, migracion: MigracionTransformada): Promise<Record<Tabla, number>> {
    const opciones = { skipDuplicates: true };
    const Centro = await insertarEnLotes(migracion.Centro.aceptados, (data) => destino.centro.createMany({ data, ...opciones }));
    const Bodega = await insertarEnLotes(migracion.Bodega.aceptados, (data) => destino.bodega.createMany({ data, ...opciones }));
    const Unidad = await insertarEnLotes(migracion.Unidad.aceptados, (data) => destino.unidad.createMany({ data, ...opciones }));
    const Producto = await insertarEnLotes(migracion.Producto.aceptados, (data) => destino.producto.createMany({ data, ...opciones }));
    const Usuario = await insertarEnLotes(migracion.Usuario.aceptados, (data) => destino.usuario.createMany({ data, ...opciones }));
    const OrdenEntrada = await insertarEnLotes(migracion.OrdenEntrada.aceptados, (data) => destino.ordenEntrada.createMany({ data, ...opciones }));
    const OrdenEntradaDetalle = await insertarEnLotes(migracion.OrdenEntradaDetalle.aceptados, (data) =>
        destino.ordenEntradaDetalle.createMany({ data, ...opciones })
    );
    const OrdenSalida = await insertarEnLotes(migracion.OrdenSalida.aceptados, (data) => destino.ordenSalida.createMany({ data, ...opciones }));
    const OrdenSalidaDetalle = await insertarEnLotes(migracion.OrdenSalidaDetalle.aceptados, (data) =>
        destino.ordenSalidaDetalle.createMany({ data, ...opciones })
    );
    const Stock = await insertarEnLotes(migracion.Stock.aceptados, (data) => destino.stock.createMany({ data, ...opciones }));
    return { Centro, Bodega, Unidad, Producto, Usuario, OrdenEntrada, OrdenEntradaDetalle, OrdenSalida, OrdenSalidaDetalle, Stock };
}

async function leerDestino(destino: PrismaClient): Promise<DestinoCargado> {
    const id = { select: { id: true } } as const;
    const [centros, bodegas, unidades, productos, usuarios, entradas, entradaDetalles, salidas, salidaDetalles, stock] = await Promise.all([
        destino.centro.findMany(id),
        destino.bodega.findMany(id),
        destino.unidad.findMany(id),
        destino.producto.findMany(id),
        destino.usuario.findMany(id),
        destino.ordenEntrada.findMany(id),
        destino.ordenEntradaDetalle.findMany(id),
        destino.ordenSalida.findMany(id),
        destino.ordenSalidaDetalle.findMany(id),
        destino.stock.findMany({ select: { id: true, cantidadDisponible: true } })
    ]);
    const ids = (filas: { id: string | number }[]): string[] => filas.map((fila) => String(fila.id));
    return {
        ids: {
            Centro: ids(centros),
            Bodega: ids(bodegas),
            Unidad: ids(unidades),
            Producto: ids(productos),
            Usuario: ids(usuarios),
            OrdenEntrada: ids(entradas),
            OrdenEntradaDetalle: ids(entradaDetalles),
            OrdenSalida: ids(salidas),
            OrdenSalidaDetalle: ids(salidaDetalles),
            Stock: ids(stock)
        },
        stock
    };
}

function escribirReporte(directorio: string, archivos: Record<string, string>): void {
    mkdirSync(directorio, { recursive: true });
    for (const [nombre, contenido] of Object.entries(archivos)) {
        writeFileSync(join(directorio, nombre), contenido, "utf8");
    }
}

async function main(): Promise<void> {
    const opciones = leerOpciones(process.argv.slice(2), new Date().toISOString().replace(/[:.]/g, "-"));
    if (existsSync(".env")) loadEnvFile(".env");
    if (!existsSync(opciones.origenEnv)) throw new Error(`No existe ${opciones.origenEnv} con ORIGEN_DATABASE_URL`);
    loadEnvFile(opciones.origenEnv);

    const urlDestino = process.env.DESTINO_DATABASE_URL ?? requerirEnv("DATABASE_URL");
    const baseDestino = nombreBase(urlDestino);
    validarOpciones(opciones, baseDestino);

    const origen = new PrismaClient({ datasourceUrl: conUnaConexion(requerirEnv("ORIGEN_DATABASE_URL")) });
    const destino = new PrismaClient({ datasourceUrl: urlDestino });
    try {
        console.log(`Destino: ${baseDestino} · modo: ${opciones.ejecutar ? "EJECUTAR" : "simulación"}${opciones.vaciar ? " · vaciar" : ""}`);
        const datos = await leerOrigen(origen);
        await verificarDestino(destino);
        if (opciones.vaciar !== null) await vaciarDestino(destino);

        const usuariosDestino = await destino.usuario.findMany({ select: { id: true, email: true } });
        const migracion = transformarTodo(datos, { usuariosDestino, ahora: new Date() });

        let insertados: Record<Tabla, number> | null = null;
        let diferencias: Diferencia[] | null = null;
        if (opciones.ejecutar) {
            insertados = await insertar(destino, migracion);
            diferencias = validarCarga(migracion, await leerDestino(destino));
        }

        const resumen = construirResumen(migracion, insertados);
        escribirReporte(opciones.salida, archivosReporte(migracion, resumen, diferencias));

        if (opciones.ejecutar) {
            await destino.log.create({
                data: {
                    accion: "migracion",
                    entidad: "AppSheet",
                    detalle: JSON.parse(JSON.stringify({ resumen, diferencias: diferencias?.length ?? 0, vaciar: opciones.vaciar !== null })) as Prisma.InputJsonValue
                }
            });
        }

        console.table(resumen);
        console.log(`Reporte: ${opciones.salida}`);
        if (diferencias !== null && diferencias.length > 0) {
            console.error(`Validación con ${diferencias.length} diferencias: revisa validacion.json`);
            process.exitCode = 1;
        }
    } finally {
        await origen.$disconnect();
        await destino.$disconnect();
    }
}

main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
});
