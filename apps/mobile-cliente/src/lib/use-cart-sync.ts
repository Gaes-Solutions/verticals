import { useEffect } from "react";
import { AppState } from "react-native";
import { useAuth } from "./auth-store";
import { accountCartKey, useCart } from "./cart-store";
import { refreshRemoteCart, restoreRemoteCart, saveRemoteCart } from "./cart-sync";
import { checkoutBlocksCart, useCheckout } from "./checkout-store";

export function useCartSync(): void {
  const { status, tenantSlug, user } = useAuth();
  const owner =
    status === "signedIn" && tenantSlug && user ? accountCartKey(tenantSlug, user.id) : null;
  const { ready, busy, sync, revision } = useCart();
  const checkout = useCheckout();
  const locked = checkoutBlocksCart(checkout, owner);
  useEffect(() => {
    if (owner) void restoreRemoteCart(owner);
  }, [owner]);
  useEffect(() => {
    if (!owner || locked) return;
    let busy = false;
    const refresh = async () => {
      if (busy || AppState.currentState !== "active") return;
      busy = true;
      try {
        await refreshRemoteCart(owner, () => !checkoutBlocksCart(useCheckout.getState(), owner));
      } finally {
        busy = false;
      }
    };
    const timer = setInterval(() => void refresh(), 5000);
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void refresh();
    });
    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, [owner, locked]);
  useEffect(() => {
    if (locked || !owner || !ready || busy || sync !== "dirty") return;
    const timer = setTimeout(() => {
      if (useCart.getState().revision === revision) void saveRemoteCart(owner);
    }, 600);
    return () => clearTimeout(timer);
  }, [owner, ready, busy, sync, revision, locked]);
}
