import { useAuth } from "@/lib/auth-store";
import { colors, radius, shadow, space } from "@/theme";
import { Icon, type IconName } from "@/ui";
import { router } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

interface Item {
  perm: string;
  icon: IconName;
  label: string;
  to: string;
}
interface Grupo {
  titulo: string;
  items: Item[];
}

const GRUPOS: Grupo[] = [
  {
    titulo: "Operación",
    items: [
      { perm: "ventas.crear", icon: "cart", label: "Cobrar", to: "/(app)/cobrar" },
      { perm: "ventas.leer", icon: "receipt", label: "Ventas", to: "/(app)/ventas" },
      { perm: "pedidos.leer", icon: "cube", label: "Pedidos", to: "/(app)/pedidos" },
      {
        perm: "ventas.leer",
        icon: "return-down-back",
        label: "Devoluciones",
        to: "/(app)/devoluciones",
      },
      { perm: "clientes.leer", icon: "people", label: "Clientes", to: "/(app)/clientes" },
    ],
  },
  {
    titulo: "Catálogo e inventario",
    items: [
      { perm: "productos.leer", icon: "pricetags", label: "Productos", to: "/(app)/productos" },
      { perm: "inventario.leer", icon: "cube", label: "Inventario", to: "/(app)/inventario" },
      { perm: "precios.leer", icon: "cash", label: "Precios", to: "/(app)/precios" },
      { perm: "compras_oc.leer", icon: "cart", label: "Compras", to: "/(app)/compras" },
    ],
  },
  {
    titulo: "Marketing y lealtad",
    items: [
      {
        perm: "promociones.gestionar",
        icon: "megaphone",
        label: "Promociones",
        to: "/(app)/promociones",
      },
      { perm: "ventas.leer", icon: "wallet", label: "Monedero", to: "/(app)/monedero" },
      {
        perm: "comisiones.leer_todas",
        icon: "trophy",
        label: "Comisiones",
        to: "/(app)/comisiones",
      },
    ],
  },
  {
    titulo: "Fiscal y contabilidad",
    items: [
      { perm: "cfdi.leer", icon: "document-text", label: "Facturas (CFDI)", to: "/(app)/cfdi" },
      {
        perm: "cfdis_recibidos.leer",
        icon: "documents",
        label: "Contabilidad",
        to: "/(app)/contabilidad",
      },
    ],
  },
  {
    titulo: "Análisis",
    items: [
      { perm: "reportes.ventas", icon: "bar-chart", label: "Reportes", to: "/(app)/reportes" },
    ],
  },
];

export default function Menu() {
  const { user } = useAuth();
  const puede = (perm: string) =>
    user?.isOwner === true || (user?.permissions ?? []).includes(perm);

  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={s.root}>
      {GRUPOS.map((g) => {
        const items = g.items.filter((i) => puede(i.perm));
        if (items.length === 0) return null;
        return (
          <View key={g.titulo} style={s.grupo}>
            <Text style={s.grupoTitulo}>{g.titulo}</Text>
            <View style={s.grid}>
              {items.map((it) => (
                <Pressable
                  key={it.label}
                  style={s.tile}
                  onPress={() => router.push(it.to as never)}
                >
                  <View style={s.tileIcon}>
                    <Icon name={it.icon} size={24} color={colors.brand} />
                  </View>
                  <Text style={s.tileLabel}>{it.label}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        );
      })}
      <View style={{ height: space.xl }} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  root: { padding: space.lg, gap: space.lg },
  grupo: { gap: space.sm },
  grupoTitulo: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.faint,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  tile: {
    width: "31%",
    aspectRatio: 1,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    alignItems: "center",
    justifyContent: "center",
    gap: space.sm,
    ...shadow.card,
  },
  tileIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.brandLight,
    alignItems: "center",
    justifyContent: "center",
  },
  tileLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.ink,
    textAlign: "center",
    paddingHorizontal: 4,
  },
});
