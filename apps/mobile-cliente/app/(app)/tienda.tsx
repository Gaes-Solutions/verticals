import { useAuth } from "@/lib/auth-store";
import { money } from "@/lib/format";
import { listStoreProducts } from "@/services/comercio";
import { colors, radius, space } from "@/theme";
import { Button, EmptyState, Input, Loading } from "@/ui";
import { CommerceError } from "@/ui/CommerceError";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { useState } from "react";
import {
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";

export default function Tienda() {
  const { tenantSlug, user } = useAuth();
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const columns = useWindowDimensions().width >= 700 ? 3 : 2;
  const products = useQuery({
    queryKey: ["store", tenantSlug, user?.id, query, page],
    queryFn: () => listStoreProducts(query, page),
    retry: false,
  });
  const find = () => {
    setPage(1);
    setQuery(search.trim());
  };
  return (
    <View style={s.root}>
      <View style={s.header}>
        <Input
          label="Buscar artículos"
          value={search}
          maxLength={120}
          onChangeText={setSearch}
          onSubmitEditing={find}
          returnKeyType="search"
        />
        <View style={s.actions}>
          <Button label="Buscar" icon="search" onPress={find} />
          <Button
            label="Ver carrito"
            icon="cart"
            variant="outline"
            onPress={() => router.push("/(app)/carrito")}
          />
        </View>
        <Button
          label="Consultar compra"
          variant="ghost"
          onPress={() => router.push("/(app)/checkout")}
        />
      </View>
      {products.isPending ? (
        <Loading />
      ) : products.isError ? (
        <CommerceError error={products.error} retry={() => void products.refetch()} />
      ) : (
        <FlatList
          key={columns}
          numColumns={columns}
          data={products.data.items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={s.list}
          refreshing={products.isFetching}
          onRefresh={() => void products.refetch()}
          ListEmptyComponent={
            <EmptyState title="No encontramos artículos" subtitle="Prueba otra búsqueda." />
          }
          renderItem={({ item }) => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Ver ${item.tituloPublico}`}
              onPress={() =>
                router.push({ pathname: "/(app)/producto", params: { slug: item.slugSeo } })
              }
              style={s.product}
            >
              {item.fotosArray[0] ? (
                <Image source={{ uri: item.fotosArray[0] }} style={s.photo} resizeMode="contain" />
              ) : (
                <View style={s.photo} />
              )}
              <Text style={s.name} numberOfLines={3}>
                {item.tituloPublico}
              </Text>
              <Text style={s.price}>Desde {money(item.precioPromocion ?? item.precioDesde)}</Text>
              {item.stockPublico === 0 ? <Text style={s.soldOut}>Sin existencias</Text> : null}
            </Pressable>
          )}
          ListFooterComponent={
            <View style={s.footer}>
              <Text style={s.name}>
                Página {page} · {products.data.total} artículos
              </Text>
              <View style={s.actions}>
                <Button
                  label="Anterior"
                  disabled={page === 1}
                  variant="outline"
                  onPress={() => setPage(page - 1)}
                />
                <Button
                  label="Siguiente"
                  disabled={page * products.data.pageSize >= products.data.total}
                  variant="outline"
                  onPress={() => setPage(page + 1)}
                />
              </View>
            </View>
          }
        />
      )}
    </View>
  );
}
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { padding: space.lg, gap: space.md },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  list: { padding: space.sm },
  product: {
    flex: 1,
    maxWidth: "50%",
    padding: space.md,
    margin: space.xs,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    gap: space.sm,
  },
  photo: { width: "100%", height: 130, backgroundColor: colors.bg, borderRadius: radius.sm },
  name: { fontSize: 15, color: colors.ink },
  price: { color: colors.brand, fontWeight: "800", fontSize: 16 },
  soldOut: { color: colors.warn },
  footer: { padding: space.md, gap: space.md },
});
