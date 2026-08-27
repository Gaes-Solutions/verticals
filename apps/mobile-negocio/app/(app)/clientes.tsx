import { fecha, money } from "@/lib/format";
import { getClienteDetalle, listClientes } from "@/services/negocio";
import { colors, radius, shadow, space } from "@/theme";
import { Badge, EmptyState, Icon, Input, Loading } from "@/ui";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

export default function Clientes() {
  const [q, setQ] = useState("");
  const [detId, setDetId] = useState<string | null>(null);
  const query = useQuery({ queryKey: ["clientes", q], queryFn: () => listClientes(q) });

  return (
    <View style={s.root}>
      <View style={s.search}>
        <Input
          icon="search"
          value={q}
          onChangeText={setQ}
          placeholder="Buscar cliente…"
          autoCorrect={false}
        />
      </View>
      {query.isLoading ? (
        <Loading />
      ) : (
        <FlatList
          contentContainerStyle={s.list}
          data={query.data?.items ?? []}
          keyExtractor={(c) => c.id}
          refreshing={query.isFetching}
          onRefresh={() => query.refetch()}
          ListEmptyComponent={<EmptyState icon="people-outline" title="Sin clientes" />}
          renderItem={({ item }) => (
            <Pressable style={s.card} onPress={() => setDetId(item.id)}>
              <View style={s.avatar}>
                <Text style={s.avatarT}>{(item.nombre[0] ?? "?").toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.nombre} numberOfLines={1}>
                  {item.nombre} {item.apellidos ?? ""}
                </Text>
                <Text style={s.meta} numberOfLines={1}>
                  {item.telefonoPrincipal ?? item.emailPrincipal ?? item.tipo}
                </Text>
              </View>
              {item._count ? (
                <Badge label={`${item._count.ventas} compras`} tone="neutral" />
              ) : null}
              <Icon name="chevron-forward" size={20} color={colors.faint} />
            </Pressable>
          )}
        />
      )}
      <DetalleModal id={detId} onClose={() => setDetId(null)} />
    </View>
  );
}

function DetalleModal({ id, onClose }: { id: string | null; onClose: () => void }) {
  const det = useQuery({
    queryKey: ["cliente", id],
    queryFn: () => getClienteDetalle(id as string),
    enabled: !!id,
  });
  const c = det.data;

  return (
    <Modal visible={!!id} animationType="slide" onRequestClose={onClose}>
      <View style={s.modalRoot}>
        <View style={s.modalHead}>
          <Text style={s.modalTitle}>Cliente</Text>
          <Pressable onPress={onClose}>
            <Icon name="close" size={26} color={colors.muted} />
          </Pressable>
        </View>
        {det.isLoading || !c ? (
          <Loading />
        ) : (
          <ScrollView contentContainerStyle={s.modalBody}>
            <View style={s.bigAvatar}>
              <Text style={s.bigAvatarT}>{(c.nombre[0] ?? "?").toUpperCase()}</Text>
            </View>
            <Text style={s.detName}>
              {c.nombre} {c.apellidos ?? ""}
            </Text>
            {c.rfc ? <Text style={s.detSub}>RFC {c.rfc}</Text> : null}

            <View style={s.box}>
              <Contacto icon="call" value={c.telefonoPrincipal} />
              <Contacto icon="mail" value={c.emailPrincipal} last />
            </View>

            <Text style={s.h}>Fiado</Text>
            <View style={s.box}>
              {c.fiado ? (
                <>
                  <View style={s.rowBetween}>
                    <Text style={s.fiLabel}>Saldo pendiente</Text>
                    <Text
                      style={[s.fiVal, Number(c.fiado.montoTotal) > 0 && { color: colors.danger }]}
                    >
                      {money(c.fiado.montoTotal)}
                    </Text>
                  </View>
                  {c.fiado.movimientos.length > 0 ? (
                    <View style={{ marginTop: space.sm }}>
                      {c.fiado.movimientos.slice(0, 8).map((m) => (
                        <View key={m.id} style={s.movRow}>
                          <Text style={s.movTipo}>{m.tipo}</Text>
                          <Text style={s.movDate}>{fecha(m.createdAt)}</Text>
                          <Text style={s.movMonto}>{money(m.monto)}</Text>
                        </View>
                      ))}
                    </View>
                  ) : null}
                </>
              ) : (
                <Text style={s.detSub}>Este cliente no tiene fiado.</Text>
              )}
            </View>
            <View style={{ height: space.xl }} />
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

function Contacto({
  icon,
  value,
  last,
}: { icon: "call" | "mail"; value: string | null; last?: boolean }) {
  return (
    <View style={[s.contacto, !last && s.contactoBorder]}>
      <Icon name={icon} size={18} color={colors.brand} />
      <Text style={s.contactoVal}>{value ?? "—"}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  search: { padding: space.lg, paddingBottom: space.sm },
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
  nombre: { fontWeight: "600", color: colors.ink, fontSize: 15 },
  meta: { color: colors.muted, fontSize: 13, marginTop: 2 },
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
  modalBody: { padding: space.lg, alignItems: "stretch", gap: space.sm },
  bigAvatar: {
    width: 74,
    height: 74,
    borderRadius: 999,
    backgroundColor: colors.brand,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
  },
  bigAvatarT: { color: colors.white, fontWeight: "800", fontSize: 30 },
  detName: {
    fontSize: 20,
    fontWeight: "800",
    color: colors.ink,
    textAlign: "center",
    marginTop: space.sm,
  },
  detSub: { fontSize: 14, color: colors.muted, textAlign: "center" },
  box: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: space.md,
    ...shadow.card,
    marginTop: space.sm,
  },
  contacto: { flexDirection: "row", alignItems: "center", gap: space.md, paddingVertical: 10 },
  contactoBorder: { borderBottomWidth: 1, borderBottomColor: colors.line },
  contactoVal: { color: colors.text, fontSize: 15 },
  h: { fontSize: 15, fontWeight: "700", color: colors.ink, marginTop: space.md },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  fiLabel: { color: colors.text, fontSize: 15, fontWeight: "600" },
  fiVal: { color: colors.ink, fontSize: 20, fontWeight: "800" },
  movRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  movTipo: { flex: 1, color: colors.text, fontSize: 13, textTransform: "capitalize" },
  movDate: { color: colors.faint, fontSize: 12 },
  movMonto: {
    color: colors.ink,
    fontWeight: "700",
    fontSize: 14,
    minWidth: 70,
    textAlign: "right",
  },
});
