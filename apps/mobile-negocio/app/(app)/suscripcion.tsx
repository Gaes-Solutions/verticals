import { fecha, money } from "@/lib/format";
import { getBillingMe, listInvoices } from "@/services/negocio";
import { colors, radius, shadow, space } from "@/theme";
import { Badge, Card, EmptyState, Icon, Loading } from "@/ui";
import { useQuery } from "@tanstack/react-query";
import { ScrollView, StyleSheet, Text, View } from "react-native";

function tono(s: string): "ok" | "warn" | "danger" | "neutral" {
  if (["active", "activa", "paid", "pagada"].includes(s)) return "ok";
  if (["trialing", "pending", "pendiente"].includes(s)) return "warn";
  if (["canceled", "cancelada", "unpaid", "vencida"].includes(s)) return "danger";
  return "neutral";
}

export default function Suscripcion() {
  const me = useQuery({ queryKey: ["billing-me"], queryFn: getBillingMe });
  const invoices = useQuery({ queryKey: ["invoices"], queryFn: listInvoices });
  if (me.isLoading) return <Loading />;
  const d = me.data;

  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={s.root}>
      <Card>
        <View style={s.row}>
          <View style={s.icon}>
            <Icon name="star" size={22} color={colors.brand} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.plan}>{d?.tenant.plan.name ?? "—"}</Text>
            <Text style={s.precio}>{money(d?.tenant.plan.priceMonthly ?? "0")}/mes</Text>
          </View>
          {d?.subscription ? (
            <Badge label={d.subscription.status} tone={tono(d.subscription.status)} />
          ) : null}
        </View>
        {d?.subscription?.currentPeriodEnd ? (
          <Text style={s.periodo}>
            Renueva el {fecha(d.subscription.currentPeriodEnd)} · {d.subscription.interval}
          </Text>
        ) : null}
      </Card>

      <Text style={s.h}>Facturas</Text>
      {invoices.isLoading ? (
        <Loading />
      ) : (invoices.data ?? []).length === 0 ? (
        <EmptyState icon="receipt-outline" title="Sin facturas" />
      ) : (
        invoices.data?.map((inv) => (
          <View key={inv.id} style={s.invoice}>
            <View style={{ flex: 1 }}>
              <Text style={s.folio}>{inv.folio}</Text>
              <Text style={s.fecha}>{fecha(inv.createdAt)}</Text>
            </View>
            <Text style={s.total}>{money(inv.total)}</Text>
            <Badge label={inv.status} tone={tono(inv.status)} />
          </View>
        ))
      )}
      <View style={{ height: space.xl }} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  root: { padding: space.lg },
  row: { flexDirection: "row", alignItems: "center", gap: space.md },
  icon: {
    width: 46,
    height: 46,
    borderRadius: radius.md,
    backgroundColor: colors.brandLight,
    alignItems: "center",
    justifyContent: "center",
  },
  plan: { fontSize: 18, fontWeight: "800", color: colors.ink },
  precio: { fontSize: 14, color: colors.muted },
  periodo: { fontSize: 13, color: colors.faint, marginTop: space.sm },
  h: {
    fontSize: 15,
    fontWeight: "800",
    color: colors.ink,
    marginTop: space.lg,
    marginBottom: space.sm,
  },
  invoice: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: space.md,
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    marginBottom: space.sm,
    ...shadow.card,
  },
  folio: { fontWeight: "700", color: colors.ink, fontSize: 14 },
  fecha: { color: colors.faint, fontSize: 12, marginTop: 2 },
  total: { fontWeight: "800", color: colors.ink, fontSize: 15 },
});
