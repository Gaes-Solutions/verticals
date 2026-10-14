import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useAuth } from "../lib/auth-store";
import { cartCount } from "../lib/cart-feedback";
import { accountCartKey, useCart } from "../lib/cart-store";
import { money } from "../lib/format";
import { colors, commerce, radius, shadow } from "../theme";
import { Icon } from "./Icon";

export function CartDock({ showCart = true }: { showCart?: boolean }) {
  const { tenantSlug, user } = useAuth();
  const cart = useCart();
  const owner = tenantSlug && user ? accountCartKey(tenantSlug, user.id) : null;
  if (!owner || cart.owner !== owner) return null;
  const count = cartCount(cart.lines);
  if (!showCart || !count) return null;
  return (
    <View style={s.wrap}>
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
            <Text style={s.subtitle}>
              {cart.sync === "error"
                ? "Falta guardar · revisa tu carrito"
                : cart.sync === "saved"
                  ? "Guardado en tu cuenta"
                  : "Guardando tus artículos…"}
            </Text>
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
