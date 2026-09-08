import { ApiError } from "@gaespos/api-client";
import { api } from "../lib/api";
export interface ProductDetail {
  id: string;
  nombre: string;
  skuPadre: string;
  descripcionCorta: string | null;
  tieneVariantes: boolean;
  tipoVenta: string;
  aplicaIva: boolean;
  tasaIva: string;
  isActive: boolean;
  variantes: { id: string; precioBase: string; isDefault: boolean }[];
}
export interface ProductDraft {
  nombre: string;
  skuPadre: string;
  descripcionCorta: string;
  precioBase: string;
  codigoBarras: string;
  aplicaIva: boolean;
  tasaIva: string;
}
export const newProductDraft = (): ProductDraft => ({
  nombre: "",
  skuPadre: "",
  descripcionCorta: "",
  precioBase: "",
  codigoBarras: "",
  aplicaIva: true,
  tasaIva: "16",
});
export function canManageProducts(
  permissions: string[],
  isOwner: boolean,
  action: "leer" | "crear" | "actualizar",
) {
  return isOwner || permissions.includes("*") || permissions.includes(`productos.${action}`);
}
function text(value: string, name: string, max: number, required = false) {
  const clean = value.trim();
  if ((required && !clean) || clean.length > max)
    throw new Error(`${name}: ${required ? "obligatorio, " : ""}máximo ${max} caracteres.`);
  return clean;
}
function price(value: string) {
  if (!/^\d{1,8}(\.\d{1,4})?$/.test(value))
    throw new Error("Escribe un precio válido, no negativo y con hasta cuatro decimales.");
  return value;
}
export function editablePrice(product: ProductDetail) {
  return !product.tieneVariantes && product.variantes.length === 1;
}
export function createProductBody(draft: ProductDraft) {
  const rate = draft.aplicaIva ? draft.tasaIva : "0";
  if (!["0", "8", "16"].includes(rate)) throw new Error("Selecciona una tasa de IVA válida.");
  const barcode = text(draft.codigoBarras, "Código de barras", 60);
  return {
    nombre: text(draft.nombre, "Nombre", 240, true),
    skuPadre: text(draft.skuPadre, "SKU", 60, true),
    descripcionCorta: text(draft.descripcionCorta, "Descripción", 500),
    precioBase: price(draft.precioBase),
    aplicaIva: draft.aplicaIva,
    tasaIva: rate,
    tipoVenta: "unidad" as const,
    unidadMedida: "pza" as const,
    tieneVariantes: false,
    ...(barcode ? { codigoBarras: barcode } : {}),
  };
}
export function updateProductBody(draft: ProductDraft, current: ProductDetail) {
  return {
    nombre: text(draft.nombre, "Nombre", 240, true),
    descripcionCorta: text(draft.descripcionCorta, "Descripción", 500) || null,
    ...(editablePrice(current) ? { precioBase: price(draft.precioBase) } : {}),
  };
}
export function productDto(value: ProductDetail): ProductDetail {
  if (
    !value?.id ||
    typeof value.nombre !== "string" ||
    typeof value.skuPadre !== "string" ||
    typeof value.tieneVariantes !== "boolean" ||
    typeof value.aplicaIva !== "boolean" ||
    typeof value.isActive !== "boolean" ||
    typeof value.tipoVenta !== "string" ||
    !Array.isArray(value.variantes) ||
    value.variantes.some((v) => !v.id || typeof v.precioBase !== "string")
  )
    throw new Error("El servidor devolvió un producto no válido.");
  return {
    id: value.id,
    nombre: value.nombre,
    skuPadre: value.skuPadre,
    descripcionCorta: value.descripcionCorta ?? null,
    tieneVariantes: value.tieneVariantes,
    tipoVenta: value.tipoVenta,
    aplicaIva: value.aplicaIva,
    tasaIva: String(value.tasaIva),
    isActive: value.isActive,
    variantes: value.variantes.map((v) => ({
      id: v.id,
      precioBase: v.precioBase,
      isDefault: v.isDefault,
    })),
  };
}
export function productDraft(product: ProductDetail): ProductDraft {
  return {
    nombre: product.nombre,
    skuPadre: product.skuPadre,
    descripcionCorta: product.descripcionCorta ?? "",
    precioBase: product.variantes[0]?.precioBase ?? "",
    codigoBarras: "",
    aplicaIva: product.aplicaIva,
    tasaIva: product.tasaIva,
  };
}
export async function getProduct(id: string) {
  return productDto(await api.get<ProductDetail>(`/t/productos/${encodeURIComponent(id)}`));
}
export async function listProducts(query: string, page: number) {
  const data = await api.get<{
    items: ProductDetail[];
    total: number;
    page: number;
    pageSize: number;
  }>(`/t/productos?pageSize=30&page=${page}&q=${encodeURIComponent(query.trim())}`);
  if (!Array.isArray(data?.items) || !Number.isInteger(data.total))
    throw new Error("No se pudo verificar el catálogo.");
  return { ...data, items: data.items.map(productDto) };
}
export async function saveProduct(draft: ProductDraft, current: ProductDetail | null) {
  const result = current
    ? await api.patch<ProductDetail>(
        `/t/productos/${encodeURIComponent(current.id)}`,
        updateProductBody(draft, current),
      )
    : await api.post<ProductDetail>("/t/productos", createProductBody(draft));
  return productDto(result);
}
export function productFailure(error: unknown): string {
  if (error instanceof ApiError && error.status === 403)
    return "No tienes permiso para guardar productos.";
  if (error instanceof ApiError && error.status === 409)
    return "El código ya existe o el producto cambió. Consulta su estado antes de guardar otra vez.";
  if (error instanceof ApiError && error.status === 400)
    return "Revisa los campos. El servidor rechazó la solicitud.";
  return "No se pudo confirmar el guardado. Consulta el producto antes de repetir la operación.";
}
