import type { StoreProduct } from "../services/comercio";
import { validQuantity } from "./cart-store";
export function variantStock(product: StoreProduct, variant: string): number | null {
  return product.stockPorVariante?.[variant] ?? (product.stockPublico === 0 ? 0 : null);
}
export function initialVariant(product: StoreProduct): string {
  const available = product.variantes.filter((v) => variantStock(product, v.id) !== 0);
  return available.length === 1 ? available[0].id : "";
}
export function canAddQuantity(
  product: StoreProduct,
  variant: string,
  quantity: string | number,
  already: number,
): boolean {
  const amount = validQuantity(quantity);
  const stock = variantStock(product, variant);
  return (
    product.variantes.some((v) => v.id === variant) &&
    amount !== null &&
    (stock === null || Math.round((already + amount) * 1000) / 1000 <= stock)
  );
}
