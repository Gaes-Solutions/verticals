import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useAuth } from "../lib/auth-store";
import { cartCount } from "../lib/cart-feedback";
import { accountCartKey, useCart } from "../lib/cart-store";
import { commerce } from "../theme";
import { Icon } from "./Icon";
export function CartButton() {
  const { tenantSlug, user, status } = useAuth();
  const cart = useCart();
  const owner = tenantSlug && user ? accountCartKey(tenantSlug, user.id) : null;
  const count = status === "signedIn" && cart.owner === owner ? cartCount(cart.lines) : 0;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Ver carrito, ${count} artículos`}
      onPress={() => router.push("/(app)/carrito")}
      style={s.button}
    >
      <Icon name="bag-handle-outline" color={commerce.forest} size={24} />
      {count > 0 ? (
        <View style={s.badge}>
          <Text style={s.count}>{count > 99 ? "99+" : count}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}
const s = StyleSheet.create({
  button: {
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    padding: 10,
  },
  badge: {
    position: "absolute",
    right: 0,
    top: 0,
    backgroundColor: commerce.gold,
    minWidth: 19,
    height: 19,
    borderRadius: 10,
    paddingHorizontal: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  count: { color: commerce.forest, fontSize: 10, fontWeight: "800" },
});
