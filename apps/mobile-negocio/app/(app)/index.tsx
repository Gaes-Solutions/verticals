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
  const puede = (perm: string) =>
    user?.isOwner === true || (user?.permissions ?? []).includes(perm);
  const q = useQuery({ queryKey: ["resumen", 30], queryFn: () => getResumen(30) });
  const d = q.data;

  const accesos = [
    {
      perm: "pedidos.leer",
      icon: "cube" as const,
      label: "Pedidos",
      to: "/(app)/pedidos" as const,
    },
    {
      perm: "clientes.leer",
      icon: "people" as const,
      label: "Clientes",
      to: "/(app)/clientes" as const,
    },
    {
      perm: "productos.leer",
      icon: "pricetags" as const,
      label: "Productos",
      to: "/(app)/productos" as const,
    },
    {
      perm: "compras_oc.leer",
      icon: "cart" as const,
      label: "Compras",
      to: "/(app)/compras" as const,
    },
    {
      perm: "ventas.leer",
      icon: "return-down-back" as const,
      label: "Devoluciones",
      to: "/(app)/devoluciones" as const,
    },
    {
      perm: "reportes.ventas",
      icon: "bar-chart" as const,
      label: "Reportes",
      to: "/(app)/reportes" as const,
    },
  ].filter((a) => puede(a.perm));

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

      {accesos.length > 0 ? (
        <View style={s.accesos}>
          {accesos.map((a) => (
            <Pressable key={a.label} style={s.acceso} onPress={() => router.push(a.to)}>
              <Icon name={a.icon} size={22} color={colors.brand} />
              <Text style={s.accesoLabel}>{a.label}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

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
  accesos: { flexDirection: "row", flexWrap: "wrap", gap: space.sm, marginTop: space.sm },
  acceso: {
    flexGrow: 1,
    minWidth: "46%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.sm,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    paddingVertical: space.md,
    ...shadow.card,
  },
  accesoLabel: { fontSize: 14, fontWeight: "700", color: colors.ink },
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
