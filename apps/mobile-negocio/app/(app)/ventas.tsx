import { fecha, money } from "@/lib/format";
import { listVentas } from "@/services/negocio";
import { useQuery } from "@tanstack/react-query";
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from "react-native";

const COLOR: Record<string, string> = {
  cobrada: "#059669",
  cancelada: "#dc2626",
  borrador: "#94a3b8",
};

export default function Ventas() {
  const q = useQuery({ queryKey: ["ventas"], queryFn: () => listVentas() });

  if (q.isLoading) {
    return <ActivityIndicator style={{ marginTop: 40 }} color="#0f766e" />;
  }

  return (
    <FlatList
      contentContainerStyle={s.root}
      data={q.data?.items ?? []}
      keyExtractor={(v) => v.id}
      refreshing={q.isFetching}
      onRefresh={() => q.refetch()}
      ListEmptyComponent={<Text style={s.empty}>Aún no hay ventas.</Text>}
      renderItem={({ item }) => (
        <View style={s.card}>
          <View style={s.top}>
            <Text style={s.folio}>{item.folio}</Text>
            <Text style={s.total}>{money(item.total)}</Text>
          </View>
          <View style={s.top}>
            <Text style={s.meta}>
              {fecha(item.createdAt)} · {item.canal}
            </Text>
            <Text style={[s.estado, { color: COLOR[item.estado] ?? "#475569" }]}>
              {item.estado}
            </Text>
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
  estado: { fontSize: 13, fontWeight: "600", textTransform: "capitalize" },
  empty: { textAlign: "center", color: "#94a3b8", marginTop: 40 },
});
