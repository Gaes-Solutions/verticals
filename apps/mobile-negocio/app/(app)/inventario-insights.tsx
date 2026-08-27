import { money } from "@/lib/format";
import { getInventarioInsights } from "@/services/negocio";
import { colors, space } from "@/theme";
import { Badge, Card, EmptyState, Icon, Loading } from "@/ui";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

export default function InventarioInsights() {
  const q = useQuery({ queryKey: ["inv-insights"], queryFn: getInventarioInsights });
  if (q.isLoading) return <Loading />;
  const d = q.data;
  if (!d) return <EmptyState icon="analytics-outline" title="Sin datos" />;

  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={s.root}>
      <Text style={s.intro}>Qué reordenar, qué liquidar y qué te deja más margen.</Text>

      <Section
        icon="alert-circle"
        tono={colors.warn}
        titulo="Reordenar pronto"
        vacio="Nada urgente 👍"
        items={d.reordenar}
        render={(r) => (
          <>
            <View style={{ flex: 1 }}>
              <Text style={s.nombre} numberOfLines={1}>
                {r.nombre}
              </Text>
              <Text style={s.sku}>
                {r.sku} · stock {r.stock}
              </Text>
            </View>
            <Badge label={`+${r.sugerenciaReorden}`} tone="warn" />
          </>
        )}
      />

      <Section
        icon="pause-circle"
        tono={colors.muted}
        titulo="Estancados (dinero detenido)"
        vacio="Nada estancado."
        items={d.estancados}
        render={(r) => (
          <>
            <View style={{ flex: 1 }}>
              <Text style={s.nombre} numberOfLines={1}>
                {r.nombre}
              </Text>
              <Text style={s.sku}>
                {r.sku} · stock {r.stock}
              </Text>
            </View>
            <Text style={s.val}>{money(r.valorInmovilizado)}</Text>
          </>
        )}
      />

      <Section
        icon="trending-up"
        tono={colors.ok}
        titulo="Los que más margen dejan"
        vacio="Sin ventas aún."
        items={d.topVendidos}
        render={(r) => (
          <>
            <View style={{ flex: 1 }}>
              <Text style={s.nombre} numberOfLines={1}>
                {r.nombre}
              </Text>
              <Text style={s.sku}>
                {r.sku} · {r.vendido} vendidos
              </Text>
            </View>
            <Text style={[s.val, { color: colors.ok }]}>{money(r.margenTotal)}</Text>
          </>
        )}
      />
      <View style={{ height: space.xl }} />
    </ScrollView>
  );
}

function Section<T>({
  icon,
  tono,
  titulo,
  vacio,
  items,
  render,
}: {
  icon: "alert-circle" | "pause-circle" | "trending-up";
  tono: string;
  titulo: string;
  vacio: string;
  items: T[];
  render: (x: T) => ReactNode;
}) {
  return (
    <View style={s.mt}>
      <View style={s.secHead}>
        <Icon name={icon} size={18} color={tono} />
        <Text style={s.h}>{titulo}</Text>
      </View>
      <Card>
        {items.length === 0 ? (
          <Text style={s.vacio}>{vacio}</Text>
        ) : (
          items.map((it, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: lista estática sin id, orden fijo
            <View key={i} style={[s.row, i < items.length - 1 && s.rowBorder]}>
              {render(it)}
            </View>
          ))
        )}
      </Card>
    </View>
  );
}

const s = StyleSheet.create({
  root: { padding: space.lg },
  intro: { color: colors.muted, fontSize: 14, marginBottom: space.sm },
  mt: { marginTop: space.md },
  secHead: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: space.sm },
  h: { fontSize: 15, fontWeight: "800", color: colors.ink },
  row: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingVertical: 9 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.line },
  nombre: { fontWeight: "600", color: colors.ink, fontSize: 14 },
  sku: { color: colors.faint, fontSize: 12, marginTop: 2 },
  val: { fontWeight: "800", color: colors.ink, fontSize: 14 },
  vacio: { color: colors.muted, fontSize: 14, paddingVertical: 4 },
});
