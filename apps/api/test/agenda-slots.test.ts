import { describe, expect, it } from "vitest";
import { generarSlots } from "../src/modules/tenant/agenda/service.js";

const FECHA = "2026-07-01";
const agenda = { horaInicio: "09:00", horaFin: "12:00", duracionSlotMinutos: 30 };

function dt(hhmm: string): Date {
  return new Date(`${FECHA}T${hhmm}:00`);
}

describe("generarSlots", () => {
  it("genera slots por paso entre inicio y fin", () => {
    const slots = generarSlots(FECHA, [agenda], [], []);
    expect(slots.map((s) => s.hora)).toEqual([
      "09:00",
      "09:30",
      "10:00",
      "10:30",
      "11:00",
      "11:30",
    ]);
    expect(slots.every((s) => s.disponible)).toBe(true);
  });

  it("marca como bloqueado el slot dentro de un bloqueo", () => {
    const slots = generarSlots(
      FECHA,
      [agenda],
      [{ fechaInicio: dt("10:00"), fechaFin: dt("11:00") }],
      [],
    );
    const m10 = slots.find((s) => s.hora === "10:00");
    const m1030 = slots.find((s) => s.hora === "10:30");
    const m1130 = slots.find((s) => s.hora === "11:30");
    expect(m10?.disponible).toBe(false);
    expect(m10?.motivo).toBe("bloqueo");
    expect(m1030?.disponible).toBe(false);
    expect(m1130?.disponible).toBe(true);
  });

  it("marca como ocupado el slot con una cita existente", () => {
    const slots = generarSlots(FECHA, [agenda], [], [{ fechaProgramada: dt("09:30") }]);
    const m0930 = slots.find((s) => s.hora === "09:30");
    expect(m0930?.disponible).toBe(false);
    expect(m0930?.motivo).toBe("ocupado");
  });

  it("no genera slots si la franja es inválida", () => {
    expect(
      generarSlots(
        FECHA,
        [{ horaInicio: "12:00", horaFin: "09:00", duracionSlotMinutos: 30 }],
        [],
        [],
      ),
    ).toHaveLength(0);
    expect(
      generarSlots(
        FECHA,
        [{ horaInicio: "09:00", horaFin: "12:00", duracionSlotMinutos: 0 }],
        [],
        [],
      ),
    ).toHaveLength(0);
  });

  it("deduplica slots de agendas solapadas y los ordena", () => {
    const slots = generarSlots(
      FECHA,
      [agenda, { horaInicio: "11:00", horaFin: "13:00", duracionSlotMinutos: 30 }],
      [],
      [],
    );
    const horas = slots.map((s) => s.hora);
    expect(new Set(horas).size).toBe(horas.length);
    expect(horas).toEqual([...horas].sort());
  });
});
