import { useAuth } from "@/lib/auth-store";
import { Redirect, Tabs } from "expo-router";

export default function AppLayout() {
  const status = useAuth((sel) => sel.status);
  if (status !== "signedIn") return <Redirect href="/login" />;

  return (
    <Tabs screenOptions={{ tabBarActiveTintColor: "#4f46e5", headerShown: true }}>
      <Tabs.Screen name="index" options={{ title: "Pedidos" }} />
      <Tabs.Screen name="notificaciones" options={{ title: "Avisos" }} />
      <Tabs.Screen name="cuenta" options={{ title: "Cuenta" }} />
    </Tabs>
  );
}
