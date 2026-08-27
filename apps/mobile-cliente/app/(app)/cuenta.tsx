import { useAuth } from "@/lib/auth-store";
import { getPerfil } from "@/services/cliente";
import { colors, shadow, space } from "@/theme";
import { Button, Card, Icon, type IconName } from "@/ui";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

export default function Cuenta() {
  const { user, tenantSlug, logout } = useAuth();
  const q = useQuery({ queryKey: ["perfil"], queryFn: getPerfil });
  const p = q.data;
  const nombre = [p?.nombre, p?.apellidos].filter(Boolean).join(" ") || user?.nombre || "Cliente";

  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={s.root}>
      <View style={s.avatar}>
        <Text style={s.avatarT}>{(nombre[0] ?? "?").toUpperCase()}</Text>
      </View>
      <Text style={s.nombre}>{nombre}</Text>
      <Text style={s.email}>{p?.email ?? user?.email}</Text>
      {tenantSlug ? <Text style={s.tienda}>Tienda: {tenantSlug}</Text> : null}

      <Card style={{ marginTop: space.lg, width: "100%" }} padded={false}>
        <Link icon="person" label="Editar perfil" onPress={() => router.push("/(app)/perfil")} />
        <Link
          icon="location"
          label="Mis direcciones"
          onPress={() => router.push("/(app)/direcciones")}
        />
        <Link icon="heart" label="Favoritos" onPress={() => router.push("/(app)/favoritos")} last />
      </Card>

      <View style={{ height: space.lg, width: "100%" }} />
      <View style={{ width: "100%" }}>
        <Button
          label="Cerrar sesión"
          icon="log-out"
          variant="danger"
          onPress={() => void logout()}
        />
      </View>
    </ScrollView>
  );
}

function Link({
  icon,
  label,
  onPress,
  last,
}: { icon: IconName; label: string; onPress: () => void; last?: boolean }) {
  return (
    <Pressable style={[s.link, !last && s.linkBorder]} onPress={onPress}>
      <Icon name={icon} size={20} color={colors.brand} />
      <Text style={s.linkLabel}>{label}</Text>
      <Icon name="chevron-forward" size={18} color={colors.faint} />
    </Pressable>
  );
}

const s = StyleSheet.create({
  root: { padding: space.xl, alignItems: "center" },
  avatar: {
    width: 84,
    height: 84,
    borderRadius: 999,
    backgroundColor: colors.brand,
    alignItems: "center",
    justifyContent: "center",
    marginTop: space.sm,
    ...shadow.card,
  },
  avatarT: { color: colors.white, fontSize: 34, fontWeight: "800" },
  nombre: { fontSize: 20, fontWeight: "800", color: colors.ink, marginTop: space.md },
  email: { fontSize: 14, color: colors.muted },
  tienda: { fontSize: 13, color: colors.faint, marginTop: 4 },
  link: { flexDirection: "row", alignItems: "center", gap: space.md, padding: space.lg },
  linkBorder: { borderBottomWidth: 1, borderBottomColor: colors.line },
  linkLabel: { flex: 1, color: colors.ink, fontSize: 15, fontWeight: "600" },
});
