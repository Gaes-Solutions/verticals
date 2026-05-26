export interface CfdiXmlHeader {
  uuid: string;
  tipoComprobante: "I" | "E" | "N" | "P" | "T";
  serie?: string;
  folio?: string;
  emisorRfc: string;
  emisorRazonSocial: string;
  receptorRfc: string;
  receptorRazonSocial?: string;
  fechaEmision: Date;
  fechaTimbrado?: Date;
  subtotal: string;
  descuento: string;
  total: string;
  moneda: string;
  tipoCambio: string;
  metodoPago?: "PUE" | "PPD";
  formaPago?: string;
  usoCfdi?: string;
  version: string;
  ivaTrasladado: string;
  ivaRetenido: string;
  isrRetenido: string;
  iepsTrasladado: string;
  conceptos: Array<{
    descripcion: string;
    claveProdServ?: string;
    cantidad?: string;
    valorUnitario?: string;
    importe?: string;
  }>;
}

const NUM_REGEX = /^-?\d+(\.\d+)?$/;

function attr(xml: string, tag: string, name: string): string | undefined {
  const re = new RegExp(`<${tag}\\b[^>]*\\b${name}="([^"]+)"`, "i");
  const m = re.exec(xml);
  return m?.[1];
}

function attrNs(xml: string, tag: string, name: string): string | undefined {
  const re = new RegExp(`<[a-z0-9]+:${tag}\\b[^>]*\\b${name}="([^"]+)"`, "i");
  const m = re.exec(xml);
  return m?.[1] ?? attr(xml, tag, name);
}

function num(value: string | undefined, fallback = "0"): string {
  if (!value || !NUM_REGEX.test(value)) return fallback;
  return value;
}

function parseConceptos(xml: string): CfdiXmlHeader["conceptos"] {
  const conceptos: CfdiXmlHeader["conceptos"] = [];
  const re = /<[a-z0-9]+:Concepto\b([^>]*)\/?>/gi;
  let match: RegExpExecArray | null;
  while (true) {
    match = re.exec(xml);
    if (!match) break;
    const attrs = match[1] ?? "";
    const desc = /\bDescripcion="([^"]+)"/i.exec(attrs)?.[1];
    if (!desc) continue;
    const clave = /\bClaveProdServ="([^"]+)"/i.exec(attrs)?.[1];
    const cant = /\bCantidad="([^"]+)"/i.exec(attrs)?.[1];
    const valor = /\bValorUnitario="([^"]+)"/i.exec(attrs)?.[1];
    const imp = /\bImporte="([^"]+)"/i.exec(attrs)?.[1];
    conceptos.push({
      descripcion: desc,
      ...(clave ? { claveProdServ: clave } : {}),
      ...(cant ? { cantidad: cant } : {}),
      ...(valor ? { valorUnitario: valor } : {}),
      ...(imp ? { importe: imp } : {}),
    });
  }
  return conceptos;
}

function sumImpuesto(
  xml: string,
  tag: "Traslado" | "Retencion",
  impuesto: "001" | "002" | "003",
): string {
  const re = new RegExp(`<[a-z0-9]+:${tag}\\b([^>]*)/?>`, "gi");
  let total = 0;
  let m: RegExpExecArray | null;
  while (true) {
    m = re.exec(xml);
    if (!m) break;
    const attrs = m[1] ?? "";
    const impRe = /\bImpuesto="([^"]+)"/i;
    const imp = impRe.exec(attrs)?.[1];
    if (imp !== impuesto) continue;
    const importeRe = /\bImporte="([^"]+)"/i;
    const importe = importeRe.exec(attrs)?.[1];
    if (importe && NUM_REGEX.test(importe)) total += Number(importe);
  }
  return total.toString();
}

export class XmlParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "XmlParseError";
  }
}

export function parseCfdiXml(xml: string): CfdiXmlHeader {
  if (!/<[a-z0-9]+:Comprobante\b/i.test(xml)) {
    throw new XmlParseError("XML no contiene nodo Comprobante");
  }
  const version = attrNs(xml, "Comprobante", "Version") ?? "4.0";
  if (!version.startsWith("4")) {
    throw new XmlParseError(`Version CFDI no soportada: ${version} (solo 4.x)`);
  }
  const uuid = attrNs(xml, "TimbreFiscalDigital", "UUID");
  if (!uuid) throw new XmlParseError("UUID SAT (TimbreFiscalDigital) faltante");
  const tipo = attrNs(xml, "Comprobante", "TipoDeComprobante");
  if (!tipo || !["I", "E", "N", "P", "T"].includes(tipo)) {
    throw new XmlParseError(`TipoDeComprobante inválido: ${tipo}`);
  }
  const emisorRfc = attrNs(xml, "Emisor", "Rfc");
  const emisorRazonSocial = attrNs(xml, "Emisor", "Nombre");
  const receptorRfc = attrNs(xml, "Receptor", "Rfc");
  if (!emisorRfc || !emisorRazonSocial || !receptorRfc) {
    throw new XmlParseError("Emisor/Receptor incompletos");
  }
  const fechaStr = attrNs(xml, "Comprobante", "Fecha");
  if (!fechaStr) throw new XmlParseError("Fecha emisión faltante");
  const fechaEmision = new Date(fechaStr);
  if (Number.isNaN(fechaEmision.getTime())) {
    throw new XmlParseError(`Fecha inválida: ${fechaStr}`);
  }
  const fechaTimbradoStr = attrNs(xml, "TimbreFiscalDigital", "FechaTimbrado");
  const fechaTimbrado = fechaTimbradoStr ? new Date(fechaTimbradoStr) : undefined;
  const metodoPago = attrNs(xml, "Comprobante", "MetodoPago") as "PUE" | "PPD" | undefined;

  const serie = attrNs(xml, "Comprobante", "Serie");
  const folio = attrNs(xml, "Comprobante", "Folio");
  const receptorRazonSocial = attrNs(xml, "Receptor", "Nombre");
  const formaPago = attrNs(xml, "Comprobante", "FormaPago");
  const usoCfdi = attrNs(xml, "Receptor", "UsoCFDI");
  return {
    uuid,
    tipoComprobante: tipo as CfdiXmlHeader["tipoComprobante"],
    ...(serie ? { serie } : {}),
    ...(folio ? { folio } : {}),
    emisorRfc,
    emisorRazonSocial,
    receptorRfc,
    ...(receptorRazonSocial ? { receptorRazonSocial } : {}),
    fechaEmision,
    ...(fechaTimbrado ? { fechaTimbrado } : {}),
    subtotal: num(attrNs(xml, "Comprobante", "SubTotal")),
    descuento: num(attrNs(xml, "Comprobante", "Descuento")),
    total: num(attrNs(xml, "Comprobante", "Total")),
    moneda: attrNs(xml, "Comprobante", "Moneda") ?? "MXN",
    tipoCambio: num(attrNs(xml, "Comprobante", "TipoCambio"), "1"),
    ...(metodoPago ? { metodoPago } : {}),
    ...(formaPago ? { formaPago } : {}),
    ...(usoCfdi ? { usoCfdi } : {}),
    version,
    ivaTrasladado: sumImpuesto(xml, "Traslado", "002"),
    ivaRetenido: sumImpuesto(xml, "Retencion", "002"),
    isrRetenido: sumImpuesto(xml, "Retencion", "001"),
    iepsTrasladado: sumImpuesto(xml, "Traslado", "003"),
    conceptos: parseConceptos(xml),
  };
}
