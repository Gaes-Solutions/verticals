import { money } from "@/lib/format";
import { type ResumenVentas, getResumen } from "@/services/negocio";
import { colors, radius, space } from "@/theme";
import { Card, EmptyState, Loading, StatCard } from "@/ui";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

const PERIODOS = [
  { dias: 7, label: "7 días" },
  { dias: 30, label: "30 días" },
  { dias: 90, label: "90 días" },
];

export default function Reportes() {
  const [dias, setDias] = useState(30);
  const q = useQuery({ queryKey: ["resumen", dias], queryFn: () => getResumen(dias) });
  const d = q.data;

  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={s.root}>
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
        <Loading />
      ) : d ? (
        <>
          <View style={s.grid}>
            <StatCard label="Ventas" value={money(d.totalPeriodo)} icon="cash" highlight />
            <StatCard label="Tickets" value={String(d.numTickets)} icon="receipt" />
            <StatCard label="Ticket prom." value={money(d.ticketPromedio)} icon="pricetag" />
            <StatCard label="IVA" value={money(d.ivaPeriodo)} icon="calculator" />
          </View>

          <Text style={s.h2}>Ventas por día</Text>
          <Card>
            <BarChart data={d.porDia} />
          </Card>

          <Text style={s.h2}>Por canal</Text>
          <Card>
            {d.porCanal.length === 0 ? (
              <Text style={s.muted}>Sin ventas en el periodo.</Text>
            ) : (
              d.porCanal.map((c, i) => (
                <View key={c.canal} style={[s.row, i < d.porCanal.length - 1 && s.rowBorder]}>
                  <Text style={s.rowName}>{c.canal}</Text>
                  <Text style={s.rowVal}>{money(c.total)}</Text>
                </View>
              ))
            )}
          </Card>

          <Text style={s.h2}>Más vendidos</Text>
          <Card>
            {d.topProductos.length === 0 ? (
              <Text style={s.muted}>Sin datos.</Text>
            ) : (
              d.topProductos.map((p, i) => (
                <View
                  key={p.productoId}
                  style={[s.row, i < d.topProductos.length - 1 && s.rowBorder]}
                >
                  <Text style={s.rowName} numberOfLines={1}>
                    {p.nombre}
                  </Text>
                  <Text style={s.rowVal}>
                    {p.cantidad} · {money(p.monto)}
                  </Text>
                </View>
              ))
            )}
          </Card>
          <View style={{ height: space.xl }} />
        </>
      ) : (
        <EmptyState icon="bar-chart-outline" title="No se pudieron cargar los reportes" />
      )}
    </ScrollView>
  );
}

function BarChart({ data }: { data: ResumenVentas["porDia"] }) {
  const puntos = data.slice(-14);
  const max = Math.max(1, ...puntos.map((p) => p.total));
  if (puntos.length === 0) return <Text style={s.muted}>Sin ventas en el periodo.</Text>;
  return (
    <View style={s.chart}>
      {puntos.map((p) => {
        const h = Math.max(4, Math.round((p.total / max) * 120));
        const dd = p.fecha.slice(8, 10);
        return (
          <View key={p.fecha} style={s.barCol}>
            <View style={[s.bar, { height: h }]} />
            <Text style={s.barLabel}>{dd}</Text>
          </View>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  root: { padding: space.lg, gap: space.sm, paddingBottom: space.xl },
  tabs: { flexDirection: "row", gap: space.sm, marginBottom: space.sm },
  tab: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: radius.pill,
    backgroundColor: colors.card,
  },
  tabOn: { backgroundColor: colors.brand },
  tabText: { color: colors.text, fontWeight: "600" },
  tabTextOn: { color: colors.white },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  h2: { fontSize: 15, fontWeight: "700", color: colors.ink, marginTop: space.lg, marginBottom: 2 },
  chart: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    height: 150,
    gap: 3,
  },
  barCol: { flex: 1, alignItems: "center", gap: 4 },
  bar: { width: "72%", backgroundColor: colors.brand, borderRadius: 4, minHeight: 4 },
  barLabel: { fontSize: 10, color: colors.faint },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: space.md,
    paddingVertical: 10,
  },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.line },
  rowName: { flex: 1, color: colors.text, fontSize: 14, textTransform: "capitalize" },
  rowVal: { color: colors.ink, fontWeight: "700", fontSize: 14 },
  muted: { color: colors.faint, fontSize: 14 },
});
