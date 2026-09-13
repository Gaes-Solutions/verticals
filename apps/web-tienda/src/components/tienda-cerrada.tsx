/**
 * Lo que ve quien llega a una tienda que todavía no abre (apagada o sin
 * productos publicados). Mejor un aviso con el nombre del negocio que una
 * página vacía o un error.
 */
export function TiendaCerrada({ nombre, lema }: { nombre: string; lema: string | null }) {
  return (
    <section className="mx-auto max-w-lg px-2 py-16 text-center">
      <p className="font-medium text-marca text-sm uppercase tracking-wide">Abriremos pronto</p>
      <h1 className="mt-2 font-bold text-3xl text-slate-800">{nombre}</h1>
      {lema && <p className="mt-3 text-slate-600">{lema}</p>}
      <p className="mt-6 text-slate-500 text-sm">
        Estamos preparando nuestros productos. Vuelve muy pronto.
      </p>
    </section>
  );
}
