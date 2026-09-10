import { useAuth } from "@/lib/auth-store";
import { tiendaActual } from "@/lib/tienda";
import { Redirect } from "expo-router";
import { ActivityIndicator, View } from "react-native";

export default function Index() {
  const status = useAuth((s) => s.status);
  if (status === "loading") {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator size="large" color="#0f766e" />
      </View>
    );
  }
  // Sin sesión NO se manda al login: se abre la tienda, como cualquier tienda
  // en línea. El login solo aparece si todavía no sabemos de qué tienda es.
  if (status === "signedIn") return <Redirect href="/(app)" />;
  return <Redirect href={tiendaActual() ? "/(app)/tienda" : "/login"} />;
}
