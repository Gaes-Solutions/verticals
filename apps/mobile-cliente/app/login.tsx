import { useAuth } from "@/lib/auth-store";
import { colors, radius, space } from "@/theme";
import { Button, Icon, Input } from "@/ui";
import { Redirect } from "expo-router";
import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

export default function Login() {
  const { status, error, login, registro } = useAuth();
  const [modo, setModo] = useState<"login" | "registro">("login");
  const [tenant, setTenant] = useState("");
  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  if (status === "signedIn") return <Redirect href="/(app)" />;
  const esRegistro = modo === "registro";

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    await fn();
    setBusy(false);
  };
  const enviar = () =>
    esRegistro
      ? run(() =>
          registro({
            tenantSlug: tenant.trim(),
            nombre: nombre.trim(),
            email: email.trim(),
            password,
            ...(telefono.trim() ? { telefono: telefono.trim() } : {}),
          }),
        )
      : run(() => login(tenant.trim(), email.trim(), password));

  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        <View style={s.logo}>
          <Icon name="bag-handle" size={34} color={colors.white} />
        </View>
        <Text style={s.brand}>GaesSoft</Text>
        <Text style={s.sub}>{esRegistro ? "Crea tu cuenta" : "Tu cuenta y pedidos"}</Text>

        <View style={s.card}>
          <Input
            label="Tienda"
            icon="storefront"
            value={tenant}
            onChangeText={setTenant}
            placeholder="mi-tienda"
            autoCapitalize="none"
            autoCorrect={false}
          />
          {esRegistro ? (
            <>
              <Input
                label="Nombre"
                icon="person"
                value={nombre}
                onChangeText={setNombre}
                placeholder="Tu nombre"
              />
              <Input
                label="Teléfono (opcional)"
                icon="call"
                value={telefono}
                onChangeText={setTelefono}
                placeholder="55 1234 5678"
                keyboardType="phone-pad"
              />
            </>
          ) : null}
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
            label={esRegistro ? "Crear cuenta" : "Entrar"}
            icon="log-in"
            busy={busy}
            onPress={enviar}
          />
          {error ? (
            <View style={s.err}>
              <Icon name="alert-circle" size={16} color={colors.danger} />
              <Text style={s.errText}>{error}</Text>
            </View>
          ) : null}
          <Pressable style={s.switch} onPress={() => setModo(esRegistro ? "login" : "registro")}>
            <Text style={s.switchText}>
              {esRegistro ? "¿Ya tienes cuenta? Inicia sesión" : "¿Nuevo? Crea tu cuenta"}
            </Text>
          </Pressable>
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
  err: { flexDirection: "row", alignItems: "center", gap: 6 },
  errText: { color: colors.danger, fontSize: 14, flex: 1 },
  switch: { alignItems: "center", marginTop: 4 },
  switchText: { color: colors.brand, fontWeight: "600", fontSize: 14 },
});
