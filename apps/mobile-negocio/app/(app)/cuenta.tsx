import { useAuth } from "@/lib/auth-store";
import { Pressable, StyleSheet, Text, View } from "react-native";

export default function Cuenta() {
  const { user, logout } = useAuth();
  return (
    <View style={s.root}>
      <View style={s.card}>
        <Text style={s.nombre}>{user?.nombre ?? "Usuario"}</Text>
        <Text style={s.email}>{user?.email}</Text>
      </View>
      <Pressable style={s.btn} onPress={() => void logout()}>
        <Text style={s.btnText}>Cerrar sesión</Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, padding: 20, gap: 16 },
  card: { backgroundColor: "#fff", borderRadius: 16, padding: 18, gap: 4 },
  nombre: { fontSize: 18, fontWeight: "700", color: "#0f172a" },
  email: { fontSize: 14, color: "#64748b" },
  btn: {
    borderWidth: 1,
    borderColor: "#fca5a5",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  btnText: { color: "#dc2626", fontWeight: "700", fontSize: 16 },
});
