import { getTiendaConfig } from "@/lib/api";
import type { Metadata } from "next";
import Link from "next/link";

const TITULOS: Record<string, string> = {
  envios: "Envíos",
  devoluciones: "Cambios y devoluciones",
  privacidad: "Aviso de privacidad",
  terminos: "Términos y condiciones",
};

/** Texto por defecto cuando el tenant no ha capturado su política. */
const DEFAULTS: Record<string, string> = {
  envios:
    "Realizamos envíos a todo México. El costo y tiempo de entrega se calculan en el checkout según tu código postal. Recibirás la guía de rastreo cuando tu pedido se despache.",
  devoluciones:
    "Puedes solicitar un cambio o devolución dentro de los días posteriores a la entrega desde tu cuenta. Los productos deben estar en su estado original.",
  privacidad:
    "Tus datos personales se usan únicamente para procesar tus pedidos y se tratan conforme a la Ley Federal de Protección de Datos Personales (LFPDPPP). No los compartimos con terceros con fines comerciales.",
  terminos:
    "Al comprar en esta tienda aceptas nuestros términos de uso. Los precios y la disponibilidad pueden cambiar sin previo aviso.",
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  return { title: TITULOS[slug] ?? "Información" };
}

export default async function PoliticaPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const titulo = TITULOS[slug] ?? "Información";
  const config = await getTiendaConfig().catch(() => null);
  const html = config?.politicasHtml?.[slug];
  const texto = DEFAULTS[slug];

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/" className="text-marca text-sm">
        ← Volver a la tienda
      </Link>
      <h1 className="mt-3 mb-6 font-bold text-2xl">{titulo}</h1>
      <article className="rounded-xl border bg-white p-6">
        {html ? (
          <div
            className="prose prose-sm max-w-none text-gray-700"
            // biome-ignore lint/security/noDangerouslySetInnerHtml: política HTML capturada por el dueño del tenant
            dangerouslySetInnerHTML={{ __html: html }}
          />
        ) : (
          <p className="whitespace-pre-line text-gray-700 leading-relaxed">
            {texto ?? "Esta información estará disponible próximamente."}
          </p>
        )}
      </article>
    </div>
  );
}
