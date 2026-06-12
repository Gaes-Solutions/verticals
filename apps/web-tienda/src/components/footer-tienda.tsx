import Link from "next/link";

const POLITICAS = [
  { slug: "envios", label: "Envíos" },
  { slug: "devoluciones", label: "Cambios y devoluciones" },
  { slug: "privacidad", label: "Aviso de privacidad" },
  { slug: "terminos", label: "Términos y condiciones" },
];

/** Footer de la tienda: confianza (pagos, políticas) + navegación. */
export function FooterTienda({ nombre }: { nombre: string }) {
  return (
    <footer className="mt-16 border-t bg-white">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:grid-cols-2 md:grid-cols-4">
        <div>
          <p className="font-bold text-marca">{nombre}</p>
          <p className="mt-2 text-gray-500 text-sm">
            Tu tienda en línea con compra protegida y envíos a todo México.
          </p>
        </div>
        <div>
          <p className="mb-2 font-semibold text-gray-800 text-sm">Comprar</p>
          <ul className="space-y-1.5 text-gray-500 text-sm">
            <li>
              <Link href="/" className="hover:text-marca">
                Catálogo
              </Link>
            </li>
            <li>
              <Link href="/?soloOfertas=true" className="hover:text-marca">
                Ofertas
              </Link>
            </li>
            <li>
              <Link href="/seguimiento" className="hover:text-marca">
                Rastrear pedido
              </Link>
            </li>
            <li>
              <Link href="/cuenta" className="hover:text-marca">
                Mi cuenta
              </Link>
            </li>
          </ul>
        </div>
        <div>
          <p className="mb-2 font-semibold text-gray-800 text-sm">Ayuda</p>
          <ul className="space-y-1.5 text-gray-500 text-sm">
            {POLITICAS.map((p) => (
              <li key={p.slug}>
                <Link href={`/politicas/${p.slug}`} className="hover:text-marca">
                  {p.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="mb-2 font-semibold text-gray-800 text-sm">Pago seguro</p>
          <div className="flex flex-wrap gap-2 text-2xl">
            <span title="Visa">💳</span>
            <span title="Mastercard">💳</span>
            <span title="OXXO">🏪</span>
            <span title="Transferencia">🏦</span>
          </div>
          <p className="mt-3 text-gray-400 text-xs">🔒 Tus datos viajan cifrados.</p>
        </div>
      </div>
      <div className="border-t py-4 text-center text-gray-400 text-xs">
        © {nombre} · Powered by GaesSoft POS
      </div>
    </footer>
  );
}
