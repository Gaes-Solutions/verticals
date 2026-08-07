import { useAuth } from "@/lib/auth-store";
import { ScrollView, StyleSheet, Text, View } from "react-native";

export default function Inicio() {
  const { user, tenantSlug } = useAuth();
  const rol = user?.isOwner ? "Dueño" : (user?.roleCodes[0] ?? "Equipo");

  return (
    <ScrollView contentContainerStyle={s.root}>
      <Text style={s.hola}>Hola, {user?.nombre ?? "bienvenido"} 👋</Text>
      <Text style={s.sub}>
        {rol} · {tenantSlug ?? "tu negocio"}
      </Text>

      <View style={s.card}>
        <Text style={s.cardTitle}>Tu panel en el bolsillo</Text>
        <Text style={s.cardText}>
          Desde aquí verás tus ventas del día, cobrarás y darás seguimiento a tu negocio. Las
          secciones se ajustan a lo que tu rol puede hacer.
        </Text>
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  root: { padding: 20, gap: 6 },
  hola: { fontSize: 22, fontWeight: "800", color: "#0f172a" },
  sub: { fontSize: 14, color: "#64748b", marginBottom: 12 },
  card: { backgroundColor: "#fff", borderRadius: 16, padding: 18, gap: 6 },
  cardTitle: { fontSize: 16, fontWeight: "700", color: "#0f172a" },
  cardText: { fontSize: 14, color: "#475569", lineHeight: 20 },
});
