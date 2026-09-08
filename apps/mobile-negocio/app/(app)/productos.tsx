import { ProductEditor } from "@/components/ProductEditor";
import { useAuth } from "@/lib/auth-store";
import { money } from "@/lib/format";
import { canManageProducts, listProducts } from "@/services/productos";
import { colors, radius, shadow, space } from "@/theme";
import { Button, EmptyState, Icon, Input, Loading } from "@/ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";

export default function Productos() {
  const [q, setQ] = useState("");
  const user = useAuth((state) => state.user);
  const permissions = user?.permissions ?? [];
  const owner = user?.isOwner ?? false;
  const canRead = canManageProducts(permissions, owner, "leer");
  const canCreate = canManageProducts(permissions, owner, "crear");
  const [page, setPage] = useState(1);
  const [editor, setEditor] = useState<{ id: string | null } | null>(null);
  const cache = useQueryClient();
  const query = useQuery({
    queryKey: ["productos", q, page],
    queryFn: () => listProducts(q, page),
    enabled: canRead,
  });
  if (!canRead)
    return (
      <View style={{ padding: space.lg }}>
        <Text style={{ color: colors.danger }}>No tienes permiso para consultar productos.</Text>
      </View>
    );

  return (
    <View style={s.root}>
      <View style={s.search}>
        <Input
          icon="search"
          value={q}
          onChangeText={(value) => {
            setQ(value);
            setPage(1);
          }}
          maxLength={120}
          placeholder="Buscar por nombre o código…"
          autoCorrect={false}
          autoCapitalize="none"
        />
      </View>
      {canCreate && (
        <View style={{ paddingHorizontal: space.lg, paddingBottom: space.sm }}>
          <Button
            label="Nuevo producto"
            icon="add-circle"
            onPress={() => setEditor({ id: null })}
          />
        </View>
      )}
      {query.isError ? (
        <View style={{ padding: space.lg, gap: space.md }}>
          <Text accessibilityRole="alert" style={{ color: colors.danger }}>
            No se pudo cargar el catálogo. Revisa la conexión y tus permisos.
          </Text>
          <Button
            label="Reintentar"
            onPress={() => {
              void query.refetch();
            }}
          />
        </View>
      ) : query.isLoading ? (
        <Loading />
      ) : (
        <FlatList
          contentContainerStyle={s.list}
          data={query.data?.items ?? []}
          keyExtractor={(p) => p.id}
          refreshing={query.isFetching}
          onRefresh={() => query.refetch()}
          ListFooterComponent={
            <View style={{ gap: space.sm }}>
              <Text style={{ color: colors.text }}>
                Página {page} · {query.data?.total ?? 0} productos
              </Text>
              <Button
                label="Anterior"
                variant="outline"
                disabled={page <= 1 || query.isFetching}
                onPress={() => setPage((value) => value - 1)}
              />
              <Button
                label="Siguiente"
                variant="outline"
                disabled={page * 30 >= (query.data?.total ?? 0) || query.isFetching}
                onPress={() => setPage((value) => value + 1)}
              />
            </View>
          }
          ListEmptyComponent={<EmptyState icon="pricetags-outline" title="Sin productos" />}
          renderItem={({ item }) => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Ver producto ${item.nombre}`}
              onPress={() => setEditor({ id: item.id })}
              style={s.card}
            >
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
            </Pressable>
          )}
        />
      )}
      {editor && (
        <ProductEditor
          key={editor.id ?? "create"}
          id={editor.id}
          onClose={() => setEditor(null)}
          onSaved={() => {
            setEditor(null);
            void cache.invalidateQueries({ queryKey: ["productos"] });
          }}
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
