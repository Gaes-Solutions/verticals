import { money } from "@/lib/format";
import { listWishlist, quitarWishlist } from "@/services/cliente";
import { colors, radius, shadow, space } from "@/theme";
import { EmptyState, Icon, Loading } from "@/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, FlatList, StyleSheet, Text, View } from "react-native";

export default function Favoritos() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["wishlist"], queryFn: listWishlist });
  const quitar = useMutation({
    mutationFn: (itemId: string) => quitarWishlist(itemId),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["wishlist"] }),
    onError: (e) => Alert.alert("No se pudo", e instanceof Error ? e.message : "Error"),
  });
  if (q.isLoading) return <Loading />;

  return (
    <FlatList
      style={{ backgroundColor: colors.bg }}
      contentContainerStyle={s.list}
      data={q.data ?? []}
      keyExtractor={(w) => w.itemId}
      refreshing={q.isFetching}
      onRefresh={() => q.refetch()}
      ListEmptyComponent={
        <EmptyState
          icon="heart-outline"
          title="Sin favoritos"
          subtitle="Guarda productos que te gusten para verlos aquí."
        />
      }
      renderItem={({ item }) => (
        <View style={s.card}>
          <View style={s.thumb}>
            <Icon name="pricetag" size={20} color={colors.brand} />
          </View>
          <Text style={s.nombre} numberOfLines={2}>
            {item.tituloPublico}
          </Text>
          <Text style={s.precio}>{money(item.precio)}</Text>
          <Icon
            name="heart-dislike"
            size={22}
            color={colors.danger}
            onPress={() => quitar.mutate(item.itemId)}
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
  thumb: {
    width: 44,
    height: 44,
    borderRadius: radius.sm,
    backgroundColor: colors.brandLight,
    alignItems: "center",
    justifyContent: "center",
  },
  nombre: { flex: 1, fontWeight: "600", color: colors.ink, fontSize: 15 },
  precio: { fontWeight: "800", color: colors.ink, fontSize: 15 },
});
