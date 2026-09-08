import { KIOSKO_TOKEN_KEY } from "@/config";
import { secureStorage } from "@/lib/storage";
import { colors } from "@/theme";
import { Button } from "@/ui";
import { Redirect } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";

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
      <View style={{ flex: 1, justifyContent: "center", padding: 20 }}>
        <Text>
          No se pudo leer la configuración segura del dispositivo. Desbloquea el dispositivo y
          vuelve a intentar.
        </Text>
        <Button label="Reintentar" onPress={load} />
      </View>
    );
  if (estado === "cargando") {
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: colors.bg,
        }}
      >
        <ActivityIndicator size="large" color={colors.brand} />
      </View>
    );
  }
  return <Redirect href={estado === "listo" ? "/verificador" : "/setup"} />;
}
