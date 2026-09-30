export const TIPOS_SALIDA = [
    "Consumo Interno",
    "A otra bodega",
    "A Otros Centros",
    "Merma"
] as const;

export type TipoSalida = (typeof TIPOS_SALIDA)[number];

export const DESTINOS_CONSUMO_INTERNO = [
    "Urgencia / SAPU / SAR",
    "Box Médico / Consulta Médica",
    "Vacunatorio",
    "Dental / Odontología",
    "Toma de Muestras / Laboratorio",
    "Sala de Curaciones",
    "Sala ERA / IRA",
    "Control Ginecológico / Maternidad",
    "Kinesiología / Rehabilitación",
    "Farmacia Despacho Paciente",
    "Atención Domiciliaria",
    "Otro Servicio Clínico"
] as const;

export const DESTINOS_MERMA = [
    "Baja por caducidad en estantería",
    "Rotura o deterioro de envase",
    "Falla de cadena de frío",
    "Retiro de mercado / Alerta sanitaria ISP",
    "Contaminación o pérdida de esterilidad",
    "Otra causal sanitaria"
] as const;
