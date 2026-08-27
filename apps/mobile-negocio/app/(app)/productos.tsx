import { money } from "@/lib/format";
import { listProductos } from "@/services/negocio";
import { colors, radius, shadow, space } from "@/theme";
import { EmptyState, Icon, Input, Loading } from "@/ui";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";

export default function Productos() {
  const [q, setQ] = useState("");
  const query = useQuery({ queryKey: ["productos", q], queryFn: () => listProductos(q) });

  return (
    <View style={s.root}>
      <View style={s.search}>
        <Input
          icon="search"
          value={q}
          onChangeText={setQ}
          placeholder="Buscar por nombre o código…"
          autoCorrect={false}
          autoCapitalize="none"
        />
      </View>
      {query.isLoading ? (
        <Loading />
      ) : (
        <FlatList
          contentContainerStyle={s.list}
          data={query.data?.items ?? []}
          keyExtractor={(p) => p.id}
          refreshing={query.isFetching}
          onRefresh={() => query.refetch()}
          ListEmptyComponent={<EmptyState icon="pricetags-outline" title="Sin productos" />}
          renderItem={({ item }) => (
            <View style={s.card}>
              <View style={s.thumb}>
                <Icon name="cube" size={20} color={colors.brand} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.nombre} numberOfLines={1}>
                  {item.nombre}
                </Text>
                <Text style={s.sku}>{item.skuPadre}</Text>
              </View>
              <Text style={s.precio}>{money(item.variantes[0]?.precioBase ?? "0")}</Text>
            </View>
          )}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  search: { padding: space.lg, paddingBottom: space.sm },
  list: { paddingHorizontal: space.lg, paddingBottom: space.xl, gap: space.sm },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: space.md,
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    ...shadow.card,
  },
  thumb: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    backgroundColor: colors.brandLight,
    alignItems: "center",
    justifyContent: "center",
  },
  nombre: { fontWeight: "600", color: colors.ink, fontSize: 15 },
  sku: { color: colors.faint, fontSize: 12, marginTop: 2 },
  precio: { fontWeight: "800", color: colors.ink, fontSize: 15 },
});
