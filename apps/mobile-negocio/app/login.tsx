import { useAuth } from "@/lib/auth-store";
import { Redirect } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

export default function Login() {
  const { status, error, login, submitMfa } = useAuth();
  const [tenant, setTenant] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  if (status === "signedIn") return <Redirect href="/(app)" />;

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    await fn();
    setBusy(false);
  };

  const esMfa = status === "mfa";

  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={s.card}>
        <Text style={s.brand}>GaesSoft</Text>
        <Text style={s.subtitle}>{esMfa ? "Verificación en dos pasos" : "Panel del negocio"}</Text>

        {esMfa ? (
          <>
            <Text style={s.label}>Código de tu app de autenticación</Text>
            <TextInput
              style={s.input}
              value={code}
              onChangeText={setCode}
              placeholder="123456"
              keyboardType="number-pad"
              maxLength={6}
              autoFocus
            />
            <Boton texto="Entrar" busy={busy} onPress={() => run(() => submitMfa(code))} />
          </>
        ) : (
          <>
            <Text style={s.label}>Negocio</Text>
            <TextInput
              style={s.input}
              value={tenant}
              onChangeText={setTenant}
              placeholder="mi-negocio"
              autoCapitalize="none"
              autoCorrect={false}
            />
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
            <Boton
              texto="Entrar"
              busy={busy}
              onPress={() => run(() => login(tenant.trim(), email.trim(), password))}
            />
          </>
        )}

        {error ? <Text style={s.error}>{error}</Text> : null}
      </View>
    </KeyboardAvoidingView>
  );
}

function Boton({ texto, busy, onPress }: { texto: string; busy: boolean; onPress: () => void }) {
  return (
    <Pressable style={[s.btn, busy && s.btnDisabled]} onPress={onPress} disabled={busy}>
      {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>{texto}</Text>}
    </Pressable>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, justifyContent: "center", padding: 20, backgroundColor: "#f1f5f9" },
  card: { backgroundColor: "#fff", borderRadius: 20, padding: 24, gap: 6 },
  brand: { fontSize: 26, fontWeight: "800", color: "#0f766e" },
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
    backgroundColor: "#0f766e",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 16,
  },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  error: { color: "#dc2626", marginTop: 12, fontSize: 14 },
});
