import { describe, expect, it } from "vitest";
import { camposDireccionMapa } from "../../apps/web-tienda/src/lib/direccion-mapa";

describe("dirección desde ubicación", () => {
  it("usa la alcaldía como municipio y conserva el cero inicial del CP", () => {
    expect(
      camposDireccionMapa({
        lat: "19.43",
        lon: "-99.13",
        address: {
          road: "Plaza de la Constitución",
          neighbourhood: "Centro",
          city: "Ciudad de México",
          borough: "Cuauhtémoc",
          state: "Ciudad de México",
          postcode: "06060",
        },
      }),
    ).toEqual({
      calle: "Plaza de la Constitución",
      numeroExterior: "",
      colonia: "Centro",
      municipio: "Cuauhtémoc",
      estado: "Ciudad de México",
      codigoPostal: "06060",
    });
  });
  it("reconoce localidades pequeñas y barrios devueltos con otras claves", () => {
    expect(
      camposDireccionMapa({
        lat: "20",
        lon: "-100",
        address: {
          pedestrian: "Calle Central",
          house_number: "17",
          quarter: "San Pedro",
          village: "Villa de prueba",
          state: "México",
          postcode: "50000",
        },
      }),
    ).toMatchObject({
      calle: "Calle Central",
      numeroExterior: "17",
      colonia: "San Pedro",
      municipio: "Villa de prueba",
      codigoPostal: "50000",
    });
  });
  it("no inventa el número ni el CP cuando el mapa no los conoce", () => {
    expect(
      camposDireccionMapa({
        lat: "20",
        lon: "-100",
        address: { road: "Calle conocida", county: "Municipio conocido", postcode: "MX" },
      }),
    ).toMatchObject({
      calle: "Calle conocida",
      numeroExterior: "",
      codigoPostal: "",
      municipio: "Municipio conocido",
    });
  });
});
