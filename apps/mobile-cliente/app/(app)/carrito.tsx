import { useAuth } from "@/lib/auth-store";
import { accountCartKey, useCart, validQuantity } from "@/lib/cart-store";
import { restoreRemoteCart, saveRemoteCart } from "@/lib/cart-sync";
import { checkoutBlocksCart, useCheckout } from "@/lib/checkout-store";
import { money } from "@/lib/format";
import { storeConfig } from "@/services/comercio";
import { colors, radius, space } from "@/theme";
import { Button, EmptyState, Input } from "@/ui";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

const syncLabels = {
  loading: "Recuperando tu carrito…",
  saving: "Guardando y calculando precios…",
  dirty: "Cambios pendientes de guardar",
  saved: "Carrito guardado en tu cuenta",
  error: "Cambios sin confirmar",
};

export default function Carrito() {
  const { tenantSlug, user } = useAuth();
  const cart = useCart();
  const owner = tenantSlug && user ? accountCartKey(tenantSlug, user.id) : "";
  const checkout = useCheckout();
  const editable = cart.ready && !checkoutBlocksCart(checkout, owner);
  const lines = cart.owner === owner ? cart.lines : [];
  const quote = cart.owner === owner && cart.sync === "saved" ? cart.quote : null;
  const retry = () => {
    if (cart.ready) void saveRemoteCart(owner);
    else void restoreRemoteCart(owner);
  };
  return (
    <ScrollView
      style={s.root}
      contentContainerStyle={s.content}
      keyboardShouldPersistTaps="handled"
    >
      <Button
        label="Seguir viendo artículos"
        variant="outline"
        onPress={() => router.push("/(app)/tienda")}
      />
      <Text accessibilityLiveRegion="polite" style={s.text}>
        {syncLabels[cart.sync]}
      </Text>
      {cart.sync === "dirty" || cart.sync === "error" ? (
        <Text style={s.text}>
          Los cambios sin guardar pueden perderse si cierras la aplicación.
        </Text>
      ) : null}
      {cart.syncError ? (
        <>
          <Text accessibilityRole="alert" style={s.error}>
            {cart.syncError}
          </Text>
          <Button
            label="Reintentar"
            busy={cart.busy}
            disabled={checkoutBlocksCart(checkout, owner)}
            onPress={retry}
          />
        </>
      ) : null}
      {lines.length === 0 ? (
        <EmptyState
          title="Sin artículos seleccionados"
          subtitle={
            cart.sync === "saved"
              ? "Elige artículos en la tienda para comenzar."
              : "La sincronización debe terminar para confirmar tu carrito."
          }
        />
      ) : (
        <>
          {lines.map((line, index) => (
            <View key={line.varianteId} style={s.line}>
              <Text style={s.title}>{cart.names[line.varianteId] ?? `Artículo ${index + 1}`}</Text>
              <Quantity
                key={`${line.varianteId}:${line.cantidad}`}
                value={line.cantidad}
                disabled={!editable}
                apply={(quantity) => cart.change(owner, line.varianteId, quantity)}
              />
              <Button
                label="Quitar artículo"
                variant="ghost"
                disabled={!editable}
                onPress={() => cart.change(owner, line.varianteId, 0)}
              />
            </View>
          ))}
          <ConfiguredCoupon owner={owner} disabled={!editable} />
          <Button
            label="Actualizar precios y disponibilidad"
            busy={cart.busy}
            disabled={!editable}
            onPress={() => void saveRemoteCart(owner)}
          />
          {quote ? (
            <View style={s.line}>
              {quote.items.map((line) => (
                <Text key={line.varianteId} style={s.text}>
                  {line.nombre}: {line.cantidad} × {money(line.precioUnitario)} ={" "}
                  {money(line.subtotal)}
                </Text>
              ))}
              <Text style={s.total}>
                Total {money(quote.total)} {quote.moneda}
              </Text>
              <Text style={s.text}>Los precios pueden cambiar hasta confirmar la compra.</Text>
            </View>
          ) : (
            <Text style={s.text}>
              Precios pendientes de confirmar. Los cambios se guardan al recuperar la conexión y
              reintentar.
            </Text>
          )}
          <Button
            label="Vaciar carrito"
            variant="ghost"
            disabled={!editable}
            onPress={() => {
              for (const line of lines) cart.change(owner, line.varianteId, 0);
            }}
          />
        </>
      )}
      <Button
        label="Entrega y pago / Consultar compra"
        disabled={cart.busy}
        onPress={() => router.push("/(app)/checkout")}
      />
    </ScrollView>
  );
}
function ConfiguredCoupon({ owner, disabled }: { owner: string; disabled: boolean }) {
  const cart = useCart();
  const config = useQuery({
    queryKey: ["store-config", owner],
    queryFn: storeConfig,
    retry: false,
  });
  return config.data?.cuponEnCheckout ? (
    <Coupon key={cart.coupon} value={cart.coupon} disabled={disabled} apply={cart.setCoupon} />
  ) : null;
}
function Coupon({
  value,
  disabled,
  apply,
}: { value: string; disabled: boolean; apply: (coupon: string) => void }) {
  const [text, setText] = useState(value);
  return (
    <View style={s.line}>
      <Input
        label="Cupón (opcional)"
        value={text}
        onChangeText={setText}
        editable={!disabled}
        maxLength={80}
        autoCapitalize="characters"
      />
      <Button
        label="Guardar cupón"
        variant="outline"
        disabled={disabled || text.trim() === value}
        onPress={() => apply(text)}
      />
      {value ? (
        <Text style={s.text}>
          Cupón guardado, pendiente de validación al generar la referencia. El carrito aún no
          refleja su descuento.
        </Text>
      ) : null}
    </View>
  );
}
function Quantity({
  value,
  apply,
  disabled,
}: { value: number; apply: (quantity: number) => void; disabled: boolean }) {
  const [text, setText] = useState(String(value));
  const amount = validQuantity(text);
  return (
    <View style={{ gap: space.sm }}>
      <Input
        label="Cantidad"
        value={text}
        editable={!disabled}
        onChangeText={setText}
        keyboardType="decimal-pad"
      />
      <Button
        label="Aplicar cantidad"
        variant="outline"
        disabled={disabled || amount === null || amount === value}
        onPress={() => {
          if (amount !== null) apply(amount);
        }}
      />
      {amount === null ? (
        <Text style={s.error}>Usa una cantidad positiva con hasta 3 decimales.</Text>
      ) : null}
    </View>
  );
}
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: space.lg, gap: space.md, maxWidth: 800, width: "100%", alignSelf: "center" },
  line: { backgroundColor: colors.card, padding: space.lg, borderRadius: radius.md, gap: space.md },
  title: { color: colors.ink, fontWeight: "700", fontSize: 17 },
  text: { color: colors.text, fontSize: 15 },
  total: { color: colors.brand, fontWeight: "800", fontSize: 24 },
  note: { color: colors.warn, fontSize: 15 },
  error: { color: colors.danger, fontSize: 15 },
});
