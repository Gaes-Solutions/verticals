import { z } from "zod";
export const locationInput = z.union([
  z.object({ q: z.string().trim().min(3).max(250) }).strict(),
  z
    .object({
      lat: z.number().finite().min(-90).max(90),
      lon: z.number().finite().min(-180).max(180),
    })
    .strict(),
]);
export interface MapResult {
  lat: string;
  lon: string;
  display_name?: string | undefined;
  address: Record<string, string | undefined>;
}
const coordinate = (limit: number) =>
  z
    .union([z.string().trim().min(1), z.number()])
    .pipe(z.coerce.number().finite().min(-limit).max(limit))
    .transform(String);
const resultSchema = z.object({
  lat: coordinate(90),
  lon: coordinate(180),
  display_name: z.string().optional(),
  address: z.record(z.string().optional()),
});
export class LocationError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
const cache = new Map<string, { until: number; result: MapResult }>();
let last = 0;
export async function lookupLocation(input: z.infer<typeof locationInput>): Promise<MapResult> {
  const search = "q" in input;
  const url = new URL(
    search ? "search" : "reverse",
    `${process.env.GEOCODING_URL || "https://nominatim.openstreetmap.org"}/`,
  );
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("accept-language", "es");
  if (search) {
    url.searchParams.set("q", input.q);
    url.searchParams.set("countrycodes", "mx");
    url.searchParams.set("limit", "1");
  } else {
    url.searchParams.set("lat", input.lat.toFixed(6));
    url.searchParams.set("lon", input.lon.toFixed(6));
    url.searchParams.set("zoom", "18");
  }
  const key = url.toString();
  const hit = cache.get(key);
  if (hit && hit.until > Date.now()) return hit.result;
  if (Date.now() - last < 1100)
    throw new LocationError(429, "Espera un momento y vuelve a buscar.");
  last = Date.now();
  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "GaeslandStorefront/1.0 (+https://github.com/Gaes-Solutions/verticals)",
      },
      signal: AbortSignal.timeout(12000),
    });
    if (!response.ok) throw new Error("Geocoder unavailable");
    const data: unknown = await response.json();
    const parsed = resultSchema.safeParse(search && Array.isArray(data) ? data[0] : data);
    if (!parsed.success)
      throw new LocationError(
        404,
        "El mapa no encontró una dirección. Puedes escribir los datos manualmente.",
      );
    const result: MapResult = parsed.data;
    const oldest = cache.keys().next().value;
    if (cache.size >= 100 && oldest) cache.delete(oldest);
    cache.set(key, { result, until: Date.now() + 600000 });
    return result;
  } catch (e) {
    if (e instanceof LocationError) throw e;
    throw new LocationError(
      502,
      "El mapa no pudo consultar la dirección. Reintenta o escribe los datos manualmente.",
    );
  }
}
