/**
 * Redimensiona y comprime una imagen en el navegador a un data URL JPEG.
 * Evita subir megas: la tienda no tiene almacenamiento de objetos aún, así que
 * las fotos de reseña viajan como data URL pequeño (máx ~lado px, calidad q).
 */
export async function comprimirImagen(file: File, ladoMax = 1024, q = 0.7): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const escala = Math.min(1, ladoMax / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * escala);
  const h = Math.round(bitmap.height * escala);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No se pudo procesar la imagen");
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", q);
}
