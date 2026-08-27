import { useAuth } from "@/lib/auth-store";
import { colors, shadow, space } from "@/theme";
import { Button, Card, Icon } from "@/ui";
import { StyleSheet, Text, View } from "react-native";

export default function Cuenta() {
  const { user, tenantSlug, logout } = useAuth();
  const inicial = (user?.nombre?.[0] ?? "?").toUpperCase();

  return (
    <View style={s.root}>
      <View style={s.avatar}>
        <Text style={s.avatarText}>{inicial}</Text>
      </View>
      <Text style={s.nombre}>{user?.nombre ?? "Usuario"}</Text>
      <Text style={s.email}>{user?.email}</Text>

      <Card style={{ marginTop: space.lg, width: "100%" }} padded={false}>
        <Row icon="business" label="Negocio" value={tenantSlug ?? "—"} />
        <Row
          icon="shield-checkmark"
          label="Rol"
          value={user?.isOwner ? "Dueño" : (user?.roleCodes?.[0] ?? "Equipo")}
          last
        />
      </Card>

      <View style={{ height: space.lg }} />
      <View style={{ width: "100%" }}>
        <Button
          label="Cerrar sesión"
          icon="log-out"
          variant="danger"
          onPress={() => void logout()}
        />
      </View>
    </View>
  );
}

function Row({
  icon,
  label,
  value,
  last,
}: { icon: "business" | "shield-checkmark"; label: string; value: string; last?: boolean }) {
  return (
    <View style={[s.row, !last && s.rowBorder]}>
      <Icon name={icon} size={20} color={colors.brand} />
      <Text style={s.rowLabel}>{label}</Text>
      <Text style={s.rowValue}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, padding: space.xl, alignItems: "center" },
  avatar: {
    width: 84,
    height: 84,
    borderRadius: 999,
    backgroundColor: colors.brand,
    alignItems: "center",
    justifyContent: "center",
    marginTop: space.md,
    ...shadow.card,
  },
  avatarText: { color: colors.white, fontSize: 34, fontWeight: "800" },
  nombre: { fontSize: 20, fontWeight: "800", color: colors.ink, marginTop: space.md },
  email: { fontSize: 14, color: colors.muted },
  row: { flexDirection: "row", alignItems: "center", gap: space.md, padding: space.lg },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.line },
  rowLabel: { flex: 1, color: colors.text, fontSize: 15 },
  rowValue: { color: colors.ink, fontWeight: "700", fontSize: 15 },
});
