import { getTiendaConfig } from "@/lib/api";
import type { Metadata } from "next";
import Link from "next/link";

const TITULOS: Record<string, string> = {
  envios: "Envíos",
  devoluciones: "Cambios y devoluciones",
  privacidad: "Aviso de privacidad",
  terminos: "Términos y condiciones",
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
  // El servidor ya manda el texto del dueño o, si no lo capturó, el texto base.
  const texto = config?.politicasHtml?.[slug] ?? "";
  const esHtml = /<[a-z][\s\S]*>/i.test(texto);

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
            dangerouslySetInnerHTML={{ __html: texto }}
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
