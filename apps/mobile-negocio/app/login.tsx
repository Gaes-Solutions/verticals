import { useAuth } from "@/lib/auth-store";
import { colors, radius, space } from "@/theme";
import { Button, Icon, Input } from "@/ui";
import { Redirect } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";

export default function Login() {
  const { status, error, login, submitMfa } = useAuth();
  const [tenant, setTenant] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  if (status === "signedIn") return <Redirect href="/(app)" />;
  const esMfa = status === "mfa";

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    await fn();
    setBusy(false);
  };

  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        <View style={s.logo}>
          <Icon name="storefront" size={34} color={colors.white} />
        </View>
        <Text style={s.brand}>GaesSoft</Text>
        <Text style={s.sub}>{esMfa ? "Verificación en dos pasos" : "Panel del negocio"}</Text>

        <View style={s.card}>
          {esMfa ? (
            <>
              <Input
                label="Código de tu app de autenticación"
                icon="shield-checkmark"
                value={code}
                onChangeText={setCode}
                placeholder="123456"
                keyboardType="number-pad"
                maxLength={6}
                autoFocus
              />
              <Button
                label="Entrar"
                icon="log-in"
                busy={busy}
                onPress={() => run(() => submitMfa(code))}
              />
            </>
          ) : (
            <>
              <Input
                label="Negocio"
                icon="business"
                value={tenant}
                onChangeText={setTenant}
                placeholder="mi-negocio"
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
              />
              <Input
                label="Contraseña"
                icon="lock-closed"
                value={password}
                onChangeText={setPassword}
                placeholder="••••••••"
                secureTextEntry
              />
              <Button
                label="Entrar"
                icon="log-in"
                busy={busy}
                onPress={() => run(() => login(tenant.trim(), email.trim(), password))}
              />
            </>
          )}
          {error ? (
            <View style={s.err}>
              <Icon name="alert-circle" size={16} color={colors.danger} />
              <Text style={s.errText}>{error}</Text>
            </View>
          ) : null}
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
    fontSize: 28,
    fontWeight: "800",
    color: colors.brand,
    textAlign: "center",
    marginTop: space.md,
  },
  sub: { fontSize: 14, color: colors.muted, textAlign: "center", marginBottom: space.xl },
  card: { backgroundColor: colors.card, borderRadius: radius.xl, padding: space.xl, gap: space.md },
  err: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 },
  errText: { color: colors.danger, fontSize: 14, flex: 1 },
});
