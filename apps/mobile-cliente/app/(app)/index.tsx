import { fecha, money } from "@/lib/format";
import { getPedidoDetalle, listPedidos } from "@/services/cliente";
import { colors, radius, shadow, space } from "@/theme";
import { Badge, EmptyState, Icon, Loading } from "@/ui";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

const PAGO_TONE: Record<string, "ok" | "warn" | "danger" | "neutral"> = {
  pagado: "ok",
  pendiente: "warn",
  cancelado: "danger",
  reembolsado: "neutral",
};

export default function Pedidos() {
  const [folio, setFolio] = useState<string | null>(null);
  const q = useQuery({ queryKey: ["pedidos"], queryFn: listPedidos });
  if (q.isLoading) return <Loading />;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <FlatList
        contentContainerStyle={s.list}
        data={q.data ?? []}
        keyExtractor={(p) => p.id}
        refreshing={q.isFetching}
        onRefresh={() => q.refetch()}
        ListEmptyComponent={
          <EmptyState icon="bag-handle-outline" title="Todavía no tienes pedidos" />
        }
        renderItem={({ item }) => (
          <Pressable style={s.card} onPress={() => setFolio(item.folioPublico)}>
            <View style={s.top}>
              <Text style={s.folio}>#{item.folioPublico}</Text>
              <Text style={s.total}>{money(item.total)}</Text>
            </View>
            <View style={s.top}>
              <Text style={s.meta}>{fecha(item.createdAt)}</Text>
              <Badge label={item.statusPago} tone={PAGO_TONE[item.statusPago] ?? "neutral"} />
            </View>
            <View style={s.estadoRow}>
              <Text style={s.estado}>{item.statusLabel}</Text>
            </View>
          </Pressable>
        )}
      />
      <DetalleModal folio={folio} onClose={() => setFolio(null)} />
    </View>
  );
}

function DetalleModal({ folio, onClose }: { folio: string | null; onClose: () => void }) {
  const q = useQuery({
    queryKey: ["pedido", folio],
    queryFn: () => getPedidoDetalle(folio as string),
    enabled: !!folio,
  });
  const p = q.data;
  return (
    <Modal visible={!!folio} animationType="slide" onRequestClose={onClose}>
      <View style={s.modalRoot}>
        <View style={s.modalHead}>
          <Text style={s.modalTitle}>{p ? `Pedido #${p.folioPublico}` : "Pedido"}</Text>
          <Pressable onPress={onClose}>
            <Icon name="close" size={26} color={colors.muted} />
          </Pressable>
        </View>
        {q.isLoading || !p ? (
          <Loading />
        ) : (
          <ScrollView contentContainerStyle={s.modalBody}>
            <View style={s.top}>
              <Text style={s.estadoBig}>{p.statusLabel}</Text>
              <Text style={s.total}>{money(p.total)}</Text>
            </View>
            <Text style={s.meta}>{fecha(p.createdAt)}</Text>

            {p.hitos.length > 0 && (
              <>
                <Text style={s.h}>Seguimiento</Text>
                <View style={s.box}>
                  {p.hitos.map((hi, i) => (
                    <View key={hi.estado} style={s.hitoRow}>
                      <View style={s.hitoCol}>
                        <View style={[s.dot, hi.completado && s.dotOn]}>
                          {hi.completado ? (
                            <Icon name="checkmark" size={11} color={colors.white} />
                          ) : null}
                        </View>
                        {i < p.hitos.length - 1 ? (
                          <View style={[s.line, hi.completado && s.lineOn]} />
                        ) : null}
                      </View>
                      <View style={{ flex: 1, paddingBottom: space.md }}>
                        <Text style={[s.hitoText, hi.completado && s.hitoDone]}>{hi.label}</Text>
                        {hi.fecha ? <Text style={s.hitoFecha}>{fecha(hi.fecha)}</Text> : null}
                      </View>
                    </View>
                  ))}
                </View>
              </>
            )}

            {p.guiaTracking ? (
              <View style={s.guia}>
                <Icon name="car" size={18} color={colors.brand} />
                <Text style={s.guiaText}>
                  {p.paqueteria ?? "Guía"}: {p.guiaTracking}
                </Text>
              </View>
            ) : null}

            <Text style={s.h}>Productos</Text>
            <View style={s.box}>
              {p.items.map((it, i) => (
                <View
                  key={`${it.nombre}-${i}`}
                  style={[s.itemRow, i < p.items.length - 1 && s.itemBorder]}
                >
                  <Text style={s.itemName} numberOfLines={1}>
                    {it.cantidad}× {it.nombre}
                  </Text>
                  <Text style={s.itemVal}>{money(it.subtotal)}</Text>
                </View>
              ))}
              <View style={s.sep} />
              <Row label="Subtotal" value={money(p.subtotal)} />
              {Number(p.costoEnvio) > 0 ? <Row label="Envío" value={money(p.costoEnvio)} /> : null}
              <Row label="Total" value={money(p.total)} bold />
            </View>
            <View style={{ height: space.xl }} />
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <View style={s.rowLine}>
      <Text style={[s.rowLabel, bold && { fontWeight: "700", color: colors.ink }]}>{label}</Text>
      <Text style={[s.rowVal, bold && { fontSize: 17 }]}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  list: { padding: space.lg, gap: space.sm },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: space.md,
    gap: 6,
    ...shadow.card,
  },
  top: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  folio: { fontWeight: "700", color: colors.ink, fontSize: 15 },
  total: { fontWeight: "800", color: colors.ink, fontSize: 16 },
  meta: { color: colors.muted, fontSize: 13 },
  estadoRow: { flexDirection: "row" },
  estado: {
    backgroundColor: colors.brandLight,
    color: colors.brandDark,
    fontSize: 12,
    fontWeight: "600",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    overflow: "hidden",
  },
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
  modalBody: { padding: space.lg, gap: 4 },
  estadoBig: { fontSize: 17, fontWeight: "800", color: colors.brand },
  h: { fontSize: 15, fontWeight: "700", color: colors.ink, marginTop: space.md, marginBottom: 4 },
  box: { backgroundColor: colors.card, borderRadius: radius.md, padding: space.md, ...shadow.card },
  hitoRow: { flexDirection: "row", gap: space.md },
  hitoCol: { alignItems: "center", width: 20 },
  dot: {
    width: 18,
    height: 18,
    borderRadius: 999,
    backgroundColor: colors.line,
    alignItems: "center",
    justifyContent: "center",
  },
  dotOn: { backgroundColor: colors.brand },
  line: { flex: 1, width: 2, backgroundColor: colors.line, marginVertical: 2 },
  lineOn: { backgroundColor: colors.brand },
  hitoText: { color: colors.faint, fontSize: 14, fontWeight: "600" },
  hitoDone: { color: colors.ink },
  hitoFecha: { color: colors.faint, fontSize: 12, marginTop: 2 },
  guia: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    backgroundColor: colors.brandLight,
    borderRadius: radius.md,
    padding: space.md,
    marginTop: space.sm,
  },
  guiaText: { color: colors.brandDark, fontWeight: "600", fontSize: 14 },
  itemRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 8,
    gap: space.md,
  },
  itemBorder: { borderBottomWidth: 1, borderBottomColor: colors.line },
  itemName: { flex: 1, color: colors.text, fontSize: 14 },
  itemVal: { color: colors.ink, fontWeight: "700", fontSize: 14 },
  sep: { height: 1, backgroundColor: colors.line, marginVertical: 8 },
  rowLine: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 },
  rowLabel: { color: colors.muted, fontSize: 14 },
  rowVal: { color: colors.ink, fontWeight: "600", fontSize: 14 },
});
