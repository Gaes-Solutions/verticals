import { useAuth } from "@/lib/auth-store";
import { cartCount } from "@/lib/cart-feedback";
import { accountCartKey, useCart } from "@/lib/cart-store";
import { useCartSync } from "@/lib/use-cart-sync";
import { colors } from "@/theme";
import { Icon, type IconName } from "@/ui";
import { CartFeedback } from "@/ui/CartFeedback";
import { Tabs } from "expo-router";
import { View } from "react-native";

export default function AppLayout() {
  useCartSync();
  // Sin sesión NO se manda al login: el catálogo se mira como en cualquier
  // tienda en línea. Las pestañas de lo personal se esconden hasta que entre,
  // y cada una invita a entrar si se llega por otro camino.
  const { status, tenantSlug, user } = useAuth();
  const conSesion = status === "signedIn";
  const cart = useCart();
  const owner = tenantSlug && user ? accountCartKey(tenantSlug, user.id) : null;
  const count = conSesion && cart.owner === owner ? cartCount(cart.lines) : 0;

  const tab =
    (name: IconName) =>
    ({ color, size }: { color: string; size: number }) => (
      <Icon name={name} size={size} color={color} />
    );
  const hidden = { href: null } as const;
  const soloConSesion = conSesion ? {} : hidden;

  return (
    <View style={{ flex: 1 }}>
      <Tabs
        screenOptions={{
          tabBarActiveTintColor: colors.brand,
          tabBarInactiveTintColor: colors.faint,
          headerStyle: { backgroundColor: colors.card },
          headerTitleStyle: { color: colors.ink, fontWeight: "800" },
          tabBarStyle: { borderTopColor: colors.line, backgroundColor: colors.card, paddingTop: 6 },
          tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
        }}
      >
        <Tabs.Screen
          name="tienda"
          options={{ title: "Tienda", headerShown: false, tabBarIcon: tab("storefront") }}
        />
        <Tabs.Screen name="producto" options={{ ...hidden, title: "Artículo" }} />
        <Tabs.Screen name="checkout" options={{ ...hidden, title: "Entrega y pago" }} />
        <Tabs.Screen
          name="carrito"
          options={{
            ...soloConSesion,
            title: "Carrito",
            tabBarIcon: tab("cart-outline"),
            tabBarBadge: count > 0 ? (count > 99 ? "99+" : count) : undefined,
          }}
        />
        <Tabs.Screen
          name="index"
          options={{ ...soloConSesion, title: "Pedidos", tabBarIcon: tab("bag-handle") }}
        />
        <Tabs.Screen
          name="favoritos"
          options={{ ...soloConSesion, title: "Favoritos", tabBarIcon: tab("heart") }}
        />
        <Tabs.Screen
          name="notificaciones"
          options={{ ...soloConSesion, title: "Avisos", tabBarIcon: tab("notifications") }}
        />
        <Tabs.Screen
          name="cuenta"
          options={{ ...soloConSesion, title: "Cuenta", tabBarIcon: tab("person-circle") }}
        />
        <Tabs.Screen name="direcciones" options={{ ...hidden, title: "Direcciones" }} />
        <Tabs.Screen name="perfil" options={{ ...hidden, title: "Editar perfil" }} />
      </Tabs>
      <CartFeedback />
    </View>
  );
}
