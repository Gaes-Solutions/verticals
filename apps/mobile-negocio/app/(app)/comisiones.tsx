import { type ReglaComision, eliminarReglaComision, listReglasComision } from "@/services/negocio";
import { colors, radius, shadow, space } from "@/theme";
import { Badge, EmptyState, Icon, Loading } from "@/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, FlatList, StyleSheet, Text, View } from "react-native";

const BASE_LABEL: Record<string, string> = {
  venta: "Sobre la venta",
  utilidad: "Sobre la utilidad",
  producto: "Por producto",
};

export default function Comisiones() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["comisiones"], queryFn: listReglasComision });

  const del = useMutation({
    mutationFn: (r: ReglaComision) => eliminarReglaComision(r.id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["comisiones"] }),
    onError: (e) => Alert.alert("No se pudo eliminar", e instanceof Error ? e.message : "Error"),
  });

  if (q.isLoading) return <Loading />;

  return (
    <FlatList
      style={{ backgroundColor: colors.bg }}
      contentContainerStyle={s.list}
      data={q.data ?? []}
      keyExtractor={(r) => r.id}
      refreshing={q.isFetching}
      onRefresh={() => q.refetch()}
      ListEmptyComponent={<EmptyState icon="trophy-outline" title="Sin reglas de comisión" />}
      renderItem={({ item }) => (
        <View style={s.card}>
          <View style={{ flex: 1 }}>
            <View style={s.top}>
              <Text style={s.nombre} numberOfLines={1}>
                {item.nombre}
              </Text>
              <Badge
                label={item.isActive ? "activa" : "inactiva"}
                tone={item.isActive ? "ok" : "neutral"}
              />
            </View>
            <Text style={s.meta}>
              {item.pct}% · {BASE_LABEL[item.base] ?? item.base}
              {item.categoria ? ` · ${item.categoria.nombre}` : ""}
              {item.producto ? ` · ${item.producto.nombre}` : ""}
            </Text>
            <Text style={s.prio}>Prioridad {item.prioridad}</Text>
          </View>
          <Icon
            name="trash-outline"
            size={22}
            color={colors.danger}
            onPress={() =>
              Alert.alert("Eliminar regla", `¿Eliminar "${item.nombre}"?`, [
                { text: "No" },
                { text: "Sí", style: "destructive", onPress: () => del.mutate(item) },
              ])
            }
          />
        </View>
      )}
    />
  );
}

const s = StyleSheet.create({
  list: { padding: space.lg, gap: space.sm },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: space.md,
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    ...shadow.card,
  },
  top: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.sm,
  },
  nombre: { fontWeight: "700", color: colors.ink, fontSize: 15, flex: 1 },
  meta: { color: colors.text, fontSize: 13, marginTop: 4 },
  prio: { color: colors.faint, fontSize: 12, marginTop: 2 },
});
