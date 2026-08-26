import { fecha, money } from "@/lib/format";
import { listPedidos } from "@/services/cliente";
import { useQuery } from "@tanstack/react-query";
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from "react-native";

const PAGO_COLOR: Record<string, string> = {
  pagado: "#059669",
  pendiente: "#d97706",
  cancelado: "#dc2626",
  reembolsado: "#64748b",
};

export default function Pedidos() {
  const q = useQuery({ queryKey: ["pedidos"], queryFn: listPedidos });

  if (q.isLoading) {
    return <ActivityIndicator style={{ marginTop: 40 }} color="#4f46e5" />;
  }

  return (
    <FlatList
      contentContainerStyle={s.root}
      data={q.data ?? []}
      keyExtractor={(p) => p.id}
      refreshing={q.isFetching}
      onRefresh={() => q.refetch()}
      ListEmptyComponent={<Text style={s.empty}>Todavía no tienes pedidos.</Text>}
      renderItem={({ item }) => (
        <View style={s.card}>
          <View style={s.top}>
            <Text style={s.folio}>#{item.folioPublico}</Text>
            <Text style={s.total}>{money(item.total)}</Text>
          </View>
          <View style={s.top}>
            <Text style={s.meta}>{fecha(item.createdAt)}</Text>
            <Text style={[s.pago, { color: PAGO_COLOR[item.statusPago] ?? "#475569" }]}>
              {item.statusPago}
            </Text>
          </View>
          <View style={s.estadoRow}>
            <Text style={s.estado}>{item.statusLabel}</Text>
          </View>
        </View>
      )}
    />
  );
}

const s = StyleSheet.create({
  root: { padding: 16, gap: 10 },
  card: { backgroundColor: "#fff", borderRadius: 14, padding: 14, gap: 6 },
  top: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  folio: { fontWeight: "700", color: "#0f172a", fontSize: 15 },
  total: { fontWeight: "800", color: "#0f172a", fontSize: 16 },
  meta: { color: "#64748b", fontSize: 13 },
  pago: { fontSize: 13, fontWeight: "600", textTransform: "capitalize" },
  estadoRow: { flexDirection: "row" },
  estado: {
    backgroundColor: "#eef2ff",
    color: "#4f46e5",
    fontSize: 12,
    fontWeight: "600",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    overflow: "hidden",
  },
  empty: { textAlign: "center", color: "#94a3b8", marginTop: 40 },
});
