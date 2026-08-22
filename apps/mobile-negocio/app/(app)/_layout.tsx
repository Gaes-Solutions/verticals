import { useAuth } from "@/lib/auth-store";
import { Redirect, Tabs } from "expo-router";

export default function AppLayout() {
  const { status, user } = useAuth();
  if (status !== "signedIn") return <Redirect href="/login" />;

  // Gating por permisos: el dueño (isOwner) ve todo; el resto según sus permisos.
  const puede = (perm: string) =>
    user?.isOwner === true || (user?.permissions ?? []).includes(perm);

  return (
    <Tabs screenOptions={{ tabBarActiveTintColor: "#0f766e", headerShown: true }}>
      <Tabs.Screen name="index" options={{ title: "Inicio" }} />
      <Tabs.Screen
        name="ventas"
        options={{ title: "Ventas", href: puede("ventas.leer") ? undefined : null }}
      />
      <Tabs.Screen
        name="productos"
        options={{ title: "Productos", href: puede("productos.leer") ? undefined : null }}
      />
      <Tabs.Screen
        name="reportes"
        options={{ title: "Reportes", href: puede("reportes.ventas") ? undefined : null }}
      />
      <Tabs.Screen name="cuenta" options={{ title: "Cuenta" }} />
    </Tabs>
  );
}
