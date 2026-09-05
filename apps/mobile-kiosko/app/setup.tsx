import { KIOSKO_TOKEN_KEY } from "@/config";
import { secureStorage } from "@/lib/storage";
import { colors, radius, space } from "@/theme";
import { Button, Icon, Input } from "@/ui";
import { router } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from "react-native";

export default function Setup() {
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);

  const guardar = async () => {
    setBusy(true);
    await secureStorage.set(KIOSKO_TOKEN_KEY, token.trim());
    router.replace("/verificador");
  };

  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={s.card}>
        <View style={s.logo}>
          <Icon name="pricetags" size={34} color={colors.white} />
        </View>
        <Text style={s.titulo}>Configurar verificador</Text>
        <Text style={s.sub}>
          Pega el token del dispositivo que generaste en el panel (Kioskos).
        </Text>
        <View style={{ height: space.md }} />
        <Input
          label="Token del dispositivo"
          icon="key"
          value={token}
          onChangeText={setToken}
          placeholder="mi-tienda.xxxxxxxx"
          autoCapitalize="none"
          autoCorrect={false}
        />
        <View style={{ height: space.md }} />
        <Button
          label="Activar verificador"
          icon="checkmark-circle"
          busy={busy}
          disabled={token.trim().length < 5}
          onPress={guardar}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: "center",
    justifyContent: "center",
    padding: space.xl,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    padding: space.xxl,
    width: "70%",
    maxWidth: 560,
    alignItems: "stretch",
  },
  logo: {
    width: 68,
    height: 68,
    borderRadius: radius.xl,
    backgroundColor: colors.brand,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
  },
  titulo: {
    fontSize: 24,
    fontWeight: "800",
    color: colors.ink,
    textAlign: "center",
    marginTop: space.md,
  },
  sub: { fontSize: 15, color: colors.muted, textAlign: "center", marginTop: 4 },
});
