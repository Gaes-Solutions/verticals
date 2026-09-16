import { useEffect, useRef } from "react";
import { type CardPaymentProps, cardHtml, cardMessage } from "./card-html";
export function CardPayment(props: CardPaymentProps) {
  const frame = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (props.disabled || event.source !== frame.current?.contentWindow) return;
      const message = cardMessage(event.data?.gaesCard);
      if (message && "token" in message && props.provider === "conekta")
        props.onToken(message.token);
      if (message && "confirmed" in message && props.provider === "stripe") props.onConfirmed();
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [props.disabled, props.onToken, props.onConfirmed, props.provider]);
  return (
    <iframe
      ref={frame}
      title="Pago seguro con tarjeta"
      srcDoc={cardHtml(props)}
      sandbox="allow-scripts allow-forms allow-popups allow-same-origin"
      allow="payment"
      style={{
        height: 550,
        width: "100%",
        border: 0,
        pointerEvents: props.disabled ? "none" : "auto",
      }}
    />
  );
}
