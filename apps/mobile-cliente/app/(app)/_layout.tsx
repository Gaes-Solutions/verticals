import { useAuth } from "@/lib/auth-store";
import { colors } from "@/theme";
import { Icon, type IconName } from "@/ui";
import { Redirect, Tabs } from "expo-router";

export default function AppLayout() {
  const status = useAuth((sel) => sel.status);
  if (status !== "signedIn") return <Redirect href="/login" />;

  const tab =
    (name: IconName) =>
    ({ color, size }: { color: string; size: number }) => (
      <Icon name={name} size={size} color={color} />
    );
  const hidden = { href: null } as const;

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.brand,
        tabBarInactiveTintColor: colors.faint,
        headerStyle: { backgroundColor: colors.card },
        headerTitleStyle: { color: colors.ink, fontWeight: "800" },
        tabBarStyle: { borderTopColor: colors.line },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Pedidos", tabBarIcon: tab("bag-handle") }} />
      <Tabs.Screen name="favoritos" options={{ title: "Favoritos", tabBarIcon: tab("heart") }} />
      <Tabs.Screen
        name="notificaciones"
        options={{ title: "Avisos", tabBarIcon: tab("notifications") }}
      />
      <Tabs.Screen name="cuenta" options={{ title: "Cuenta", tabBarIcon: tab("person-circle") }} />
      <Tabs.Screen name="direcciones" options={{ ...hidden, title: "Direcciones" }} />
      <Tabs.Screen name="perfil" options={{ ...hidden, title: "Editar perfil" }} />
    </Tabs>
  );
}
