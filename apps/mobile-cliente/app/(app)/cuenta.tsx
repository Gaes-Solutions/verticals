import { useAuth } from "@/lib/auth-store";
import { getPerfil } from "@/services/cliente";
import { colors, shadow, space } from "@/theme";
import { Button, Card, Icon, type IconName } from "@/ui";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";

export default function Cuenta() {
  const { user, tenantSlug, logout, biometriaActiva, biometriaDisponible, setBiometria } =
    useAuth();
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

      <Card style={{ marginTop: space.lg, width: "100%" }}>
        <View style={s.bioRow}>
          <Icon name="finger-print" size={22} color={colors.brand} />
          <View style={{ flex: 1 }}>
            <Text style={s.bioTitle}>Entrar con huella / Face ID</Text>
            <Text style={s.bioSub}>
              {biometriaDisponible
                ? "Desbloquea la app con tu biometría."
                : "Configura tu huella en los ajustes del teléfono."}
            </Text>
          </View>
          <Switch
            value={biometriaActiva}
            disabled={!biometriaDisponible}
            onValueChange={async (v) => {
              const ok = await setBiometria(v);
              if (!ok && v) Alert.alert("No se pudo activar", "Verifica tu huella/Face ID.");
            }}
            trackColor={{ true: colors.brand, false: colors.line }}
          />
        </View>
      </Card>

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
  bioRow: { flexDirection: "row", alignItems: "center", gap: space.md },
  bioTitle: { fontSize: 15, fontWeight: "700", color: colors.ink },
  bioSub: { fontSize: 12, color: colors.muted, marginTop: 2 },
});
