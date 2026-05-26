import Decimal from "decimal.js";
import type { FastifyRequest } from "fastify";

type TenantClient = FastifyRequest["tenantPrisma"];
type Tx = Parameters<Parameters<TenantClient["$transaction"]>[0]>[0];

export class HospitalizacionError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly extra?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "HospitalizacionError";
  }
}

export function validateSujetoXor(input: {
  pacienteId?: string | undefined;
  mascotaId?: string | undefined;
}): void {
  if (Boolean(input.pacienteId) === Boolean(input.mascotaId)) {
    throw new HospitalizacionError(
      400,
      "Indica exactamente uno: pacienteId (humano) o mascotaId (vet)",
    );
  }
}

async function nextFolio(tx: Tx, sucursalId: string, sucursalCodigo: string): Promise<string> {
  const counter = await tx.hospitalizacionFolioCounter.upsert({
    where: { sucursalId },
    create: { sucursalId, ultimoFolio: 1 },
    update: { ultimoFolio: { increment: 1 } },
  });
  return `HOSP-${sucursalCodigo}-${String(counter.ultimoFolio).padStart(6, "0")}`;
}

export interface IngresarPacienteInput {
  sucursalId: string;
  camaId: string;
  pacienteId?: string;
  mascotaId?: string;
  medicoResponsableId: string;
  diagnosticoIngresoId?: string;
  diagnosticoIngresoTexto?: string;
  motivoIngreso: string;
  notasIngreso?: string;
  tarifaEstanciaDiaria?: string;
}

export interface IngresarPacienteResult {
  hospitalizacionId: string;
  folio: string;
  camaId: string;
}

function asegurarCamaDisponible(
  cama: {
    sucursalId: string;
    isActive: boolean;
    estado: string;
    codigo: string;
  },
  sucursalIdEsperada: string,
): void {
  if (cama.sucursalId !== sucursalIdEsperada) {
    throw new HospitalizacionError(400, "Cama no pertenece a la sucursal indicada");
  }
  if (!cama.isActive) {
    throw new HospitalizacionError(409, "Cama inactiva");
  }
  if (cama.estado !== "libre") {
    throw new HospitalizacionError(409, `Cama en estado ${cama.estado}, no disponible`, {
      estadoActual: cama.estado,
    });
  }
}

function buildHospitalizacionData(
  input: IngresarPacienteInput,
  folio: string,
  tarifa: string | null,
): Record<string, unknown> {
  return {
    folio,
    sucursalId: input.sucursalId,
    camaId: input.camaId,
    ...(input.pacienteId ? { pacienteId: input.pacienteId } : {}),
    ...(input.mascotaId ? { mascotaId: input.mascotaId } : {}),
    medicoResponsableId: input.medicoResponsableId,
    ...(input.diagnosticoIngresoId ? { diagnosticoIngresoId: input.diagnosticoIngresoId } : {}),
    ...(input.diagnosticoIngresoTexto
      ? { diagnosticoIngresoTexto: input.diagnosticoIngresoTexto }
      : {}),
    motivoIngreso: input.motivoIngreso,
    ...(input.notasIngreso ? { notasIngreso: input.notasIngreso } : {}),
    fechaIngreso: new Date(),
    ...(tarifa ? { tarifaEstanciaDiaria: tarifa } : {}),
    estado: "activa",
  };
}

export async function ingresarPaciente(
  client: TenantClient,
  input: IngresarPacienteInput,
): Promise<IngresarPacienteResult> {
  validateSujetoXor(input);
  return client.$transaction(async (tx) => {
    const cama = await tx.cama.findUnique({
      where: { id: input.camaId },
      include: { sucursal: { select: { codigo: true } } },
    });
    if (!cama) throw new HospitalizacionError(404, "Cama no encontrada");
    asegurarCamaDisponible(cama, input.sucursalId);
    const folio = await nextFolio(tx, input.sucursalId, cama.sucursal.codigo);
    const tarifa =
      input.tarifaEstanciaDiaria ?? (cama.tarifaPorNoche ? cama.tarifaPorNoche.toString() : null);
    const hosp = await tx.hospitalizacion.create({
      data: buildHospitalizacionData(input, folio, tarifa) as never,
    });
    await tx.cama.update({ where: { id: input.camaId }, data: { estado: "ocupada" } });
    if (tarifa) {
      await tx.cargoHospital.create({
        data: {
          hospitalizacionId: hosp.id,
          tipo: "estancia_diaria",
          descripcion: `Estancia diaria — cama ${cama.codigo}`,
          cantidad: "1",
          precioUnitario: tarifa,
          monto: tarifa,
          capturadoPorId: input.medicoResponsableId,
        },
      });
    }
    return { hospitalizacionId: hosp.id, folio: hosp.folio, camaId: hosp.camaId };
  });
}

export interface ExpandKardexInput {
  horaInicio: Date;
  frecuenciaHoras: number;
  duracionDias: number;
}

export function expandKardexProgramado(input: ExpandKardexInput): Date[] {
  const dosis: Date[] = [];
  const totalHoras = input.duracionDias * 24;
  const totalDosis = Math.floor(totalHoras / input.frecuenciaHoras);
  for (let i = 0; i < totalDosis; i++) {
    const hora = new Date(input.horaInicio);
    hora.setHours(hora.getHours() + i * input.frecuenciaHoras);
    dosis.push(hora);
  }
  return dosis;
}

export interface ProgramarMedicacionInput {
  hospitalizacionId: string;
  prescritaPorId: string;
  medicamentoCatalogoId: string;
  dosis: string;
  via: string;
  frecuenciaHoras: number;
  duracionDias: number;
  horaInicio: Date;
  indicacionMedica: string;
  recetaId?: string;
}

export interface ProgramarMedicacionResult {
  medicacionProgramadaId: string;
  kardexCreados: number;
}

export async function programarMedicacion(
  client: TenantClient,
  input: ProgramarMedicacionInput,
): Promise<ProgramarMedicacionResult> {
  return client.$transaction(async (tx) => {
    const hosp = await tx.hospitalizacion.findUnique({
      where: { id: input.hospitalizacionId },
      select: { id: true, estado: true },
    });
    if (!hosp) throw new HospitalizacionError(404, "Hospitalización no encontrada");
    if (hosp.estado !== "activa") {
      throw new HospitalizacionError(
        409,
        `Hospitalización en estado ${hosp.estado}, no permite programar`,
      );
    }
    const medicamento = await tx.medicamentoCatalogo.findUnique({
      where: { id: input.medicamentoCatalogoId },
      select: { id: true, nombreComercial: true, isActive: true },
    });
    if (!medicamento || !medicamento.isActive) {
      throw new HospitalizacionError(404, "Medicamento no encontrado o inactivo");
    }
    const med = await tx.medicacionProgramada.create({
      data: {
        hospitalizacionId: input.hospitalizacionId,
        medicamentoCatalogoId: input.medicamentoCatalogoId,
        medicamentoNombreSnapshot: medicamento.nombreComercial,
        dosis: input.dosis,
        via: input.via,
        frecuenciaHoras: input.frecuenciaHoras,
        horaInicio: input.horaInicio,
        duracionDias: input.duracionDias,
        indicacionMedica: input.indicacionMedica,
        ...(input.recetaId ? { recetaId: input.recetaId } : {}),
        prescritaPorId: input.prescritaPorId,
      },
    });
    const horas = expandKardexProgramado({
      horaInicio: input.horaInicio,
      frecuenciaHoras: input.frecuenciaHoras,
      duracionDias: input.duracionDias,
    });
    await tx.kardexAplicacion.createMany({
      data: horas.map((hora) => ({
        medicacionProgramadaId: med.id,
        horaProgramada: hora,
        estado: "pendiente" as const,
      })),
    });
    return { medicacionProgramadaId: med.id, kardexCreados: horas.length };
  });
}

export async function suspenderMedicacion(
  client: TenantClient,
  id: string,
  motivoSuspension: string,
): Promise<void> {
  const med = await client.medicacionProgramada.findUnique({
    where: { id },
    select: { id: true, estado: true },
  });
  if (!med) throw new HospitalizacionError(404, "Medicación no encontrada");
  if (med.estado !== "activa") {
    throw new HospitalizacionError(409, `Medicación en estado ${med.estado}, no permite suspender`);
  }
  await client.medicacionProgramada.update({
    where: { id },
    data: { estado: "suspendida", suspendidaAt: new Date(), motivoSuspension },
  });
}

export interface AplicarKardexInput {
  kardexId: string;
  enfermeraAplicadorId: string;
  estado: "aplicada" | "omitida" | "reprogramada";
  notas?: string;
  motivoOmision?: string;
  reaccionAdversaObservada?: string;
  horaAplicada?: Date;
  nuevaHoraProgramada?: Date;
}

export async function aplicarKardex(
  client: TenantClient,
  input: AplicarKardexInput,
): Promise<void> {
  const kardex = await client.kardexAplicacion.findUnique({
    where: { id: input.kardexId },
    select: { id: true, estado: true },
  });
  if (!kardex) throw new HospitalizacionError(404, "Kardex no encontrado");
  if (kardex.estado !== "pendiente") {
    throw new HospitalizacionError(409, `Kardex ya en estado ${kardex.estado} (append-only)`);
  }
  if (input.estado === "omitida" && !input.motivoOmision) {
    throw new HospitalizacionError(400, "motivoOmision requerido cuando estado=omitida");
  }
  if (input.estado === "reprogramada" && !input.nuevaHoraProgramada) {
    throw new HospitalizacionError(400, "nuevaHoraProgramada requerida cuando estado=reprogramada");
  }
  await client.kardexAplicacion.update({
    where: { id: input.kardexId },
    data: {
      estado: input.estado,
      ...(input.estado === "aplicada"
        ? {
            horaAplicada: input.horaAplicada ?? new Date(),
            enfermeraAplicadorId: input.enfermeraAplicadorId,
          }
        : {}),
      ...(input.estado === "reprogramada"
        ? { horaProgramada: input.nuevaHoraProgramada as Date }
        : {}),
      ...(input.notas !== undefined ? { notas: input.notas } : {}),
      ...(input.motivoOmision !== undefined ? { motivoOmision: input.motivoOmision } : {}),
      ...(input.reaccionAdversaObservada !== undefined
        ? { reaccionAdversaObservada: input.reaccionAdversaObservada }
        : {}),
    },
  });
}

export interface SignoVitalAlertas {
  fiebreAlta?: boolean;
  hipotermia?: boolean;
  taquicardia?: boolean;
  bradicardia?: boolean;
  hipoxemia?: boolean;
  hipertension?: boolean;
  hipoglucemia?: boolean;
  hiperglucemia?: boolean;
}

function alertasTemperatura(temperaturaC: string | null | undefined): SignoVitalAlertas {
  if (!temperaturaC) return {};
  const t = Number(temperaturaC);
  if (t >= 39) return { fiebreAlta: true };
  if (t <= 35) return { hipotermia: true };
  return {};
}

function alertasFrecuenciaCardiaca(fc: number | null | undefined): SignoVitalAlertas {
  if (!fc) return {};
  if (fc > 180) return { taquicardia: true };
  if (fc < 40) return { bradicardia: true };
  return {};
}

function alertasGlucosa(glucosa: string | null | undefined): SignoVitalAlertas {
  if (!glucosa) return {};
  const g = Number(glucosa);
  if (g < 60) return { hipoglucemia: true };
  if (g > 250) return { hiperglucemia: true };
  return {};
}

export function evaluarAlertasSignoVital(s: {
  temperaturaC?: string | null;
  frecuenciaCardiaca?: number | null;
  saturacionO2?: number | null;
  presionSistolica?: number | null;
  glucosa?: string | null;
}): SignoVitalAlertas {
  return {
    ...alertasTemperatura(s.temperaturaC),
    ...alertasFrecuenciaCardiaca(s.frecuenciaCardiaca),
    ...(s.saturacionO2 != null && s.saturacionO2 < 90 ? { hipoxemia: true } : {}),
    ...(s.presionSistolica != null && s.presionSistolica > 180 ? { hipertension: true } : {}),
    ...alertasGlucosa(s.glucosa),
  };
}

export interface CapturarSignoVitalInput {
  hospitalizacionId: string;
  capturadoPorId: string;
  temperaturaC?: string;
  frecuenciaCardiaca?: number;
  frecuenciaRespiratoria?: number;
  saturacionO2?: number;
  presionSistolica?: number;
  presionDiastolica?: number;
  glucosa?: string;
  dolorEscala?: number;
  tiempoLlenadoCapilarSeg?: string;
  mucosasColor?: string;
  observaciones?: string;
}

function pickDefinedFields<T extends object>(src: T, keys: ReadonlyArray<keyof T>): Partial<T> {
  const out: Partial<T> = {};
  for (const k of keys) {
    if (src[k] !== undefined) out[k] = src[k];
  }
  return out;
}

const SIGNO_FIELDS = [
  "temperaturaC",
  "frecuenciaCardiaca",
  "frecuenciaRespiratoria",
  "saturacionO2",
  "presionSistolica",
  "presionDiastolica",
  "glucosa",
  "dolorEscala",
  "tiempoLlenadoCapilarSeg",
  "mucosasColor",
  "observaciones",
] as const;

export async function capturarSignoVital(
  client: TenantClient,
  input: CapturarSignoVitalInput,
): Promise<{ id: string; alertasMarcadas: SignoVitalAlertas }> {
  const hosp = await client.hospitalizacion.findUnique({
    where: { id: input.hospitalizacionId },
    select: { id: true, estado: true, pacienteId: true, mascotaId: true },
  });
  if (!hosp) throw new HospitalizacionError(404, "Hospitalización no encontrada");
  if (hosp.estado !== "activa") {
    throw new HospitalizacionError(409, "Solo se capturan signos en hospitalización activa");
  }
  const alertasMarcadas = evaluarAlertasSignoVital({
    temperaturaC: input.temperaturaC ?? null,
    frecuenciaCardiaca: input.frecuenciaCardiaca ?? null,
    saturacionO2: input.saturacionO2 ?? null,
    presionSistolica: input.presionSistolica ?? null,
    glucosa: input.glucosa ?? null,
  });
  const signo = await client.signoVitalHospital.create({
    data: {
      hospitalizacionId: input.hospitalizacionId,
      ...(hosp.pacienteId ? { pacienteId: hosp.pacienteId } : {}),
      ...(hosp.mascotaId ? { mascotaId: hosp.mascotaId } : {}),
      capturadoPorId: input.capturadoPorId,
      hora: new Date(),
      ...pickDefinedFields(input, SIGNO_FIELDS),
      alertasMarcadas: alertasMarcadas as object,
    },
  });
  return { id: signo.id, alertasMarcadas };
}

export interface AgregarCargoInput {
  hospitalizacionId: string;
  capturadoPorId: string;
  tipo:
    | "estancia_diaria"
    | "medicamento"
    | "procedimiento"
    | "laboratorio"
    | "imagenologia"
    | "consumible"
    | "honorarios_medicos"
    | "otro";
  descripcion: string;
  cantidad: string;
  precioUnitario: string;
  productoId?: string;
  observaciones?: string;
}

export async function agregarCargo(
  client: TenantClient,
  input: AgregarCargoInput,
): Promise<{ id: string; monto: string }> {
  const hosp = await client.hospitalizacion.findUnique({
    where: { id: input.hospitalizacionId },
    select: { id: true, estado: true },
  });
  if (!hosp) throw new HospitalizacionError(404, "Hospitalización no encontrada");
  if (hosp.estado !== "activa") {
    throw new HospitalizacionError(409, "Solo se agregan cargos en hospitalización activa");
  }
  const monto = new Decimal(input.cantidad).times(input.precioUnitario).toFixed(4);
  const cargo = await client.cargoHospital.create({
    data: {
      hospitalizacionId: input.hospitalizacionId,
      tipo: input.tipo,
      descripcion: input.descripcion,
      cantidad: input.cantidad,
      precioUnitario: input.precioUnitario,
      monto,
      ...(input.productoId ? { productoId: input.productoId } : {}),
      ...(input.observaciones ? { observaciones: input.observaciones } : {}),
      capturadoPorId: input.capturadoPorId,
    },
  });
  return { id: cargo.id, monto };
}

export interface DarAltaInput {
  hospitalizacionId: string;
  altaPorId: string;
  motivoAlta: string;
  observaciones?: string;
  generarVenta?: boolean;
}

export interface DarAltaResult {
  hospitalizacionId: string;
  camaLiberadaId: string;
  ventaBorradorId: string | null;
  cargosFacturados: number;
  montoTotal: string;
}

async function nextVentaFolio(tx: Tx, sucursalId: string, sucursalCodigo: string): Promise<string> {
  const counter = await tx.ventaFolioCounter.upsert({
    where: { sucursalId },
    create: { sucursalId, ultimoNumero: 1 },
    update: { ultimoNumero: { increment: 1 } },
  });
  return `${sucursalCodigo}-${String(counter.ultimoNumero).padStart(6, "0")}`;
}

export async function darAlta(client: TenantClient, input: DarAltaInput): Promise<DarAltaResult> {
  return client.$transaction(async (tx) => {
    const hosp = await tx.hospitalizacion.findUnique({
      where: { id: input.hospitalizacionId },
      include: {
        sucursal: { select: { id: true, codigo: true } },
        cargos: true,
      },
    });
    if (!hosp) throw new HospitalizacionError(404, "Hospitalización no encontrada");
    if (hosp.estado !== "activa") {
      throw new HospitalizacionError(409, `Hospitalización ya en estado ${hosp.estado}`);
    }
    await tx.medicacionProgramada.updateMany({
      where: { hospitalizacionId: hosp.id, estado: "activa" },
      data: {
        estado: "suspendida",
        suspendidaAt: new Date(),
        motivoSuspension: `Alta: ${input.motivoAlta}`,
      },
    });
    await tx.cama.update({ where: { id: hosp.camaId }, data: { estado: "limpieza" } });
    const cargosNoFacturados = hosp.cargos.filter((c) => c.facturadoEnVentaId === null);
    let ventaId: string | null = null;
    let montoTotal = new Decimal(0);
    for (const c of cargosNoFacturados) montoTotal = montoTotal.plus(c.monto.toString());
    if (input.generarVenta !== false && cargosNoFacturados.length > 0) {
      const folio = await nextVentaFolio(tx, hosp.sucursal.id, hosp.sucursal.codigo);
      const venta = await tx.venta.create({
        data: {
          folio,
          sucursalId: hosp.sucursal.id,
          usuarioId: input.altaPorId,
          estado: "borrador",
          canal: "pos",
          moneda: "MXN",
          subtotal: montoTotal.toFixed(4),
          total: montoTotal.toFixed(4),
          observaciones: `Alta hospitalización ${hosp.folio}: ${input.motivoAlta}`,
        },
      });
      ventaId = venta.id;
      await tx.cargoHospital.updateMany({
        where: { id: { in: cargosNoFacturados.map((c) => c.id) } },
        data: { facturadoEnVentaId: venta.id, facturadoAt: new Date() },
      });
    }
    await tx.hospitalizacion.update({
      where: { id: hosp.id },
      data: {
        estado: "alta",
        fechaEgreso: new Date(),
        motivoEgreso: input.motivoAlta,
        altaPorId: input.altaPorId,
        ...(input.observaciones ? { observacionesAlta: input.observaciones } : {}),
        ...(ventaId ? { ventaAlAltaId: ventaId } : {}),
      },
    });
    return {
      hospitalizacionId: hosp.id,
      camaLiberadaId: hosp.camaId,
      ventaBorradorId: ventaId,
      cargosFacturados: cargosNoFacturados.length,
      montoTotal: montoTotal.toFixed(4),
    };
  });
}
