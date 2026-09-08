import { ApiError } from "@gaespos/api-client";
import { create } from "zustand";
import {
  type CheckoutInput,
  type PaymentAttempt,
  latestCheckout,
  lookupCheckout,
  prepareCheckout,
  submitCheckout,
} from "../services/checkout";
import { useCart } from "./cart-store";
import { restoreRemoteCart } from "./cart-sync";
import { paymentOutcome } from "./checkout-model";

export function checkoutFailure(error: unknown): string {
  if (error instanceof ApiError && error.status === 409)
    return "La compra requiere verificación. Consulta este mismo intento y no vuelvas a pagar. Si no se resuelve, contacta a la tienda.";
  return "No pudimos verificar la compra. Conservamos el intento: consulta su estado antes de volver a pagar.";
}
interface CheckoutState {
  owner: string | null;
  version: number;
  busy: boolean;
  recovered: boolean;
  prepared: { idempotencyKey: string; carritoId: string } | null;
  attempt: PaymentAttempt | null;
  outcome: "confirmed" | "failed" | "pending" | null;
  submitted: boolean;
  error: string | null;
  reset: () => void;
}
export const useCheckout = create<CheckoutState>((set, get) => ({
  owner: null,
  version: 0,
  busy: false,
  recovered: false,
  prepared: null,
  attempt: null,
  outcome: null,
  submitted: false,
  error: null,
  reset: () =>
    set({
      owner: null,
      version: get().version + 1,
      busy: false,
      recovered: false,
      prepared: null,
      attempt: null,
      outcome: null,
      submitted: false,
      error: null,
    }),
}));
function begin(owner: string) {
  if (useCheckout.getState().owner !== owner) {
    useCheckout.getState().reset();
    useCheckout.setState({ owner });
  }
  const version = useCheckout.getState().version;
  return () => useCheckout.getState().owner === owner && useCheckout.getState().version === version;
}
async function refreshAfterConfirmed(owner: string, attempt: PaymentAttempt) {
  const cart = useCart.getState();
  if (
    paymentOutcome(attempt, "lookup") === "confirmed" &&
    cart.owner === owner &&
    cart.cartId === attempt.carritoId
  )
    await restoreRemoteCart(owner);
}
export async function recoverCheckout(owner: string): Promise<void> {
  const current = begin(owner);
  if (useCheckout.getState().busy) return;
  useCheckout.setState({ busy: true, error: null });
  const prepared = useCheckout.getState().prepared;
  try {
    const attempt =
      prepared && useCheckout.getState().submitted
        ? await lookupCheckout(prepared.idempotencyKey)
        : await latestCheckout();
    if (current()) {
      useCheckout.setState({
        attempt,
        prepared: { idempotencyKey: attempt.idempotencyKey, carritoId: attempt.carritoId },
        recovered: true,
        submitted: true,
        outcome: paymentOutcome(attempt, "lookup"),
      });
      await refreshAfterConfirmed(owner, attempt);
    }
  } catch (error) {
    if (!current()) return;
    if (error instanceof ApiError && error.status === 404 && !useCheckout.getState().submitted)
      useCheckout.setState({ recovered: true });
    else useCheckout.setState({ error: checkoutFailure(error) });
  } finally {
    if (current()) useCheckout.setState({ busy: false });
  }
}
export async function initiateCheckout(
  owner: string,
  input: Omit<CheckoutInput, "idempotencyKey">,
): Promise<void> {
  const current = begin(owner);
  const state = useCheckout.getState();
  if (state.busy || !state.recovered) return;
  if (state.submitted && state.outcome !== "confirmed") {
    await recoverCheckout(owner);
    return;
  }
  if (state.prepared?.carritoId === input.carritoId && state.outcome === "confirmed") return;
  useCheckout.setState({ busy: true, error: null });
  try {
    const prepared = await prepareCheckout(input.carritoId);
    if (!current()) return;
    useCheckout.setState({ prepared, submitted: true, attempt: null, outcome: "pending" });
    const attempt = await submitCheckout({ ...input, idempotencyKey: prepared.idempotencyKey });
    if (!current()) return;
    useCheckout.setState({ attempt, outcome: paymentOutcome(attempt, "submission") });
  } catch (error) {
    if (current()) useCheckout.setState({ error: checkoutFailure(error) });
  } finally {
    if (current()) useCheckout.setState({ busy: false });
  }
}

export function checkoutBlocksCart(
  state: Pick<CheckoutState, "owner" | "busy" | "submitted" | "outcome">,
  owner: string | null = state.owner,
): boolean {
  return (
    state.owner === owner && (state.busy || (state.submitted && state.outcome !== "confirmed"))
  );
}
