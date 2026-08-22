import { useAuth } from "@/lib/auth-store";
import { money } from "@/lib/format";
import { getResumen } from "@/services/negocio";
import { useQuery } from "@tanstack/react-query";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

export default function Inicio() {
  const { user, tenantSlug } = useAuth();
  const rol = user?.isOwner ? "Dueño" : (user?.roleCodes[0] ?? "Equipo");
  const q = useQuery({ queryKey: ["resumen", 30], queryFn: () => getResumen(30) });

  return (
    <ScrollView
      contentContainerStyle={s.root}
      refreshControl={<RefreshControl refreshing={q.isFetching} onRefresh={() => q.refetch()} />}
    >
      <Text style={s.hola}>Hola, {user?.nombre ?? "bienvenido"} 👋</Text>
      <Text style={s.sub}>
        {rol} · {tenantSlug ?? "tu negocio"}
      </Text>

      {q.isLoading ? (
        <ActivityIndicator style={{ marginTop: 32 }} color="#0f766e" />
      ) : q.isError ? (
        <Text style={s.error}>No se pudieron cargar tus números. Desliza para reintentar.</Text>
      ) : q.data ? (
        <>
          <Text style={s.periodo}>Últimos {q.data.dias} días</Text>
          <View style={s.grid}>
            <Kpi label="Ventas" valor={money(q.data.totalPeriodo)} destacado />
            <Kpi label="Tickets" valor={String(q.data.numTickets)} />
            <Kpi label="Ticket prom." valor={money(q.data.ticketPromedio)} />
            <Kpi label="IVA" valor={money(q.data.ivaPeriodo)} />
          </View>

          {q.data.topProductos.length > 0 && (
            <View style={s.card}>
              <Text style={s.cardTitle}>Más vendidos</Text>
              {q.data.topProductos.slice(0, 5).map((p) => (
                <View key={p.productoId} style={s.row}>
                  <Text style={s.rowName} numberOfLines={1}>
                    {p.nombre}
                  </Text>
                  <Text style={s.rowVal}>{money(p.monto)}</Text>
                </View>
              ))}
            </View>
          )}
        </>
      ) : null}
    </ScrollView>
  );
}

function Kpi({ label, valor, destacado }: { label: string; valor: string; destacado?: boolean }) {
  return (
    <View style={[s.kpi, destacado && s.kpiHi]}>
      <Text style={s.kpiLabel}>{label}</Text>
      <Text style={[s.kpiValue, destacado && s.kpiValueHi]}>{valor}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  root: { padding: 16, gap: 6 },
  hola: { fontSize: 22, fontWeight: "800", color: "#0f172a" },
  sub: { fontSize: 14, color: "#64748b" },
  periodo: { fontSize: 13, color: "#94a3b8", marginTop: 10 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 6 },
  kpi: { flexGrow: 1, minWidth: "45%", backgroundColor: "#fff", borderRadius: 14, padding: 14 },
  kpiHi: { backgroundColor: "#0f766e" },
  kpiLabel: { fontSize: 12, color: "#64748b" },
  kpiValue: { fontSize: 20, fontWeight: "800", color: "#0f172a", marginTop: 2 },
  kpiValueHi: { color: "#fff" },
  kpiLabelHi: { color: "#ccfbf1" },
  card: { backgroundColor: "#fff", borderRadius: 14, padding: 16, marginTop: 14, gap: 8 },
  cardTitle: { fontSize: 15, fontWeight: "700", color: "#0f172a" },
  row: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  rowName: { flex: 1, color: "#475569", fontSize: 14 },
  rowVal: { color: "#0f172a", fontWeight: "600", fontSize: 14 },
  error: { color: "#dc2626", marginTop: 24, fontSize: 14 },
});
