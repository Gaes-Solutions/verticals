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
      ? await calculateCart(lines, cart.coupon)
      : await abandonCart().then(() => null);
    if (current()) useCart.getState().saved(owner, revision, result);
  } catch (error) {
    if (current()) useCart.getState().failed(owner, commerceError(error));
  }
}
