import { MockAiProvider } from "@gaespos/ai";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildTestApp, createTenantUser, createTestTenant, loginTenantUser } from "./helpers.js";

const TENANT_SLUG = "test-despacho-1";
const OWNER = { email: "owner-desp@test.local", password: "ChangeMe!2026" };
const CONTADOR = { email: "contador-desp@test.local", password: "ChangeMe!2026" };
const CAJERO = { email: "cajero-desp@test.local", password: "ChangeMe!2026" };

let app: FastifyInstance;
let aiMock: MockAiProvider;
let ownerToken: string;
let contadorToken: string;
let cajeroToken: string;
let sucursalId: string;

function auth(t: string) {
  return { authorization: `Bearer ${t}` };
}

function sampleCfdiXml(
  uuid: string,
  opts: Partial<{
    rfc: string;
    total: number;
    claveProdServ: string;
    descripcion: string;
    razonSocial: string;
  }> = {},
): string {
  const rfc = opts.rfc ?? "GAS800101AAA";
  const razon = opts.razonSocial ?? "Gas Express SA de CV";
  const total = opts.total ?? 1160;
  const subtotal = (total / 1.16).toFixed(4);
  const iva = (total - Number(subtotal)).toFixed(4);
  const clave = opts.claveProdServ ?? "15101500";
  const desc = opts.descripcion ?? "Gasolina Magna 50 lt";
  return `<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" Version="4.0" Serie="A" Folio="100" Fecha="2026-05-10T12:00:00" SubTotal="${subtotal}" Moneda="MXN" TipoCambio="1" Total="${total}" TipoDeComprobante="I" MetodoPago="PUE" FormaPago="01" LugarExpedicion="44100">
  <cfdi:Emisor Rfc="${rfc}" Nombre="${razon}" RegimenFiscal="601"/>
  <cfdi:Receptor Rfc="XAXX010101000" Nombre="GASESSOFT" UsoCFDI="G03" DomicilioFiscalReceptor="44100" RegimenFiscalReceptor="612"/>
  <cfdi:Conceptos>
    <cfdi:Concepto ClaveProdServ="${clave}" Cantidad="1" ClaveUnidad="LTR" Descripcion="${desc}" ValorUnitario="${subtotal}" Importe="${subtotal}" ObjetoImp="02">
      <cfdi:Impuestos>
        <cfdi:Traslados>
          <cfdi:Traslado Base="${subtotal}" Impuesto="002" TipoFactor="Tasa" TasaOCuota="0.160000" Importe="${iva}"/>
        </cfdi:Traslados>
      </cfdi:Impuestos>
    </cfdi:Concepto>
  </cfdi:Conceptos>
  <cfdi:Impuestos TotalImpuestosTrasladados="${iva}">
    <cfdi:Traslados>
      <cfdi:Traslado Base="${subtotal}" Impuesto="002" TipoFactor="Tasa" TasaOCuota="0.160000" Importe="${iva}"/>
    </cfdi:Traslados>
  </cfdi:Impuestos>
  <cfdi:Complemento>
    <tfd:TimbreFiscalDigital xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital" Version="1.1" UUID="${uuid}" FechaTimbrado="2026-05-10T12:01:00" SelloCFD="X" NoCertificadoSAT="X" SelloSAT="X"/>
  </cfdi:Complemento>
</cfdi:Comprobante>`;
}

beforeAll(async () => {
  aiMock = new MockAiProvider();
  app = await buildTestApp({}, { aiProviderFactory: () => aiMock });
  await createTestTenant(TENANT_SLUG, "Despacho Test");
  await createTenantUser(TENANT_SLUG, {
    email: OWNER.email,
    password: OWNER.password,
    rolCodigo: "dueno",
    nombre: "Owner Desp",
  });
  await createTenantUser(TENANT_SLUG, {
    email: CONTADOR.email,
    password: CONTADOR.password,
    rolCodigo: "contador_interno",
    nombre: "Contador",
  });
  await createTenantUser(TENANT_SLUG, {
    email: CAJERO.email,
    password: CAJERO.password,
    rolCodigo: "cajero",
    nombre: "Cajero",
  });
  ownerToken = (await loginTenantUser(app, TENANT_SLUG, OWNER.email, OWNER.password)).accessToken;
  contadorToken = (await loginTenantUser(app, TENANT_SLUG, CONTADOR.email, CONTADOR.password))
    .accessToken;
  cajeroToken = (await loginTenantUser(app, TENANT_SLUG, CAJERO.email, CAJERO.password))
    .accessToken;

  const sucs = await app.inject({ method: "GET", url: "/t/sucursales", headers: auth(ownerToken) });
  const principal = (sucs.json() as Array<{ id: string; codigo: string }>).find(
    (s) => s.codigo === "SUC-PRINCIPAL",
  );
  if (!principal) throw new Error();
  sucursalId = principal.id;
});

afterAll(async () => {
  if (app) await app.close();
});

describe("catálogo categorías contables sembrado", () => {
  it("incluye categorías clave (G-606 combustibles, G-601 papelería, G-999 sin asignar)", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/t/cfdis-recibidos/categorias/contables",
      headers: auth(contadorToken),
    });
    const items = res.json() as Array<{ codigoContable: string; esDeducibleSat: boolean }>;
    expect(items.find((c) => c.codigoContable === "G-606")?.esDeducibleSat).toBe(true);
    expect(items.find((c) => c.codigoContable === "G-601")).toBeDefined();
    expect(items.find((c) => c.codigoContable === "G-999")?.esDeducibleSat).toBe(false);
  });
});

describe("CFDIs recibidos: upload + auto-categorización IA", () => {
  let cfdiCombustibleId: string;

  it("cajero NO puede uploadar CFDI (sin CFDIS_RECIBIDOS_UPLOAD, 403)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/t/cfdis-recibidos/upload",
      headers: auth(cajeroToken),
      payload: { xml: sampleCfdiXml("aaaaaaaa-bbbb-cccc-dddd-000000000001") },
    });
    expect(res.statusCode).toBe(403);
  });

  it("contador uploadea XML combustible → parsea OK", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/t/cfdis-recibidos/upload",
      headers: auth(contadorToken),
      payload: { xml: sampleCfdiXml("aaaaaaaa-bbbb-cccc-dddd-000000000001") },
    });
    expect(res.statusCode).toBe(201);
    const r = res.json() as {
      cfdiRecibidoId: string;
      uuidSat: string;
      yaExistia: boolean;
      total: string;
    };
    expect(r.yaExistia).toBe(false);
    expect(r.uuidSat).toBe("aaaaaaaa-bbbb-cccc-dddd-000000000001");
    expect(Number(r.total)).toBeCloseTo(1160, 0);
    cfdiCombustibleId = r.cfdiRecibidoId;
  });

  it("upload del mismo UUID es idempotente (yaExistia=true)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/t/cfdis-recibidos/upload",
      headers: auth(contadorToken),
      payload: { xml: sampleCfdiXml("aaaaaaaa-bbbb-cccc-dddd-000000000001") },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().yaExistia).toBe(true);
  });

  it("XML inválido → 400", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/t/cfdis-recibidos/upload",
      headers: auth(contadorToken),
      payload: { xml: "<not-cfdi></not-cfdi>" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("auto-categorización IA (mock) detecta G-606 por claveProdServ 15101", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/t/cfdis-recibidos/${cfdiCombustibleId}/auto-categorizar`,
      headers: auth(contadorToken),
    });
    expect(res.statusCode).toBe(200);
    const r = res.json() as {
      categoriaContableId: string;
      categorizadoPor: string;
      confianza: number | null;
    };
    expect(["ia", "regla_heuristica"]).toContain(r.categorizadoPor);
    expect(aiMock.categorizeCalls).toBeGreaterThanOrEqual(1);

    const detalle = await app.inject({
      method: "GET",
      url: `/t/cfdis-recibidos/${cfdiCombustibleId}`,
      headers: auth(contadorToken),
    });
    const d = detalle.json() as {
      procesado: boolean;
      categorizacion: { categoria: { codigoContable: string } };
    };
    expect(d.procesado).toBe(true);
    expect(d.categorizacion.categoria.codigoContable).toBe("G-606");
  });

  it("categorización manual sobreescribe la IA con override=true", async () => {
    const cats = await app.inject({
      method: "GET",
      url: "/t/cfdis-recibidos/categorias/contables",
      headers: auth(contadorToken),
    });
    const g999 = (cats.json() as Array<{ id: string; codigoContable: string }>).find(
      (c) => c.codigoContable === "G-999",
    );
    if (!g999) throw new Error();
    const res = await app.inject({
      method: "POST",
      url: `/t/cfdis-recibidos/${cfdiCombustibleId}/categorizar`,
      headers: auth(contadorToken),
      payload: { categoriaContableId: g999.id, forzarCategoria: true },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().categorizadoPor).toBe("manual");
    const detalle = await app.inject({
      method: "GET",
      url: `/t/cfdis-recibidos/${cfdiCombustibleId}`,
      headers: auth(contadorToken),
    });
    expect(detalle.json().categorizacion.categoria.codigoContable).toBe("G-999");
    expect(detalle.json().categorizacion.override).toBe(true);
  });

  it("listado por categoría contable filtra correctamente", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/t/cfdis-recibidos?emisorRfc=GAS800101AAA",
      headers: auth(contadorToken),
    });
    const r = res.json() as { total: number; items: Array<{ uuidSat: string }> };
    expect(r.total).toBe(1);
    expect(r.items[0]?.uuidSat).toBe("aaaaaaaa-bbbb-cccc-dddd-000000000001");
  });

  it("fallback heurístico cuando IA falla", async () => {
    aiMock.setNextError(new Error("Anthropic rate limit"));
    const uuid = "bbbbbbbb-cccc-dddd-eeee-000000000002";
    const upload = await app.inject({
      method: "POST",
      url: "/t/cfdis-recibidos/upload",
      headers: auth(contadorToken),
      payload: {
        xml: sampleCfdiXml(uuid, {
          rfc: "PAP800101AAA",
          razonSocial: "Papelería Premium",
          claveProdServ: "14111515",
          descripcion: "Resma papel bond",
          total: 580,
        }),
      },
    });
    const cfdiId = upload.json().cfdiRecibidoId;
    const res = await app.inject({
      method: "POST",
      url: `/t/cfdis-recibidos/${cfdiId}/auto-categorizar`,
      headers: auth(contadorToken),
    });
    expect(res.statusCode).toBe(500);
  });

  it("cancelar CFDI marca estado=cancelado", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/t/cfdis-recibidos/${cfdiCombustibleId}/cancelar`,
      headers: auth(contadorToken),
      payload: { motivo: "Solicitado por proveedor" },
    });
    expect(res.statusCode).toBe(204);
    const detalle = await app.inject({
      method: "GET",
      url: `/t/cfdis-recibidos/${cfdiCombustibleId}`,
      headers: auth(contadorToken),
    });
    expect(detalle.json().estado).toBe("cancelado");
  });

  it("re-cancelar CFDI cancelado → 409", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/t/cfdis-recibidos/${cfdiCombustibleId}/cancelar`,
      headers: auth(contadorToken),
      payload: { motivo: "duplicado" },
    });
    expect(res.statusCode).toBe(409);
  });
});

describe("Órdenes de compra", () => {
  let ocId: string;
  let linea1Id: string;

  it("contador crea OC borrador con 2 líneas", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/t/ordenes-compra",
      headers: auth(ownerToken),
      payload: {
        sucursalId,
        proveedorRfc: "ABC800101AAA",
        proveedorRazonSocial: "Proveedor Test SA",
        proveedorEmail: "proveedor@test.local",
        fechaEsperada: "2026-06-01T00:00:00.000Z",
        lineas: [
          { descripcion: "Producto A", cantidad: 10, precioUnitario: 50, ivaPct: 16 },
          { descripcion: "Producto B", cantidad: 5, precioUnitario: 100, ivaPct: 16 },
        ],
      },
    });
    expect(res.statusCode).toBe(201);
    const r = res.json() as { id: string; folio: string };
    expect(r.folio).toMatch(/^OC-SUC-PRINCIPAL-\d{6}$/);
    ocId = r.id;

    const detalle = await app.inject({
      method: "GET",
      url: `/t/ordenes-compra/${ocId}`,
      headers: auth(ownerToken),
    });
    const d = detalle.json() as {
      subtotal: string;
      total: string;
      lineas: Array<{ id: string; numero: number }>;
    };
    expect(Number(d.subtotal)).toBeCloseTo(1000, 2);
    expect(Number(d.total)).toBeCloseTo(1160, 2);
    expect(d.lineas.length).toBe(2);
    if (d.lineas[0]) linea1Id = d.lineas[0].id;
  });

  it("cajero NO puede autorizar OC (sin COMPRAS_OC_AUTORIZAR, 403)", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/t/ordenes-compra/${ocId}/autorizar`,
      headers: auth(cajeroToken),
      payload: {},
    });
    expect(res.statusCode).toBe(403);
  });

  it("contador autoriza OC → enviada", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/t/ordenes-compra/${ocId}/autorizar`,
      headers: auth(contadorToken),
      payload: {},
    });
    expect(res.statusCode).toBe(204);
    const d = await app.inject({
      method: "GET",
      url: `/t/ordenes-compra/${ocId}`,
      headers: auth(contadorToken),
    });
    expect(d.json().estado).toBe("enviada");
    expect(d.json().autorizadoAt).toBeDefined();
  });

  it("recibe parcial primera línea → estado=recibida_parcial", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/t/ordenes-compra/${ocId}/recibir`,
      headers: auth(ownerToken),
      payload: {
        lineas: [{ lineaId: linea1Id, cantidadRecibida: 4 }],
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().estado).toBe("recibida_parcial");
  });

  it("recibe excediendo cantidad → 409", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/t/ordenes-compra/${ocId}/recibir`,
      headers: auth(ownerToken),
      payload: { lineas: [{ lineaId: linea1Id, cantidadRecibida: 100 }] },
    });
    expect(res.statusCode).toBe(409);
  });

  it("recibe resto → estado=recibida_total + vincula CFDI", async () => {
    const cfdiUuid = "cccccccc-dddd-eeee-ffff-000000000003";
    const cfdiUpload = await app.inject({
      method: "POST",
      url: "/t/cfdis-recibidos/upload",
      headers: auth(contadorToken),
      payload: {
        xml: sampleCfdiXml(cfdiUuid, {
          rfc: "ABC800101AAA",
          razonSocial: "Proveedor Test SA",
          total: 1160,
        }),
      },
    });
    const cfdiId = cfdiUpload.json().cfdiRecibidoId;

    const oc = await app.inject({
      method: "GET",
      url: `/t/ordenes-compra/${ocId}`,
      headers: auth(ownerToken),
    });
    const d = oc.json() as {
      lineas: Array<{ id: string; cantidad: string; cantidadRecibida: string }>;
    };
    const linea2 = d.lineas.find((l) => l.id !== linea1Id);
    if (!linea2 || !linea1Id) throw new Error();
    const res = await app.inject({
      method: "POST",
      url: `/t/ordenes-compra/${ocId}/recibir`,
      headers: auth(ownerToken),
      payload: {
        cfdiRecibidoId: cfdiId,
        lineas: [
          { lineaId: linea1Id, cantidadRecibida: 6 },
          { lineaId: linea2.id, cantidadRecibida: 5 },
        ],
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().estado).toBe("recibida_total");

    const verifCfdi = await app.inject({
      method: "GET",
      url: `/t/cfdis-recibidos/${cfdiId}`,
      headers: auth(contadorToken),
    });
    expect(verifCfdi.json().ordenCompra.id).toBe(ocId);
  });

  it("cancelar OC recibida_total → 409", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/t/ordenes-compra/${ocId}/cancelar`,
      headers: auth(contadorToken),
      payload: { motivo: "test" },
    });
    expect(res.statusCode).toBe(409);
  });
});

describe("DIOT export TXT formato SAT", () => {
  beforeAll(async () => {
    // Categorizar el CFDI del proveedor ABC para que entre a DIOT (requiere
    // categorización con ivaAcreditable=true).
    const cfdis = await app.inject({
      method: "GET",
      url: "/t/cfdis-recibidos?emisorRfc=ABC800101AAA",
      headers: auth(contadorToken),
    });
    const items = (cfdis.json() as { items: Array<{ id: string }> }).items;
    for (const c of items) {
      await app.inject({
        method: "POST",
        url: `/t/cfdis-recibidos/${c.id}/auto-categorizar`,
        headers: auth(contadorToken),
      });
    }
  });

  it("genera reporte DIOT del periodo agrupando por RFC + categoría deducible", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/t/diot/202605",
      headers: auth(contadorToken),
    });
    expect(res.statusCode).toBe(200);
    const r = res.json() as {
      periodoYyyymm: string;
      totalProveedores: number;
      lineas: Array<{ rfcTercero: string; ivaPagado16: string }>;
    };
    expect(r.periodoYyyymm).toBe("202605");
    expect(r.totalProveedores).toBeGreaterThanOrEqual(1);
    const proveedor = r.lineas.find((l) => l.rfcTercero === "ABC800101AAA");
    expect(proveedor).toBeDefined();
  });

  it("export TXT con separador | y headers correctos", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/t/diot/202605/export.txt",
      headers: auth(contadorToken),
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/plain");
    expect(res.headers["content-disposition"]).toContain("diot-202605.txt");
    const txt = res.body;
    expect(txt.split("\n")[0]?.split("|").length).toBe(11);
  });

  it("periodo formato inválido → 400", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/t/diot/2026-05",
      headers: auth(contadorToken),
    });
    expect(res.statusCode).toBe(400);
  });

  it("cajero NO puede generar DIOT (sin permiso 403)", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/t/diot/202605",
      headers: auth(cajeroToken),
    });
    expect(res.statusCode).toBe(403);
  });
});
