import { money } from "@/lib/format";
import { getResumen } from "@/services/negocio";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

const PERIODOS = [
  { dias: 7, label: "7 días" },
  { dias: 30, label: "30 días" },
  { dias: 90, label: "90 días" },
];

export default function Reportes() {
  const [dias, setDias] = useState(30);
  const q = useQuery({ queryKey: ["resumen", dias], queryFn: () => getResumen(dias) });

  return (
    <ScrollView contentContainerStyle={s.root}>
      <View style={s.tabs}>
        {PERIODOS.map((p) => (
          <Pressable
            key={p.dias}
            onPress={() => setDias(p.dias)}
            style={[s.tab, dias === p.dias && s.tabOn]}
          >
            <Text style={[s.tabText, dias === p.dias && s.tabTextOn]}>{p.label}</Text>
          </Pressable>
        ))}
      </View>

      {q.isLoading ? (
        <ActivityIndicator style={{ marginTop: 32 }} color="#0f766e" />
      ) : q.data ? (
        <>
          <View style={s.grid}>
            <Kpi label="Ventas del periodo" valor={money(q.data.totalPeriodo)} />
            <Kpi label="Tickets" valor={String(q.data.numTickets)} />
            <Kpi label="Ticket promedio" valor={money(q.data.ticketPromedio)} />
            <Kpi label="IVA del periodo" valor={money(q.data.ivaPeriodo)} />
          </View>

          <Text style={s.h2}>Ventas por canal</Text>
          <View style={s.card}>
            {q.data.porCanal.length === 0 ? (
              <Text style={s.muted}>Sin ventas en el periodo.</Text>
            ) : (
              q.data.porCanal.map((c) => (
                <View key={c.canal} style={s.row}>
                  <Text style={s.rowName}>{c.canal}</Text>
                  <Text style={s.rowVal}>{money(c.total)}</Text>
                </View>
              ))
            )}
          </View>

          <Text style={s.h2}>Más vendidos</Text>
          <View style={s.card}>
            {q.data.topProductos.length === 0 ? (
              <Text style={s.muted}>Sin datos.</Text>
            ) : (
              q.data.topProductos.map((p) => (
                <View key={p.productoId} style={s.row}>
                  <Text style={s.rowName} numberOfLines={1}>
                    {p.nombre}
                  </Text>
                  <Text style={s.rowVal}>
                    {p.cantidad} · {money(p.monto)}
                  </Text>
                </View>
              ))
            )}
          </View>
        </>
      ) : (
        <Text style={s.error}>No se pudieron cargar los reportes.</Text>
      )}
    </ScrollView>
  );
}

function Kpi({ label, valor }: { label: string; valor: string }) {
  return (
    <View style={s.kpi}>
      <Text style={s.kpiLabel}>{label}</Text>
      <Text style={s.kpiValue}>{valor}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  root: { padding: 16, gap: 6 },
  tabs: { flexDirection: "row", gap: 8, marginBottom: 8 },
  tab: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 999, backgroundColor: "#fff" },
  tabOn: { backgroundColor: "#0f766e" },
  tabText: { color: "#475569", fontWeight: "600" },
  tabTextOn: { color: "#fff" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  kpi: { flexGrow: 1, minWidth: "45%", backgroundColor: "#fff", borderRadius: 14, padding: 14 },
  kpiLabel: { fontSize: 12, color: "#64748b" },
  kpiValue: { fontSize: 19, fontWeight: "800", color: "#0f172a", marginTop: 2 },
  h2: { fontSize: 15, fontWeight: "700", color: "#0f172a", marginTop: 14 },
  card: { backgroundColor: "#fff", borderRadius: 14, padding: 14, gap: 8, marginTop: 6 },
  row: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  rowName: { flex: 1, color: "#475569", fontSize: 14, textTransform: "capitalize" },
  rowVal: { color: "#0f172a", fontWeight: "600", fontSize: 14 },
  muted: { color: "#94a3b8", fontSize: 14 },
  error: { color: "#dc2626", marginTop: 24 },
});
