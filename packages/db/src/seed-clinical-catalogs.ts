/**
 * Catálogos clínicos seed para tenants vertical Salud (Hito 3.2 V1).
 *
 * - **CIE-10** top ~30 diagnósticos comunes en consulta de medicina humana general.
 *   No es exhaustivo — el médico siempre puede crear diagnósticos custom.
 * - **PLM** top ~25 medicamentos más usados consultorio humano (analgésicos,
 *   antibióticos comunes, antialérgicos, antihipertensivos básicos).
 *
 * Diferidos a V1.5:
 *  - CIE-11 mapeo
 *  - Catálogo completo PLM ~5000 medicamentos
 *  - Catálogo vacunas SSa
 *  - Motor de reglas interacciones que cruza `interaccionesConocidas` automáticamente
 *
 * REGLA: estos son DATOS ESTÁTICOS DE REFERENCIA. El médico lee y decide.
 * No hay IA que recomiende diagnóstico ni calcule dosis (ver project_gaes_pos_no_autodiagnostico.md).
 */

import type { TenantPrismaClient } from "./tenant-client.js";

export interface DiagnosticoSeed {
  codigoCie10: string;
  nombreEs: string;
  nombreEn?: string;
  categoria?: string;
  aplicaHumano?: boolean;
  aplicaVet?: boolean;
}

export const DIAGNOSTICOS_CIE10_V1: ReadonlyArray<DiagnosticoSeed> = Object.freeze([
  // Infecciosas
  {
    codigoCie10: "J00",
    nombreEs: "Resfriado común (rinofaringitis aguda)",
    nombreEn: "Acute nasopharyngitis [common cold]",
    categoria: "infecciosas_respiratorias",
  },
  {
    codigoCie10: "J06.9",
    nombreEs: "Infección aguda de vías respiratorias superiores no especificada",
    categoria: "infecciosas_respiratorias",
  },
  {
    codigoCie10: "J20.9",
    nombreEs: "Bronquitis aguda no especificada",
    categoria: "infecciosas_respiratorias",
  },
  {
    codigoCie10: "J03.9",
    nombreEs: "Amigdalitis aguda no especificada",
    categoria: "infecciosas_respiratorias",
  },
  {
    codigoCie10: "A09",
    nombreEs: "Diarrea y gastroenteritis de presunto origen infeccioso",
    categoria: "infecciosas_digestivas",
  },
  {
    codigoCie10: "N39.0",
    nombreEs: "Infección de vías urinarias, sitio no especificado",
    categoria: "infecciosas_genitourinarias",
  },
  // Metabólicas
  {
    codigoCie10: "E11.9",
    nombreEs: "Diabetes mellitus tipo 2 sin complicaciones",
    categoria: "endocrinas_metabolicas",
  },
  {
    codigoCie10: "E78.5",
    nombreEs: "Hiperlipidemia no especificada",
    categoria: "endocrinas_metabolicas",
  },
  {
    codigoCie10: "E66.9",
    nombreEs: "Obesidad no especificada",
    categoria: "endocrinas_metabolicas",
  },
  // Cardiovasculares
  {
    codigoCie10: "I10",
    nombreEs: "Hipertensión esencial (primaria)",
    categoria: "cardiovasculares",
  },
  {
    codigoCie10: "I25.9",
    nombreEs: "Enfermedad isquémica crónica del corazón no especificada",
    categoria: "cardiovasculares",
  },
  // Respiratorias
  { codigoCie10: "J45.9", nombreEs: "Asma no especificada", categoria: "respiratorias" },
  {
    codigoCie10: "J44.9",
    nombreEs: "Enfermedad pulmonar obstructiva crónica no especificada",
    categoria: "respiratorias",
  },
  // Digestivas
  {
    codigoCie10: "K21.9",
    nombreEs: "Enfermedad por reflujo gastroesofágico sin esofagitis",
    categoria: "digestivas",
  },
  {
    codigoCie10: "K59.0",
    nombreEs: "Estreñimiento",
    categoria: "digestivas",
  },
  // Dolor / Musculoesquelético
  { codigoCie10: "R51", nombreEs: "Cefalea", categoria: "sintomas_signos" },
  { codigoCie10: "M54.5", nombreEs: "Lumbago no especificado", categoria: "musculoesqueleticas" },
  {
    codigoCie10: "M25.5",
    nombreEs: "Dolor articular no especificado",
    categoria: "musculoesqueleticas",
  },
  // Mental
  {
    codigoCie10: "F32.9",
    nombreEs: "Episodio depresivo no especificado",
    categoria: "mental_comportamiento",
  },
  {
    codigoCie10: "F41.1",
    nombreEs: "Trastorno de ansiedad generalizada",
    categoria: "mental_comportamiento",
  },
  // Piel
  { codigoCie10: "L23.9", nombreEs: "Dermatitis alérgica de contacto", categoria: "piel" },
  // Sentidos
  {
    codigoCie10: "H10.9",
    nombreEs: "Conjuntivitis no especificada",
    categoria: "oftalmologicas",
  },
  {
    codigoCie10: "H66.9",
    nombreEs: "Otitis media no especificada",
    categoria: "otorrinolaringologicas",
  },
  // Otros frecuentes
  { codigoCie10: "Z00.0", nombreEs: "Examen médico general", categoria: "examen_salud" },
  { codigoCie10: "Z23", nombreEs: "Vacunación", categoria: "examen_salud" },
  {
    codigoCie10: "R10.4",
    nombreEs: "Dolor abdominal no especificado",
    categoria: "sintomas_signos",
  },
  { codigoCie10: "R50.9", nombreEs: "Fiebre no especificada", categoria: "sintomas_signos" },
  { codigoCie10: "T78.4", nombreEs: "Alergia no especificada", categoria: "inmunologicas" },
  {
    codigoCie10: "B34.9",
    nombreEs: "Infección viral no especificada",
    categoria: "infecciosas_virales",
  },
  { codigoCie10: "M79.1", nombreEs: "Mialgia", categoria: "musculoesqueleticas" },
]);

/**
 * Diagnósticos veterinarios V1 — uso códigos CIE-10 humanos como base + extensiones
 * propias (V-*) para condiciones específicas vet (parásitos comunes, dermatitis,
 * problemas dentales, etc.). En V1.5 migrar a códigos CIE veterinarios oficiales.
 */
export const DIAGNOSTICOS_VET_V1: ReadonlyArray<DiagnosticoSeed> = Object.freeze([
  {
    codigoCie10: "V-001",
    nombreEs: "Parasitosis intestinal",
    categoria: "vet_parasitos",
    aplicaHumano: false,
    aplicaVet: true,
  },
  {
    codigoCie10: "V-002",
    nombreEs: "Ehrlichiosis canina",
    categoria: "vet_hemoparasitos",
    aplicaHumano: false,
    aplicaVet: true,
  },
  {
    codigoCie10: "V-003",
    nombreEs: "Otitis externa",
    categoria: "vet_otorrinolaringologicas",
    aplicaHumano: false,
    aplicaVet: true,
  },
  {
    codigoCie10: "V-004",
    nombreEs: "Dermatitis atópica canina",
    categoria: "vet_piel",
    aplicaHumano: false,
    aplicaVet: true,
  },
  {
    codigoCie10: "V-005",
    nombreEs: "Sarna sarcóptica",
    categoria: "vet_piel",
    aplicaHumano: false,
    aplicaVet: true,
  },
  {
    codigoCie10: "V-006",
    nombreEs: "Gastroenteritis aguda no especificada",
    categoria: "vet_digestivas",
    aplicaHumano: false,
    aplicaVet: true,
  },
  {
    codigoCie10: "V-007",
    nombreEs: "Parvovirosis canina",
    categoria: "vet_infecciosas_virales",
    aplicaHumano: false,
    aplicaVet: true,
  },
  {
    codigoCie10: "V-008",
    nombreEs: "Moquillo canino",
    categoria: "vet_infecciosas_virales",
    aplicaHumano: false,
    aplicaVet: true,
  },
  {
    codigoCie10: "V-009",
    nombreEs: "Calicivirus felino",
    categoria: "vet_infecciosas_virales",
    aplicaHumano: false,
    aplicaVet: true,
  },
  {
    codigoCie10: "V-010",
    nombreEs: "Rinotraqueítis felina",
    categoria: "vet_infecciosas_virales",
    aplicaHumano: false,
    aplicaVet: true,
  },
  {
    codigoCie10: "V-011",
    nombreEs: "Insuficiencia renal crónica",
    categoria: "vet_renal",
    aplicaHumano: false,
    aplicaVet: true,
  },
  {
    codigoCie10: "V-012",
    nombreEs: "Diabetes mellitus felina",
    categoria: "vet_endocrinas",
    aplicaHumano: false,
    aplicaVet: true,
  },
  {
    codigoCie10: "V-013",
    nombreEs: "Obesidad",
    categoria: "vet_metabolicas",
    aplicaHumano: false,
    aplicaVet: true,
  },
  {
    codigoCie10: "V-014",
    nombreEs: "Otitis interna",
    categoria: "vet_otorrinolaringologicas",
    aplicaHumano: false,
    aplicaVet: true,
  },
  {
    codigoCie10: "V-015",
    nombreEs: "Conjuntivitis",
    categoria: "vet_oftalmologicas",
    aplicaHumano: false,
    aplicaVet: true,
  },
  {
    codigoCie10: "V-016",
    nombreEs: "Pioderma superficial",
    categoria: "vet_piel",
    aplicaHumano: false,
    aplicaVet: true,
  },
  {
    codigoCie10: "V-017",
    nombreEs: "Enfermedad periodontal",
    categoria: "vet_estomatologicas",
    aplicaHumano: false,
    aplicaVet: true,
  },
  {
    codigoCie10: "V-018",
    nombreEs: "Vómito agudo no especificado",
    categoria: "vet_sintomas",
    aplicaHumano: false,
    aplicaVet: true,
  },
  {
    codigoCie10: "V-019",
    nombreEs: "Diarrea aguda no especificada",
    categoria: "vet_sintomas",
    aplicaHumano: false,
    aplicaVet: true,
  },
  {
    codigoCie10: "V-020",
    nombreEs: "Atropello vehicular",
    categoria: "vet_trauma",
    aplicaHumano: false,
    aplicaVet: true,
  },
  {
    codigoCie10: "V-021",
    nombreEs: "Pseudociesis (embarazo psicológico)",
    categoria: "vet_reproductivas",
    aplicaHumano: false,
    aplicaVet: true,
  },
  {
    codigoCie10: "V-022",
    nombreEs: "Esterilización electiva (revisión post)",
    categoria: "vet_quirurgicas",
    aplicaHumano: false,
    aplicaVet: true,
  },
  {
    codigoCie10: "V-023",
    nombreEs: "Cuerpo extraño gastrointestinal",
    categoria: "vet_digestivas",
    aplicaHumano: false,
    aplicaVet: true,
  },
  {
    codigoCie10: "V-024",
    nombreEs: "Hipertiroidismo felino",
    categoria: "vet_endocrinas",
    aplicaHumano: false,
    aplicaVet: true,
  },
  {
    codigoCie10: "V-025",
    nombreEs: "Revisión preventiva anual",
    categoria: "vet_examen_salud",
    aplicaHumano: false,
    aplicaVet: true,
  },
]);

type CofeprisV1 = "G_I" | "G_II" | "G_III" | "G_IV" | "G_V" | "G_VI" | "vet" | "OTC";

export interface MedicamentoSeed {
  nombreComercial: string;
  principioActivo: string;
  concentracion?: string;
  presentacion?: string;
  viaAdministracion?: string;
  categoria?: string;
  clasificacionCofepris: CofeprisV1;
  requiereRecetarioOficial?: boolean;
  dosisRecomendadaPediatrica?: Record<string, unknown>;
  dosisRecomendadaAdulto?: Record<string, unknown>;
  dosisRecomendadaVet?: Record<string, unknown>;
  interaccionesConocidas?: string[];
  alergiasRelacionadas?: string[];
  efectosAdversos?: string[];
  precioReferenciaMercado?: number;
}

export const MEDICAMENTOS_PLM_V1: ReadonlyArray<MedicamentoSeed> = Object.freeze([
  // Analgésicos / antipiréticos
  {
    nombreComercial: "Tempra",
    principioActivo: "Paracetamol",
    concentracion: "500 mg",
    presentacion: "Tabletas / Suspensión 24 mg/mL",
    viaAdministracion: "oral",
    categoria: "analgesico_antipiretico",
    clasificacionCofepris: "OTC",
    dosisRecomendadaPediatrica: { mgPorKg: 15, frecuenciaHoras: 6, maxMgKgDia: 60 },
    dosisRecomendadaAdulto: { dosisMg: 500, frecuenciaHoras: 6, maxMgDia: 4000 },
    alergiasRelacionadas: ["paracetamol", "acetaminofen"],
    efectosAdversos: ["hepatotoxicidad_dosis_alta"],
  },
  {
    nombreComercial: "Advil",
    principioActivo: "Ibuprofeno",
    concentracion: "400 mg",
    presentacion: "Tabletas / Suspensión 100 mg/5mL",
    viaAdministracion: "oral",
    categoria: "aine",
    clasificacionCofepris: "G_IV",
    dosisRecomendadaPediatrica: { mgPorKg: 10, frecuenciaHoras: 8, maxMgKgDia: 40 },
    dosisRecomendadaAdulto: { dosisMg: 400, frecuenciaHoras: 8, maxMgDia: 2400 },
    alergiasRelacionadas: ["ibuprofeno", "aines"],
    interaccionesConocidas: ["warfarina", "litio", "metotrexato"],
    efectosAdversos: ["gastritis", "ulcera_peptica", "nefrotoxicidad"],
  },
  {
    nombreComercial: "Naproxeno Genérico",
    principioActivo: "Naproxeno sódico",
    concentracion: "550 mg",
    presentacion: "Tabletas",
    viaAdministracion: "oral",
    categoria: "aine",
    clasificacionCofepris: "G_IV",
    dosisRecomendadaAdulto: { dosisMg: 275, frecuenciaHoras: 12, maxMgDia: 1100 },
    alergiasRelacionadas: ["aines"],
    interaccionesConocidas: ["warfarina", "litio"],
  },
  // Antibióticos
  {
    nombreComercial: "Amoxil",
    principioActivo: "Amoxicilina",
    concentracion: "500 mg",
    presentacion: "Cápsulas / Suspensión 250 mg/5mL",
    viaAdministracion: "oral",
    categoria: "antibiotico_betalactamico",
    clasificacionCofepris: "G_IV",
    requiereRecetarioOficial: false,
    dosisRecomendadaPediatrica: { mgPorKg: 30, frecuenciaHoras: 8 },
    dosisRecomendadaAdulto: { dosisMg: 500, frecuenciaHoras: 8, duracionDiasTipica: 7 },
    alergiasRelacionadas: ["penicilina", "amoxicilina", "betalactamicos"],
    interaccionesConocidas: ["anticonceptivos_orales", "metotrexato"],
  },
  {
    nombreComercial: "Augmentin",
    principioActivo: "Amoxicilina + Ácido clavulánico",
    concentracion: "875/125 mg",
    presentacion: "Tabletas / Suspensión 400/57 mg/5mL",
    viaAdministracion: "oral",
    categoria: "antibiotico_betalactamico",
    clasificacionCofepris: "G_IV",
    dosisRecomendadaAdulto: { dosisMg: 875, frecuenciaHoras: 12, duracionDiasTipica: 7 },
    alergiasRelacionadas: ["penicilina", "betalactamicos"],
  },
  {
    nombreComercial: "Bactrim",
    principioActivo: "Sulfametoxazol + Trimetoprima",
    concentracion: "800/160 mg",
    presentacion: "Tabletas",
    viaAdministracion: "oral",
    categoria: "antibiotico_sulfonamida",
    clasificacionCofepris: "G_IV",
    dosisRecomendadaAdulto: { dosisMg: 800, frecuenciaHoras: 12, duracionDiasTipica: 7 },
    alergiasRelacionadas: ["sulfas", "sulfametoxazol"],
    interaccionesConocidas: ["warfarina", "metotrexato"],
  },
  {
    nombreComercial: "Ciprolet",
    principioActivo: "Ciprofloxacina",
    concentracion: "500 mg",
    presentacion: "Tabletas",
    viaAdministracion: "oral",
    categoria: "antibiotico_quinolona",
    clasificacionCofepris: "G_IV",
    dosisRecomendadaAdulto: { dosisMg: 500, frecuenciaHoras: 12, duracionDiasTipica: 7 },
    alergiasRelacionadas: ["quinolonas"],
    interaccionesConocidas: ["antiacidos", "teofilina", "warfarina"],
    efectosAdversos: ["tendinitis", "fotosensibilidad"],
  },
  // Gastrointestinales
  {
    nombreComercial: "Pantoprazol Genérico",
    principioActivo: "Pantoprazol",
    concentracion: "40 mg",
    presentacion: "Tabletas con capa entérica",
    viaAdministracion: "oral",
    categoria: "ibp",
    clasificacionCofepris: "G_IV",
    dosisRecomendadaAdulto: { dosisMg: 40, frecuenciaHoras: 24 },
  },
  {
    nombreComercial: "Omeprazol Genérico",
    principioActivo: "Omeprazol",
    concentracion: "20 mg",
    presentacion: "Cápsulas",
    viaAdministracion: "oral",
    categoria: "ibp",
    clasificacionCofepris: "OTC",
    dosisRecomendadaAdulto: { dosisMg: 20, frecuenciaHoras: 24 },
  },
  {
    nombreComercial: "Plidan compuesto",
    principioActivo: "Hioscina + Metamizol",
    concentracion: "10/250 mg",
    presentacion: "Tabletas",
    viaAdministracion: "oral",
    categoria: "antiespasmodico_analgesico",
    clasificacionCofepris: "G_IV",
    alergiasRelacionadas: ["metamizol", "dipirona"],
  },
  // Antialérgicos
  {
    nombreComercial: "Avapena",
    principioActivo: "Clorfenamina",
    concentracion: "4 mg",
    presentacion: "Tabletas / Jarabe 2 mg/5mL",
    viaAdministracion: "oral",
    categoria: "antihistaminico",
    clasificacionCofepris: "OTC",
    dosisRecomendadaPediatrica: { dosisMg: 1, frecuenciaHoras: 8 },
    dosisRecomendadaAdulto: { dosisMg: 4, frecuenciaHoras: 6 },
  },
  {
    nombreComercial: "Loratadina Genérica",
    principioActivo: "Loratadina",
    concentracion: "10 mg",
    presentacion: "Tabletas / Jarabe 5 mg/5mL",
    viaAdministracion: "oral",
    categoria: "antihistaminico",
    clasificacionCofepris: "OTC",
    dosisRecomendadaAdulto: { dosisMg: 10, frecuenciaHoras: 24 },
  },
  // Cardiovasculares / antihipertensivos
  {
    nombreComercial: "Losartán Genérico",
    principioActivo: "Losartán",
    concentracion: "50 mg",
    presentacion: "Tabletas",
    viaAdministracion: "oral",
    categoria: "antihipertensivo_ara2",
    clasificacionCofepris: "G_IV",
    dosisRecomendadaAdulto: { dosisMg: 50, frecuenciaHoras: 24 },
    interaccionesConocidas: ["aines", "diureticos_ahorradores_potasio"],
  },
  {
    nombreComercial: "Norvasc",
    principioActivo: "Amlodipino",
    concentracion: "5 mg",
    presentacion: "Tabletas",
    viaAdministracion: "oral",
    categoria: "antihipertensivo_bcc",
    clasificacionCofepris: "G_IV",
    dosisRecomendadaAdulto: { dosisMg: 5, frecuenciaHoras: 24 },
  },
  {
    nombreComercial: "Atenolol Genérico",
    principioActivo: "Atenolol",
    concentracion: "50 mg",
    presentacion: "Tabletas",
    viaAdministracion: "oral",
    categoria: "antihipertensivo_betabloqueador",
    clasificacionCofepris: "G_IV",
    dosisRecomendadaAdulto: { dosisMg: 50, frecuenciaHoras: 24 },
    alergiasRelacionadas: ["betabloqueadores"],
  },
  // Endocrinos
  {
    nombreComercial: "Metformina Genérica",
    principioActivo: "Metformina",
    concentracion: "850 mg",
    presentacion: "Tabletas",
    viaAdministracion: "oral",
    categoria: "antidiabetico_biguanida",
    clasificacionCofepris: "G_IV",
    dosisRecomendadaAdulto: { dosisMg: 850, frecuenciaHoras: 12 },
    efectosAdversos: ["acidosis_lactica_raro"],
  },
  // Broncodilatadores
  {
    nombreComercial: "Salbutamol Inhalador",
    principioActivo: "Salbutamol",
    concentracion: "100 mcg/dosis",
    presentacion: "Inhalador 200 dosis",
    viaAdministracion: "inhalacion",
    categoria: "broncodilatador",
    clasificacionCofepris: "G_IV",
    dosisRecomendadaAdulto: { puff: 2, frecuenciaHoras: 6 },
  },
  // Lípidos
  {
    nombreComercial: "Atorvastatina Genérica",
    principioActivo: "Atorvastatina",
    concentracion: "20 mg",
    presentacion: "Tabletas",
    viaAdministracion: "oral",
    categoria: "hipolipemiante_estatina",
    clasificacionCofepris: "G_IV",
    dosisRecomendadaAdulto: { dosisMg: 20, frecuenciaHoras: 24 },
    interaccionesConocidas: ["claritromicina", "fluconazol", "ciclosporina"],
    efectosAdversos: ["mialgia", "hepatotoxicidad_raro"],
  },
  // Antieméticos
  {
    nombreComercial: "Plasil",
    principioActivo: "Metoclopramida",
    concentracion: "10 mg",
    presentacion: "Tabletas / Jarabe 5 mg/5mL",
    viaAdministracion: "oral",
    categoria: "antiemetico",
    clasificacionCofepris: "G_IV",
    dosisRecomendadaAdulto: { dosisMg: 10, frecuenciaHoras: 8 },
  },
  // Antitusivos
  {
    nombreComercial: "Ambroxol Genérico",
    principioActivo: "Ambroxol",
    concentracion: "30 mg",
    presentacion: "Jarabe 15 mg/5mL",
    viaAdministracion: "oral",
    categoria: "mucolitico",
    clasificacionCofepris: "OTC",
  },
  // Antibióticos opcionales adicionales (urinarias)
  {
    nombreComercial: "Nitrofurantoína Genérica",
    principioActivo: "Nitrofurantoína",
    concentracion: "100 mg",
    presentacion: "Cápsulas",
    viaAdministracion: "oral",
    categoria: "antibiotico_urinario",
    clasificacionCofepris: "G_IV",
    dosisRecomendadaAdulto: { dosisMg: 100, frecuenciaHoras: 8, duracionDiasTipica: 7 },
  },
  // Corticoides
  {
    nombreComercial: "Prednisona Genérica",
    principioActivo: "Prednisona",
    concentracion: "50 mg",
    presentacion: "Tabletas",
    viaAdministracion: "oral",
    categoria: "corticoide",
    clasificacionCofepris: "G_IV",
    dosisRecomendadaAdulto: { dosisMg: 50, frecuenciaHoras: 24 },
    efectosAdversos: ["hiperglicemia", "osteoporosis_uso_prolongado"],
  },
  // Tópicos
  {
    nombreComercial: "Hidrocortisona crema 1%",
    principioActivo: "Hidrocortisona",
    concentracion: "1%",
    presentacion: "Crema tópica 15 g",
    viaAdministracion: "topica",
    categoria: "corticoide_topico",
    clasificacionCofepris: "OTC",
  },
  // Anticonceptivo emergencia (ejemplo G_II - controlado)
  {
    nombreComercial: "Postday",
    principioActivo: "Levonorgestrel",
    concentracion: "1.5 mg",
    presentacion: "Tableta",
    viaAdministracion: "oral",
    categoria: "anticoncepcion_emergencia",
    clasificacionCofepris: "G_II",
    requiereRecetarioOficial: false,
  },
]);

/**
 * Medicamentos veterinarios V1 — top 20 más usados consultorio MX (ICA, Pet's Pharma,
 * Bayer Animal Health, MSD Animal Health). Dosis de REFERENCIA por kg para que el
 * médico LEA y calcule manualmente. NO IA calcula.
 */
export const MEDICAMENTOS_VET_V1: ReadonlyArray<MedicamentoSeed> = Object.freeze([
  // Antiparasitarios
  {
    nombreComercial: "Drontal Plus",
    principioActivo: "Pirantel + Febantel + Praziquantel",
    concentracion: "Tabletas comprimidas",
    presentacion: "Tabletas para perro",
    viaAdministracion: "oral",
    categoria: "antiparasitario_amplio_espectro",
    clasificacionCofepris: "vet",
    dosisRecomendadaVet: { perro: { mgPorKgPirantel: 14.4, dosisUnica: true } },
  },
  {
    nombreComercial: "Bravecto",
    principioActivo: "Fluralaner",
    concentracion: "Tabletas masticables",
    presentacion: "112.5/250/500/1000/1400 mg según peso",
    viaAdministracion: "oral",
    categoria: "antiparasitario_externo_pulgas_garrapatas",
    clasificacionCofepris: "vet",
    dosisRecomendadaVet: { perro: { mgPorKg: 25, frecuenciaDias: 90 } },
  },
  {
    nombreComercial: "NexGard",
    principioActivo: "Afoxolaner",
    concentracion: "Tabletas masticables",
    presentacion: "11.3/28.3/68/136 mg según peso",
    viaAdministracion: "oral",
    categoria: "antiparasitario_externo_mensual",
    clasificacionCofepris: "vet",
    dosisRecomendadaVet: { perro: { mgPorKg: 2.5, frecuenciaDias: 30 } },
  },
  // Antibióticos vet
  {
    nombreComercial: "Synulox",
    principioActivo: "Amoxicilina + Ácido clavulánico",
    concentracion: "250/500 mg",
    presentacion: "Tabletas / Suspensión inyectable",
    viaAdministracion: "oral",
    categoria: "antibiotico_betalactamico_vet",
    clasificacionCofepris: "vet",
    dosisRecomendadaVet: {
      perro: { mgPorKg: 12.5, frecuenciaHoras: 12 },
      gato: { mgPorKg: 12.5, frecuenciaHoras: 12 },
    },
    alergiasRelacionadas: ["penicilina", "betalactamicos"],
  },
  {
    nombreComercial: "Marbofloxacina Vet",
    principioActivo: "Marbofloxacina",
    concentracion: "50 mg",
    presentacion: "Tabletas",
    viaAdministracion: "oral",
    categoria: "antibiotico_fluoroquinolona_vet",
    clasificacionCofepris: "vet",
    dosisRecomendadaVet: {
      perro: { mgPorKg: 2, frecuenciaHoras: 24 },
      gato: { mgPorKg: 2, frecuenciaHoras: 24 },
    },
  },
  // Antiinflamatorios vet
  {
    nombreComercial: "Meloxicam Vet",
    principioActivo: "Meloxicam",
    concentracion: "1.5 mg/mL suspensión",
    presentacion: "Suspensión oral",
    viaAdministracion: "oral",
    categoria: "aine_vet",
    clasificacionCofepris: "vet",
    dosisRecomendadaVet: {
      perro: { mgPorKgDia1: 0.2, mgPorKgManten: 0.1, frecuenciaHoras: 24 },
      gato: { mgPorKg: 0.05, frecuenciaHoras: 24, observacion: "uso restringido" },
    },
    efectosAdversos: ["gastritis", "nefrotoxicidad_gato"],
  },
  {
    nombreComercial: "Rimadyl",
    principioActivo: "Carprofeno",
    concentracion: "25/75/100 mg",
    presentacion: "Tabletas masticables",
    viaAdministracion: "oral",
    categoria: "aine_vet",
    clasificacionCofepris: "vet",
    dosisRecomendadaVet: { perro: { mgPorKg: 2, frecuenciaHoras: 12 } },
  },
  // Antieméticos
  {
    nombreComercial: "Cerenia",
    principioActivo: "Maropitant",
    concentracion: "16/24/60/160 mg",
    presentacion: "Tabletas / Inyectable",
    viaAdministracion: "oral",
    categoria: "antiemetico_vet",
    clasificacionCofepris: "vet",
    dosisRecomendadaVet: {
      perro: { mgPorKg: 2, frecuenciaHoras: 24 },
      gato: { mgPorKg: 1, frecuenciaHoras: 24 },
    },
  },
  // Otros
  {
    nombreComercial: "Frontline Plus",
    principioActivo: "Fipronil + (S)-metopreno",
    concentracion: "Pipeta topical",
    presentacion: "0.5/1.34/2.68/4.02 mL según peso",
    viaAdministracion: "topica",
    categoria: "antiparasitario_externo_topico",
    clasificacionCofepris: "vet",
    dosisRecomendadaVet: { perro: { frecuenciaDias: 30 }, gato: { frecuenciaDias: 30 } },
  },
  {
    nombreComercial: "Caninsulin",
    principioActivo: "Insulina porcina cinc cristalina",
    concentracion: "40 UI/mL",
    presentacion: "Vial inyectable",
    viaAdministracion: "subcutanea",
    categoria: "antidiabetico_vet",
    clasificacionCofepris: "vet",
    dosisRecomendadaVet: {
      perro: { dosisInicialUiPorKg: 0.5, frecuenciaHoras: 12 },
      gato: { dosisInicialUiPorKg: 0.25, frecuenciaHoras: 12 },
    },
  },
  // Antihistamínicos vet
  {
    nombreComercial: "Apoquel",
    principioActivo: "Oclacitinib",
    concentracion: "3.6/5.4/16 mg",
    presentacion: "Tabletas",
    viaAdministracion: "oral",
    categoria: "inmunosupresor_dermatitis_vet",
    clasificacionCofepris: "vet",
    dosisRecomendadaVet: {
      perro: { mgPorKg: 0.4, frecuenciaHoras: 12, maintenanceHoras: 24 },
    },
  },
  // Sedación / pre-anestésicos
  {
    nombreComercial: "Acepromacina Vet",
    principioActivo: "Acepromacina",
    concentracion: "10 mg/mL",
    presentacion: "Inyectable",
    viaAdministracion: "intramuscular",
    categoria: "sedante_vet",
    clasificacionCofepris: "vet",
    dosisRecomendadaVet: {
      perro: { mgPorKg: 0.05, frecuenciaHoras: 6 },
      gato: { mgPorKg: 0.05, frecuenciaHoras: 6 },
    },
  },
]);

/**
 * Vacunas catálogo V1 — esquema básico SSa MX humano + vacunas vet más comunes
 * (séxtuple/triple felina/antirrábica). Datos estáticos del esquema oficial.
 */
export interface VacunaSeed {
  nombreComercial: string;
  principioActivo?: string;
  tipo?: string;
  aplicaHumano?: boolean;
  aplicaVet?: boolean;
  especiesAplicables?: string[];
  esquemaDefaultHumano?: Record<string, unknown>;
  esquemaDefaultVet?: Record<string, unknown>;
  viaAplicacion?: string;
  intervaloRefuerzosDias?: number;
  isObligatoriaCartillaNacional?: boolean;
  precioReferencia?: number;
}

export const VACUNAS_V1: ReadonlyArray<VacunaSeed> = Object.freeze([
  // Humano - cartilla SSa MX básica
  {
    nombreComercial: "BCG",
    principioActivo: "Mycobacterium bovis atenuada",
    tipo: "bacteriana_atenuada",
    aplicaHumano: true,
    esquemaDefaultHumano: { dosisRN: { edadDias: 0, dosisMl: 0.1, via: "intradermica" } },
    viaAplicacion: "intradermica",
    isObligatoriaCartillaNacional: true,
  },
  {
    nombreComercial: "Hepatitis B",
    principioActivo: "Antígeno superficie HBsAg recombinante",
    tipo: "viral_recombinante",
    aplicaHumano: true,
    esquemaDefaultHumano: {
      dosis: [
        { edadMeses: 0, dosis: "1ra" },
        { edadMeses: 2, dosis: "2da" },
        { edadMeses: 6, dosis: "3ra" },
      ],
    },
    viaAplicacion: "intramuscular",
    isObligatoriaCartillaNacional: true,
  },
  {
    nombreComercial: "Pentavalente acelular",
    principioActivo: "DPaT + HepB + Hib + IPV",
    tipo: "combinada",
    aplicaHumano: true,
    esquemaDefaultHumano: {
      dosis: [{ edadMeses: 2 }, { edadMeses: 4 }, { edadMeses: 6 }, { edadMeses: 18 }],
    },
    viaAplicacion: "intramuscular",
    isObligatoriaCartillaNacional: true,
  },
  {
    nombreComercial: "Triple viral (SRP)",
    principioActivo: "Sarampión + Rubéola + Parotiditis",
    tipo: "viral_atenuada",
    aplicaHumano: true,
    esquemaDefaultHumano: {
      dosis: [{ edadMeses: 12 }, { edadAnios: 6 }],
    },
    viaAplicacion: "subcutanea",
    isObligatoriaCartillaNacional: true,
  },
  {
    nombreComercial: "Influenza estacional",
    aplicaHumano: true,
    tipo: "viral_inactivada",
    esquemaDefaultHumano: { dosis: "anual desde 6 meses" },
    viaAplicacion: "intramuscular",
    intervaloRefuerzosDias: 365,
    isObligatoriaCartillaNacional: true,
  },
  {
    nombreComercial: "Antitetánica/Td",
    principioActivo: "Toxoide tetánico + diftérico",
    aplicaHumano: true,
    tipo: "toxoide",
    esquemaDefaultHumano: { dosis: "refuerzo cada 10 años" },
    viaAplicacion: "intramuscular",
    intervaloRefuerzosDias: 3650,
    isObligatoriaCartillaNacional: true,
  },
  {
    nombreComercial: "VPH",
    principioActivo: "Virus del papiloma humano tetravalente",
    aplicaHumano: true,
    tipo: "viral_recombinante",
    esquemaDefaultHumano: { dosis: [{ edadAnios: 11 }, { mesesPosterior: 6 }] },
    viaAplicacion: "intramuscular",
    isObligatoriaCartillaNacional: true,
  },
  // Vet - canina
  {
    nombreComercial: "Vanguard Plus 5/CV-L",
    principioActivo:
      "Moquillo + Adenovirus + Parainfluenza + Parvovirus + Coronavirus + Leptospira",
    tipo: "combinada_vet",
    aplicaVet: true,
    especiesAplicables: ["perro"],
    esquemaDefaultVet: {
      perro: {
        primaria: [
          { edadSemanas: 6, dosis: "1ra" },
          { edadSemanas: 9, dosis: "2da" },
          { edadSemanas: 12, dosis: "3ra" },
        ],
        refuerzoAnual: true,
      },
    },
    viaAplicacion: "subcutanea",
    intervaloRefuerzosDias: 365,
  },
  {
    nombreComercial: "Antirrábica canina",
    principioActivo: "Virus rabia inactivado",
    tipo: "viral_inactivada_vet",
    aplicaVet: true,
    especiesAplicables: ["perro", "gato", "huron"],
    esquemaDefaultVet: {
      perro: { primaria: { edadSemanas: 12 }, refuerzoAnual: true },
      gato: { primaria: { edadSemanas: 12 }, refuerzoAnual: true },
    },
    viaAplicacion: "subcutanea",
    intervaloRefuerzosDias: 365,
    isObligatoriaCartillaNacional: true,
  },
  {
    nombreComercial: "Bordetella",
    principioActivo: "Bordetella bronchiseptica + Parainfluenza",
    tipo: "bacteriana_atenuada_vet",
    aplicaVet: true,
    especiesAplicables: ["perro"],
    esquemaDefaultVet: { perro: { refuerzoAnual: true } },
    viaAplicacion: "intranasal",
    intervaloRefuerzosDias: 365,
  },
  // Vet - felina
  {
    nombreComercial: "Triple felina (FVRCP)",
    principioActivo: "Rinotraqueítis + Calicivirus + Panleucopenia",
    tipo: "combinada_vet",
    aplicaVet: true,
    especiesAplicables: ["gato"],
    esquemaDefaultVet: {
      gato: {
        primaria: [
          { edadSemanas: 8, dosis: "1ra" },
          { edadSemanas: 12, dosis: "2da" },
          { edadSemanas: 16, dosis: "3ra" },
        ],
        refuerzoAnual: true,
      },
    },
    viaAplicacion: "subcutanea",
    intervaloRefuerzosDias: 365,
  },
  {
    nombreComercial: "Leucemia felina (FeLV)",
    principioActivo: "Virus leucemia felina inactivado",
    tipo: "viral_inactivada_vet",
    aplicaVet: true,
    especiesAplicables: ["gato"],
    esquemaDefaultVet: {
      gato: {
        primaria: [{ edadSemanas: 9 }, { edadSemanas: 12 }],
        refuerzoAnual: true,
      },
    },
    viaAplicacion: "subcutanea",
    intervaloRefuerzosDias: 365,
  },
]);

export interface MotivoCitaSeed {
  nombre: string;
  vertical: "humana" | "vet" | "ambos";
  duracionDefaultMinutos: number;
  costoReferencia?: number;
  requiereAnticipo?: boolean;
}

export const MOTIVOS_CITA_V1: ReadonlyArray<MotivoCitaSeed> = Object.freeze([
  { nombre: "Consulta general", vertical: "humana", duracionDefaultMinutos: 30 },
  { nombre: "Consulta de seguimiento", vertical: "humana", duracionDefaultMinutos: 20 },
  { nombre: "Consulta de primera vez", vertical: "humana", duracionDefaultMinutos: 45 },
  { nombre: "Examen de chequeo anual", vertical: "humana", duracionDefaultMinutos: 60 },
  { nombre: "Urgencia", vertical: "humana", duracionDefaultMinutos: 30 },
  { nombre: "Vacunación", vertical: "ambos", duracionDefaultMinutos: 15 },
  { nombre: "Control postoperatorio", vertical: "humana", duracionDefaultMinutos: 20 },
  { nombre: "Telemedicina", vertical: "humana", duracionDefaultMinutos: 30 },
]);

export interface SeedClinicalCatalogsResult {
  diagnosticosCreados: number;
  medicamentosCreados: number;
  motivosCreados: number;
  vacunasCreados: number;
}

async function seedDiagnostico(client: TenantPrismaClient, dx: DiagnosticoSeed): Promise<boolean> {
  const existing = await client.diagnosticoCatalogo.findUnique({
    where: { codigoCie10: dx.codigoCie10 },
  });
  if (existing) return false;
  await client.diagnosticoCatalogo.create({
    data: {
      codigoCie10: dx.codigoCie10,
      nombreEs: dx.nombreEs,
      ...(dx.nombreEn ? { nombreEn: dx.nombreEn } : {}),
      ...(dx.categoria ? { categoria: dx.categoria } : {}),
      aplicaHumano: dx.aplicaHumano ?? true,
      aplicaVet: dx.aplicaVet ?? false,
      isPrecargadoGlobal: true,
    },
  });
  return true;
}

async function seedMedicamento(client: TenantPrismaClient, med: MedicamentoSeed): Promise<boolean> {
  const existing = await client.medicamentoCatalogo.findFirst({
    where: {
      nombreComercial: med.nombreComercial,
      principioActivo: med.principioActivo,
    },
  });
  if (existing) return false;
  await client.medicamentoCatalogo.create({
    data: {
      nombreComercial: med.nombreComercial,
      principioActivo: med.principioActivo,
      ...(med.concentracion ? { concentracion: med.concentracion } : {}),
      ...(med.presentacion ? { presentacion: med.presentacion } : {}),
      ...(med.viaAdministracion ? { viaAdministracion: med.viaAdministracion } : {}),
      ...(med.categoria ? { categoria: med.categoria } : {}),
      clasificacionCofepris: med.clasificacionCofepris,
      requiereRecetarioOficial: med.requiereRecetarioOficial ?? false,
      ...(med.dosisRecomendadaPediatrica
        ? { dosisRecomendadaPediatrica: med.dosisRecomendadaPediatrica as object }
        : {}),
      ...(med.dosisRecomendadaAdulto
        ? { dosisRecomendadaAdulto: med.dosisRecomendadaAdulto as object }
        : {}),
      ...(med.dosisRecomendadaVet
        ? { dosisRecomendadaVet: med.dosisRecomendadaVet as object }
        : {}),
      interaccionesConocidas: med.interaccionesConocidas ?? [],
      alergiasRelacionadas: med.alergiasRelacionadas ?? [],
      efectosAdversos: med.efectosAdversos ?? [],
      ...(med.precioReferenciaMercado !== undefined
        ? { precioReferenciaMercado: med.precioReferenciaMercado }
        : {}),
      isPrecargadoGlobal: true,
    },
  });
  return true;
}

async function seedVacuna(client: TenantPrismaClient, v: VacunaSeed): Promise<boolean> {
  const existing = await client.vacunaCatalogo.findFirst({
    where: { nombreComercial: v.nombreComercial },
  });
  if (existing) return false;
  await client.vacunaCatalogo.create({
    data: {
      nombreComercial: v.nombreComercial,
      ...(v.principioActivo ? { principioActivo: v.principioActivo } : {}),
      ...(v.tipo ? { tipo: v.tipo } : {}),
      aplicaHumano: v.aplicaHumano ?? false,
      aplicaVet: v.aplicaVet ?? false,
      especiesAplicables: (v.especiesAplicables ?? []) as object,
      ...(v.esquemaDefaultHumano ? { esquemaDefaultHumano: v.esquemaDefaultHumano as object } : {}),
      ...(v.esquemaDefaultVet ? { esquemaDefaultVet: v.esquemaDefaultVet as object } : {}),
      ...(v.viaAplicacion ? { viaAplicacion: v.viaAplicacion } : {}),
      ...(v.intervaloRefuerzosDias !== undefined
        ? { intervaloRefuerzosDias: v.intervaloRefuerzosDias }
        : {}),
      isObligatoriaCartillaNacional: v.isObligatoriaCartillaNacional ?? false,
      ...(v.precioReferencia !== undefined ? { precioReferencia: v.precioReferencia } : {}),
      isPrecargadoGlobal: true,
    },
  });
  return true;
}

export async function seedClinicalCatalogs(
  client: TenantPrismaClient,
): Promise<SeedClinicalCatalogsResult> {
  let diagnosticosCreados = 0;
  let medicamentosCreados = 0;
  let motivosCreados = 0;
  let vacunasCreados = 0;

  for (const dx of DIAGNOSTICOS_CIE10_V1) {
    if (await seedDiagnostico(client, dx)) diagnosticosCreados += 1;
  }
  for (const dx of DIAGNOSTICOS_VET_V1) {
    if (await seedDiagnostico(client, dx)) diagnosticosCreados += 1;
  }

  for (const med of MEDICAMENTOS_PLM_V1) {
    if (await seedMedicamento(client, med)) medicamentosCreados += 1;
  }
  for (const med of MEDICAMENTOS_VET_V1) {
    if (await seedMedicamento(client, med)) medicamentosCreados += 1;
  }

  for (const m of MOTIVOS_CITA_V1) {
    const existing = await client.motivoCitaCatalogo.findUnique({
      where: { nombre_vertical: { nombre: m.nombre, vertical: m.vertical } },
    });
    if (existing) continue;
    await client.motivoCitaCatalogo.create({
      data: {
        nombre: m.nombre,
        vertical: m.vertical,
        duracionDefaultMinutos: m.duracionDefaultMinutos,
        ...(m.costoReferencia !== undefined ? { costoReferencia: m.costoReferencia } : {}),
        requiereAnticipo: m.requiereAnticipo ?? false,
      },
    });
    motivosCreados += 1;
  }

  for (const v of VACUNAS_V1) {
    if (await seedVacuna(client, v)) vacunasCreados += 1;
  }

  return { diagnosticosCreados, medicamentosCreados, motivosCreados, vacunasCreados };
}
