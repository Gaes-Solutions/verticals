import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../lib/auth-store";
import { cartMessage } from "../lib/cart-feedback";
import { accountCartKey, useCart } from "../lib/cart-store";
import { saveRemoteCart } from "../lib/cart-sync";
import { checkoutBlocksCart, useCheckout } from "../lib/checkout-store";
import { colors, commerce, shadow } from "../theme";
import { Icon } from "./Icon";
export function CartFeedback() {
  const insets = useSafeAreaInsets();
  const { tenantSlug, user, status } = useAuth();
  const cart = useCart();
  const checkout = useCheckout();
  const [, tick] = useState(0);
  const notice = cart.notice;
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(
      () => tick((n) => n + 1),
      Math.max(0, notice.expiresAt - Date.now()) + 50,
    );
    return () => clearTimeout(timer);
  }, [notice]);
  const owner = tenantSlug && user ? accountCartKey(tenantSlug, user.id) : null;
  if (
    status !== "signedIn" ||
    !owner ||
    cart.owner !== owner ||
    !notice ||
    notice.owner !== owner ||
    notice.scopeVersion !== cart.scopeVersion ||
    (notice.expiresAt <= Date.now() && cart.sync !== "error")
  )
    return null;
  const locked = checkoutBlocksCart(checkout, owner);
  const failed = cart.sync === "error";
  const saved = cart.sync === "saved";
  return (
    <View pointerEvents="box-none" style={[s.overlay, { top: insets.top + 58 }]}>
      <View style={[s.card, failed && s.failed]} accessibilityLiveRegion="polite">
        <View style={s.row}>
          <Icon
            name={failed ? "alert-circle" : "checkmark-circle"}
            color={failed ? colors.warn : colors.brand}
            size={24}
          />
          <View style={s.words}>
            <Text style={s.title} numberOfLines={2}>
              {cartMessage(notice, cart.names[notice.variant] ?? "Artículo")}
            </Text>
            <Text style={s.status}>
              {failed
                ? "Está en la app; falta guardarlo en tu cuenta."
                : saved
                  ? "Guardado en tu cuenta"
                  : "Guardando en tu cuenta…"}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Cerrar confirmación del carrito"
            hitSlop={8}
            onPress={cart.dismissNotice}
            style={s.close}
          >
            <Icon name="close" size={20} />
          </Pressable>
        </View>
        <View style={s.actions}>
          {cart.lastEdit && cart.lastEdit.expiresAt > Date.now() && !locked ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Deshacer último cambio"
              onPress={() => cart.undo(owner)}
              style={s.action}
            >
              <Text style={s.actionText}>Deshacer</Text>
            </Pressable>
          ) : null}
          {failed && !locked ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Reintentar guardar carrito"
              onPress={() => {
                cart.retry();
                void saveRemoteCart(owner);
              }}
              style={s.action}
            >
              <Text style={s.actionText}>Reintentar</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );
}
const s = StyleSheet.create({
  overlay: {
    position: "absolute",
    left: 16,
    right: 16,
    zIndex: 100,
    maxWidth: 600,
    alignSelf: "center",
  },
  card: {
    borderRadius: 17,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: "#b9d5c6",
    padding: 14,
    ...shadow.card,
    elevation: 8,
  },
  failed: { borderColor: colors.warn },
  row: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  words: { flex: 1, gap: 4 },
  title: { color: commerce.forest, fontSize: 14, lineHeight: 20, fontWeight: "800" },
  status: { color: colors.muted, fontSize: 11, lineHeight: 16 },
  close: { padding: 4 },
  actions: { flexDirection: "row", justifyContent: "flex-end", gap: 10 },
  action: { minHeight: 40, justifyContent: "center", paddingHorizontal: 10 },
  actionText: { color: colors.brand, fontSize: 13, fontWeight: "800" },
});
