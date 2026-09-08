import { KIOSKO_TOKEN_KEY } from "@/config";
import { activateKiosk, kioskFailure } from "@/lib/recovery";
import { secureStorage } from "@/lib/storage";
import { validateKioskoToken } from "@/services/kiosko";
import { colors, radius, space } from "@/theme";
import { Button, Icon, Input } from "@/ui";
import { useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

export default function Setup() {
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const queryClient = useQueryClient();

  const guardar = async () => {
    setBusy(true);
    setError("");
    try {
      await activateKiosk(token, validateKioskoToken, (value) =>
        secureStorage.set(KIOSKO_TOKEN_KEY, value),
      );
      queryClient.removeQueries({ queryKey: ["kiosko-config"] });
      queryClient.removeQueries({ queryKey: ["kiosko-idle"] });
      setToken("");
      router.replace("/verificador");
    } catch (err) {
      setError(kioskFailure(err).message);
    } finally {
      setBusy(false);
    }
  };

  const confirmSave = () =>
    Alert.alert(
      "Configuración del encargado",
      "Confirma que eres el encargado y deseas activar este dispositivo con el token del panel. La configuración anterior se reemplaza solo después de validar el nuevo token.",
      [
        { text: "Cancelar", style: "cancel" },
        { text: "Validar y activar", onPress: () => void guardar() },
      ],
    );

  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
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
            secureTextEntry
            editable={!busy}
          />
          <View style={{ height: space.md }} />
          <Button
            label="Activar verificador"
            icon="checkmark-circle"
            busy={busy}
            disabled={token.trim().length < 5}
            onPress={confirmSave}
          />
          {error ? (
            <Text accessibilityRole="alert" style={s.error}>
              {error}
            </Text>
          ) : null}
          <Button
            label="Volver al verificador"
            variant="ghost"
            disabled={busy}
            onPress={() => router.replace("/verificador")}
          />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: { flexGrow: 1, alignItems: "center", justifyContent: "center", padding: space.lg },
  error: { color: colors.danger, marginVertical: space.md },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    padding: space.xxl,
    width: "100%",
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
