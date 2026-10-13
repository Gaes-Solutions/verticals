import type { CategoriaPublica, ProductoPublicado } from "@/lib/api";
import { ArrowRight, Package, ShoppingBag, Store, Truck } from "lucide-react";
import Link from "next/link";

export function Escaparate({
  nombre,
  lema,
  items,
  categorias,
  recogida,
  envio,
}: {
  nombre: string;
  lema: string | null;
  items: ProductoPublicado[];
  categorias: CategoriaPublica[];
  recogida: boolean;
  envio: boolean;
}) {
  const conFoto = items.filter((p) => p.fotosArray[0]);
  const principal = conFoto[0];
  return (
    <div className="store-showcase">
      <section className="store-hero">
        <div className="store-hero-copy">
          <span className="store-eyebrow">
            <span /> DESCUBRE {nombre}
          </span>
          <h1>{lema || "Encuentra lo que te gusta. Compra a tu manera."}</h1>
          <p>
            Explora nuestro catálogo, elige tus favoritos y arma tu próxima compra en un solo lugar.
          </p>
          <div className="store-hero-buttons">
            <Link href="#catalogo" className="store-button">
              Explorar productos <ArrowRight size={18} />
            </Link>
            <Link href="/?soloOfertas=true" className="store-text-link">
              Ver ofertas →
            </Link>
          </div>
          <div className="store-hero-note">
            <ShoppingBag size={17} /> Tu próxima compra empieza aquí
          </div>
        </div>
        <div className="store-hero-products">
          {principal ? (
            <>
              <Link href={`/producto/${principal.slugSeo}`} className="store-featured-image">
                <img src={principal.fotosArray[0]} alt={principal.tituloPublico} />
                <span>
                  Descubre en {nombre} <ArrowRight size={18} />
                </span>
              </Link>
              <div className="store-mini-products">
                {conFoto.slice(1, 3).map((p) => (
                  <Link key={p.id} href={`/producto/${p.slugSeo}`}>
                    <img src={p.fotosArray[0]} alt={p.tituloPublico} />
                    <span>{p.tituloPublico}</span>
                  </Link>
                ))}
              </div>
            </>
          ) : (
            <div className="store-hero-placeholder">
              <ShoppingBag size={85} strokeWidth={1} />
              <span>Algo para cada día</span>
            </div>
          )}
        </div>
      </section>
      <div className="store-service-strip">
        <div>
          <ShoppingBag size={23} />
          <span>
            <strong>Elige a tu ritmo</strong>
            <small>Busca, compara y agrega al carrito</small>
          </span>
        </div>
        <div>
          {recogida ? <Store size={23} /> : <Package size={23} />}
          <span>
            <strong>{recogida ? "Recoge en tienda" : "Todo en tu cuenta"}</strong>
            <small>
              {recogida ? "Selecciona recogida al comprar" : "Consulta tus pedidos y direcciones"}
            </small>
          </span>
        </div>
        <div>
          <Truck size={23} />
          <span>
            <strong>{envio ? "Entrega a domicilio" : "Sigue tu compra"}</strong>
            <small>
              {envio ? "Consulta opciones en el checkout" : "Consulta el estado de tu pedido"}
            </small>
          </span>
        </div>
      </div>
      {categorias.length > 0 && (
        <section className="store-category-section">
          <div className="store-section-heading">
            <div>
              <p className="store-kicker">ENCUENTRA LO TUYO</p>
              <h2>Compra por departamento</h2>
            </div>
            <Link href="#catalogo">
              Ver catálogo <ArrowRight size={16} />
            </Link>
          </div>
          <div className="store-category-grid">
            {categorias.slice(0, 6).map((c, i) => {
              const p = conFoto.find((p) => p.categoriaPublica?.slugSeo === c.slugSeo);
              return (
                <Link
                  key={c.id}
                  href={`/?cat=${c.id}`}
                  className={`store-category store-category-${i % 3}`}
                >
                  <span>
                    {c.nombre}
                    <small>
                      Explorar <ArrowRight size={14} />
                    </small>
                  </span>
                  {p ? (
                    <img src={p.fotosArray[0]} alt="" loading="lazy" />
                  ) : (
                    <ShoppingBag size={36} strokeWidth={1.3} />
                  )}
                </Link>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
