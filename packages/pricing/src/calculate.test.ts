import { describe, expect, it } from "vitest";
import { calcularLinea, calcularTicket } from "./calculate.js";
import type {
  CalcularLineaContexto,
  CuponInput,
  LineaPrecioInput,
  ReglaPrecioInput,
} from "./types.js";

const baseLinea = (overrides: Partial<LineaPrecioInput> = {}): LineaPrecioInput => ({
  productoVarianteId: "var-1",
  productoId: "prod-1",
  categoriaId: null,
  cantidad: "1",
  precioBase: "100",
  preciosEscalonados: [],
  listaPrecioItem: null,
  permiteDescuento: true,
  ...overrides,
});

const ctx = (overrides: Partial<CalcularLineaContexto> = {}): CalcularLineaContexto => ({
  reglas: [],
  ...overrides,
});

describe("calcularLinea — paso 1 escalonado RF-02", () => {
  it("usa precio base si no hay escalonado", () => {
    const r = calcularLinea(baseLinea({ cantidad: "1" }), ctx());
    expect(r.precioUnitario).toBe("100");
    expect(r.subtotal).toBe("100");
    expect(r.descuentos).toHaveLength(0);
  });

  it("aplica tier escalonado cuando cantidad cae en rango", () => {
    const r = calcularLinea(
      baseLinea({
        cantidad: "5",
        preciosEscalonados: [
          { cantidadMinima: "2", cantidadMaxima: "9", precioUnitario: "90" },
          { cantidadMinima: "10", cantidadMaxima: null, precioUnitario: "80" },
        ],
      }),
      ctx(),
    );
    expect(r.precioUnitario).toBe("90");
    expect(r.subtotal).toBe("450");
    expect(r.descuentos[0]?.paso).toBe(1);
    expect(r.descuentos[0]?.fuente).toBe("escalonado");
    expect(r.descuentos[0]?.montoTotal).toBe("50");
  });

  it("tier 100+ con cantidadMaxima null", () => {
    const r = calcularLinea(
      baseLinea({
        cantidad: "150",
        preciosEscalonados: [{ cantidadMinima: "100", cantidadMaxima: null, precioUnitario: "70" }],
      }),
      ctx(),
    );
    expect(r.precioUnitario).toBe("70");
  });
});

describe("calcularLinea — paso 2 lista de precios", () => {
  it("usa precio de lista si presente y no hay escalonado matched", () => {
    const r = calcularLinea(
      baseLinea({
        cantidad: "3",
        listaPrecioItem: { precio: "85", precioMinimoNegociacion: null, incluyeIva: true },
      }),
      ctx(),
    );
    expect(r.precioUnitario).toBe("85");
    expect(r.descuentos[0]?.fuente).toBe("lista_precio");
    expect(r.descuentos[0]?.paso).toBe(2);
  });

  it("escalonado tiene precedencia sobre lista de precios", () => {
    const r = calcularLinea(
      baseLinea({
        cantidad: "5",
        preciosEscalonados: [{ cantidadMinima: "5", cantidadMaxima: null, precioUnitario: "90" }],
        listaPrecioItem: { precio: "85", precioMinimoNegociacion: null, incluyeIva: true },
      }),
      ctx(),
    );
    expect(r.precioUnitario).toBe("90");
    expect(r.descuentos[0]?.fuente).toBe("escalonado");
  });

  it("flag precioMinimoViolado se prende si precio cae bajo el mínimo", () => {
    const r = calcularLinea(
      baseLinea({
        cantidad: "1",
        listaPrecioItem: { precio: "80", precioMinimoNegociacion: "90", incluyeIva: true },
      }),
      ctx(),
    );
    expect(r.precioMinimoViolado).toBe(true);
  });
});

describe("calcularLinea — paso 3 reglas a nivel línea", () => {
  const reglaDescuentoCategoria: ReglaPrecioInput = {
    id: "regla-1",
    tipo: "descuento_categoria",
    prioridad: 10,
    stackable: false,
    excluyeProductosConEscalonado: true,
    condicion: { categoriasAplicables: ["cat-belleza"] },
    accion: { tipo: "porcentaje", valor: "20" },
  };

  it("aplica regla de categoría cuando categoría coincide", () => {
    const r = calcularLinea(
      baseLinea({ cantidad: "1", categoriaId: "cat-belleza" }),
      ctx({ reglas: [reglaDescuentoCategoria] }),
    );
    expect(r.precioUnitario).toBe("80");
    expect(r.descuentos[0]?.paso).toBe(3);
    expect(r.descuentos[0]?.reglaId).toBe("regla-1");
  });

  it("regla con excluyeProductosConEscalonado se salta si hay tier matched", () => {
    const r = calcularLinea(
      baseLinea({
        cantidad: "5",
        categoriaId: "cat-belleza",
        preciosEscalonados: [{ cantidadMinima: "5", cantidadMaxima: null, precioUnitario: "90" }],
      }),
      ctx({ reglas: [reglaDescuentoCategoria] }),
    );
    expect(r.precioUnitario).toBe("90");
    expect(r.descuentos.some((d) => d.fuente === "regla_precio")).toBe(false);
  });

  it("permiteDescuento=false bloquea reglas a nivel línea", () => {
    const r = calcularLinea(
      baseLinea({ cantidad: "1", categoriaId: "cat-belleza", permiteDescuento: false }),
      ctx({ reglas: [reglaDescuentoCategoria] }),
    );
    expect(r.precioUnitario).toBe("100");
    expect(r.descuentos).toHaveLength(0);
  });

  it("reglas no stackable se detienen en la primera; stackable acumulan", () => {
    const reglaA: ReglaPrecioInput = {
      id: "a",
      tipo: "descuento_producto",
      prioridad: 1,
      stackable: true,
      excluyeProductosConEscalonado: false,
      condicion: { productosAplicables: ["prod-1"] },
      accion: { tipo: "porcentaje", valor: "10" },
    };
    const reglaB: ReglaPrecioInput = {
      id: "b",
      tipo: "descuento_producto",
      prioridad: 2,
      stackable: true,
      excluyeProductosConEscalonado: false,
      condicion: { productosAplicables: ["prod-1"] },
      accion: { tipo: "porcentaje", valor: "10" },
    };
    const r = calcularLinea(baseLinea({ cantidad: "1" }), ctx({ reglas: [reglaA, reglaB] }));
    expect(r.precioUnitario).toBe("81");
    expect(r.descuentos.filter((d) => d.fuente === "regla_precio")).toHaveLength(2);
  });
});

describe("calcularTicket — pasos 4, 5, 6 a nivel ticket", () => {
  it("paso 4 mayoreo por total de ticket cuando supera monto mínimo", () => {
    const reglaMayoreo: ReglaPrecioInput = {
      id: "mayoreo-1",
      tipo: "mayoreo_por_total_ticket",
      prioridad: 1,
      stackable: false,
      excluyeProductosConEscalonado: false,
      condicion: { montoMinimo: "1000" },
      accion: { tipo: "porcentaje", valor: "5" },
    };
    const r = calcularTicket({
      lineas: [baseLinea({ cantidad: "12" })],
      contexto: ctx({ reglas: [reglaMayoreo] }),
      cupon: null,
      descuentoGlobal: null,
    });
    expect(r.subtotal).toBe("1200");
    expect(r.total).toBe("1140");
    expect(r.descuentosTicket[0]?.paso).toBe(4);
    expect(r.descuentosTicket[0]?.fuente).toBe("ticket_mayoreo");
  });

  it("paso 5 cupón porcentaje aplica sobre subtotal después del paso 4", () => {
    const cupon: CuponInput = {
      id: "cup-1",
      codigo: "SAVE10",
      tipo: "porcentaje",
      valor: "10",
      montoMinimoCompra: null,
    };
    const r = calcularTicket({
      lineas: [baseLinea({ cantidad: "1" })],
      contexto: ctx(),
      cupon,
      descuentoGlobal: null,
    });
    expect(r.subtotal).toBe("100");
    expect(r.total).toBe("90");
    expect(r.descuentosTicket[0]?.fuente).toBe("cupon");
  });

  it("paso 5 cupón monto_fijo no excede el total disponible", () => {
    const cupon: CuponInput = {
      id: "cup-2",
      codigo: "FIJO500",
      tipo: "monto_fijo",
      valor: "500",
      montoMinimoCompra: null,
    };
    const r = calcularTicket({
      lineas: [baseLinea({ cantidad: "1" })],
      contexto: ctx(),
      cupon,
      descuentoGlobal: null,
    });
    expect(r.total).toBe("0");
  });

  it("paso 5 cupón con montoMinimoCompra no aplica si subtotal < min", () => {
    const cupon: CuponInput = {
      id: "cup-3",
      codigo: "MIN500",
      tipo: "porcentaje",
      valor: "10",
      montoMinimoCompra: "500",
    };
    const r = calcularTicket({
      lineas: [baseLinea({ cantidad: "1" })],
      contexto: ctx(),
      cupon,
      descuentoGlobal: null,
    });
    expect(r.total).toBe("100");
    expect(r.descuentosTicket).toHaveLength(0);
  });

  it("paso 6 descuento global del cajero aplica al final", () => {
    const r = calcularTicket({
      lineas: [baseLinea({ cantidad: "1" })],
      contexto: ctx(),
      cupon: null,
      descuentoGlobal: { porcentaje: "5", motivo: "Cliente leal", usuarioId: "u-1" },
    });
    expect(r.total).toBe("95");
    expect(r.descuentosTicket[0]?.paso).toBe(6);
  });

  it("cascada completa: escalonado + mayoreo + cupón + descuento manual", () => {
    const reglaMayoreo: ReglaPrecioInput = {
      id: "mayoreo-1",
      tipo: "mayoreo_por_total_ticket",
      prioridad: 1,
      stackable: false,
      excluyeProductosConEscalonado: false,
      condicion: { montoMinimo: "500" },
      accion: { tipo: "porcentaje", valor: "10" },
    };
    const cupon: CuponInput = {
      id: "cup-9",
      codigo: "EXTRA",
      tipo: "porcentaje",
      valor: "5",
      montoMinimoCompra: null,
    };
    const r = calcularTicket({
      lineas: [
        baseLinea({
          cantidad: "10",
          preciosEscalonados: [
            { cantidadMinima: "10", cantidadMaxima: null, precioUnitario: "80" },
          ],
        }),
      ],
      contexto: ctx({ reglas: [reglaMayoreo] }),
      cupon,
      descuentoGlobal: { porcentaje: "5", motivo: "Cierre de mes", usuarioId: "u-1" },
    });
    expect(r.subtotal).toBe("800");
    expect(r.total).toBe("649.8");
    expect(r.descuentosTicket).toHaveLength(3);
    expect(r.lineas[0]?.descuentos[0]?.fuente).toBe("escalonado");
  });
});
