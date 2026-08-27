import { money } from "@/lib/format";
import { listPickup, listTarifas, listZonas } from "@/services/negocio";
import { colors, radius, space } from "@/theme";
import { Badge, Card, EmptyState, Icon, Loading } from "@/ui";
import { useQuery } from "@tanstack/react-query";
import { ScrollView, StyleSheet, Text, View } from "react-native";

export default function Envios() {
  const zonas = useQuery({ queryKey: ["envios-zonas"], queryFn: listZonas });
  const tarifas = useQuery({ queryKey: ["envios-tarifas"], queryFn: listTarifas });
  const pickup = useQuery({ queryKey: ["envios-pickup"], queryFn: listPickup });

  if (zonas.isLoading || tarifas.isLoading || pickup.isLoading) return <Loading />;

  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={s.root}>
      <Text style={s.h}>Tarifas de envío</Text>
      {(tarifas.data ?? []).length === 0 ? (
        <EmptyState icon="pricetag-outline" title="Sin tarifas" />
      ) : (
        tarifas.data?.map((t) => (
          <Card key={t.id} style={s.mt}>
            <View style={s.row}>
              <View style={s.icon}>
                <Icon name="cube" size={18} color={colors.brand} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.nombre}>{t.nombrePublico}</Text>
                <Text style={s.meta}>
                  {t.paqueteria} · {t.tipoCalculo}
                  {t.diasEntregaEstimados ? ` · ${t.diasEntregaEstimados} días` : ""}
                </Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                {t.montoFijo ? <Text style={s.precio}>{money(t.montoFijo)}</Text> : null}
                <Badge
                  label={t.isActive ? "activa" : "inactiva"}
                  tone={t.isActive ? "ok" : "neutral"}
                />
              </View>
            </View>
            {t.montoMinimoEnvioGratis ? (
              <Text style={s.gratis}>Envío gratis desde {money(t.montoMinimoEnvioGratis)}</Text>
            ) : null}
          </Card>
        ))
      )}

      <Text style={[s.h, s.mt]}>Zonas de cobertura</Text>
      {(zonas.data ?? []).length === 0 ? (
        <EmptyState icon="map-outline" title="Sin zonas" />
      ) : (
        zonas.data?.map((z) => (
          <Card key={z.id} style={s.mt}>
            <Text style={s.nombre}>{z.nombre}</Text>
            <Text style={s.meta}>
              {z.estadosIncluidos.length > 0
                ? `${z.estadosIncluidos.length} estados`
                : "Todo el país"}
              {z.cpsIncluidos.length > 0 ? ` · ${z.cpsIncluidos.length} CPs` : ""}
            </Text>
          </Card>
        ))
      )}

      <Text style={[s.h, s.mt]}>Recoger en tienda (Click & Collect)</Text>
      {(pickup.data ?? []).map((p) => (
        <Card key={p.sucursal.id} style={s.mt}>
          <View style={s.row}>
            <View style={s.icon}>
              <Icon name="storefront" size={18} color={colors.brand} />
            </View>
            <Text style={[s.nombre, { flex: 1 }]}>{p.sucursal.nombre}</Text>
            <Badge
              label={p.config?.activa ? "activo" : "inactivo"}
              tone={p.config?.activa ? "ok" : "neutral"}
            />
          </View>
        </Card>
      ))}
      <View style={{ height: space.xl }} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  root: { padding: space.lg },
  h: { fontSize: 15, fontWeight: "800", color: colors.ink },
  mt: { marginTop: space.sm },
  row: { flexDirection: "row", alignItems: "center", gap: space.md },
  icon: {
    width: 38,
    height: 38,
    borderRadius: radius.sm,
    backgroundColor: colors.brandLight,
    alignItems: "center",
    justifyContent: "center",
  },
  nombre: { fontWeight: "700", color: colors.ink, fontSize: 15 },
  meta: { color: colors.muted, fontSize: 13, marginTop: 2 },
  precio: { fontWeight: "800", color: colors.ink, fontSize: 15 },
  gratis: { color: colors.ok, fontSize: 12, marginTop: 6, fontWeight: "600" },
});
