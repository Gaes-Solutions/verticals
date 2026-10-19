import { useAuth } from "@/lib/auth-store";
import { cartCount } from "@/lib/cart-feedback";
import { accountCartKey, useCart } from "@/lib/cart-store";
import { checkoutBlocksCart, useCheckout } from "@/lib/checkout-store";
import { money } from "@/lib/format";
import { addAvailableProduct, canAddQuantity } from "@/lib/product-selection";
import { tiendaActual } from "@/lib/tienda";
import { type StoreProduct, listStoreProducts, storeConfig } from "@/services/comercio";
import { colors, commerce, space } from "@/theme";
import { Button, CommerceError, EmptyState, Icon, Loading } from "@/ui";
import { CartButton } from "@/ui/CartButton";
import { CartDock } from "@/ui/CartDock";
import { ProductPhoto } from "@/ui/ProductPhoto";
import { SwipeAddButton } from "@/ui/SwipeAddButton";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { useRef, useState } from "react";
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function Tienda() {
  const { tenantSlug, user, status } = useAuth();
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [error, setError] = useState("");
  const list = useRef<FlatList<StoreProduct>>(null);
  const columns = useWindowDimensions().width >= 700 ? 3 : 2;
  const cart = useCart();
  const checkout = useCheckout();
  const owner = tenantSlug && user ? accountCartKey(tenantSlug, user.id) : "";
  const ready = cart.owner === owner && cart.ready && !checkoutBlocksCart(checkout, owner);
  const store = tiendaActual();
  const config = useQuery({
    queryKey: ["store-config", store, user?.id],
    queryFn: storeConfig,
    retry: false,
  });
  const products = useQuery({
    queryKey: ["store", store, user?.id, query, page],
    queryFn: () => listStoreProducts(query, page),
    retry: false,
  });
  const name = config.data?.nombre || (store === "gaesland" ? "Gaesland" : "Tu tienda");
  const find = () => {
    setPage(1);
    setQuery(search.trim());
  };
  const open = (item: StoreProduct) =>
    router.push({ pathname: "/(app)/producto", params: { slug: item.slugSeo } });
  const add = (item: StoreProduct) => {
    if (status !== "signedIn") {
      router.push({ pathname: "/login", params: { next: "/(app)/producto", slug: item.slugSeo } });
      return false;
    }
    const v = item.variantes[0];
    if (item.variantes.length !== 1 || !v) {
      open(item);
      return false;
    }
    if (!ready) return false;
    const already = cart.lines.find((l) => l.varianteId === v.id)?.cantidad ?? 0;
    if (!canAddQuantity(item, v.id, 1, already)) {
      setError("Ya tienes la cantidad disponible de este artículo en el carrito.");
      return false;
    }
    try {
      if (checkoutBlocksCart(useCheckout.getState(), owner)) return false;
      addAvailableProduct(owner, item, v.id, 1, item.tituloPublico);
      setError("");
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo agregar. Inténtalo de nuevo.");
      return false;
    }
  };
  const header = (
    <View style={s.header}>
      <View style={s.brandRow}>
        <View style={s.brandIcon}>
          <Icon name="storefront-outline" color={colors.white} size={24} />
        </View>
        <View style={s.brandWords}>
          <Text style={s.brand}>{name}</Text>
          <Text style={s.eyebrow}>TU TIENDA EN LÍNEA</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={user ? "Mi cuenta" : "Iniciar sesión"}
          onPress={() => router.push(user ? "/(app)/cuenta" : "/login")}
          style={s.headerButton}
        >
          <Icon name="person-outline" color={commerce.forest} />
        </Pressable>
        <CartButton />
      </View>
      <View style={s.search}>
        <Icon name="search-outline" color={colors.muted} size={20} />
        <TextInput
          accessibilityLabel="Buscar artículos"
          placeholder="¿Qué estás buscando hoy?"
          placeholderTextColor={colors.muted}
          value={search}
          onChangeText={setSearch}
          maxLength={120}
          onSubmitEditing={find}
          returnKeyType="search"
          style={s.searchInput}
        />
        {search ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Limpiar búsqueda"
            hitSlop={8}
            onPress={() => {
              setSearch("");
              setQuery("");
              setPage(1);
            }}
          >
            <Icon name="close" size={18} />
          </Pressable>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Buscar"
          onPress={find}
          style={s.searchButton}
        >
          <Icon name="arrow-forward" color={commerce.forest} size={22} />
        </Pressable>
      </View>
      {!query && page === 1 ? (
        <View style={s.hero}>
          <View style={s.heroTag}>
            <Text style={s.heroTagText}>DESCUBRE ALGO PARA TI</Text>
          </View>
          <Text style={s.heroTitle}>Pequeños detalles.{"\n"}Grandes momentos.</Text>
          <Text style={s.heroSubtitle}>Explora, elige y disfruta comprar a tu ritmo.</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Explorar productos"
            onPress={() => list.current?.scrollToOffset({ offset: 310, animated: true })}
            style={s.heroButton}
          >
            <Text style={s.heroButtonText}>Explorar productos</Text>
            <Icon name="arrow-forward" size={18} color={commerce.forest} />
          </Pressable>
          <View style={s.heroDecor} pointerEvents="none">
            <Icon name="leaf-outline" size={85} color="rgba(229,188,102,0.3)" />
          </View>
        </View>
      ) : null}
      <View style={s.section}>
        <View style={{ flex: 1 }}>
          <Text style={s.sectionTitle}>
            {query ? `Resultados para “${query}”` : "Encuentra tu próximo favorito"}
          </Text>
          <Text style={s.sectionSubtitle}>
            {products.data
              ? `${products.data.total} artículos para descubrir`
              : "Una selección para tu día a día"}
          </Text>
        </View>
      </View>
      {error ? (
        <Text accessibilityRole="alert" style={s.error}>
          {error}
        </Text>
      ) : null}
      {products.isPending ? <Loading /> : null}
      {products.isError ? (
        <CommerceError error={products.error} retry={() => void products.refetch()} />
      ) : null}
    </View>
  );
  return (
    <SafeAreaView edges={["top"]} style={s.root}>
      <FlatList
        ref={list}
        key={columns}
        numColumns={columns}
        keyboardShouldPersistTaps="handled"
        data={products.data?.items ?? []}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={header}
        contentContainerStyle={s.list}
        columnWrapperStyle={s.columns}
        refreshing={products.isFetching && !products.isPending}
        onRefresh={() => void products.refetch()}
        ListEmptyComponent={
          !products.isPending && !products.isError ? (
            <EmptyState
              title="No encontramos artículos"
              subtitle="Prueba con otra palabra o limpia tu búsqueda."
            />
          ) : null
        }
        renderItem={({ item }) => (
          <View style={[s.product, { maxWidth: columns === 3 ? "31.5%" : "48%" }]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Ver ${item.tituloPublico}`}
              onPress={() => open(item)}
            >
              <View style={s.photoWrap}>
                <ProductPhoto uri={item.fotosArray[0]} label={item.tituloPublico} style={s.photo} />
                {item.enOferta && item.descuentoPct ? (
                  <View style={s.offer}>
                    <Text style={s.offerText}>−{item.descuentoPct}%</Text>
                  </View>
                ) : null}
              </View>
              <View style={s.productWords}>
                <Text style={s.category} numberOfLines={1}>
                  {item.categoriaPublica?.nombre || "LA SELECCIÓN DE TU TIENDA"}
                </Text>
                <Text style={s.name} numberOfLines={2}>
                  {item.tituloPublico}
                </Text>
                {item.enOferta && item.precioPromocion ? (
                  <Text style={s.oldPrice}>{money(item.precioDesde)}</Text>
                ) : (
                  <View style={{ height: 16 }} />
                )}
                <Text style={s.price}>
                  {item.variantes.length > 1 && !item.precioPromocion ? (
                    <Text style={s.fromPrice}>Desde </Text>
                  ) : null}
                  {money(item.precioPromocion ?? item.precioDesde)}
                </Text>
                {cart.owner === owner &&
                cart.lines.some((line) => item.variantes.some((v) => v.id === line.varianteId)) ? (
                  <Text style={s.inCart}>
                    ✓ En tu carrito:{" "}
                    {cartCount(
                      cart.lines.filter((line) =>
                        item.variantes.some((v) => v.id === line.varianteId),
                      ),
                    )}
                  </Text>
                ) : null}
                <Text style={s.availability}>
                  {item.stockPublico === 0
                    ? "Agotado por ahora"
                    : item.variantes.length > 1
                      ? "Elige tu presentación"
                      : "Toca o desliza para agregar"}
                </Text>
              </View>
            </Pressable>
            <View style={s.addWrap}>
              {item.variantes.length === 1 ? (
                <SwipeAddButton
                  compact
                  inCart={
                    cart.owner === owner
                      ? cartCount(
                          cart.lines.filter((line) =>
                            item.variantes.some((v) => v.id === line.varianteId),
                          ),
                        )
                      : 0
                  }
                  disabled={item.stockPublico === 0 || (status === "signedIn" && !ready)}
                  onAdd={() => add(item)}
                />
              ) : (
                <Button
                  label="Elegir opciones"
                  variant="outline"
                  onPress={() => open(item)}
                  disabled={item.stockPublico === 0}
                />
              )}
            </View>
          </View>
        )}
        ListFooterComponent={
          products.data && products.data.total > products.data.pageSize ? (
            <View style={s.footer}>
              <Text style={s.sectionSubtitle}>
                Página {page} de {Math.ceil(products.data.total / products.data.pageSize)}
              </Text>
              <View style={s.pagination}>
                <Button
                  label="Anterior"
                  disabled={page === 1}
                  variant="outline"
                  onPress={() => {
                    setPage(page - 1);
                    list.current?.scrollToOffset({ offset: 0 });
                  }}
                />
                <Button
                  label="Siguiente"
                  disabled={page * products.data.pageSize >= products.data.total}
                  variant="outline"
                  onPress={() => {
                    setPage(page + 1);
                    list.current?.scrollToOffset({ offset: 0 });
                  }}
                />
              </View>
            </View>
          ) : (
            <View style={{ height: 20 }} />
          )
        }
      />
      <CartDock />
    </SafeAreaView>
  );
}
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  list: { paddingBottom: 8, maxWidth: 1000, width: "100%", alignSelf: "center" },
  header: { padding: 16, gap: 18 },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  brandIcon: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: commerce.forest,
    justifyContent: "center",
    alignItems: "center",
  },
  brandWords: { flex: 1 },
  brand: { color: commerce.forest, fontSize: 23, fontWeight: "800" },
  eyebrow: { color: colors.muted, fontSize: 9, letterSpacing: 1.5, marginTop: 2 },
  headerButton: {
    padding: 10,
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    paddingLeft: 13,
    backgroundColor: "#f1f4f1",
    borderWidth: 1,
    borderColor: "#d9e0da",
    borderRadius: 13,
    overflow: "hidden",
  },
  searchInput: { flex: 1, minWidth: 0, color: colors.ink, fontSize: 14, paddingVertical: 15 },
  searchButton: { backgroundColor: commerce.gold, padding: 14 },
  hero: {
    backgroundColor: commerce.forest,
    borderRadius: 24,
    padding: 24,
    overflow: "hidden",
    gap: 12,
  },
  heroTag: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: "rgba(229,188,102,0.35)",
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  heroTagText: { color: commerce.gold, fontSize: 9, letterSpacing: 1.1, fontWeight: "700" },
  heroTitle: {
    color: colors.white,
    fontSize: 30,
    lineHeight: 35,
    fontWeight: "800",
    letterSpacing: -0.6,
  },
  heroSubtitle: { color: "#cee0d7", fontSize: 13, lineHeight: 20, maxWidth: 240 },
  heroButton: {
    backgroundColor: commerce.gold,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    alignSelf: "flex-start",
    zIndex: 1,
  },
  heroButtonText: { fontWeight: "800", fontSize: 13, color: commerce.forest },
  heroDecor: { position: "absolute", right: -10, bottom: 20, transform: [{ rotate: "-20deg" }] },
  section: { flexDirection: "row", alignItems: "center", gap: 10 },
  sectionTitle: { fontSize: 20, color: colors.ink, fontWeight: "800", letterSpacing: -0.3 },
  sectionSubtitle: { fontSize: 12, color: colors.muted, marginTop: 5 },
  columns: { gap: 12, paddingHorizontal: 16, marginBottom: 14 },
  product: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#e3e8e2",
    borderRadius: 17,
    backgroundColor: colors.card,
    overflow: "hidden",
  },
  photoWrap: { position: "relative" },
  photo: { height: 155, width: "100%" },
  offer: {
    position: "absolute",
    top: 10,
    left: 10,
    backgroundColor: commerce.gold,
    borderRadius: 7,
    paddingHorizontal: 7,
    paddingVertical: 4,
  },
  offerText: { fontSize: 11, fontWeight: "800", color: commerce.forest },
  productWords: { padding: 12, gap: 5 },
  category: { color: colors.muted, fontSize: 8, letterSpacing: 0.9, fontWeight: "700" },
  name: { fontSize: 14, fontWeight: "600", lineHeight: 19, color: colors.ink, minHeight: 38 },
  price: { color: commerce.forest, fontWeight: "800", fontSize: 20, letterSpacing: -0.5 },
  fromPrice: { fontSize: 11, fontWeight: "400" },
  oldPrice: { color: colors.muted, textDecorationLine: "line-through", fontSize: 11, height: 16 },
  inCart: { color: colors.brand, fontSize: 11, fontWeight: "700", marginTop: 3 },
  availability: { color: colors.muted, fontSize: 10, lineHeight: 14 },
  addWrap: { padding: 10, paddingTop: 0, marginTop: "auto" },
  footer: { padding: space.lg, gap: 12, alignItems: "center" },
  pagination: { flexDirection: "row", gap: 12 },
  error: { color: colors.danger, fontSize: 13 },
});
