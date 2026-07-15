export interface DnsRecord {
  tipo: string;
  nombre: string;
  valor: string;
}

interface RailwayCfg {
  token: string;
  projectId: string;
  environmentId: string;
  serviceId: string;
}

const RAILWAY_API = "https://backboard.railway.com/graphql/v2";
// Cloudflare bloquea User-Agents "de bot" (error 1010); mandamos uno de navegador.
const BROWSER_UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

/**
 * Config para provisionar dominios propios del portal B2B en Railway. project y
 * environment los inyecta Railway en el contenedor; solo hay que setear a mano
 * RAILWAY_API_TOKEN (idealmente un token de proyecto) y RAILWAY_B2B_SERVICE_ID.
 * Si falta algo, devuelve null → el alta cae al modo manual (CNAME genérico).
 */
export function railwayCfg(): RailwayCfg | null {
  const token = process.env.RAILWAY_API_TOKEN?.trim();
  const projectId = process.env.RAILWAY_PROJECT_ID?.trim();
  const environmentId = process.env.RAILWAY_ENVIRONMENT_ID?.trim();
  const serviceId = process.env.RAILWAY_B2B_SERVICE_ID?.trim();
  if (!token || !projectId || !environmentId || !serviceId) return null;
  return { token, projectId, environmentId, serviceId };
}

interface CustomDomainResponse {
  errors?: { message?: string }[];
  data?: {
    customDomainCreate?: {
      status?: {
        dnsRecords?: { hostlabel?: string; recordType?: string; requiredValue?: string }[];
      };
    };
  };
}

/**
 * Agrega `domain` como custom domain del servicio web-b2b y devuelve los
 * registros DNS que el dueño debe crear (CNAME + posible verificación ACME).
 * Railway emite el TLS solo. Lanza si Railway rechaza (ej. dominio ya en uso).
 */
export async function provisionarDominio(cfg: RailwayCfg, domain: string): Promise<DnsRecord[]> {
  const query = `mutation($input: CustomDomainCreateInput!) {
    customDomainCreate(input: $input) {
      status { dnsRecords { hostlabel recordType requiredValue } }
    }
  }`;
  const res = await fetch(RAILWAY_API, {
    method: "POST",
    headers: {
      // Token de proyecto → header Project-Access-Token (los de cuenta usan Bearer).
      "Project-Access-Token": cfg.token,
      "Content-Type": "application/json",
      "User-Agent": BROWSER_UA,
    },
    body: JSON.stringify({
      query,
      variables: {
        input: {
          projectId: cfg.projectId,
          environmentId: cfg.environmentId,
          serviceId: cfg.serviceId,
          domain,
        },
      },
    }),
  });
  const body = (await res.json()) as CustomDomainResponse;
  if (body.errors?.length) {
    throw new Error(body.errors[0]?.message ?? "Railway rechazó el dominio");
  }
  const records = body.data?.customDomainCreate?.status?.dnsRecords ?? [];
  return records.map((r) => ({
    // Railway devuelve el enum "DNS_RECORD_TYPE_CNAME"; lo dejamos legible ("CNAME").
    tipo: (r.recordType ?? "CNAME").replace(/^DNS_RECORD_TYPE_/, ""),
    nombre: r.hostlabel ?? domain,
    valor: r.requiredValue ?? "",
  }));
}
