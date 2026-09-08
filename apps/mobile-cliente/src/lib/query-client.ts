import { QueryClient } from "@tanstack/react-query";
import { useCart } from "./cart-store";
import { useCheckout } from "./checkout-store";

export const queryClient = new QueryClient();

export async function clearAccountCache(): Promise<void> {
  useCart.getState().clear();
  useCheckout.getState().reset();
  await queryClient.cancelQueries();
  queryClient.clear();
}
