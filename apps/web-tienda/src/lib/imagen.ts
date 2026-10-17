/** Compress shopper review photos to the API's 250,000-character data-URL limit. */
export async function comprimirImagen(
  file: File,
  ladoMax = 1024,
  q = 0.7,
  signal?: AbortSignal,
): Promise<string> {
  if (
    !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
    file.size > 12 * 1024 * 1024
  )
    throw new Error("Usa fotos JPG, PNG o WebP de hasta 12 MB.");
  signal?.throwIfAborted();
  const bitmap = await new Promise<ImageBitmap>((resolve, reject) => {
    const abort = () => reject(signal?.reason ?? new Error("Foto cancelada"));
    signal?.addEventListener("abort", abort, { once: true });
    void createImageBitmap(file).then(
      (image) => {
        signal?.removeEventListener("abort", abort);
        if (signal?.aborted) {
          image.close();
          reject(signal.reason);
        } else resolve(image);
      },
      (error) => {
        signal?.removeEventListener("abort", abort);
        reject(error);
      },
    );
  });
  try {
    if (!bitmap.width || !bitmap.height || bitmap.width * bitmap.height > 40_000_000)
      throw new Error("La imagen es demasiado grande.");
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("No se pudo procesar la imagen");
    let lado = ladoMax;
    for (let intento = 0; intento < 6; intento++) {
      signal?.throwIfAborted();
      const escala = Math.min(1, lado / Math.max(bitmap.width, bitmap.height));
      canvas.width = Math.max(1, Math.round(bitmap.width * escala));
      canvas.height = Math.max(1, Math.round(bitmap.height * escala));
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const result = canvas.toDataURL("image/jpeg", q);
      if (result.length <= 250000) return result;
      lado = Math.floor(lado * 0.75);
    }
    throw new Error("No se pudo reducir la foto. Prueba con otra imagen.");
  } finally {
    bitmap.close();
  }
}
