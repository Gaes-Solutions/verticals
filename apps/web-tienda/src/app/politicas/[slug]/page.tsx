import { getTiendaConfig } from "@/lib/api";
import type { Metadata } from "next";
import Link from "next/link";

const TITULOS: Record<string, string> = {
  envios: "Envíos",
  devoluciones: "Cambios y devoluciones",
  privacidad: "Aviso de privacidad",
  terminos: "Términos y condiciones",
};

/** Allowlist mínima para contenido editable; elimina scripts, eventos y URLs peligrosas. */
function sanitizePolicyHtml(input: string): string {
  return input
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(
      /<\s*(script|style|iframe|object|embed|form|input|button)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi,
      "",
    )
    .replace(/\s+on[a-z-]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(
      /\s+(?:href|src)\s*=\s*(?:"\s*javascript:[^"]*"|'\s*javascript:[^']*'|[^\s>]*javascript:[^\s>]*)/gi,
      "",
    )
    .replace(/<\/?(?!\/?(?:p|br|strong|em|u|ul|ol|li|h2|h3|a)(?:\s|\/?>))[^>]+>/gi, "");
}

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
  // El servidor ya manda el texto del dueño o, si no lo capturó, el texto base.
  const texto = config?.politicasHtml?.[slug] ?? "";
  const textoSeguro = sanitizePolicyHtml(texto);
  const esHtml = /<[a-z][\s\S]*>/i.test(textoSeguro);

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/" className="text-marca text-sm">
        ← Volver a la tienda
      </Link>
      <h1 className="mt-3 mb-6 font-bold text-2xl">{titulo}</h1>
      <article className="gx-card">
        {texto && esHtml ? (
          <div
            className="prose prose-sm max-w-none text-slate-700"
            // biome-ignore lint/security/noDangerouslySetInnerHtml: política HTML capturada por el dueño del tenant
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
