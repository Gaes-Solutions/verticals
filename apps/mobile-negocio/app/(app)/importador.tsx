import { colors, radius, space } from "@/theme";
import { Card, Icon } from "@/ui";
import { StyleSheet, Text, View } from "react-native";

const CAPACIDADES = [
  {
    icon: "cube" as const,
    titulo: "Productos",
    desc: "Carga masiva de productos y variantes (SKU, nombre, precio).",
  },
  { icon: "cash" as const, titulo: "Precios", desc: "Actualiza precios en lote por SKU." },
  { icon: "layers" as const, titulo: "Inventario", desc: "Conteo físico masivo por sucursal." },
];

export default function Importador() {
  return (
    <View style={s.root}>
      <Card>
        <View style={s.head}>
          <View style={s.icon}>
            <Icon name="cloud-upload" size={26} color={colors.brand} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.title}>Importación masiva</Text>
            <Text style={s.sub}>Sube archivos Excel/CSV para cargar datos en lote.</Text>
          </View>
        </View>
      </Card>

      {CAPACIDADES.map((c) => (
        <Card key={c.titulo} style={s.mt}>
          <View style={s.row}>
            <View style={s.iconSm}>
              <Icon name={c.icon} size={18} color={colors.brand} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.cTitle}>{c.titulo}</Text>
              <Text style={s.cDesc}>{c.desc}</Text>
            </View>
          </View>
        </Card>
      ))}

      <View style={s.nota}>
        <Icon name="information-circle" size={18} color={colors.info} />
        <Text style={s.notaText}>
          La carga de archivos se hace desde el panel web (app.angaes.com), donde puedes mapear las
          columnas de tu Excel. Aquí ves qué se puede importar.
        </Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, padding: space.lg },
  head: { flexDirection: "row", alignItems: "center", gap: space.md },
  icon: {
    width: 46,
    height: 46,
    borderRadius: radius.md,
    backgroundColor: colors.brandLight,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontSize: 16, fontWeight: "800", color: colors.ink },
  sub: { fontSize: 13, color: colors.muted, marginTop: 2 },
  mt: { marginTop: space.sm },
  row: { flexDirection: "row", alignItems: "center", gap: space.md },
  iconSm: {
    width: 38,
    height: 38,
    borderRadius: radius.sm,
    backgroundColor: colors.brandLight,
    alignItems: "center",
    justifyContent: "center",
  },
  cTitle: { fontWeight: "700", color: colors.ink, fontSize: 15 },
  cDesc: { color: colors.muted, fontSize: 13, marginTop: 2 },
  nota: {
    flexDirection: "row",
    gap: space.sm,
    backgroundColor: colors.infoLight,
    borderRadius: radius.md,
    padding: space.md,
    marginTop: space.md,
  },
  notaText: { flex: 1, color: colors.info, fontSize: 13 },
});
