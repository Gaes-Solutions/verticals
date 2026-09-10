import { useAuth } from "@/lib/auth-store";
import { accountCartKey, useCart } from "@/lib/cart-store";
import { type CheckoutAddress, deliveryContext, validCheckoutAddress } from "@/lib/checkout-model";
import { initiateCheckout, recoverCheckout, useCheckout } from "@/lib/checkout-store";
import { money } from "@/lib/format";
import { deliveryOptions, paymentConfig } from "@/services/checkout";
import { listDirecciones } from "@/services/cliente";
import { colors, radius, space } from "@/theme";
import { Button, EntraParaVer, Input } from "@/ui";
import { CommerceError } from "@/ui/CommerceError";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

export default function Checkout() {
  const { status, tenantSlug, user } = useAuth();
  // Mirar el catálogo es libre; pagar no. Aquí sí hace falta correo y
  // dirección, así que es el único punto donde se pide la cuenta.
  if (status !== "signedIn")
    return (
      <EntraParaVer
        icono="lock-closed"
        titulo="Crea tu cuenta para pagar"
        texto="Necesitamos un correo y una dirección para enviarte tu pedido. Tu carrito se conserva."
      />
    );
  const owner = tenantSlug && user ? accountCartKey(tenantSlug, user.id) : "";
  return <CheckoutScreen key={owner} owner={owner} name={user?.nombre ?? ""} />;
}
function useCheckoutForm({ owner, name }: { owner: string; name: string }) {
  const cart = useCart();
  const checkout = useCheckout();
  const [address, setAddress] = useState<CheckoutAddress>({
    nombre: name,
    calle: "",
    ciudad: "",
    estado: "",
    cp: "",
  });
  const [mode, setMode] = useState<"paqueteria" | "click_collect">("paqueteria");
  const [selection, setSelection] = useState<{ context: string; id: string } | null>(null);
  const [payment, setPayment] = useState<"oxxo" | "spei" | null>(null);
  const sameCart =
    cart.owner === owner && cart.sync === "saved" && !!cart.cartId && cart.lines.length > 0;
  const context = deliveryContext(cart.cartId ?? "", cart.revision, address);
  const config = useQuery({
    queryKey: ["payment-config", owner],
    queryFn: paymentConfig,
    retry: false,
  });
  const addresses = useQuery({
    queryKey: ["checkout-addresses", owner],
    queryFn: listDirecciones,
    retry: false,
  });
  const delivery = useQuery({
    queryKey: ["checkout-delivery", owner, context, mode],
    queryFn: () =>
      deliveryOptions(
        cart.cartId ?? "",
        mode === "click_collect" ? "" : address.cp,
        mode === "click_collect" ? "" : address.estado,
      ),
    enabled:
      sameCart &&
      (mode === "click_collect" ||
        (/^\d{5}$/.test(address.cp) && address.estado.trim().length >= 2)),
    retry: false,
  });
  useEffect(() => {
    if (owner) void recoverCheckout(owner);
  }, [owner]);
  const locked = checkout.owner === owner && checkout.submitted && checkout.outcome !== "confirmed";
  const selected = selection?.context === `${context}:${mode}` ? selection.id : null;
  const selectedExists =
    mode === "paqueteria"
      ? delivery.data?.opcionesEnvio.some((item) => item.tarifaId === selected)
      : delivery.data?.pickup.some((item) => item.sucursalId === selected);
  const canSubmit =
    sameCart &&
    checkout.recovered &&
    !locked &&
    selectedExists &&
    !delivery.isError &&
    !delivery.isFetching &&
    !config.isError &&
    payment &&
    config.data?.proveedor === "conekta" &&
    config.data.metodos.includes(payment) &&
    (mode === "click_collect" || validCheckoutAddress(address));
  const submit = () => {
    if (!canSubmit || !cart.cartId || !selected || !payment) return;
    void initiateCheckout(owner, {
      carritoId: cart.cartId,
      metodoPago: payment,
      metodoEnvio: mode,
      ...(mode === "click_collect"
        ? { sucursalPickupId: selected }
        : { tarifaEnvioId: selected, direccionEnvio: address }),
    });
  };
  return {
    context,
    selected,
    cart,
    checkout,
    address,
    setAddress,
    mode,
    setMode,
    selection,
    setSelection,
    payment,
    setPayment,
    sameCart,
    config,
    addresses,
    delivery,
    locked,
    canSubmit,
    submit,
  };
}
function CheckoutScreen({ owner, name }: { owner: string; name: string }) {
  const form = useCheckoutForm({ owner, name });
  const {
    cart,
    checkout,
    address,
    setAddress,
    mode,
    sameCart,
    config,
    addresses,
    delivery,
    locked,
    canSubmit,
    submit,
  } = form;
  return (
    <ScrollView
      style={s.root}
      contentContainerStyle={s.content}
      keyboardShouldPersistTaps="handled"
    >
      <Button
        label="Volver al carrito"
        variant="ghost"
        onPress={() => router.push("/(app)/carrito")}
      />
      <AttemptStatus owner={owner} />
      {sameCart && !locked ? (
        <>
          <Text style={s.title}>Entrega y pago</Text>
          <Text style={s.text}>
            Artículos: {money(cart.quote?.total ?? "0")}. El envío y los descuentos se confirman en
            el servidor al generar la referencia.
          </Text>
          <DeliveryMode form={form} />
          <SavedAddresses form={form} name={name} />
          {addresses.isError ? (
            <Text style={s.text}>No pudimos cargar tus direcciones. Puedes escribirla abajo.</Text>
          ) : null}
          <AddressFields address={address} change={setAddress} full={mode === "paqueteria"} />
          <Text style={s.text}>
            Código postal y estado permiten consultar entrega y sucursales disponibles.
          </Text>
          {delivery.isFetching ? (
            <Text style={s.text}>Consultando opciones de entrega…</Text>
          ) : null}
          {delivery.isError ? (
            <CommerceError error={delivery.error} retry={() => void delivery.refetch()} />
          ) : null}
          <DeliveryChoices form={form} />
          <Text style={s.title}>Método de pago</Text>
          {config.isFetching ? <Text style={s.text}>Consultando métodos…</Text> : null}
          {config.isError ? (
            <CommerceError error={config.error} retry={() => void config.refetch()} />
          ) : null}
          <PaymentChoices form={form} />
          <Text style={s.text}>
            Tarjeta no disponible en esta versión. Generar una referencia OXXO/SPEI no significa que
            el pago esté recibido.
          </Text>
          <Button
            label="Generar referencia de pago"
            busy={checkout.busy}
            disabled={!canSubmit}
            onPress={submit}
          />
        </>
      ) : null}
    </ScrollView>
  );
}
function DeliveryMode({ form }: { form: ReturnType<typeof useCheckoutForm> }) {
  return (
    <View style={s.row}>
      <Button
        label="Envío a domicilio"
        variant={form.mode === "paqueteria" ? "primary" : "outline"}
        onPress={() => form.setMode("paqueteria")}
      />
      <Button
        label="Recoger en tienda"
        variant={form.mode === "click_collect" ? "primary" : "outline"}
        onPress={() => form.setMode("click_collect")}
      />
    </View>
  );
}
function PaymentChoices({ form }: { form: ReturnType<typeof useCheckoutForm> }) {
  const methods = (["oxxo", "spei"] as const).filter(
    (method) =>
      form.config.data?.proveedor === "conekta" && form.config.data.metodos.includes(method),
  );
  return (
    <View style={s.row}>
      {methods.map((method) => (
        <Button
          key={method}
          label={method.toUpperCase()}
          variant={form.payment === method ? "primary" : "outline"}
          onPress={() => form.setPayment(method)}
        />
      ))}
    </View>
  );
}
function SavedAddresses({
  form,
  name,
}: { form: ReturnType<typeof useCheckoutForm>; name: string }) {
  if (form.mode !== "paqueteria") return null;
  return (
    <>
      {form.addresses.data?.map((item) => (
        <Button
          key={item.id}
          label={`Usar dirección: ${item.etiqueta}`}
          variant="outline"
          onPress={() =>
            form.setAddress({
              nombre: name,
              calle: item.calle,
              numero: item.numeroExterior ?? "",
              colonia: item.colonia ?? "",
              ciudad: item.municipio ?? "",
              estado: item.estado,
              cp: item.codigoPostal,
              referencias: item.referencias ?? "",
            })
          }
        />
      ))}
    </>
  );
}
function DeliveryChoices({ form }: { form: ReturnType<typeof useCheckoutForm> }) {
  const { delivery, mode, selected, setSelection, context } = form;
  if (!delivery.data) return null;
  const items =
    mode === "paqueteria"
      ? delivery.data.opcionesEnvio.map((item) => ({
          id: item.tarifaId,
          label: `${item.nombrePublico}: ${money(item.costo)}`,
        }))
      : delivery.data.pickup.map((item) => ({ id: item.sucursalId, label: item.nombre }));
  return (
    <View style={s.card}>
      {items.map((item) => (
        <Button
          key={item.id}
          label={item.label}
          variant={selected === item.id ? "primary" : "outline"}
          onPress={() => setSelection({ context: `${context}:${mode}`, id: item.id })}
        />
      ))}
      {items.length === 0 ? (
        <Text style={s.text}>
          No hay opciones para esta entrega. Prueba otra dirección o modalidad.
        </Text>
      ) : null}
    </View>
  );
}
const addressLimits: Record<keyof CheckoutAddress, number> = {
  nombre: 150,
  calle: 200,
  numero: 30,
  colonia: 120,
  ciudad: 120,
  estado: 100,
  cp: 5,
  telefono: 40,
  referencias: 300,
};
function AddressFields({
  address,
  change,
  full,
}: { address: CheckoutAddress; change: (address: CheckoutAddress) => void; full: boolean }) {
  if (!full) return null;
  const fields: { key: keyof CheckoutAddress; label: string }[] = full
    ? [
        { key: "nombre", label: "Nombre de quien recibe" },
        { key: "calle", label: "Calle" },
        { key: "numero", label: "Número" },
        { key: "colonia", label: "Colonia" },
        { key: "ciudad", label: "Ciudad / municipio" },
        { key: "estado", label: "Estado" },
        { key: "cp", label: "Código postal" },
        { key: "telefono", label: "Teléfono (opcional)" },
      ]
    : [
        { key: "estado", label: "Estado" },
        { key: "cp", label: "Código postal" },
      ];
  return (
    <View style={s.card}>
      {fields.map((field) => (
        <Input
          key={field.key}
          label={field.label}
          value={address[field.key] ?? ""}
          maxLength={addressLimits[field.key]}
          keyboardType={field.key === "cp" ? "number-pad" : "default"}
          onChangeText={(value) => change({ ...address, [field.key]: value })}
        />
      ))}
    </View>
  );
}
function AttemptStatus({ owner }: { owner: string }) {
  const state = useCheckout();
  if (state.owner !== owner) return null;
  return (
    <View style={s.card}>
      <Text style={s.title}>
        {state.outcome === "confirmed"
          ? "Pago confirmado por la tienda"
          : state.outcome === "failed"
            ? "El pago no pudo completarse"
            : state.submitted
              ? "Compra pendiente de confirmación"
              : "Verificación de compras anteriores"}
      </Text>
      {state.attempt ? (
        <>
          <Text selectable style={s.text}>
            Pedido {state.attempt.folioPublico} · {money(state.attempt.total)}
          </Text>
          {state.attempt.referenciaPago ? (
            <>
              <Text style={s.text}>Referencia de pago:</Text>
              <Text selectable style={s.reference}>
                {state.attempt.referenciaPago}
              </Text>
            </>
          ) : null}
        </>
      ) : null}
      {state.error ? (
        <Text accessibilityRole="alert" style={s.error}>
          {state.error}
        </Text>
      ) : null}
      {state.submitted ? (
        <Text style={s.text}>
          Consulta este mismo intento. No generes otro pago mientras se confirma el resultado.
        </Text>
      ) : null}
      <Button
        label="Consultar estado de la compra"
        variant="outline"
        busy={state.busy}
        onPress={() => void recoverCheckout(owner)}
      />
      {state.outcome === "confirmed" ? (
        <Button label="Ver mis pedidos" onPress={() => router.push("/(app)")} />
      ) : null}
    </View>
  );
}
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: space.lg, width: "100%", maxWidth: 800, alignSelf: "center", gap: space.md },
  card: { backgroundColor: colors.card, borderRadius: radius.md, padding: space.lg, gap: space.md },
  row: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  title: { fontSize: 20, fontWeight: "800", color: colors.ink },
  text: { fontSize: 15, color: colors.text },
  error: { color: colors.danger },
  reference: { fontSize: 22, color: colors.brand, fontWeight: "800" },
});
