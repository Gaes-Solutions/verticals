import { useAuth } from "@/lib/auth-store";
import { accountCartKey, useCart, validQuantity } from "@/lib/cart-store";
import { restoreRemoteCart, saveRemoteCart } from "@/lib/cart-sync";
import { checkoutBlocksCart, useCheckout } from "@/lib/checkout-store";
import { money } from "@/lib/format";
import { storeConfig } from "@/services/comercio";
import { colors, commerce, radius, space } from "@/theme";
import { Button, EmptyState, EntraParaVer, Icon, Input } from "@/ui";
import { CartDock } from "@/ui/CartDock";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

const syncLabels = {
  loading: "Recuperando tu carrito…",
  saving: "Confirmando precios…",
  dirty: "Actualizando tu carrito…",
  saved: "Carrito guardado en tu cuenta",
  error: "Cambios sin confirmar",
};

export default function Carrito() {
  const { status } = useAuth();
  if (status !== "signedIn")
    return (
      <EntraParaVer
        icono="bag-handle-outline"
        titulo="Tu carrito, siempre contigo"
        texto="Entra para guardar los artículos que te gustan y continuar tu compra."
      />
    );
  return <CartScreen />;
}
function CartScreen() {
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
    <View style={s.root}>
      <ScrollView
        style={s.root}
        contentContainerStyle={s.content}
        keyboardShouldPersistTaps="handled"
      >
        <View style={s.heading}>
          <Text style={s.kicker}>ELEGIDO POR TI</Text>
          <Text style={s.pageTitle}>Tu carrito</Text>
          <Text style={s.text}>
            {lines.length} {lines.length === 1 ? "artículo" : "artículos"} · Revisa, ajusta y
            continúa.
          </Text>
        </View>
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
                <View style={s.lineHeader}>
                  <View style={s.lineIcon}>
                    <Icon name="bag-handle-outline" color={commerce.forest} size={25} />
                  </View>
                  <Text style={s.title}>
                    {cart.names[line.varianteId] ?? `Artículo ${index + 1}`}
                  </Text>
                </View>
                {quote?.items.find((item) => item.varianteId === line.varianteId) ? (
                  <Text style={s.text}>
                    {money(
                      quote.items.find((item) => item.varianteId === line.varianteId)
                        ?.precioUnitario ?? 0,
                    )}{" "}
                    por unidad
                  </Text>
                ) : null}
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
                  Subtotal {money(quote.total)} {quote.moneda}
                </Text>
                <Text style={s.text}>
                  El envío y los descuentos se confirman al elegir entrega y pago.
                </Text>
              </View>
            ) : (
              <Text style={s.text}>
                Precios pendientes de confirmar. Los cambios se guardan al recuperar la conexión y
                reintentar.
              </Text>
            )}
          </>
        )}
      </ScrollView>
      <CartDock showCart={false} />
      <View style={s.checkoutBar}>
        {quote ? (
          <View style={s.summaryRow}>
            <Text style={s.text}>Subtotal de artículos</Text>
            <Text style={s.summaryTotal}>{money(quote.total)}</Text>
          </View>
        ) : null}
        <Button
          label={
            checkoutBlocksCart(checkout, owner)
              ? "Consultar mi compra"
              : cart.busy
                ? "Guardando tu carrito…"
                : "Elegir entrega y pago"
          }
          icon="arrow-forward"
          disabled={cart.busy || (!quote && !checkoutBlocksCart(checkout, owner))}
          onPress={() => router.push("/(app)/checkout")}
        />
      </View>
    </View>
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
  const [custom, setCustom] = useState(false);
  const amount = validQuantity(text);
  return (
    <View style={{ gap: space.sm }}>
      <View style={s.stepperRow}>
        <Text style={s.text}>Cantidad</Text>
        <View style={s.stepper}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Reducir cantidad"
            disabled={disabled || value <= 1}
            onPress={() => apply(Math.max(0.001, Math.round((value - 1) * 1000) / 1000))}
            style={s.stepButton}
          >
            <Icon name="remove" color={colors.brand} />
          </Pressable>
          <Text style={s.quantityValue}>{value}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Aumentar cantidad"
            disabled={disabled || validQuantity(value + 1) === null}
            onPress={() => apply(Math.round((value + 1) * 1000) / 1000)}
            style={s.stepButton}
          >
            <Icon name="add" color={colors.brand} />
          </Pressable>
        </View>
      </View>
      <Pressable accessibilityRole="button" onPress={() => setCustom(!custom)}>
        <Text style={s.manualQuantity}>
          {custom ? "Cerrar cantidad manual" : "Escribir otra cantidad"}
        </Text>
      </Pressable>
      {custom ? (
        <>
          <Input
            label="Otra cantidad (opcional)"
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
        </>
      ) : null}
      {custom && amount === null ? (
        <Text style={s.error}>Usa una cantidad positiva con hasta 3 decimales.</Text>
      ) : null}
    </View>
  );
}
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: {
    padding: space.lg,
    gap: 18,
    maxWidth: 800,
    width: "100%",
    alignSelf: "center",
    paddingBottom: 24,
  },
  heading: { gap: 7 },
  kicker: { color: colors.muted, fontSize: 10, letterSpacing: 1.8, fontWeight: "700" },
  pageTitle: { color: commerce.forest, fontSize: 32, letterSpacing: -0.8, fontWeight: "800" },
  lineHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  lineIcon: {
    width: 50,
    height: 50,
    borderRadius: 13,
    backgroundColor: commerce.sage,
    justifyContent: "center",
    alignItems: "center",
  },
  checkoutBar: {
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderColor: colors.line,
    padding: 16,
    gap: 12,
  },
  summaryRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  summaryTotal: { color: commerce.forest, fontWeight: "800", fontSize: 22 },
  stepperRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  stepper: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
  },
  stepButton: { padding: 10, minHeight: 44, minWidth: 44, alignItems: "center" },
  manualQuantity: { color: colors.brand, fontSize: 12, fontWeight: "600", paddingVertical: 8 },
  quantityValue: { color: colors.ink, fontWeight: "700", minWidth: 26, textAlign: "center" },
  line: {
    backgroundColor: colors.card,
    padding: 18,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: "#e3e8e2",
    gap: 14,
  },
  title: { color: colors.ink, fontWeight: "700", fontSize: 17, flex: 1 },
  text: { color: colors.text, fontSize: 15 },
  total: { color: colors.brand, fontWeight: "800", fontSize: 24 },
  note: { color: colors.warn, fontSize: 15 },
  error: { color: colors.danger, fontSize: 15 },
});
