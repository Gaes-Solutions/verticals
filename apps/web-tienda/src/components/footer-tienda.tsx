import { Banknote, CreditCard, Lock, Store } from "lucide-react";
import Link from "next/link";

const POLITICAS = [
  { slug: "envios", label: "Envíos" },
  { slug: "devoluciones", label: "Cambios y devoluciones" },
  { slug: "privacidad", label: "Aviso de privacidad" },
  { slug: "terminos", label: "Términos y condiciones" },
];

/** Footer de la tienda: confianza (pagos, políticas) + navegación. */
export function FooterTienda({
  nombre,
  metodosPago = [],
}: { nombre: string; metodosPago?: string[] }) {
  return (
    <footer className="store-footer mt-12 border-t bg-white">
      <div className="tienda-shell grid gap-8 py-10 sm:grid-cols-2 md:grid-cols-4">
        <div>
          <p className="font-bold text-marca">{nombre}</p>
          <p className="mt-2 text-slate-500 text-sm">
            Explora nuestros productos y consulta las opciones de entrega al finalizar tu compra.
          </p>
        </div>
        <div>
          <p className="mb-2 font-semibold text-slate-800 text-sm">Comprar</p>
          <ul className="space-y-1.5 text-slate-500 text-sm">
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
          <p className="mb-2 font-semibold text-slate-800 text-sm">Ayuda</p>
          <ul className="space-y-1.5 text-slate-500 text-sm">
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
          <p className="mb-2 font-semibold text-slate-800 text-sm">Tu compra</p>
          <div className="flex flex-wrap items-center gap-2 text-slate-500">
            {metodosPago.includes("tarjeta") && (
              <span title="Tarjetas" className="rounded-md border border-slate-200 p-1.5">
                <CreditCard size={18} strokeWidth={1.75} />
              </span>
            )}
            {metodosPago.includes("oxxo") && (
              <span title="OXXO" className="rounded-md border border-slate-200 p-1.5">
                <Store size={18} strokeWidth={1.75} />
              </span>
            )}
            {metodosPago.includes("spei") && (
              <span title="Transferencia" className="rounded-md border border-slate-200 p-1.5">
                <Banknote size={18} strokeWidth={1.75} />
              </span>
            )}
            {metodosPago.length === 0 && (
              <span className="text-sm">Consulta las opciones al finalizar tu pedido.</span>
            )}
          </div>
          <p className="mt-3 flex items-center gap-1.5 text-slate-400 text-xs">
            <Lock size={13} strokeWidth={2} /> Tus datos viajan cifrados.
          </p>
        </div>
      </div>
      <div className="border-t py-4 text-center text-slate-400 text-xs">
        © {new Date().getFullYear()} {nombre} · Tu tienda en línea
      </div>
    </footer>
  );
}
