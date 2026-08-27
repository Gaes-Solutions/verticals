import { useAuth } from "@/lib/auth-store";
import { colors } from "@/theme";
import { Icon, type IconName } from "@/ui";
import { Redirect, Tabs } from "expo-router";

export default function AppLayout() {
  const { status, user } = useAuth();
  if (status !== "signedIn") return <Redirect href="/login" />;

  const puede = (perm: string) =>
    user?.isOwner === true || (user?.permissions ?? []).includes(perm);

  const tab =
    (name: IconName) =>
    ({ color, size }: { color: string; size: number }) => (
      <Icon name={name} size={size} color={color} />
    );

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
      <Tabs.Screen name="index" options={{ title: "Inicio", tabBarIcon: tab("home") }} />
      <Tabs.Screen
        name="cobrar"
        options={{
          title: "Cobrar",
          tabBarIcon: tab("cart"),
          href: puede("ventas.crear") ? undefined : null,
        }}
      />
      <Tabs.Screen
        name="ventas"
        options={{
          title: "Ventas",
          tabBarIcon: tab("receipt"),
          href: puede("ventas.leer") ? undefined : null,
        }}
      />
      <Tabs.Screen
        name="inventario"
        options={{
          title: "Inventario",
          tabBarIcon: tab("cube"),
          href: puede("inventario.leer") ? undefined : null,
        }}
      />
      <Tabs.Screen name="cuenta" options={{ title: "Cuenta", tabBarIcon: tab("person-circle") }} />

      {/* Rutas fuera de la barra (se abren desde el Inicio) */}
      <Tabs.Screen name="productos" options={{ href: null, title: "Productos" }} />
      <Tabs.Screen name="pedidos" options={{ href: null, title: "Pedidos" }} />
      <Tabs.Screen name="clientes" options={{ href: null, title: "Clientes" }} />
      <Tabs.Screen name="reportes" options={{ href: null, title: "Reportes" }} />
    </Tabs>
  );
}
