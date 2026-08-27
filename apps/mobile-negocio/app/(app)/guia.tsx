import { getOnboarding } from "@/services/negocio";
import { colors, radius, shadow, space } from "@/theme";
import { Card, Icon, Loading } from "@/ui";
import { useQuery } from "@tanstack/react-query";
import { ScrollView, StyleSheet, Text, View } from "react-native";

const PASOS: { key: string; titulo: string }[] = [
  { key: "vendedores", titulo: "Crea a tu personal" },
  { key: "seguridad", titulo: "Protege el acceso (2FA / biometría)" },
  { key: "productos", titulo: "Agrega tus productos" },
  { key: "inventario", titulo: "Carga tu inventario" },
  { key: "listaPrecios", titulo: "Crea tu lista de precios de mayoreo" },
  { key: "clientesB2b", titulo: "Da de alta tus clientes" },
  { key: "comisiones", titulo: "Configura las comisiones" },
  { key: "tienda", titulo: "Activa tu tienda en línea" },
  { key: "envios", titulo: "Configura tus envíos" },
  { key: "primeraVenta", titulo: "Haz tu primera venta" },
];

export default function Guia() {
  const q = useQuery({ queryKey: ["onboarding"], queryFn: getOnboarding });
  if (q.isLoading) return <Loading />;
  const pasos = q.data?.pasos ?? {};
  const hechos = PASOS.filter((p) => pasos[p.key]).length;

  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={s.root}>
      <Card>
        <Text style={s.title}>Tu progreso</Text>
        <Text style={s.sub}>
          {hechos} de {PASOS.length} pasos completados
        </Text>
        <View style={s.barBg}>
          <View style={[s.barFill, { width: `${(hechos / PASOS.length) * 100}%` }]} />
        </View>
      </Card>

      <View style={{ height: space.md }} />
      {PASOS.map((p) => {
        const done = !!pasos[p.key];
        return (
          <View key={p.key} style={s.paso}>
            <Icon
              name={done ? "checkmark-circle" : "ellipse-outline"}
              size={26}
              color={done ? colors.ok : colors.faint}
            />
            <Text style={[s.pasoText, done && s.pasoDone]}>{p.titulo}</Text>
          </View>
        );
      })}
      <View style={{ height: space.xl }} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  root: { padding: space.lg },
  title: { fontSize: 16, fontWeight: "800", color: colors.ink },
  sub: { fontSize: 13, color: colors.muted, marginTop: 2, marginBottom: space.sm },
  barBg: { height: 10, borderRadius: 999, backgroundColor: colors.line, overflow: "hidden" },
  barFill: { height: 10, borderRadius: 999, backgroundColor: colors.brand },
  paso: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: space.md,
    marginBottom: space.sm,
    ...shadow.card,
  },
  pasoText: { flex: 1, color: colors.ink, fontSize: 15, fontWeight: "600" },
  pasoDone: { color: colors.muted, textDecorationLine: "line-through" },
});
