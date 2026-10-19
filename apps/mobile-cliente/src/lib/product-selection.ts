import type { StoreProduct } from "../services/comercio";
import { useCart, validQuantity } from "./cart-store";
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
  const total =
    amount === null ? null : validQuantity(Math.round((already + amount) * 1000) / 1000);
  return (
    product.variantes.some((v) => v.id === variant) &&
    amount !== null &&
    (already === 0 || validQuantity(already) !== null) &&
    total !== null &&
    (stock === null || total <= stock)
  );
}

/** Recheck the live cart: two taps can happen before React renders the first addition. */
export function addAvailableProduct(
  owner: string,
  product: StoreProduct,
  variant: string,
  quantity: string | number,
  name: string,
): void {
  const cart = useCart.getState();
  if (!owner || cart.owner !== owner || !cart.ready)
    throw new Error("El carrito cambió. Revisa tu cuenta y vuelve a intentar.");
  const already = cart.lines.find((line) => line.varianteId === variant)?.cantidad ?? 0;
  if (!canAddQuantity(product, variant, quantity, already))
    throw new Error("La cantidad supera lo disponible, incluyendo lo que ya tienes en el carrito.");
  const amount = validQuantity(quantity);
  if (amount !== null) cart.add(owner, variant, amount, name);
}
