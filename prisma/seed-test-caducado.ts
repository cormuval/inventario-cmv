import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main(): Promise<void> {
    const bodega = await prisma.bodega.findFirst({
        where: { id: "bodega-clinica" }
    }) ?? await prisma.bodega.findFirstOrThrow();

    const productoTest = await prisma.producto.upsert({
        where: { id: 999 },
        update: {
            linea: "CLINICO",
            descripcion: "Paracetamol 500mg (TEST CONTROL SANITARIO)",
            estado: true
        },
        create: {
            id: 999,
            linea: "CLINICO",
            descripcion: "Paracetamol 500mg (TEST CONTROL SANITARIO)",
            estado: true
        }
    });

    const hoy = new Date();
    const fechaAyer = new Date(hoy);
    fechaAyer.setDate(fechaAyer.getDate() - 30);
    fechaAyer.setHours(0, 0, 0, 0);

    const fechaFutura = new Date(hoy);
    fechaFutura.setFullYear(fechaFutura.getFullYear() + 1);
    fechaFutura.setHours(0, 0, 0, 0);

    // Lote Caducado: Saldo 50 unidades, vencido hace 30 días
    await prisma.stock.upsert({
        where: {
            stock_lote_unico: {
                productoId: productoTest.id,
                bodegaId: bodega.id,
                lote: "TEST-CAD-01",
                fechaCaducidad: fechaAyer
            }
        },
        update: {
            cantidadDisponible: 50,
            stockMinimo: 5,
            fechaCaducidad: fechaAyer,
            fechaUltimaActualizacion: new Date()
        },
        create: {
            productoId: productoTest.id,
            bodegaId: bodega.id,
            lote: "TEST-CAD-01",
            fechaCaducidad: fechaAyer,
            cantidadDisponible: 50,
            stockMinimo: 5,
            fechaUltimaActualizacion: new Date()
        }
    });

    // Lote Vigente: Saldo 50 unidades, vence en 1 año
    await prisma.stock.upsert({
        where: {
            stock_lote_unico: {
                productoId: productoTest.id,
                bodegaId: bodega.id,
                lote: "TEST-VIG-02",
                fechaCaducidad: fechaFutura
            }
        },
        update: {
            cantidadDisponible: 50,
            stockMinimo: 5,
            fechaCaducidad: fechaFutura,
            fechaUltimaActualizacion: new Date()
        },
        create: {
            productoId: productoTest.id,
            bodegaId: bodega.id,
            lote: "TEST-VIG-02",
            fechaCaducidad: fechaFutura,
            cantidadDisponible: 50,
            stockMinimo: 5,
            fechaUltimaActualizacion: new Date()
        }
    });

    console.log("==========================================================");
    console.log("PRODUCTO DE PRUEBA SANITARIO CREADO EXITOSAMENTE:");
    console.log(`- Producto: #${productoTest.id} ${productoTest.descripcion}`);
    console.log(`- Bodega: ${bodega.nombre} (${bodega.id})`);
    console.log(`- Lote Caducado: TEST-CAD-01 (Venció: ${fechaAyer.toISOString().split("T")[0]}, Saldo: 50)`);
    console.log(`- Lote Vigente:  TEST-VIG-02 (Vence:   ${fechaFutura.toISOString().split("T")[0]}, Saldo: 50)`);
    console.log("==========================================================");
}

main()
    .catch((error) => {
        console.error("Error al sembrar producto de prueba:", error);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
