import { Button } from "@/ui";
import { initPaymentSheet, initStripe, presentPaymentSheet } from "@stripe/stripe-react-native";
import { useRef, useState } from "react";
import { Text, View } from "react-native";
import WebView from "react-native-webview";
import { type CardPaymentProps, cardHtml, cardMessage } from "./card-html";

export function CardPayment(props: CardPaymentProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const guard = useRef(false);
  async function pay() {
    if (guard.current || props.disabled || !props.clientSecret) return;
    guard.current = true;
    setBusy(true);
    setError("");
    try {
      await initStripe({
        publishableKey: props.publicKey,
        urlScheme: "gaessoft-cliente",
        ...(props.stripeAccountId ? { stripeAccountId: props.stripeAccountId } : {}),
      });
      const prepared = await initPaymentSheet({
        merchantDisplayName: "GaesSoft Tienda",
        paymentIntentClientSecret: props.clientSecret,
        returnURL: "gaessoft-cliente://stripe-redirect",
        allowsDelayedPaymentMethods: false,
      });
      if (prepared.error) throw new Error("No se pudo abrir el pago seguro");
      const result = await presentPaymentSheet();
      if (result.error) {
        setError(
          result.error.code === "Canceled"
            ? "Pago cancelado. Puedes continuar con este mismo pedido."
            : "No se confirmó el pago. Consulta el pedido antes de reintentar.",
        );
        return;
      }
      props.onConfirmed();
    } catch {
      setError("No se pudo confirmar el pago. El pedido se conserva para consultar su estado.");
    } finally {
      guard.current = false;
      setBusy(false);
    }
  }
  if (props.provider === "stripe")
    return (
      <View>
        <Button
          label="Pagar con tarjeta"
          busy={busy}
          disabled={props.disabled}
          onPress={() => void pay()}
        />
        {error ? <Text accessibilityRole="alert">{error}</Text> : null}
      </View>
    );
  return (
    <View style={{ height: 550 }} pointerEvents={props.disabled ? "none" : "auto"}>
      <WebView
        source={{ html: cardHtml(props), baseUrl: "https://payments.angaes.invalid" }}
        javaScriptEnabled
        domStorageEnabled={false}
        mixedContentMode="never"
        allowFileAccess={false}
        onShouldStartLoadWithRequest={(request) =>
          !request.isTopFrame ||
          request.url === "about:blank" ||
          request.url === "https://payments.angaes.invalid/"
        }
        onMessage={(event) => {
          try {
            const message = cardMessage(JSON.parse(event.nativeEvent.data));
            if (message && "token" in message && !props.disabled) props.onToken(message.token);
          } catch {
            setError("Respuesta de pago inválida");
          }
        }}
        onError={() => setError("No se pudo cargar el pago seguro. Revisa tu conexión.")}
      />
      {error ? <Text accessibilityRole="alert">{error}</Text> : null}
    </View>
  );
}
