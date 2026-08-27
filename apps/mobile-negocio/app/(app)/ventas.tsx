import { fecha, money } from "@/lib/format";
import { listVentas } from "@/services/negocio";
import { colors, radius, shadow, space } from "@/theme";
import { Badge, EmptyState, Loading } from "@/ui";
import { useQuery } from "@tanstack/react-query";
import { FlatList, StyleSheet, Text, View } from "react-native";

const TONE: Record<string, "ok" | "danger" | "neutral"> = {
  cobrada: "ok",
  cancelada: "danger",
  borrador: "neutral",
};

export default function Ventas() {
  const q = useQuery({ queryKey: ["ventas"], queryFn: () => listVentas() });
  if (q.isLoading) return <Loading />;

  return (
    <FlatList
      style={{ backgroundColor: colors.bg }}
      contentContainerStyle={s.root}
      data={q.data?.items ?? []}
      keyExtractor={(v) => v.id}
      refreshing={q.isFetching}
      onRefresh={() => q.refetch()}
      ListEmptyComponent={<EmptyState icon="receipt-outline" title="Aún no hay ventas" />}
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
            <Badge label={item.estado} tone={TONE[item.estado] ?? "neutral"} />
          </View>
        </View>
      )}
    />
  );
}

const s = StyleSheet.create({
  root: { padding: space.lg, gap: space.sm },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: space.md,
    gap: 8,
    ...shadow.card,
  },
  top: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  folio: { fontWeight: "700", color: colors.ink, fontSize: 15 },
  total: { fontWeight: "800", color: colors.ink, fontSize: 16 },
  meta: { color: colors.muted, fontSize: 13 },
});
