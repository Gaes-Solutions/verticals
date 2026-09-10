import { useAuth } from "@/lib/auth-store";
import { money } from "@/lib/format";
import { listWishlist, quitarWishlist } from "@/services/cliente";
import { colors, radius, shadow, space } from "@/theme";
import { EmptyState, EntraParaVer, Icon, Loading } from "@/ui";
import { CommerceError } from "@/ui/CommerceError";
import { Screen } from "@/ui/Screen";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FlatList, StyleSheet, Text, View } from "react-native";

export default function Favoritos() {
  const conSesion = useAuth((sel) => sel.status) === "signedIn";
  if (!conSesion)
    return (
      <EntraParaVer
        icono="heart"
        titulo="Tus favoritos"
        texto="Guarda lo que te gusta para encontrarlo rápido la próxima vez."
      />
    );
  const { tenantSlug, user } = useAuth();
  const queryKey = ["wishlist", tenantSlug, user?.id];
  const qc = useQueryClient();
  const q = useQuery({ queryKey, retry: false, queryFn: listWishlist });
  const quitar = useMutation({
    mutationFn: (itemId: string) => quitarWishlist(itemId),
    onSuccess: () => void qc.invalidateQueries({ queryKey }),
  });
  if (q.isLoading) return <Loading />;
  if (q.isError)
    return (
      <Screen>
        <CommerceError
          error={q.error}
          message="No pudimos cargar tus favoritos. Revisa tu conexión y vuelve a intentar."
          retry={() => void q.refetch()}
        />
      </Screen>
    );

  return (
    <FlatList
      style={{ backgroundColor: colors.bg }}
      contentContainerStyle={s.list}
      data={q.data ?? []}
      keyExtractor={(w) => w.itemId}
      refreshing={q.isFetching}
      onRefresh={() => q.refetch()}
      ListHeaderComponent={
        quitar.isError ? (
          <CommerceError
            error={quitar.error}
            message="No pudimos confirmar el cambio de favoritos. Actualiza la lista para revisar su estado."
            retry={() => {
              quitar.reset();
              void q.refetch();
            }}
          />
        ) : null
      }
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
            onPress={() => {
              if (!quitar.isPending) quitar.mutate(item.itemId);
            }}
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
