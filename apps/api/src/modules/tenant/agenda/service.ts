export interface SlotDisponibilidad {
  hora: string;
  inicio: string;
  disponible: boolean;
  motivo?: "bloqueo" | "ocupado";
}

export interface AgendaSlotConfig {
  horaInicio: string;
  horaFin: string;
  duracionSlotMinutos: number;
}
export interface BloqueoRango {
  fechaInicio: Date;
  fechaFin: Date;
}
export interface CitaOcupada {
  fechaProgramada: Date;
}

function aMinutos(hhmm: string): number {
  const [h, m] = hhmm.split(":");
  return Number(h) * 60 + Number(m);
}

/**
 * Genera los slots de un día a partir de las agendas del médico, marcando como
 * NO disponibles los que caen dentro de un bloqueo o ya tienen una cita. Función
 * pura (sin DB) para poder testearla. Nota: las horas de la agenda son hora local
 * del negocio; el manejo fino de zona horaria queda para V2.
 */
export function generarSlots(
  fecha: string,
  agendas: AgendaSlotConfig[],
  bloqueos: BloqueoRango[],
  citas: CitaOcupada[],
): SlotDisponibilidad[] {
  const porInicio = new Map<string, SlotDisponibilidad>();

  for (const ag of agendas) {
    const inicioMin = aMinutos(ag.horaInicio);
    const finMin = aMinutos(ag.horaFin);
    const paso = ag.duracionSlotMinutos;
    if (paso <= 0 || finMin <= inicioMin) continue;

    for (let m = inicioMin; m + paso <= finMin; m += paso) {
      const hh = String(Math.floor(m / 60)).padStart(2, "0");
      const mm = String(m % 60).padStart(2, "0");
      const inicio = new Date(`${fecha}T${hh}:${mm}:00`);
      const claveInicio = inicio.toISOString();
      if (porInicio.has(claveInicio)) continue;
      const fin = new Date(inicio.getTime() + paso * 60_000);

      const bloqueado = bloqueos.some((b) => inicio >= b.fechaInicio && inicio < b.fechaFin);
      const ocupado = citas.some((c) => c.fechaProgramada >= inicio && c.fechaProgramada < fin);

      porInicio.set(claveInicio, {
        hora: `${hh}:${mm}`,
        inicio: claveInicio,
        disponible: !bloqueado && !ocupado,
        ...(bloqueado
          ? { motivo: "bloqueo" as const }
          : ocupado
            ? { motivo: "ocupado" as const }
            : {}),
      });
    }
  }

  return [...porInicio.values()].sort((a, b) => a.hora.localeCompare(b.hora));
}
