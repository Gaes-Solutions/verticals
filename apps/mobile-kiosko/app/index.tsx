import { KIOSKO_TOKEN_KEY } from "@/config";
import { secureStorage } from "@/lib/storage";
import { colors } from "@/theme";
import { Redirect } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";

export default function Index() {
  const [estado, setEstado] = useState<"cargando" | "sin-token" | "listo">("cargando");
  useEffect(() => {
    secureStorage.get(KIOSKO_TOKEN_KEY).then((t) => setEstado(t ? "listo" : "sin-token"));
  }, []);
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
