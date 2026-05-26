import type { TenantPrismaClient } from "./tenant-client.js";

type CategoriaTipo = "activo" | "pasivo" | "capital" | "ingreso" | "gasto" | "costo";

interface CategoriaSeed {
  codigoContable: string;
  nombre: string;
  tipo: CategoriaTipo;
  esDeducibleSat: boolean;
  ivaAcreditable: boolean;
  isrRetenibleDefault?: string;
  claveProdServSatRegex?: string;
  descripcion?: string;
}

const CATEGORIAS_CONTABLES_V1: CategoriaSeed[] = [
  // Gastos deducibles operativos (más comunes)
  {
    codigoContable: "G-601",
    nombre: "Gastos de oficina y papelería",
    tipo: "gasto",
    esDeducibleSat: true,
    ivaAcreditable: true,
    claveProdServSatRegex: "^(141111|141014|141015|141016|141017|141018|141019|141020|44|14)",
    descripcion: "Papelería, suministros oficina, consumibles administrativos",
  },
  {
    codigoContable: "G-602",
    nombre: "Renta de inmuebles (oficina/local)",
    tipo: "gasto",
    esDeducibleSat: true,
    ivaAcreditable: true,
    isrRetenibleDefault: "10",
    claveProdServSatRegex: "^(80131500|80131501|80131502|80131503|80131600|80131601|80131602)",
    descripcion: "Arrendamiento de oficina/local — incluye retención ISR 10%",
  },
  {
    codigoContable: "G-603",
    nombre: "Servicios de comunicación (telefonía/internet)",
    tipo: "gasto",
    esDeducibleSat: true,
    ivaAcreditable: true,
    claveProdServSatRegex:
      "^(81161500|81161501|81161600|83111500|83111600|83111700|83111800|83111900|83112000|83112200|83112300|83112400|83121700)",
  },
  {
    codigoContable: "G-604",
    nombre: "Honorarios profesionales (asimilados)",
    tipo: "gasto",
    esDeducibleSat: true,
    ivaAcreditable: true,
    isrRetenibleDefault: "10.0",
    claveProdServSatRegex: "^(8011|8101|8121|8141|8016|80161500|80161600|80161700|80161800)",
    descripcion:
      "Servicios profesionales personas físicas — retención ISR 10% + IVA retenido 10.67%",
  },
  {
    codigoContable: "G-605",
    nombre: "Energía eléctrica",
    tipo: "gasto",
    esDeducibleSat: true,
    ivaAcreditable: true,
    claveProdServSatRegex: "^(83101500|83101600|83101700|83101800|83101900)",
  },
  {
    codigoContable: "G-606",
    nombre: "Combustibles y lubricantes",
    tipo: "gasto",
    esDeducibleSat: true,
    ivaAcreditable: true,
    claveProdServSatRegex:
      "^(15101500|15101600|15101700|15101800|15101900|15102000|15102100|15111500|15111600|15111700)",
    descripcion: "Gasolina, diesel, lubricantes — IEPS no acreditable, IVA sí",
  },
  {
    codigoContable: "G-607",
    nombre: "Mantenimiento vehículos",
    tipo: "gasto",
    esDeducibleSat: true,
    ivaAcreditable: true,
    claveProdServSatRegex:
      "^(25101500|25101600|25101800|25102000|78181500|78181501|78181502|78181503|78181504|78181700)",
  },
  {
    codigoContable: "G-608",
    nombre: "Mantenimiento de inmueble",
    tipo: "gasto",
    esDeducibleSat: true,
    ivaAcreditable: true,
    claveProdServSatRegex:
      "^(72101500|72101600|72101700|72101800|72101900|72102000|72102100|72102200)",
  },
  {
    codigoContable: "G-609",
    nombre: "Publicidad y marketing",
    tipo: "gasto",
    esDeducibleSat: true,
    ivaAcreditable: true,
    claveProdServSatRegex:
      "^(82101500|82101600|82101700|82101800|82101900|82111900|82121500|82121700|82131500|82131600|82131700)",
  },
  {
    codigoContable: "G-610",
    nombre: "Viáticos (hospedaje/alimentación viajes)",
    tipo: "gasto",
    esDeducibleSat: true,
    ivaAcreditable: true,
    claveProdServSatRegex:
      "^(90111500|90111600|90111700|90111800|90121500|90121600|90121700|90121800|90131500)",
    descripcion: "Tope diario nacional/extranjero según LISR Art. 28-V",
  },
  {
    codigoContable: "G-611",
    nombre: "Transporte aéreo nacional",
    tipo: "gasto",
    esDeducibleSat: true,
    ivaAcreditable: true,
    claveProdServSatRegex:
      "^(78111500|78111501|78111502|78111503|78111506|78111507|78111508|78111509|78111510)",
  },
  {
    codigoContable: "G-612",
    nombre: "Hospedaje (hoteles)",
    tipo: "gasto",
    esDeducibleSat: true,
    ivaAcreditable: true,
    claveProdServSatRegex: "^(90111500|90111600|90111700|90111800)",
  },
  {
    codigoContable: "G-613",
    nombre: "Alimentación (restaurantes en viaje deducible)",
    tipo: "gasto",
    esDeducibleSat: true,
    ivaAcreditable: true,
    claveProdServSatRegex: "^(90101500|90101600|90101700|90101800)",
    descripcion: "Deducible solo si está en viaje fuera de 50km, tope $750/día",
  },
  {
    codigoContable: "G-614",
    nombre: "Cuotas y suscripciones (asociaciones, software SaaS)",
    tipo: "gasto",
    esDeducibleSat: true,
    ivaAcreditable: true,
    claveProdServSatRegex:
      "^(43232300|43232400|43232500|43232600|43232700|43232800|43233000|43233200|81111800|81112200|81112400)",
  },
  {
    codigoContable: "G-615",
    nombre: "Comisiones bancarias",
    tipo: "gasto",
    esDeducibleSat: true,
    ivaAcreditable: true,
    claveProdServSatRegex:
      "^(84121500|84121600|84121700|84121800|84121900|84131500|84131600|84131800)",
  },

  // Sueldos y nómina
  {
    codigoContable: "G-701",
    nombre: "Sueldos y salarios",
    tipo: "gasto",
    esDeducibleSat: true,
    ivaAcreditable: false,
    claveProdServSatRegex:
      "^(80111600|80111601|80111602|80111603|80111620|80111621|80111622|80111623|80111624)",
  },
  {
    codigoContable: "G-702",
    nombre: "Honorarios asimilables a salarios",
    tipo: "gasto",
    esDeducibleSat: true,
    ivaAcreditable: false,
    isrRetenibleDefault: "1.92",
  },
  {
    codigoContable: "G-703",
    nombre: "IMSS / Infonavit / Sar",
    tipo: "gasto",
    esDeducibleSat: true,
    ivaAcreditable: false,
  },

  // Inversiones / Activos fijos
  {
    codigoContable: "A-101",
    nombre: "Equipo de cómputo",
    tipo: "activo",
    esDeducibleSat: false,
    ivaAcreditable: true,
    claveProdServSatRegex: "^(43211500|43211600|43211700|43211800|43211900|43212100|43212200)",
    descripcion: "Activo fijo — se deduce vía depreciación 30% anual",
  },
  {
    codigoContable: "A-102",
    nombre: "Mobiliario y equipo de oficina",
    tipo: "activo",
    esDeducibleSat: false,
    ivaAcreditable: true,
    claveProdServSatRegex:
      "^(56101500|56101600|56101700|56101800|56111500|56111600|56111700|56112000|56121500)",
    descripcion: "Activo fijo — depreciación 10% anual",
  },
  {
    codigoContable: "A-103",
    nombre: "Equipo de transporte",
    tipo: "activo",
    esDeducibleSat: false,
    ivaAcreditable: true,
    claveProdServSatRegex:
      "^(25101503|25101504|25101505|25101506|25101507|25101508|25101509|25101511)",
    descripcion: "Activo fijo — depreciación 25% anual con tope $250K",
  },
  {
    codigoContable: "A-104",
    nombre: "Equipo médico",
    tipo: "activo",
    esDeducibleSat: false,
    ivaAcreditable: true,
    claveProdServSatRegex: "^(42|41|41121800|41121900|41122100|41122200)",
    descripcion: "Activo fijo — depreciación 25% anual",
  },
  {
    codigoContable: "A-105",
    nombre: "Construcciones / inmuebles",
    tipo: "activo",
    esDeducibleSat: false,
    ivaAcreditable: true,
    descripcion: "Activo fijo — depreciación 5% anual",
  },

  // Costo de ventas
  {
    codigoContable: "C-401",
    nombre: "Compra de mercancía",
    tipo: "costo",
    esDeducibleSat: true,
    ivaAcreditable: true,
    descripcion: "Mercancía para reventa",
  },
  {
    codigoContable: "C-402",
    nombre: "Compra de materia prima",
    tipo: "costo",
    esDeducibleSat: true,
    ivaAcreditable: true,
  },
  {
    codigoContable: "C-403",
    nombre: "Mano de obra directa",
    tipo: "costo",
    esDeducibleSat: true,
    ivaAcreditable: false,
  },

  // No deducibles
  {
    codigoContable: "G-901",
    nombre: "Gastos no deducibles (multas, recargos, donativos a partidos)",
    tipo: "gasto",
    esDeducibleSat: false,
    ivaAcreditable: false,
    descripcion: "Multas SAT, recargos, infracciones, donativos no autorizados",
  },
  {
    codigoContable: "G-902",
    nombre: "Consumos personales (uso particular)",
    tipo: "gasto",
    esDeducibleSat: false,
    ivaAcreditable: false,
  },

  // Pendiente de clasificar (catch-all)
  {
    codigoContable: "G-999",
    nombre: "Sin categoría asignada",
    tipo: "gasto",
    esDeducibleSat: false,
    ivaAcreditable: false,
    descripcion: "CFDI no categorizado — requiere revisión manual",
  },
];

export interface SeedCategoriasContablesResult {
  categoriasCreadas: number;
  categoriasActualizadas: number;
}

export async function seedCategoriasContables(
  client: TenantPrismaClient,
): Promise<SeedCategoriasContablesResult> {
  let creadas = 0;
  let actualizadas = 0;
  for (const cat of CATEGORIAS_CONTABLES_V1) {
    const existing = await client.categoriaContable.findUnique({
      where: { codigoContable: cat.codigoContable },
    });
    const data = {
      codigoContable: cat.codigoContable,
      nombre: cat.nombre,
      tipo: cat.tipo,
      esDeducibleSat: cat.esDeducibleSat,
      ivaAcreditable: cat.ivaAcreditable,
      isPrecargadoGlobal: true,
      ...(cat.isrRetenibleDefault ? { isrRetenibleDefault: cat.isrRetenibleDefault } : {}),
      ...(cat.claveProdServSatRegex ? { claveProdServSatRegex: cat.claveProdServSatRegex } : {}),
      ...(cat.descripcion ? { descripcion: cat.descripcion } : {}),
    };
    if (existing) {
      await client.categoriaContable.update({
        where: { codigoContable: cat.codigoContable },
        data,
      });
      actualizadas++;
    } else {
      await client.categoriaContable.create({ data });
      creadas++;
    }
  }
  return { categoriasCreadas: creadas, categoriasActualizadas: actualizadas };
}
