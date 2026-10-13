export interface ResultadoMapa {
  lat: string;
  lon: string;
  display_name?: string;
  address?: Record<string, string | undefined>;
}

/** OpenStreetMap uses different keys for cities, rural settlements and boroughs. */
export function camposDireccionMapa(item: ResultadoMapa) {
  const a = item.address ?? {};
  return {
    calle: a.road || a.pedestrian || a.residential || a.footway || "",
    numeroExterior: a.house_number || "",
    colonia: a.neighbourhood || a.suburb || a.quarter || a.city_district || "",
    municipio:
      a.municipality || a.borough || a.city || a.town || a.village || a.county || a.hamlet || "",
    estado: a.state || a.region || "",
    codigoPostal: /^\d{5}$/.test(a.postcode ?? "") ? (a.postcode ?? "") : "",
  };
}
