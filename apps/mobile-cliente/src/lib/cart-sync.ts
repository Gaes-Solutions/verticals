import { ApiError } from "@gaespos/api-client";
import { abandonCart, calculateCart, getActiveCart } from "../services/comercio";
import { useCart } from "./cart-store";
import { commerceError } from "./commerce-errors";

export async function restoreRemoteCart(owner: string): Promise<void> {
  useCart.getState().begin(owner);
  const { revision, scopeVersion } = useCart.getState();
  const current = () =>
    useCart.getState().owner === owner && useCart.getState().scopeVersion === scopeVersion;
  try {
    const cart = await getActiveCart();
    if (current()) useCart.getState().hydrate(owner, revision, cart);
  } catch (error) {
    if (!current()) return;
    if (error instanceof ApiError && error.status === 404)
      useCart.getState().hydrate(owner, revision, null);
    else {
      useCart.getState().failed(owner, commerceError(error));
      if (useCart.getState().owner === owner && useCart.getState().revision === revision)
        useCart.setState({ ready: false });
    }
  }
}
export async function saveRemoteCart(owner: string): Promise<void> {
  const cart = useCart.getState();
  if (cart.owner !== owner || cart.busy || !cart.ready) return;
  const { revision, lines, scopeVersion } = cart;
  const current = () =>
    useCart.getState().owner === owner && useCart.getState().scopeVersion === scopeVersion;
  useCart.setState({ busy: true, sync: "saving", syncError: null, quote: null });
  try {
    const result = lines.length
      ? await calculateCart(lines, cart.coupon, cart.remoteVersion)
      : await abandonCart(cart.remoteVersion).then(() => null);
    if (current()) useCart.getState().saved(owner, revision, result);
  } catch (error) {
    if (current() && error instanceof ApiError && error.code === "CART_CHANGED") {
      try {
        const remote = await getActiveCart().catch((error: unknown) => {
          if (error instanceof ApiError && error.status === 404) return null;
          throw error;
        });
        if (current()) {
          useCart.getState().hydrate(owner, useCart.getState().revision, remote);
          useCart
            .getState()
            .failed(
              owner,
              "El carrito cambió en otro dispositivo. Lo actualizamos; revisa los artículos y vuelve a aplicar tu cambio.",
            );
        }
      } catch {
        if (current()) useCart.getState().failed(owner, commerceError(error));
      }
    } else if (current()) useCart.getState().failed(owner, commerceError(error));
  }
}

/** Refresh only a clean cart. An arriving response cannot undo a newer local edit. */
export async function refreshRemoteCart(
  owner: string,
  canApply: () => boolean = () => true,
): Promise<void> {
  const before = useCart.getState();
  if (before.owner !== owner || !before.ready || before.busy || before.sync !== "saved") return;
  const { revision, scopeVersion } = before;
  try {
    const remote = await getActiveCart().catch((error: unknown) => {
      if (error instanceof ApiError && error.status === 404) return null;
      throw error;
    });
    const state = useCart.getState();
    if (
      state.owner === owner &&
      state.scopeVersion === scopeVersion &&
      state.revision === revision &&
      state.sync === "saved" &&
      !state.busy &&
      canApply()
    )
      state.hydrate(owner, revision, remote);
  } catch {
    /* Transient background failures must not clear a saved cart. */
  }
}
