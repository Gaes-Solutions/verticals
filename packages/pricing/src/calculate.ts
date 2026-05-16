import Decimal from "decimal.js";
import type {
  CalcularLineaContexto,
  CalcularTicketInput,
  CuponInput,
  DecimalLike,
  DescuentoAplicado,
  DescuentoGlobalInput,
  LineaCalculada,
  LineaPrecioInput,
  ReglaAccion,
  ReglaPrecioInput,
  TicketCalculado,
} from "./types.js";

const ZERO = new Decimal(0);
const HUNDRED = new Decimal(100);

function dec(v: DecimalLike): Decimal {
  return v instanceof Decimal ? v : new Decimal(v);
}

function pickEscalonado(linea: LineaPrecioInput): {
  precio: Decimal;
  matched: boolean;
} {
  const cantidad = dec(linea.cantidad);
  for (const tier of linea.preciosEscalonados) {
    const min = dec(tier.cantidadMinima);
    const max = tier.cantidadMaxima === null ? null : dec(tier.cantidadMaxima);
    if (cantidad.gte(min) && (max === null || cantidad.lte(max))) {
      return { precio: dec(tier.precioUnitario), matched: true };
    }
  }
  return { precio: dec(linea.precioBase), matched: false };
}

function applyAccion(precio: Decimal, accion: ReglaAccion): Decimal {
  const valor = dec(accion.valor);
  switch (accion.tipo) {
    case "porcentaje":
      return precio.mul(HUNDRED.minus(valor)).div(HUNDRED);
    case "monto_fijo":
      return Decimal.max(precio.minus(valor), ZERO);
    case "precio_override":
      return valor;
  }
}

function reglaAplica(
  regla: ReglaPrecioInput,
  linea: LineaPrecioInput,
  contexto: CalcularLineaContexto,
): boolean {
  const cond = regla.condicion;
  if (cond.productosAplicables?.length && !cond.productosAplicables.includes(linea.productoId)) {
    return false;
  }
  if (
    cond.categoriasAplicables?.length &&
    (linea.categoriaId === null || !cond.categoriasAplicables.includes(linea.categoriaId))
  ) {
    return false;
  }
  if (cond.clientesAplicables?.length) {
    if (!contexto.clienteId || !cond.clientesAplicables.includes(contexto.clienteId)) {
      return false;
    }
  }
  if (cond.cantidadMinima !== undefined && dec(linea.cantidad).lt(dec(cond.cantidadMinima))) {
    return false;
  }
  return true;
}

const REGLAS_LINEA: ReadonlySet<ReglaPrecioInput["tipo"]> = new Set([
  "descuento_producto",
  "descuento_categoria",
  "descuento_cliente",
  "precio_temporada",
]);

function aplicarEscalonado(
  linea: LineaPrecioInput,
  cantidad: Decimal,
): { precio: Decimal; matched: boolean; descuento: DescuentoAplicado | null } {
  const escalonado = pickEscalonado(linea);
  if (!escalonado.matched) return { precio: escalonado.precio, matched: false, descuento: null };
  const ahorro = dec(linea.precioBase).minus(escalonado.precio).mul(cantidad);
  return {
    precio: escalonado.precio,
    matched: true,
    descuento: ahorro.gt(ZERO)
      ? {
          paso: 1,
          fuente: "escalonado",
          descripcion: `Precio escalonado por cantidad (${cantidad.toString()})`,
          montoTotal: ahorro.toString(),
        }
      : null,
  };
}

function aplicarListaPrecio(
  linea: LineaPrecioInput,
  cantidad: Decimal,
  precioActual: Decimal,
  escalonadoMatched: boolean,
): { precio: Decimal; descuento: DescuentoAplicado | null } {
  if (linea.listaPrecioItem === null || escalonadoMatched) {
    return { precio: precioActual, descuento: null };
  }
  const precioLista = dec(linea.listaPrecioItem.precio);
  const ahorro = dec(linea.precioBase).minus(precioLista).mul(cantidad);
  return {
    precio: precioLista,
    descuento: ahorro.gt(ZERO)
      ? {
          paso: 2,
          fuente: "lista_precio",
          descripcion: "Precio según lista del cliente",
          montoTotal: ahorro.toString(),
        }
      : null,
  };
}

function aplicarReglasLinea(
  linea: LineaPrecioInput,
  contexto: CalcularLineaContexto,
  cantidad: Decimal,
  escalonadoMatched: boolean,
  precioInicial: Decimal,
): { precio: Decimal; descuentos: DescuentoAplicado[] } {
  const descuentos: DescuentoAplicado[] = [];
  if (!linea.permiteDescuento) return { precio: precioInicial, descuentos };
  const reglas = contexto.reglas
    .filter((r) => REGLAS_LINEA.has(r.tipo))
    .filter((r) => !(r.excluyeProductosConEscalonado && escalonadoMatched))
    .filter((r) => reglaAplica(r, linea, contexto))
    .sort((a, b) => a.prioridad - b.prioridad);

  let precio = precioInicial;
  for (const regla of reglas) {
    const prev = precio;
    precio = applyAccion(precio, regla.accion);
    const ahorro = prev.minus(precio).mul(cantidad);
    if (ahorro.gt(ZERO)) {
      descuentos.push({
        paso: 3,
        fuente: "regla_precio",
        reglaId: regla.id,
        descripcion: `Regla ${regla.tipo}`,
        montoTotal: ahorro.toString(),
      });
    }
    if (!regla.stackable) break;
  }
  return { precio, descuentos };
}

function evaluarPrecioMinimo(linea: LineaPrecioInput, precioActual: Decimal): boolean {
  const item = linea.listaPrecioItem;
  if (!item || item.precioMinimoNegociacion === null) return false;
  return precioActual.lt(dec(item.precioMinimoNegociacion));
}

export function calcularLinea(
  linea: LineaPrecioInput,
  contexto: CalcularLineaContexto,
): LineaCalculada {
  const cantidad = dec(linea.cantidad);
  const descuentos: DescuentoAplicado[] = [];

  const paso1 = aplicarEscalonado(linea, cantidad);
  if (paso1.descuento) descuentos.push(paso1.descuento);

  const paso2 = aplicarListaPrecio(linea, cantidad, paso1.precio, paso1.matched);
  if (paso2.descuento) descuentos.push(paso2.descuento);

  const paso3 = aplicarReglasLinea(linea, contexto, cantidad, paso1.matched, paso2.precio);
  descuentos.push(...paso3.descuentos);

  const precioFinal = paso3.precio;
  const subtotal = precioFinal.mul(cantidad);

  return {
    productoVarianteId: linea.productoVarianteId,
    cantidad: cantidad.toString(),
    precioBase: dec(linea.precioBase).toString(),
    precioUnitario: precioFinal.toString(),
    precioMinimoViolado: evaluarPrecioMinimo(linea, precioFinal),
    subtotal: subtotal.toString(),
    descuentos,
  };
}

function aplicarMayoreoTotalTicket(
  subtotal: Decimal,
  reglas: ReglaPrecioInput[],
): { descuento: Decimal; aplicada: ReglaPrecioInput | null } {
  const candidatas = reglas
    .filter((r) => r.tipo === "mayoreo_por_total_ticket")
    .filter((r) => {
      const min = r.condicion.montoMinimo;
      return min === undefined || subtotal.gte(dec(min));
    })
    .sort((a, b) => a.prioridad - b.prioridad);

  if (candidatas.length === 0) return { descuento: ZERO, aplicada: null };
  const regla = candidatas[0];
  if (!regla) return { descuento: ZERO, aplicada: null };
  const valor = dec(regla.accion.valor);
  let descuento: Decimal;
  switch (regla.accion.tipo) {
    case "porcentaje":
      descuento = subtotal.mul(valor).div(HUNDRED);
      break;
    case "monto_fijo":
      descuento = Decimal.min(valor, subtotal);
      break;
    case "precio_override":
      descuento = Decimal.max(subtotal.minus(valor), ZERO);
      break;
  }
  return { descuento, aplicada: regla };
}

function aplicarCupon(
  subtotal: Decimal,
  cupon: CuponInput,
  contexto: CalcularLineaContexto,
): Decimal {
  if (cupon.montoMinimoCompra !== null && subtotal.lt(dec(cupon.montoMinimoCompra))) {
    return ZERO;
  }
  if (cupon.clientesAplicables?.length) {
    if (!contexto.clienteId || !cupon.clientesAplicables.includes(contexto.clienteId)) {
      return ZERO;
    }
  }
  const valor = dec(cupon.valor);
  switch (cupon.tipo) {
    case "monto_fijo":
      return Decimal.min(valor, subtotal);
    case "porcentaje":
      return subtotal.mul(valor).div(HUNDRED);
    case "envio_gratis":
    case "producto_gratis":
      return ZERO;
  }
}

function aplicarDescuentoGlobal(subtotal: Decimal, global: DescuentoGlobalInput): Decimal {
  const pct = dec(global.porcentaje);
  return subtotal.mul(pct).div(HUNDRED);
}

export function calcularTicket(input: CalcularTicketInput): TicketCalculado {
  const lineas = input.lineas.map((l) => calcularLinea(l, input.contexto));
  const subtotalLineas = lineas.reduce((acc, l) => acc.plus(dec(l.subtotal)), ZERO);
  const descuentosTicket: DescuentoAplicado[] = [];
  let totalActual = subtotalLineas;

  // Paso 4: mayoreo por total de ticket (RF-03)
  const mayoreo = aplicarMayoreoTotalTicket(totalActual, input.contexto.reglas);
  if (mayoreo.descuento.gt(ZERO) && mayoreo.aplicada !== null) {
    totalActual = totalActual.minus(mayoreo.descuento);
    descuentosTicket.push({
      paso: 4,
      fuente: "ticket_mayoreo",
      reglaId: mayoreo.aplicada.id,
      descripcion: "Descuento por monto total de ticket",
      montoTotal: mayoreo.descuento.toString(),
    });
  }

  // Paso 5: cupón
  if (input.cupon !== null) {
    const desc = aplicarCupon(totalActual, input.cupon, input.contexto);
    if (desc.gt(ZERO)) {
      totalActual = totalActual.minus(desc);
      descuentosTicket.push({
        paso: 5,
        fuente: "cupon",
        cuponId: input.cupon.id,
        descripcion: `Cupón ${input.cupon.codigo}`,
        montoTotal: desc.toString(),
      });
    }
  }

  // Paso 6: descuento global del cajero (con permiso, validar fuera del motor)
  if (input.descuentoGlobal !== null) {
    const desc = aplicarDescuentoGlobal(totalActual, input.descuentoGlobal);
    if (desc.gt(ZERO)) {
      totalActual = totalActual.minus(desc);
      descuentosTicket.push({
        paso: 6,
        fuente: "manual",
        descripcion: `Descuento manual: ${input.descuentoGlobal.motivo}`,
        montoTotal: desc.toString(),
      });
    }
  }

  return {
    lineas,
    subtotal: subtotalLineas.toString(),
    descuentosTicket,
    total: Decimal.max(totalActual, ZERO).toString(),
  };
}
