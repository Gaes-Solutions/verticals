/** Public stock is a cap for the combined cart quantity, not for each separate click. */
export function cantidadCompra(
  texto: string,
  fraccion: boolean,
  actual: number,
  stock: number | null,
) {
  const cantidad = Number(texto);
  const formato = /^\d{1,6}(?:\.\d{1,3})?$/.test(texto);
  if (
    !formato ||
    !Number.isFinite(cantidad) ||
    cantidad <= 0 ||
    cantidad > 100000 ||
    (!fraccion && !Number.isInteger(cantidad))
  )
    return {
      ok: false as const,
      mensaje: fraccion
        ? "Escribe una cantidad mayor que cero, hasta 100000 y con hasta 3 decimales."
        : "Escribe una cantidad entera entre 1 y 100000.",
    };
  if (cantidadActualInvalida(actual, fraccion))
    return {
      ok: false as const,
      mensaje: "Revisa la cantidad que ya tienes en tu carrito antes de agregar más.",
    };
  const total = (Math.round(actual * 1000) + Math.round(cantidad * 1000)) / 1000;
  if (total > 100000)
    return {
      ok: false as const,
      mensaje: "La cantidad total de esta opción no puede superar 100000.",
    };
  if (stock !== null && (!Number.isFinite(stock) || stock < 0))
    return {
      ok: false as const,
      mensaje: "No pudimos confirmar la disponibilidad de esta opción.",
    };
  if (stock !== null && total > stock) {
    const restante = Math.max(0, Math.floor((stock - actual) * 1000 + 0.000001) / 1000);
    return {
      ok: false as const,
      mensaje:
        restante > 0
          ? `Puedes agregar hasta ${restante} de esta opción.`
          : "Ya tienes en el carrito las unidades disponibles de esta opción.",
    };
  }
  return { ok: true as const, cantidad, total };
}

function cantidadActualInvalida(actual: number, fraccion: boolean) {
  return (
    !Number.isFinite(actual) ||
    actual < 0 ||
    actual > 100000 ||
    (!fraccion && !Number.isInteger(actual)) ||
    Math.abs(actual * 1000 - Math.round(actual * 1000)) > 0.000001
  );
}
