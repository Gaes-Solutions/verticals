import { useAuth } from "@/lib/auth-store";
import { accountCartKey, useCart, validQuantity } from "@/lib/cart-store";
import { checkoutBlocksCart, useCheckout } from "@/lib/checkout-store";
import { money } from "@/lib/format";
import { type StoreProduct, getStoreProduct } from "@/services/comercio";
import { colors, radius, space } from "@/theme";
import { Button, EmptyState, Input, Loading } from "@/ui";
import { CommerceError } from "@/ui/CommerceError";
import { useQuery } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text } from "react-native";

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
  const { tenantSlug, user } = useAuth();
  const checkout = useCheckout();
  const ready = useCart((state) => state.ready) && !checkoutBlocksCart(checkout);
  const [variant, setVariant] = useState(
    product.variantes.length === 1 ? (product.variantes[0]?.id ?? "") : "",
  );
  const [quantity, setQuantity] = useState("1");
  const [error, setError] = useState("");
  const selected = product.variantes.find((item) => item.id === variant);
  const add = () => {
    if (!tenantSlug || !user) return;
    const amount = validQuantity(quantity);
    if (amount === null || !selected) {
      setError("Selecciona una presentación y una cantidad válida.");
      return;
    }
    try {
      useCart
        .getState()
        .add(
          accountCartKey(tenantSlug, user.id),
          selected.id,
          amount,
          `${product.tituloPublico}${selected.nombreVariante ? ` · ${selected.nombreVariante}` : ""}`,
        );
      router.push("/(app)/carrito");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo agregar.");
    }
  };
  return (
    <ScrollView
      style={s.root}
      contentContainerStyle={s.content}
      keyboardShouldPersistTaps="handled"
    >
      <Button
        label="Volver a la tienda"
        variant="ghost"
        onPress={() => router.push("/(app)/tienda")}
      />
      {product.fotosArray[0] ? (
        <Image source={{ uri: product.fotosArray[0] }} style={s.photo} resizeMode="contain" />
      ) : null}
      <Text style={s.title}>{product.tituloPublico}</Text>
      <Text style={s.price}>
        {selected ? money(selected.precioBase) : `Desde ${money(product.precioDesde)}`}
      </Text>
      <Text style={s.note}>
        El precio final y la disponibilidad se confirman al calcular el carrito.
      </Text>
      {product.descripcionMd ? <Text style={s.description}>{product.descripcionMd}</Text> : null}
      <Text style={s.label}>Selecciona una presentación</Text>
      {product.variantes.map((item) => (
        <Pressable
          key={item.id}
          accessibilityRole="radio"
          accessibilityState={{ checked: variant === item.id }}
          onPress={() => setVariant(item.id)}
          style={[s.variant, variant === item.id && s.selected]}
        >
          <Text style={s.description}>
            {item.nombreVariante || product.tituloPublico} · {money(item.precioBase)}
          </Text>
        </Pressable>
      ))}
      <Input
        label="Cantidad (hasta 3 decimales)"
        keyboardType="decimal-pad"
        value={quantity}
        onChangeText={setQuantity}
      />
      {product.stockPublico === 0 ? <Text style={s.note}>Sin existencias disponibles</Text> : null}
      {error ? (
        <Text accessibilityRole="alert" style={s.error}>
          {error}
        </Text>
      ) : null}
      {!ready ? (
        <>
          <Text style={s.note}>
            Espera a recuperar tu carrito. Si no termina, abre el carrito y vuelve a intentar.
          </Text>
          <Button
            label="Ver estado del carrito"
            variant="outline"
            onPress={() => router.push("/(app)/carrito")}
          />
        </>
      ) : null}
      <Button
        label="Agregar al carrito"
        icon="cart"
        disabled={
          !ready || !selected || product.stockPublico === 0 || validQuantity(quantity) === null
        }
        onPress={add}
      />
    </ScrollView>
  );
}
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: space.lg, width: "100%", maxWidth: 800, alignSelf: "center", gap: space.md },
  photo: { height: 240, width: "100%", backgroundColor: colors.card, borderRadius: radius.md },
  title: { fontSize: 24, fontWeight: "800", color: colors.ink },
  price: { fontSize: 26, color: colors.brand, fontWeight: "800" },
  note: { color: colors.muted, fontSize: 14 },
  description: { color: colors.text, fontSize: 16 },
  label: { color: colors.ink, fontWeight: "700", fontSize: 16 },
  variant: {
    padding: space.lg,
    minHeight: 48,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
  },
  selected: { borderColor: colors.brand, backgroundColor: colors.brandLight },
  error: { color: colors.danger },
});
