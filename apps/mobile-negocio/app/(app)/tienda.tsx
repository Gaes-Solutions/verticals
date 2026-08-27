import {
  type ConfigTienda,
  countProductosPublicados,
  getEcommerceConfig,
  saveEcommerceConfig,
} from "@/services/negocio";
import { colors, radius, space } from "@/theme";
import { Card, Icon, Loading, StatCard } from "@/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, ScrollView, StyleSheet, Switch, Text, View } from "react-native";

export default function Tienda() {
  const qc = useQueryClient();
  const cfg = useQuery({ queryKey: ["ecommerce-config"], queryFn: getEcommerceConfig });
  const pubs = useQuery({ queryKey: ["productos-publicados"], queryFn: countProductosPublicados });

  const save = useMutation({
    mutationFn: (next: ConfigTienda) => saveEcommerceConfig(next),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["ecommerce-config"] }),
    onError: (e) => Alert.alert("No se pudo guardar", e instanceof Error ? e.message : "Error"),
  });

  if (cfg.isLoading) return <Loading />;
  const c = cfg.data ?? {};

  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={s.root}>
      <View style={s.grid}>
        <StatCard
          label="Productos publicados"
          value={String(pubs.data?.items?.length ?? 0)}
          icon="pricetags"
          highlight
        />
        <StatCard label="Estado" value={c.activa ? "En línea" : "Apagada"} icon="globe" />
      </View>

      <Card style={s.mt}>
        <View style={s.row}>
          <View style={s.icon}>
            <Icon name="globe" size={20} color={colors.brand} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.title}>Tienda en línea</Text>
            <Text style={s.sub}>Visible al público cuando está activa.</Text>
          </View>
          <Switch
            value={c.activa ?? false}
            onValueChange={(v) => save.mutate({ ...c, activa: v })}
            trackColor={{ true: colors.brand, false: colors.line }}
          />
        </View>
      </Card>

      <Card style={s.mt}>
        <Text style={s.label}>Dirección de tu tienda</Text>
        {c.subdominio ? (
          <Text style={s.url}>{c.subdominio}.shop.angaes.com</Text>
        ) : (
          <Text style={s.sub}>Sin subdominio configurado.</Text>
        )}
        {c.dominioPropio ? <Text style={s.url}>{c.dominioPropio}</Text> : null}
      </Card>
      <View style={{ height: space.xl }} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  root: { padding: space.lg },
  grid: { flexDirection: "row", gap: space.sm },
  mt: { marginTop: space.md },
  row: { flexDirection: "row", alignItems: "center", gap: space.md },
  icon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.brandLight,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontSize: 16, fontWeight: "800", color: colors.ink },
  sub: { fontSize: 13, color: colors.muted, marginTop: 2 },
  label: { fontSize: 13, fontWeight: "700", color: colors.text, marginBottom: 6 },
  url: { fontSize: 15, fontWeight: "600", color: colors.brand, marginTop: 2 },
});
