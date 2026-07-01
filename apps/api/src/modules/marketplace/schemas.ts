import { z } from "zod";

export const tipoProfesionalEnum = z.enum([
  "medico_humano",
  "veterinario",
  "dentista",
  "nutriologo",
  "psicologo",
]);

export const perfilUpsertSchema = z.object({
  medicoIdLocal: z.string().min(1),
  tipo: tipoProfesionalEnum,
  nombrePublico: z.string().min(2).max(160),
  cedulaProfesional: z.string().min(4).max(20).optional(),
  cedulaEspecialidad: z.string().min(4).max(20).optional(),
  especialidades: z.array(z.string().max(80)).max(10).optional(),
  fotoPerfilUrl: z.string().url().optional(),
  bioCorta: z.string().max(280).optional(),
  bioLarga: z.string().max(4000).optional(),
  anosExperiencia: z.number().int().min(0).max(80).optional(),
  idiomas: z.array(z.string().max(10)).max(8).optional(),
  genero: z.string().max(20).optional(),
  atiendeNinos: z.boolean().optional(),
  atiendeAdultos: z.boolean().optional(),
  aceptaTelemedicina: z.boolean().optional(),
  aceptaMismoDia: z.boolean().optional(),
});

export const ubicacionCreateSchema = z.object({
  nombreLugar: z.string().min(2).max(160),
  direccion: z.string().max(240).optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  ciudad: z.string().min(2).max(80),
  estado: z.string().min(2).max(80),
  colonia: z.string().max(120).optional(),
  cp: z.string().max(10).optional(),
  telefonoPublico: z.string().max(20).optional(),
  esPrincipal: z.boolean().optional(),
});

export const responderResenaSchema = z.object({
  respuesta: z.string().min(1).max(1000),
});

export const validarAdminSchema = z.object({
  cedulaValidaSsa: z.boolean(),
  aprobar: z.boolean(),
  motivoRechazo: z.string().max(500).optional(),
});

export const moderarResenaAdminSchema = z.object({
  aprobar: z.boolean(),
});

export const idParamSchema = z.object({ id: z.string().min(1) });
export const slugParamSchema = z.object({ slug: z.string().min(1).max(120) });

export const busquedaQuerySchema = z.object({
  q: z.string().max(120).optional(),
  tipo: tipoProfesionalEnum.optional(),
  ciudad: z.string().max(80).optional(),
  estado: z.string().max(80).optional(),
  aceptaTelemedicina: z.coerce.boolean().optional(),
  atiendeNinos: z.coerce.boolean().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

export const pacienteRegistroSchema = z.object({
  email: z.string().email().toLowerCase(),
  nombre: z.string().min(2).max(120),
  apellidos: z.string().max(120).optional(),
  telefono: z.string().max(20).optional(),
});

export const pacienteConfirmarSchema = z.object({
  email: z.string().email().toLowerCase(),
  codigo: z.string().regex(/^\d{4,8}$/),
});

export const crearResenaPublicaSchema = z.object({
  pacienteEmail: z.string().email().toLowerCase(),
  bookingId: z.string().min(1).optional(),
  ratingGeneral: z.number().int().min(1).max(5),
  ratingPuntualidad: z.number().int().min(1).max(5).optional(),
  ratingExplicacion: z.number().int().min(1).max(5).optional(),
  ratingTrato: z.number().int().min(1).max(5).optional(),
  comentario: z.string().max(2000).optional(),
});

export const reservaCreateSchema = z.object({
  pacienteMasterId: z.string().min(1),
  locationId: z.string().min(1).optional(),
  fechaHora: z.string().datetime(),
  modalidad: z.enum(["presencial", "telemedicina"]).default("presencial"),
  motivo: z.string().max(500).optional(),
});

export const pacienteIdParamSchema = z.object({ pacienteId: z.string().min(1) });

export const reservaConfirmarSchema = z.object({
  medicoUsuarioId: z.string().min(1).optional(),
});

export const reservaRechazarSchema = z.object({
  motivo: z.string().min(3).max(500),
});

export const reservaListQuerySchema = z.object({
  status: z.enum(["pendiente", "confirmada", "rechazada", "cancelada", "completada"]).optional(),
});

export type BusquedaQuery = z.infer<typeof busquedaQuerySchema>;
export type ReservaCreateInput = z.infer<typeof reservaCreateSchema>;
export type ReservaListQuery = z.infer<typeof reservaListQuerySchema>;
