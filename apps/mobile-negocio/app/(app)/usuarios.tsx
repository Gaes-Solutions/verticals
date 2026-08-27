import {
  type Usuario,
  asignarRol,
  listRoles,
  listUsuarios,
  quitarRol,
  setUsuarioActivo,
} from "@/services/negocio";
import { colors, radius, shadow, space } from "@/theme";
import { Badge, EmptyState, Icon, Loading } from "@/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Alert, FlatList, Modal, Pressable, StyleSheet, Switch, Text, View } from "react-native";

export default function Usuarios() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"usuarios" | "roles">("usuarios");
  const [rolesDe, setRolesDe] = useState<Usuario | null>(null);

  const usuarios = useQuery({ queryKey: ["usuarios"], queryFn: listUsuarios });
  const roles = useQuery({ queryKey: ["roles"], queryFn: listRoles });

  const toggle = useMutation({
    mutationFn: async ({ id, activo }: { id: string; activo: boolean }) => {
      await setUsuarioActivo(id, activo);
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["usuarios"] }),
    onError: (e) => Alert.alert("No se pudo", e instanceof Error ? e.message : "Error"),
  });

  return (
    <View style={s.root}>
      <View style={s.tabs}>
        <TabBtn label="Usuarios" active={tab === "usuarios"} onPress={() => setTab("usuarios")} />
        <TabBtn label="Roles y permisos" active={tab === "roles"} onPress={() => setTab("roles")} />
      </View>

      {tab === "usuarios" ? (
        usuarios.isLoading ? (
          <Loading />
        ) : (
          <FlatList
            contentContainerStyle={s.list}
            data={usuarios.data ?? []}
            keyExtractor={(u) => u.id}
            refreshing={usuarios.isFetching}
            onRefresh={() => usuarios.refetch()}
            ListEmptyComponent={<EmptyState icon="people-outline" title="Sin usuarios" />}
            renderItem={({ item }) => (
              <View style={s.card}>
                <View style={s.avatar}>
                  <Text style={s.avatarT}>{(item.nombre[0] ?? "?").toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.nombre}>{item.nombre}</Text>
                  <Text style={s.email}>{item.email}</Text>
                  <View style={s.rolesRow}>
                    {item.roles.length > 0 ? (
                      item.roles.map((r) => <Badge key={r.id} label={r.nombre} tone="brand" />)
                    ) : (
                      <Text style={s.sinRol}>Sin rol</Text>
                    )}
                    <Pressable onPress={() => setRolesDe(item)}>
                      <Icon name="add-circle-outline" size={20} color={colors.brand} />
                    </Pressable>
                  </View>
                </View>
                <Switch
                  value={item.isActive}
                  onValueChange={(v) => toggle.mutate({ id: item.id, activo: v })}
                  trackColor={{ true: colors.brand, false: colors.line }}
                />
              </View>
            )}
          />
        )
      ) : roles.isLoading ? (
        <Loading />
      ) : (
        <FlatList
          contentContainerStyle={s.list}
          data={roles.data ?? []}
          keyExtractor={(r) => r.id}
          refreshing={roles.isFetching}
          onRefresh={() => roles.refetch()}
          ListEmptyComponent={<EmptyState icon="shield-outline" title="Sin roles" />}
          renderItem={({ item }) => (
            <View style={s.card}>
              <View style={s.rolIcon}>
                <Icon name="shield-checkmark" size={20} color={colors.brand} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.nombre}>{item.nombre}</Text>
                <Text style={s.email}>
                  {item.codigo} · {item.permisos.length} permisos
                </Text>
              </View>
              <Badge
                label={item.isActive ? "activo" : "inactivo"}
                tone={item.isActive ? "ok" : "neutral"}
              />
            </View>
          )}
        />
      )}

      <RolesModal
        usuario={rolesDe}
        roles={roles.data ?? []}
        onClose={() => setRolesDe(null)}
        onChange={() => void qc.invalidateQueries({ queryKey: ["usuarios"] })}
      />
    </View>
  );
}

function RolesModal({
  usuario,
  roles,
  onClose,
  onChange,
}: {
  usuario: Usuario | null;
  roles: { id: string; codigo: string; nombre: string }[];
  onClose: () => void;
  onChange: () => void;
}) {
  const qc = useQueryClient();
  const asignados = new Set(usuario?.roles.map((r) => r.id));
  const m = useMutation({
    mutationFn: async ({ rolId, tiene }: { rolId: string; tiene: boolean }) => {
      if (tiene) await quitarRol(usuario?.id ?? "", rolId);
      else await asignarRol(usuario?.id ?? "", rolId);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["usuarios"] });
      onChange();
    },
    onError: (e) => Alert.alert("No se pudo", e instanceof Error ? e.message : "Error"),
  });

  return (
    <Modal visible={!!usuario} animationType="slide" onRequestClose={onClose}>
      <View style={s.modalRoot}>
        <View style={s.modalHead}>
          <Text style={s.modalTitle}>Roles de {usuario?.nombre}</Text>
          <Pressable onPress={onClose}>
            <Icon name="close" size={26} color={colors.muted} />
          </Pressable>
        </View>
        <FlatList
          contentContainerStyle={s.list}
          data={roles}
          keyExtractor={(r) => r.id}
          renderItem={({ item }) => {
            const tiene = asignados.has(item.id);
            return (
              <Pressable
                style={s.rolRow}
                onPress={() => m.mutate({ rolId: item.id, tiene })}
                disabled={m.isPending}
              >
                <View style={{ flex: 1 }}>
                  <Text style={s.nombre}>{item.nombre}</Text>
                  <Text style={s.email}>{item.codigo}</Text>
                </View>
                <Icon
                  name={tiene ? "checkmark-circle" : "ellipse-outline"}
                  size={26}
                  color={tiene ? colors.ok : colors.faint}
                />
              </Pressable>
            );
          }}
        />
      </View>
    </Modal>
  );
}

function TabBtn({
  label,
  active,
  onPress,
}: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable style={[s.tab, active && s.tabOn]} onPress={onPress}>
      <Text style={[s.tabText, active && s.tabTextOn]}>{label}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  tabs: { flexDirection: "row", gap: space.sm, padding: space.lg, paddingBottom: space.sm },
  tab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: radius.pill,
    backgroundColor: colors.card,
    alignItems: "center",
  },
  tabOn: { backgroundColor: colors.brand },
  tabText: { color: colors.text, fontWeight: "600" },
  tabTextOn: { color: colors.white },
  list: { paddingHorizontal: space.lg, paddingBottom: space.xl, gap: space.sm },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: space.md,
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    ...shadow.card,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 999,
    backgroundColor: colors.brandLight,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarT: { color: colors.brandDark, fontWeight: "800", fontSize: 17 },
  rolIcon: {
    width: 42,
    height: 42,
    borderRadius: radius.sm,
    backgroundColor: colors.brandLight,
    alignItems: "center",
    justifyContent: "center",
  },
  nombre: { fontWeight: "700", color: colors.ink, fontSize: 15 },
  email: { color: colors.muted, fontSize: 13, marginTop: 2 },
  rolesRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6, marginTop: 6 },
  sinRol: { color: colors.faint, fontSize: 12, fontStyle: "italic" },
  modalRoot: { flex: 1, backgroundColor: colors.bg, paddingTop: 48 },
  modalHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: space.lg,
    paddingBottom: space.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  modalTitle: { fontSize: 20, fontWeight: "800", color: colors.ink },
  rolRow: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: space.md,
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    ...shadow.card,
  },
});
