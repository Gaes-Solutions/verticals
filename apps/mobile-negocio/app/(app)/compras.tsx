import { fecha, money } from "@/lib/format";
import {
  autorizarOc,
  cancelarOc,
  getOcDetalle,
  listOrdenesCompra,
  recibirOcTodo,
} from "@/services/negocio";
import { colors, radius, shadow, space } from "@/theme";
import { Badge, Button, EmptyState, Loading } from "@/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  Alert,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

const ESTADOS = ["borrador", "enviada", "recibida_parcial", "recibida_total", "cancelada"];

function tono(e: string): "ok" | "danger" | "info" | "warn" | "neutral" {
  if (e === "recibida_total") return "ok";
  if (e === "cancelada") return "danger";
  if (e === "enviada") return "info";
  if (e === "recibida_parcial") return "warn";
  return "neutral";
}
const label = (e: string) => e.replace(/_/g, " ");

export default function Compras() {
  const [filtro, setFiltro] = useState("");
  const [detId, setDetId] = useState<string | null>(null);
  const q = useQuery({
    queryKey: ["compras", filtro],
    queryFn: () => listOrdenesCompra(filtro || undefined),
  });

  return (
    <View style={s.root}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={s.chipsWrap}
        contentContainerStyle={s.chips}
      >
        <Chip label="Todas" active={!filtro} onPress={() => setFiltro("")} />
        {ESTADOS.map((e) => (
          <Chip key={e} label={label(e)} active={filtro === e} onPress={() => setFiltro(e)} />
        ))}
      </ScrollView>

      {q.isLoading ? (
        <Loading />
      ) : (
        <FlatList
          contentContainerStyle={s.list}
          data={q.data?.items ?? []}
          keyExtractor={(o) => o.id}
          refreshing={q.isFetching}
          onRefresh={() => q.refetch()}
          ListEmptyComponent={<EmptyState icon="cart-outline" title="Sin órdenes de compra" />}
          renderItem={({ item }) => (
            <Pressable style={s.card} onPress={() => setDetId(item.id)}>
              <View style={s.top}>
                <Text style={s.folio}>#{item.folio}</Text>
                <Text style={s.total}>{money(item.total)}</Text>
              </View>
              <View style={s.top}>
                <Text style={s.prov} numberOfLines={1}>
                  {item.proveedorRazonSocial}
                </Text>
                <Badge label={label(item.estado)} tone={tono(item.estado)} />
              </View>
              <Text style={s.meta}>
                {item.lineas.length} línea(s) · {fecha(item.createdAt)}
              </Text>
            </Pressable>
          )}
        />
      )}

      <DetalleModal id={detId} onClose={() => setDetId(null)} />
    </View>
  );
}

function DetalleModal({ id, onClose }: { id: string | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [cancelando, setCancelando] = useState(false);
  const [motivo, setMotivo] = useState("");
  const det = useQuery({
    queryKey: ["oc", id],
    queryFn: () => getOcDetalle(id as string),
    enabled: !!id,
  });
  const o = det.data;

  const invalidar = () => {
    void qc.invalidateQueries({ queryKey: ["oc", id] });
    void qc.invalidateQueries({ queryKey: ["compras"] });
  };
  const err = (e: unknown) => Alert.alert("No se pudo", e instanceof Error ? e.message : "Error");

  const autorizar = useMutation({
    mutationFn: () => autorizarOc(id as string),
    onSuccess: invalidar,
    onError: err,
  });
  const recibir = useMutation({
    mutationFn: () => recibirOcTodo(id as string, o?.lineas ?? []),
    onSuccess: invalidar,
    onError: err,
  });
  const cancelar = useMutation({
    mutationFn: () => cancelarOc(id as string, motivo),
    onSuccess: () => {
      setCancelando(false);
      setMotivo("");
      invalidar();
      onClose();
    },
    onError: err,
  });

  const puedeRecibir = o && ["enviada", "recibida_parcial"].includes(o.estado);
  const puedeAutorizar = o?.estado === "borrador";
  const puedeCancelar = o && !["cancelada", "recibida_total"].includes(o.estado);

  return (
    <Modal visible={!!id} animationType="slide" onRequestClose={onClose}>
      <View style={s.modalRoot}>
        <View style={s.modalHead}>
          <Text style={s.modalTitle}>{o ? `OC #${o.folio}` : "Orden de compra"}</Text>
          <Pressable onPress={onClose}>
            <Text style={s.close}>✕</Text>
          </Pressable>
        </View>
        {det.isLoading || !o ? (
          <Loading />
        ) : (
          <ScrollView contentContainerStyle={s.modalBody}>
            <View style={s.rowBetween}>
              <Badge label={label(o.estado)} tone={tono(o.estado)} />
              <Text style={s.total}>{money(o.total)}</Text>
            </View>
            <Text style={s.prov}>{o.proveedorRazonSocial}</Text>
            <Text style={s.meta}>
              RFC {o.proveedorRfc} · {fecha(o.createdAt)}
            </Text>

            <Text style={s.h}>Líneas</Text>
            <View style={s.box}>
              {o.lineas.map((l, i) => (
                <View key={l.id} style={[s.lRow, i < o.lineas.length - 1 && s.lBorder]}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.lName} numberOfLines={1}>
                      {l.descripcion}
                    </Text>
                    <Text style={s.lRecv}>
                      Recibido {fmt(l.cantidadRecibida)} / {fmt(l.cantidad)}
                    </Text>
                  </View>
                  <Text style={s.lVal}>
                    {money(String(Number(l.precioUnitario) * Number(l.cantidad)))}
                  </Text>
                </View>
              ))}
            </View>

            <View style={{ height: space.md }} />
            {puedeAutorizar ? (
              <Button
                label="Autorizar y enviar"
                icon="paper-plane"
                busy={autorizar.isPending}
                onPress={() => autorizar.mutate()}
              />
            ) : null}
            {puedeRecibir ? (
              <>
                <View style={{ height: space.sm }} />
                <Button
                  label="Recibir mercancía (todo)"
                  icon="checkmark-done"
                  busy={recibir.isPending}
                  onPress={() => recibir.mutate()}
                />
              </>
            ) : null}
            {puedeCancelar ? (
              <>
                <View style={{ height: space.sm }} />
                {cancelando ? (
                  <View style={s.box}>
                    <TextInput
                      style={s.input}
                      value={motivo}
                      onChangeText={setMotivo}
                      placeholder="Motivo de cancelación…"
                      placeholderTextColor={colors.faint}
                      multiline
                    />
                    <View style={{ height: space.sm }} />
                    <Button
                      label="Confirmar cancelación"
                      variant="danger"
                      busy={cancelar.isPending}
                      disabled={motivo.trim().length < 3}
                      onPress={() => cancelar.mutate()}
                    />
                  </View>
                ) : (
                  <Button
                    label="Cancelar OC"
                    icon="close-circle"
                    variant="outline"
                    onPress={() => setCancelando(true)}
                  />
                )}
              </>
            ) : null}
            <View style={{ height: space.xl }} />
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

function Chip({
  label: l,
  active,
  onPress,
}: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable style={[s.chip, active && s.chipOn]} onPress={onPress}>
      <Text style={[s.chipText, active && s.chipTextOn]}>{l}</Text>
    </Pressable>
  );
}
function fmt(n: string): string {
  const v = Number(n);
  return Number.isInteger(v) ? String(v) : v.toFixed(2);
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  chipsWrap: { maxHeight: 56, flexGrow: 0 },
  chips: { paddingHorizontal: space.lg, paddingVertical: space.sm, gap: space.sm },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: radius.pill,
    backgroundColor: colors.card,
    ...shadow.card,
  },
  chipOn: { backgroundColor: colors.brand },
  chipText: { color: colors.text, fontWeight: "600", textTransform: "capitalize" },
  chipTextOn: { color: colors.white },
  list: { paddingHorizontal: space.lg, paddingBottom: space.xl, gap: space.sm },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: space.md,
    gap: 8,
    ...shadow.card,
  },
  top: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  folio: { fontWeight: "700", color: colors.ink, fontSize: 15 },
  total: { fontWeight: "800", color: colors.ink, fontSize: 17 },
  prov: { color: colors.text, fontSize: 14, fontWeight: "600", flex: 1, marginRight: space.sm },
  meta: { color: colors.faint, fontSize: 12 },
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
  close: { fontSize: 22, color: colors.muted, fontWeight: "700" },
  modalBody: { padding: space.lg, gap: 6 },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  h: { fontSize: 15, fontWeight: "700", color: colors.ink, marginTop: space.md },
  box: { backgroundColor: colors.card, borderRadius: radius.md, padding: space.md, ...shadow.card },
  lRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    gap: space.md,
  },
  lBorder: { borderBottomWidth: 1, borderBottomColor: colors.line },
  lName: { color: colors.ink, fontSize: 14, fontWeight: "600" },
  lRecv: { color: colors.faint, fontSize: 12, marginTop: 2 },
  lVal: { color: colors.ink, fontWeight: "700", fontSize: 14 },
  input: {
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    padding: space.md,
    fontSize: 15,
    color: colors.ink,
    minHeight: 70,
    textAlignVertical: "top",
  },
});
