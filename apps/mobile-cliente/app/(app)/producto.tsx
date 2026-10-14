import { useAuth } from "@/lib/auth-store";
import { accountCartKey, useCart, validQuantity } from "@/lib/cart-store";
import { checkoutBlocksCart, useCheckout } from "@/lib/checkout-store";
import { money } from "@/lib/format";
import { canAddQuantity, initialVariant, variantStock } from "@/lib/product-selection";
import { type StoreProduct, getStoreProduct } from "@/services/comercio";
import { colors, commerce, radius, space } from "@/theme";
import { Button, CommerceError, EmptyState, Icon, Input, Loading } from "@/ui";
import { CartDock } from "@/ui/CartDock";
import { ProductGallery } from "@/ui/ProductGallery";
import { SwipeAddButton } from "@/ui/SwipeAddButton";
import { useQuery } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

export default function Producto() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { tenantSlug, user } = useAuth();
  const product = useQuery({
    queryKey: ["store-product", tenantSlug, user?.id, slug],
    queryFn: () => getStoreProduct(slug),
    enabled: typeof slug === "string" && slug.length > 0,
    retry: false,
  });
  if (!slug) return <EmptyState title="Selecciona un artículo desde la tienda" />;
  if (product.isPending) return <Loading />;
  if (product.isError)
    return <CommerceError error={product.error} retry={() => void product.refetch()} />;
  return <ProductDetails key={product.data.id} product={product.data} />;
}
function ProductDetails({ product }: { product: StoreProduct }) {
  const { status, tenantSlug, user } = useAuth();
  const checkout = useCheckout();
  const cart = useCart();
  const owner = tenantSlug && user ? accountCartKey(tenantSlug, user.id) : "";
  const ready = cart.owner === owner && cart.ready && !checkoutBlocksCart(checkout, owner);
  const [variant, setVariant] = useState(initialVariant(product));
  const [quantity, setQuantity] = useState("1");
  const [error, setError] = useState("");
  const [customQuantity, setCustomQuantity] = useState(false);
  const selected = product.variantes.find((item) => item.id === variant);
  const already =
    cart.owner === owner ? (cart.lines.find((l) => l.varianteId === variant)?.cantidad ?? 0) : 0;
  const stock = variantStock(product, variant);
  const allowed = canAddQuantity(product, variant, quantity, already);
  const add = () => {
    if (status !== "signedIn") {
      router.push({
        pathname: "/login",
        params: { next: "/(app)/producto", slug: product.slugSeo },
      });
      return false;
    }
    if (!ready || !selected || !allowed) return false;
    try {
      cart.add(
        owner,
        selected.id,
        Number(quantity.replace(",", ".")),
        `${product.tituloPublico}${selected.nombreVariante ? ` · ${selected.nombreVariante}` : ""}`,
      );
      setError("");
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo agregar. Inténtalo de nuevo.");
      return false;
    }
  };
  const adjust = (delta: number) => {
    const amount = validQuantity(quantity);
    if (amount !== null)
      setQuantity(String(Math.max(1, Math.round((amount + delta) * 1000) / 1000)));
  };
  return (
    <View style={s.root}>
      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Volver a la tienda"
          style={s.back}
          onPress={() => router.push("/(app)/tienda")}
        >
          <Icon name="arrow-back" size={18} color={colors.brand} />
          <Text style={s.backText}>Seguir explorando</Text>
        </Pressable>
        <ProductGallery photos={product.fotosArray} title={product.tituloPublico} />
        <View style={s.details}>
          <Text style={s.category}>
            {product.categoriaPublica?.nombre || "LA SELECCIÓN DE TU TIENDA"}
          </Text>
          <Text accessibilityRole="header" style={s.title}>
            {product.tituloPublico}
          </Text>
          {product.enOferta && product.precioPromocion ? (
            <View style={s.offerRow}>
              <Text style={s.oldPrice}>{money(product.precioDesde)}</Text>
              <Text style={s.offer}>−{product.descuentoPct}%</Text>
            </View>
          ) : null}
          <Text style={s.price}>
            {product.variantes.length > 1 && !product.precioPromocion ? (
              <Text style={s.fromPrice}>Desde </Text>
            ) : null}
            {money(product.precioPromocion ?? product.precioDesde)}
          </Text>
          <Text style={s.note}>Precio publicado. El total se confirma en tu carrito.</Text>
          <View style={s.stockRow}>
            <View style={[s.dot, (stock === 0 || product.stockPublico === 0) && s.outDot]} />
            <Text style={s.stockText}>
              {stock === 0 || product.stockPublico === 0
                ? "Agotado por ahora"
                : stock !== null
                  ? `${stock} disponibles en esta presentación`
                  : "Disponibilidad al confirmar el carrito"}
            </Text>
          </View>
        </View>
        {product.variantes.length > 1 ? (
          <View style={s.section}>
            <Text style={s.label}>Elige tu presentación</Text>
            <View style={s.variants}>
              {product.variantes.map((item) => {
                const unavailable = variantStock(product, item.id) === 0;
                return (
                  <Pressable
                    key={item.id}
                    accessibilityRole="radio"
                    accessibilityLabel={item.nombreVariante || product.tituloPublico}
                    accessibilityState={{ checked: variant === item.id, disabled: unavailable }}
                    disabled={unavailable}
                    onPress={() => {
                      setVariant(item.id);
                      setError("");
                    }}
                    style={[
                      s.variant,
                      variant === item.id && s.selected,
                      unavailable && s.unavailable,
                    ]}
                  >
                    <Text style={[s.variantText, variant === item.id && s.selectedText]}>
                      {item.nombreVariante || product.tituloPublico}
                    </Text>
                    {unavailable ? <Text style={s.note}>Sin existencias</Text> : null}
                  </Pressable>
                );
              })}
            </View>
          </View>
        ) : null}
        <View style={s.quantityRow}>
          <View style={{ flex: 1 }}>
            <Text style={s.label}>Cantidad</Text>
            <Text style={s.note}>
              {already ? `${already} ya en tu carrito` : "Elige cuántos quieres"}
            </Text>
          </View>
          <View style={s.stepper}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Reducir cantidad"
              disabled={(validQuantity(quantity) ?? 0) <= 1}
              onPress={() => adjust(-1)}
              style={s.stepButton}
            >
              <Icon name="remove" color={colors.brand} />
            </Pressable>
            <Text style={s.quantity}>{quantity}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Aumentar cantidad"
              disabled={
                !canAddQuantity(product, variant, (validQuantity(quantity) ?? 0) + 1, already)
              }
              onPress={() => adjust(1)}
              style={s.stepButton}
            >
              <Icon name="add" color={colors.brand} />
            </Pressable>
          </View>
        </View>
        <Pressable accessibilityRole="button" onPress={() => setCustomQuantity(!customQuantity)}>
          <Text style={s.backText}>
            {customQuantity ? "Ocultar cantidad manual" : "Escribir otra cantidad"}
          </Text>
        </Pressable>
        {customQuantity ? (
          <Input
            label="Cantidad (hasta 3 decimales)"
            keyboardType="decimal-pad"
            value={quantity}
            onChangeText={setQuantity}
            maxLength={10}
          />
        ) : null}
        {!allowed && selected ? (
          <Text style={s.warning}>
            {validQuantity(quantity) === null
              ? "Escribe una cantidad positiva con hasta 3 decimales."
              : "La cantidad supera lo disponible, incluyendo lo que ya tienes en el carrito."}
          </Text>
        ) : null}
        {error ? (
          <Text accessibilityRole="alert" style={s.error}>
            {error}
          </Text>
        ) : null}
        {status === "signedIn" && !ready ? (
          <View style={s.recovery}>
            <Text style={s.note}>
              Estamos recuperando tu carrito o verificando una compra pendiente.
            </Text>
            <Button
              label="Revisar mi carrito"
              variant="outline"
              onPress={() => router.push("/(app)/carrito")}
            />
          </View>
        ) : null}
        <SwipeAddButton
          inCart={already}
          onAdd={add}
          disabled={!allowed || (status === "signedIn" && !ready)}
        />
        {!selected && product.variantes.length > 1 ? (
          <Text style={s.note}>Selecciona una presentación para agregar.</Text>
        ) : null}
        {status !== "signedIn" ? (
          <Text style={s.note}>
            Puedes explorar libremente. Para guardar tu carrito te pediremos entrar.
          </Text>
        ) : null}
        {product.descripcionMd ? (
          <View style={s.descriptionBox}>
            <Text style={s.label}>Lo que lo hace especial</Text>
            <Text style={s.description}>{product.descripcionMd}</Text>
          </View>
        ) : null}
      </ScrollView>
      <CartDock />
    </View>
  );
}
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: {
    padding: space.lg,
    width: "100%",
    maxWidth: 800,
    alignSelf: "center",
    gap: 18,
    paddingBottom: 24,
  },
  back: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    alignSelf: "flex-start",
    paddingVertical: 8,
  },
  backText: { color: colors.brand, fontWeight: "600", fontSize: 13 },
  details: { gap: 8 },
  category: { fontSize: 10, letterSpacing: 1.4, fontWeight: "700", color: colors.muted },
  title: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: "800",
    letterSpacing: -0.6,
    color: colors.ink,
  },
  price: { fontSize: 32, color: commerce.forest, fontWeight: "800", letterSpacing: -0.8 },
  fromPrice: { fontSize: 15, fontWeight: "400" },
  offerRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  oldPrice: { color: colors.muted, textDecorationLine: "line-through", fontSize: 14 },
  offer: {
    backgroundColor: commerce.gold,
    color: commerce.forest,
    fontSize: 12,
    fontWeight: "800",
    borderRadius: 6,
    padding: 5,
  },
  note: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  stockRow: { flexDirection: "row", gap: 8, alignItems: "center", marginTop: 4 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.brand },
  outDot: { backgroundColor: colors.warn },
  stockText: { color: colors.text, fontSize: 12, flex: 1 },
  section: { gap: 12 },
  label: { color: colors.ink, fontWeight: "700", fontSize: 16 },
  variants: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  variant: {
    padding: 14,
    minHeight: 48,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    flexShrink: 1,
  },
  variantText: { color: colors.text, fontSize: 14, fontWeight: "600" },
  selected: { borderColor: colors.brand, backgroundColor: commerce.sage },
  selectedText: { color: colors.brand },
  unavailable: { opacity: 0.5 },
  quantityRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  stepper: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    backgroundColor: colors.card,
    overflow: "hidden",
  },
  stepButton: { padding: 12, minWidth: 44, minHeight: 44, alignItems: "center" },
  quantity: {
    minWidth: 28,
    maxWidth: 85,
    textAlign: "center",
    fontWeight: "800",
    color: colors.ink,
    fontSize: 16,
  },
  descriptionBox: { paddingTop: 20, borderTopWidth: 1, borderColor: colors.line, gap: 10 },
  description: { color: colors.text, fontSize: 15, lineHeight: 24 },
  warning: { color: colors.warn, fontSize: 13, lineHeight: 19 },
  error: { color: colors.danger, fontSize: 13 },
  recovery: { gap: 10 },
});
