import { useAuth } from "@/lib/auth-store";
import { Redirect } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
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

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    await fn();
    setBusy(false);
  };

  const esRegistro = modo === "registro";

  const enviar = () => {
    if (esRegistro) {
      run(() =>
        registro({
          tenantSlug: tenant.trim(),
          nombre: nombre.trim(),
          email: email.trim(),
          password,
          ...(telefono.trim() ? { telefono: telefono.trim() } : {}),
        }),
      );
    } else {
      run(() => login(tenant.trim(), email.trim(), password));
    }
  };

  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        <View style={s.card}>
          <Text style={s.brand}>GaesSoft</Text>
          <Text style={s.subtitle}>{esRegistro ? "Crea tu cuenta" : "Tu cuenta y pedidos"}</Text>

          <Text style={s.label}>Tienda</Text>
          <TextInput
            style={s.input}
            value={tenant}
            onChangeText={setTenant}
            placeholder="mi-tienda"
            autoCapitalize="none"
            autoCorrect={false}
          />

          {esRegistro ? (
            <>
              <Text style={s.label}>Nombre</Text>
              <TextInput
                style={s.input}
                value={nombre}
                onChangeText={setNombre}
                placeholder="Tu nombre"
              />
              <Text style={s.label}>Teléfono (opcional)</Text>
              <TextInput
                style={s.input}
                value={telefono}
                onChangeText={setTelefono}
                placeholder="55 1234 5678"
                keyboardType="phone-pad"
              />
            </>
          ) : null}

          <Text style={s.label}>Correo</Text>
          <TextInput
            style={s.input}
            value={email}
            onChangeText={setEmail}
            placeholder="tu@correo.com"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Text style={s.label}>Contraseña</Text>
          <TextInput
            style={s.input}
            value={password}
            onChangeText={setPassword}
            placeholder="••••••••"
            secureTextEntry
          />

          <Pressable style={[s.btn, busy && s.btnDisabled]} onPress={enviar} disabled={busy}>
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={s.btnText}>{esRegistro ? "Crear cuenta" : "Entrar"}</Text>
            )}
          </Pressable>

          {error ? <Text style={s.error}>{error}</Text> : null}

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
  root: { flex: 1, backgroundColor: "#eef2ff" },
  scroll: { flexGrow: 1, justifyContent: "center", padding: 20 },
  card: { backgroundColor: "#fff", borderRadius: 20, padding: 24, gap: 6 },
  brand: { fontSize: 26, fontWeight: "800", color: "#4f46e5" },
  subtitle: { fontSize: 14, color: "#64748b", marginBottom: 12 },
  label: { fontSize: 13, color: "#334155", marginTop: 8, fontWeight: "600" },
  input: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  btn: {
    backgroundColor: "#4f46e5",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 16,
  },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  error: { color: "#dc2626", marginTop: 12, fontSize: 14 },
  switch: { marginTop: 16, alignItems: "center" },
  switchText: { color: "#4f46e5", fontWeight: "600", fontSize: 14 },
});
