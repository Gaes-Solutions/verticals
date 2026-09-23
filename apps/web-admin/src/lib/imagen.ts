/**
 * Encoge una foto en el navegador antes de subirla. Una foto de cámara pesa
 * varios MB y la tienda la muestra en una tarjeta de 300px: subirla tal cual
 * hace lenta la carga del lote y lenta la tienda en el celular del cliente.
 *
 * Se conserva el original cuando encogerlo no ayuda (ya es chico, o el
 * navegador no puede procesarlo): más vale una foto pesada que ninguna.
 */
export const LADO_MAXIMO = 1600;
const CALIDAD = 0.82;

export interface FotoLista {
  archivo: Blob;
  tipo: "image/jpeg" | "image/png" | "image/webp";
  optimizada: boolean;
}

function tipoDeSalida(original: string): FotoLista["tipo"] {
  // PNG se conserva solo si es PNG: convertirlo a JPEG tiraría la transparencia.
  return original === "image/png" ? "image/png" : "image/jpeg";
}

export async function prepararFoto(file: File): Promise<FotoLista> {
  const tipo = tipoDeSalida(file.type);
  const sinCambios: FotoLista = {
    archivo: file,
    tipo: file.type as FotoLista["tipo"],
    optimizada: false,
  };
  try {
    const bitmap = await createImageBitmap(file);
    const escala = Math.min(1, LADO_MAXIMO / Math.max(bitmap.width, bitmap.height));
    const ancho = Math.round(bitmap.width * escala);
    const alto = Math.round(bitmap.height * escala);
    const canvas = document.createElement("canvas");
    canvas.width = ancho;
    canvas.height = alto;
    const ctx = canvas.getContext("2d");
    if (!ctx) return sinCambios;
    ctx.drawImage(bitmap, 0, 0, ancho, alto);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, tipo, CALIDAD));
    if (!blob || blob.size >= file.size) return sinCambios;
    return { archivo: blob, tipo, optimizada: true };
  } catch {
    return sinCambios;
  }
}
