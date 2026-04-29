import { Client } from "pg";

const SLUG_REGEX = /^[a-z][a-z0-9_-]{1,49}$/;

export function validateSlug(slug: string): void {
  if (!SLUG_REGEX.test(slug)) {
    throw new Error(
      `Slug inválido: "${slug}". Debe empezar con letra minúscula, contener solo a-z 0-9 _ - y tener 2-50 chars.`,
    );
  }
}

export function tenantSchemaName(slug: string): string {
  return `tenant_${slug.replace(/-/g, "_")}`;
}

export function tenantDatabaseUrl(baseUrl: string, schemaName: string): string {
  const url = new URL(baseUrl);
  url.searchParams.set("schema", schemaName);
  return url.toString();
}

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Variable de entorno requerida no definida: ${name}`);
  }
  return value;
}

export async function withPgClient<T>(
  connectionString: string,
  fn: (client: Client) => Promise<T>,
): Promise<T> {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}
