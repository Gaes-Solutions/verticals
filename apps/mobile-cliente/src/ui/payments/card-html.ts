export interface CardPaymentProps {
  provider: "stripe" | "conekta";
  publicKey: string;
  clientSecret?: string;
  stripeAccountId?: string;
  onToken: (token: string) => void;
  onConfirmed: () => void;
  disabled?: boolean;
}
export function cardHtml(
  props: Pick<CardPaymentProps, "provider" | "publicKey" | "clientSecret" | "stripeAccountId">,
) {
  const config = JSON.stringify(props).replace(/</g, "\\u003c");
  const isStripe = props.provider === "stripe";
  return `<!doctype html><html lang="es"><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta charset="utf-8"><style>body{font:16px system-ui;color:#1e293b;margin:12px}label{display:block;margin-bottom:12px}input,button{font:inherit;box-sizing:border-box;min-height:44px;width:100%;padding:10px;border:1px solid #94a3b8;border-radius:8px}button{background:#0f766e;color:white}#error{color:#b91c1c}#card{min-height:200px}</style></head><body><form id="form">
${isStripe ? '<div id="card"></div>' : '<label>Nombre en la tarjeta<input id="name" autocomplete="cc-name" required maxlength="120"></label><label>Número de tarjeta<input id="number" inputmode="numeric" autocomplete="cc-number" required maxlength="23"></label><label>Mes (MM)<input id="month" inputmode="numeric" autocomplete="cc-exp-month" required maxlength="2"></label><label>Año (AAAA)<input id="year" inputmode="numeric" autocomplete="cc-exp-year" required maxlength="4"></label><label>Código de seguridad<input id="cvc" type="password" inputmode="numeric" autocomplete="cc-csc" required maxlength="4"></label>'}
<p id="error" role="alert"></p><button id="submit" disabled>${isStripe ? "Pagar con tarjeta" : "Continuar con esta tarjeta"}</button></form><script>
const config=${config};const button=document.getElementById('submit');const fail=()=>{document.getElementById('error').textContent='No se pudo confirmar la tarjeta. Revisa los datos o reintenta.';button.disabled=false;};
const send=(value)=>{const text=JSON.stringify(value);if(window.ReactNativeWebView)window.ReactNativeWebView.postMessage(text);else window.parent.postMessage({gaesCard:value},'*');};
const sdk=document.createElement('script');sdk.src=${JSON.stringify(isStripe ? "https://js.stripe.com/v3/" : "https://cdn.conekta.io/js/latest/conekta.js")};sdk.onerror=fail;
sdk.onload=()=>{let stripe,elements;if(config.provider==='stripe'){stripe=Stripe(config.publicKey,config.stripeAccountId?{stripeAccount:config.stripeAccountId}:{});elements=stripe.elements({clientSecret:config.clientSecret,locale:'es'});elements.create('payment').mount('#card');}else Conekta.setPublicKey(config.publicKey);button.disabled=false;
document.getElementById('form').onsubmit=async(e)=>{e.preventDefault();if(button.disabled)return;button.disabled=true;document.getElementById('error').textContent='';
if(config.provider==='stripe'){try{const result=await stripe.confirmPayment({elements,redirect:'if_required'});if(result.error){fail();return;}send({confirmed:true});}catch{fail();}}
else{Conekta.Token.create({card:{name:document.getElementById('name').value,number:document.getElementById('number').value.replace(/\\s/g,''),exp_month:document.getElementById('month').value,exp_year:document.getElementById('year').value,cvc:document.getElementById('cvc').value}},token=>{document.getElementById('form').reset();send({token:token.id});},fail);}};};document.head.appendChild(sdk);</script></body></html>`;
}
export function cardMessage(raw: unknown): { token: string } | { confirmed: true } | null {
  if (!raw || typeof raw !== "object") return null;
  if (
    "token" in raw &&
    typeof raw.token === "string" &&
    /^tok_[A-Za-z0-9_-]{5,180}$/.test(raw.token)
  )
    return { token: raw.token };
  if ("confirmed" in raw && raw.confirmed === true) return { confirmed: true };
  return null;
}
