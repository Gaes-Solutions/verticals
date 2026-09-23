import { authApi } from "@/lib/api";
import { colors, radius, space } from "@/theme";
import { Button, Icon, Input } from "@/ui";
import { ApiError, NetworkError, solicitarResetContrasena } from "@gaespos/api-client";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";

/** "Olvidé mi contraseña": pide el enlace por email. El mensaje de éxito es
 *  genérico aunque el correo no exista (igual contrato que la tienda web). */
export default function RecuperarContrasena() {
  const router = useRouter();
  const params = useLocalSearchParams<{ tenant?: string }>();
  const [tenant, setTenant] = useState(params.tenant ?? "");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enviado, setEnviado] = useState(false);

  const enviar = async () => {
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      await solicitarResetContrasena(authApi, {
        tenantSlug: tenant.trim(),
        email: email.trim(),
      });
      setEnviado(true);
    } catch (e) {
      setError(
        e instanceof NetworkError
          ? "Sin conexión. Intenta nuevamente."
          : e instanceof ApiError
            ? e.message
            : "No se pudo enviar el enlace. Intenta nuevamente.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        <View style={s.logo}>
          <Icon name="key" size={34} color={colors.white} />
        </View>
        <Text style={s.brand}>Recuperar contraseña</Text>
        <Text style={s.sub}>
          Te enviaremos un enlace a tu correo para restablecerla (vence en 1 hora).
        </Text>

        <View style={s.card}>
          {enviado ? (
            <>
              <View style={s.ok}>
                <Icon name="mail" size={18} color={colors.brand} />
                <Text style={s.okText}>
                  Si el correo existe en esta tienda, te enviamos un enlace para restablecer tu
                  contraseña.
                </Text>
              </View>
              <Button
                label="Volver a iniciar sesión"
                icon="log-in"
                busy={busy}
                onPress={() => router.push("/login")}
              />
            </>
          ) : (
            <>
              <Input
                label="Tienda"
                icon="storefront"
                value={tenant}
                onChangeText={setTenant}
                placeholder="mi-tienda"
                autoCapitalize="none"
                autoCorrect={false}
              />
              <Input
                label="Correo"
                icon="mail"
                value={email}
                onChangeText={setEmail}
                placeholder="tu@correo.com"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="done"
                onSubmitEditing={enviar}
              />
              <Button label="Enviar enlace" icon="send" busy={busy} onPress={enviar} />
              {error ? (
                <View style={s.err}>
                  <Icon name="alert-circle" size={16} color={colors.danger} />
                  <Text style={s.errText}>{error}</Text>
                </View>
              ) : null}
              <Button
                label="Volver a iniciar sesión"
                variant="ghost"
                busy={busy}
                onPress={() => router.push("/login")}
              />
            </>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scroll: { flexGrow: 1, justifyContent: "center", padding: space.xl },
  logo: {
    width: 68,
    height: 68,
    borderRadius: radius.xl,
    backgroundColor: colors.brand,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
  },
  brand: {
    fontSize: 24,
    fontWeight: "800",
    color: colors.brand,
    textAlign: "center",
    marginTop: space.md,
  },
  sub: { fontSize: 14, color: colors.muted, textAlign: "center", marginBottom: space.xl },
  card: { backgroundColor: colors.card, borderRadius: radius.xl, padding: space.xl, gap: space.md },
  ok: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  okText: { color: colors.text, fontSize: 14, flex: 1 },
  err: { flexDirection: "row", alignItems: "center", gap: 6 },
  errText: { color: colors.danger, fontSize: 14, flex: 1 },
});
