import { useAuth } from "@/lib/auth-store";
import { tiendaActual } from "@/lib/tienda";
import { colors } from "@/theme";
import { Button, Screen } from "@/ui";
import { Redirect } from "expo-router";
import { ActivityIndicator, Text, View } from "react-native";

export default function Index() {
  const status = useAuth((s) => s.status);
  const error = useAuth((s) => s.error);
  const restore = useAuth((s) => s.restore);
  if (status === "loading") {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator size="large" color={colors.brand} />
      </View>
    );
  }
  if (status === "unverified") {
    return (
      <Screen style={{ justifyContent: "center", padding: 24, gap: 16 }}>
        <Text accessibilityRole="alert" style={{ color: colors.ink, textAlign: "center" }}>
          {error ?? "No pudimos verificar la cuenta guardada. Vuelve a intentar."}
        </Text>
        <Button label="Reintentar" onPress={() => void restore()} />
      </Screen>
    );
  }
  // Sin sesión NO se manda al login: se abre la tienda, como cualquier tienda
  // en línea. El login solo aparece si todavía no sabemos de qué tienda es.
  if (status === "signedIn") return <Redirect href="/(app)/tienda" />;
  return <Redirect href={tiendaActual() ? "/(app)/tienda" : "/login"} />;
}
