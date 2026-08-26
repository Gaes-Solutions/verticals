import { useAuth } from "@/lib/auth-store";
import { getPerfil } from "@/services/cliente";
import { useQuery } from "@tanstack/react-query";
import { Pressable, StyleSheet, Text, View } from "react-native";

export default function Cuenta() {
  const { user, tenantSlug, logout } = useAuth();
  const q = useQuery({ queryKey: ["perfil"], queryFn: getPerfil });
  const p = q.data;

  const nombre = [p?.nombre, p?.apellidos].filter(Boolean).join(" ") || user?.nombre || "Cliente";

  return (
    <View style={s.root}>
      <View style={s.avatar}>
        <Text style={s.avatarText}>{(nombre[0] ?? "?").toUpperCase()}</Text>
      </View>

      <View style={s.card}>
        <Text style={s.nombre}>{nombre}</Text>
        <Text style={s.email}>{p?.email ?? user?.email}</Text>
        {p?.telefono ? <Text style={s.email}>{p.telefono}</Text> : null}
        {tenantSlug ? <Text style={s.tienda}>Tienda: {tenantSlug}</Text> : null}
      </View>

      <Pressable style={s.btn} onPress={() => void logout()}>
        <Text style={s.btnText}>Cerrar sesión</Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, padding: 20, gap: 16, alignItems: "stretch" },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 999,
    backgroundColor: "#4f46e5",
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    marginTop: 8,
  },
  avatarText: { color: "#fff", fontSize: 30, fontWeight: "800" },
  card: { backgroundColor: "#fff", borderRadius: 16, padding: 18, gap: 4 },
  nombre: { fontSize: 18, fontWeight: "700", color: "#0f172a" },
  email: { fontSize: 14, color: "#64748b" },
  tienda: { fontSize: 13, color: "#94a3b8", marginTop: 6 },
  btn: {
    borderWidth: 1,
    borderColor: "#fca5a5",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  btnText: { color: "#dc2626", fontWeight: "700", fontSize: 16 },
});
