import { KIOSKO_TOKEN_KEY } from "@/config";
import { secureStorage } from "@/lib/storage";
import { colors, space } from "@/theme";
import { Button, Screen } from "@/ui";
import { Redirect } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text } from "react-native";

export default function Index() {
  const [estado, setEstado] = useState<"cargando" | "sin-token" | "listo" | "error">("cargando");
  const load = () => {
    setEstado("cargando");
    secureStorage
      .get(KIOSKO_TOKEN_KEY)
      .then((t) => setEstado(t ? "listo" : "sin-token"))
      .catch(() => setEstado("error"));
  };
  useEffect(load, []);
  if (estado === "error")
    return (
      <Screen style={s.center}>
        <Text style={s.errorText}>
          No se pudo leer la configuración segura del dispositivo. Desbloquea el dispositivo y
          vuelve a intentar.
        </Text>
        <Button label="Reintentar" onPress={load} />
      </Screen>
    );
  if (estado === "cargando") {
    return (
      <Screen style={s.center}>
        <ActivityIndicator size="large" color={colors.brand} />
      </Screen>
    );
  }
  return <Redirect href={estado === "listo" ? "/verificador" : "/setup"} />;
}

const s = StyleSheet.create({
  center: { alignItems: "center", justifyContent: "center", padding: space.lg },
  errorText: {
    color: colors.text,
    fontSize: 16,
    textAlign: "center",
    marginBottom: space.lg,
  },
});
