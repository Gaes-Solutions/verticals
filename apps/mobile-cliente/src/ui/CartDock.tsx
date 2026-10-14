import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useAuth } from "../lib/auth-store";
import { accountCartKey, useCart } from "../lib/cart-store";
import { checkoutBlocksCart, useCheckout } from "../lib/checkout-store";
import { money } from "../lib/format";
import { colors, commerce, radius, shadow } from "../theme";
import { Icon } from "./Icon";

export function CartDock({ showCart = true }: { showCart?: boolean }) {
  const { tenantSlug, user } = useAuth();
  const cart = useCart();
  const checkout = useCheckout();
  const owner = tenantSlug && user ? accountCartKey(tenantSlug, user.id) : null;
  const [, tick] = useState(0);
  useEffect(() => {
    if (!cart.lastEdit) return;
    const t = setTimeout(
      () => tick((n) => n + 1),
      Math.max(0, cart.lastEdit.expiresAt - Date.now()) + 50,
    );
    return () => clearTimeout(t);
  }, [cart.lastEdit]);
  if (!owner || cart.owner !== owner) return null;
  const undo =
    cart.lastEdit &&
    cart.lastEdit.owner === owner &&
    cart.lastEdit.expiresAt > Date.now() &&
    !checkoutBlocksCart(checkout, owner);
  const count = cart.lines.reduce((n, item) => n + item.cantidad, 0);
  if ((!showCart || !count) && !undo) return null;
  return (
    <View style={s.wrap}>
      {undo ? (
        <View style={s.notice} accessibilityLiveRegion="polite">
          <Icon name="checkmark-circle" size={20} color={colors.brand} />
          <Text style={s.noticeText}>Carrito actualizado</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Deshacer último cambio"
            hitSlop={8}
            onPress={() => {
              cart.undo(owner);
            }}
            style={s.undo}
          >
            <Text style={s.undoText}>Deshacer</Text>
          </Pressable>
        </View>
      ) : null}
      {showCart && count > 0 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Ver carrito, ${count} artículos`}
          onPress={() => router.push("/(app)/carrito")}
          style={s.cart}
        >
          <View style={s.badge}>
            <Icon name="bag-handle-outline" color={commerce.forest} size={22} />
            <Text style={s.count}>{count}</Text>
          </View>
          <View style={s.words}>
            <Text style={s.title}>Tu carrito</Text>
            <Text style={s.subtitle}>Continúa cuando quieras</Text>
          </View>
          <Text style={s.total}>
            {cart.sync === "saved" && cart.quote ? money(cart.quote.total) : "Ver carrito"}
          </Text>
          <Icon name="arrow-forward" color={colors.white} size={20} />
        </Pressable>
      ) : null}
    </View>
  );
}
const s = StyleSheet.create({
  wrap: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 10,
    gap: 8,
    backgroundColor: colors.bg,
  },
  notice: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.md,
    backgroundColor: commerce.sage,
  },
  noticeText: { flex: 1, color: commerce.forest, fontSize: 13 },
  undo: { paddingVertical: 10, paddingHorizontal: 4 },
  undoText: { fontWeight: "800", color: colors.brand, fontSize: 13 },
  cart: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: commerce.forest,
    borderRadius: radius.lg,
    padding: 14,
    ...shadow.card,
  },
  badge: {
    backgroundColor: commerce.gold,
    borderRadius: 12,
    padding: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  count: { fontWeight: "800", color: commerce.forest },
  words: { flex: 1 },
  title: { color: colors.white, fontSize: 15, fontWeight: "800" },
  subtitle: { color: colors.onBrandMuted, fontSize: 11, marginTop: 2 },
  total: { color: colors.white, fontWeight: "800", fontSize: 15 },
});
