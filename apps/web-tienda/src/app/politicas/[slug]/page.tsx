import { getTiendaConfig } from "@/lib/api";
import { sanitizePolicyHtml } from "@/lib/policy-html";
import type { Metadata } from "next";
import Link from "next/link";

const TITULOS: Record<string, string> = {
  envios: "Envíos",
  devoluciones: "Cambios y devoluciones",
  privacidad: "Aviso de privacidad",
  terminos: "Términos y condiciones",
};

function tituloPolitica(slug: string): string {
  return Object.hasOwn(TITULOS, slug) ? TITULOS[slug] : "Información";
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  return { title: tituloPolitica(slug) };
}

export default async function PoliticaPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const titulo = tituloPolitica(slug);
  const config = await getTiendaConfig().catch(() => null);
  // El servidor ya manda el texto del dueño o, si no lo capturó, el texto base.
  const consultaFallida = !config || config.consultaFallida === true;
  const politicas = config?.politicasHtml;
  const politica = politicas && Object.hasOwn(politicas, slug) ? politicas[slug] : undefined;
  const texto = typeof politica === "string" ? politica : "";
  const textoSeguro = sanitizePolicyHtml(texto);
  const esHtml = /<[a-z][\s\S]*>/i.test(textoSeguro);

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/" className="text-marca text-sm">
        ← Volver a la tienda
      </Link>
      <h1 className="mt-3 mb-6 font-bold text-2xl">{titulo}</h1>
      <article className="gx-card">
        {consultaFallida ? (
          <div role="alert" className="space-y-3 text-slate-700">
            <p>No pudimos cargar esta información. Revisa tu conexión e inténtalo de nuevo.</p>
            <a
              href={`/politicas/${encodeURIComponent(slug)}`}
              className="font-semibold text-marca underline"
            >
              Reintentar
            </a>
          </div>
        ) : texto && esHtml ? (
          <div
            className="prose prose-sm max-w-none text-slate-700"
            // biome-ignore lint/security/noDangerouslySetInnerHtml: parsed with a strict tag/attribute/scheme allowlist
            dangerouslySetInnerHTML={{ __html: textoSeguro }}
          />
        ) : (
          <p className="whitespace-pre-line text-slate-700 leading-relaxed">
            {texto || "Esta información estará disponible próximamente."}
          </p>
        )}
      </article>
    </div>
  );
}
