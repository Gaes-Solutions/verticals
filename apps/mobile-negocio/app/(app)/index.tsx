import { useAuth } from "@/lib/auth-store";
import { money } from "@/lib/format";
import { getResumen } from "@/services/negocio";
import { colors, radius, shadow, space } from "@/theme";
import { Card, Icon, Loading, StatCard } from "@/ui";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";

export default function Inicio() {
  const { user, tenantSlug } = useAuth();
  const rol = user?.isOwner ? "Dueño" : (user?.roleCodes?.[0] ?? "Equipo");
  const q = useQuery({ queryKey: ["resumen", 30], queryFn: () => getResumen(30) });
  const d = q.data;

  return (
    <ScrollView
      style={{ backgroundColor: colors.bg }}
      contentContainerStyle={s.root}
      refreshControl={<RefreshControl refreshing={q.isFetching} onRefresh={() => q.refetch()} />}
    >
      <Text style={s.hola}>Hola, {user?.nombre ?? "bienvenido"} 👋</Text>
      <Text style={s.sub}>
        {rol} · {tenantSlug ?? "tu negocio"}
      </Text>

      <Pressable style={s.cobrar} onPress={() => router.push("/(app)/cobrar")}>
        <View style={s.cobrarIcon}>
          <Icon name="cart" size={24} color={colors.white} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.cobrarTitle}>Cobrar</Text>
          <Text style={s.cobrarSub}>Nueva venta en el punto de venta</Text>
        </View>
        <Icon name="chevron-forward" size={22} color={colors.white} />
      </Pressable>

      {q.isLoading ? (
        <Loading />
      ) : q.isError ? (
        <Card>
          <Text style={s.err}>No se pudieron cargar tus números. Desliza para reintentar.</Text>
        </Card>
      ) : d ? (
        <>
          <Text style={s.periodo}>Últimos {d.dias} días</Text>
          <View style={s.grid}>
            <StatCard label="Ventas" value={money(d.totalPeriodo)} icon="cash" highlight />
            <StatCard label="Tickets" value={String(d.numTickets)} icon="receipt" />
            <StatCard label="Ticket prom." value={money(d.ticketPromedio)} icon="pricetag" />
            <StatCard label="IVA" value={money(d.ivaPeriodo)} icon="calculator" />
          </View>

          {d.topProductos.length > 0 && (
            <Card style={{ marginTop: space.md }}>
              <Text style={s.cardTitle}>Más vendidos</Text>
              {d.topProductos.slice(0, 5).map((p, i) => (
                <View key={p.productoId} style={s.row}>
                  <View style={s.rank}>
                    <Text style={s.rankN}>{i + 1}</Text>
                  </View>
                  <Text style={s.rowName} numberOfLines={1}>
                    {p.nombre}
                  </Text>
                  <Text style={s.rowVal}>{money(p.monto)}</Text>
                </View>
              ))}
            </Card>
          )}
        </>
      ) : null}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  root: { padding: space.lg, gap: 4, paddingBottom: space.xxl },
  hola: { fontSize: 24, fontWeight: "800", color: colors.ink },
  sub: { fontSize: 14, color: colors.muted },
  cobrar: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    backgroundColor: colors.brand,
    borderRadius: radius.lg,
    padding: space.lg,
    marginTop: space.lg,
    ...shadow.card,
  },
  cobrarIcon: {
    width: 46,
    height: 46,
    borderRadius: radius.md,
    backgroundColor: colors.brandDark,
    alignItems: "center",
    justifyContent: "center",
  },
  cobrarTitle: { color: colors.white, fontSize: 18, fontWeight: "800" },
  cobrarSub: { color: colors.brandLight, fontSize: 13 },
  periodo: { fontSize: 13, color: colors.faint, marginTop: space.lg, marginBottom: 2 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  cardTitle: { fontSize: 15, fontWeight: "700", color: colors.ink, marginBottom: 4 },
  row: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingVertical: 7 },
  rank: {
    width: 24,
    height: 24,
    borderRadius: 999,
    backgroundColor: colors.brandLight,
    alignItems: "center",
    justifyContent: "center",
  },
  rankN: { fontSize: 12, fontWeight: "800", color: colors.brandDark },
  rowName: { flex: 1, color: colors.text, fontSize: 14 },
  rowVal: { color: colors.ink, fontWeight: "700", fontSize: 14 },
  err: { color: colors.danger, fontSize: 14 },
});
