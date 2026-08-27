import { getConfigVentas, saveConfigVentas } from "@/services/negocio";
import { colors, radius, space } from "@/theme";
import { Button, Card, Icon, Input, Loading } from "@/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";

export default function Configuracion() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["config-ventas"], queryFn: getConfigVentas });
  const [pct, setPct] = useState("");

  useEffect(() => {
    if (q.data) setPct(String(q.data.descuentoMaximoPct));
  }, [q.data]);

  const save = useMutation({
    mutationFn: () => saveConfigVentas(Number(pct)),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["config-ventas"] });
      Alert.alert("Guardado ✓");
    },
    onError: (e) => Alert.alert("No se pudo guardar", e instanceof Error ? e.message : "Error"),
  });

  if (q.isLoading) return <Loading />;

  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={s.root}>
      <Card>
        <View style={s.head}>
          <View style={s.icon}>
            <Icon name="pricetag" size={22} color={colors.brand} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.title}>Tope de descuento</Text>
            <Text style={s.sub}>
              Máximo % de descuento que tu equipo puede aplicar en una venta.
            </Text>
          </View>
        </View>
        <View style={{ height: space.md }} />
        <Input
          label="Descuento máximo (%)"
          icon="calculator"
          value={pct}
          onChangeText={setPct}
          keyboardType="decimal-pad"
          placeholder="0"
        />
        {q.data ? <Text style={s.hint}>Recomendado: {q.data.recomendado}%</Text> : null}
        <View style={{ height: space.md }} />
        <Button
          label="Guardar"
          icon="save"
          busy={save.isPending}
          disabled={pct === "" || Number.isNaN(Number(pct))}
          onPress={() => save.mutate()}
        />
      </Card>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  root: { padding: space.lg },
  head: { flexDirection: "row", alignItems: "center", gap: space.md },
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
  hint: { fontSize: 12, color: colors.faint, marginTop: 6 },
});
