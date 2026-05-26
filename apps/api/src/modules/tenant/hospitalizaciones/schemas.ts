import { z } from "zod";

const positiveDecimal = z
  .union([z.number().nonnegative(), z.string().regex(/^\d+(\.\d+)?$/)])
  .transform((v) => String(v));

const positiveDecimalStrict = z
  .union([z.number().positive(), z.string().regex(/^\d*\.?\d+$/)])
  .transform((v) => String(v))
  .refine((v) => Number(v) > 0, "Debe ser mayor a 0");

export const hospitalizacionIngresarSchema = z
  .object({
    sucursalId: z.string().min(1),
    camaId: z.string().min(1),
    pacienteId: z.string().min(1).optional(),
    mascotaId: z.string().min(1).optional(),
    medicoResponsableId: z.string().min(1),
    diagnosticoIngresoId: z.string().min(1).optional(),
    diagnosticoIngresoTexto: z.string().max(500).optional(),
    motivoIngreso: z.string().min(1).max(500),
    notasIngreso: z.string().max(2000).optional(),
    tarifaEstanciaDiaria: positiveDecimal.optional(),
  })
  .refine((d) => Boolean(d.pacienteId) !== Boolean(d.mascotaId), {
    message: "Indica exactamente uno: pacienteId (humano) o mascotaId (vet)",
  });

export const programarMedicacionSchema = z.object({
  medicamentoCatalogoId: z.string().min(1),
  dosis: z.string().min(1).max(200),
  via: z.string().min(1).max(80),
  frecuenciaHoras: z.number().int().min(1).max(168),
  duracionDias: z.number().int().min(1).max(60),
  horaInicio: z.string().datetime(),
  indicacionMedica: z.string().min(1).max(2000),
  recetaId: z.string().min(1).optional(),
});

export const suspenderMedicacionSchema = z.object({
  motivoSuspension: z.string().min(1).max(500),
});

export const aplicarKardexSchema = z.object({
  estado: z.enum(["aplicada", "omitida", "reprogramada"]),
  notas: z.string().max(1000).optional(),
  motivoOmision: z.string().max(500).optional(),
  reaccionAdversaObservada: z.string().max(1000).optional(),
  horaAplicada: z.string().datetime().optional(),
  nuevaHoraProgramada: z.string().datetime().optional(),
});

export const capturarSignoVitalSchema = z.object({
  temperaturaC: positiveDecimalStrict.optional(),
  frecuenciaCardiaca: z.number().int().min(1).max(400).optional(),
  frecuenciaRespiratoria: z.number().int().min(1).max(200).optional(),
  saturacionO2: z.number().int().min(0).max(100).optional(),
  presionSistolica: z.number().int().min(0).max(300).optional(),
  presionDiastolica: z.number().int().min(0).max(250).optional(),
  glucosa: positiveDecimalStrict.optional(),
  dolorEscala: z.number().int().min(0).max(10).optional(),
  tiempoLlenadoCapilarSeg: positiveDecimalStrict.optional(),
  mucosasColor: z.string().max(40).optional(),
  observaciones: z.string().max(1000).optional(),
});

export const agregarCargoSchema = z.object({
  tipo: z.enum([
    "estancia_diaria",
    "medicamento",
    "procedimiento",
    "laboratorio",
    "imagenologia",
    "consumible",
    "honorarios_medicos",
    "otro",
  ]),
  descripcion: z.string().min(1).max(300),
  cantidad: positiveDecimalStrict.default("1"),
  precioUnitario: positiveDecimal,
  productoId: z.string().min(1).optional(),
  observaciones: z.string().max(500).optional(),
});

export const darAltaSchema = z.object({
  motivoAlta: z.string().min(1).max(500),
  observaciones: z.string().max(2000).optional(),
  generarVenta: z.boolean().default(true),
});

export const hospitalizacionIdParamSchema = z.object({ id: z.string().min(1) });

export const hospitalizacionListQuerySchema = z.object({
  sucursalId: z.string().optional(),
  pacienteId: z.string().optional(),
  mascotaId: z.string().optional(),
  camaId: z.string().optional(),
  medicoResponsableId: z.string().optional(),
  estado: z.enum(["activa", "alta", "fallecimiento", "fuga", "traslado_externo"]).optional(),
  page: z
    .preprocess((v) => (typeof v === "string" ? Number(v) : v), z.number().int().min(1))
    .default(1),
  pageSize: z
    .preprocess((v) => (typeof v === "string" ? Number(v) : v), z.number().int().min(1).max(200))
    .default(50),
});

export const kardexListQuerySchema = z.object({
  hospitalizacionId: z.string().optional(),
  medicacionProgramadaId: z.string().optional(),
  estado: z.enum(["pendiente", "aplicada", "omitida", "reprogramada"]).optional(),
  desde: z.string().datetime().optional(),
  hasta: z.string().datetime().optional(),
});

export type HospitalizacionIngresarInput = z.infer<typeof hospitalizacionIngresarSchema>;
export type ProgramarMedicacionInput = z.infer<typeof programarMedicacionSchema>;
export type AplicarKardexInput = z.infer<typeof aplicarKardexSchema>;
export type CapturarSignoVitalInput = z.infer<typeof capturarSignoVitalSchema>;
export type AgregarCargoInput = z.infer<typeof agregarCargoSchema>;
export type DarAltaInput = z.infer<typeof darAltaSchema>;
export type HospitalizacionListQuery = z.infer<typeof hospitalizacionListQuerySchema>;
export type KardexListQuery = z.infer<typeof kardexListQuerySchema>;
