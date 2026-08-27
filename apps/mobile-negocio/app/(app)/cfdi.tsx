import { fecha, money } from "@/lib/format";
import {
  type CfdiEmitido,
  type MotivoCancelacion,
  cancelarCfdi,
  listCfdisEmitidos,
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
  View,
} from "react-native";

const ESTADOS = ["vigente", "cancelado", "pendiente", "error"];
const MOTIVOS: { key: MotivoCancelacion; label: string }[] = [
  { key: "02", label: "02 · Emitido con errores (sin relación)" },
  { key: "03", label: "03 · No se llevó a cabo la operación" },
  { key: "04", label: "04 · Operación nominativa en global" },
];

function tono(e: string): "ok" | "danger" | "warn" | "neutral" {
  if (e === "vigente") return "ok";
  if (e === "cancelado" || e === "error") return "danger";
  if (e === "pendiente") return "warn";
  return "neutral";
}

export default function Cfdi() {
  const qc = useQueryClient();
  const [filtro, setFiltro] = useState("");
  const [cancelar, setCancelar] = useState<CfdiEmitido | null>(null);
  const q = useQuery({
    queryKey: ["cfdis", filtro],
    queryFn: () => listCfdisEmitidos(filtro || undefined),
  });

  return (
    <View style={s.root}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={s.chipsWrap}
        contentContainerStyle={s.chips}
      >
        <Chip label="Todos" active={!filtro} onPress={() => setFiltro("")} />
        {ESTADOS.map((e) => (
          <Chip key={e} label={e} active={filtro === e} onPress={() => setFiltro(e)} />
        ))}
      </ScrollView>

      {q.isLoading ? (
        <Loading />
      ) : (
        <FlatList
          contentContainerStyle={s.list}
          data={q.data?.items ?? []}
          keyExtractor={(c) => c.id}
          refreshing={q.isFetching}
          onRefresh={() => q.refetch()}
          ListEmptyComponent={
            <EmptyState icon="document-text-outline" title="Sin facturas emitidas" />
          }
          renderItem={({ item }) => (
            <View style={s.card}>
              <View style={s.top}>
                <Text style={s.folio}>
                  {item.serie ?? ""}
                  {item.folio ?? "—"}
                </Text>
                <Text style={s.total}>{money(item.total)}</Text>
              </View>
              <Text style={s.receptor} numberOfLines={1}>
                {item.razonSocialReceptor}
              </Text>
              <View style={s.top}>
                <Text style={s.meta}>
                  {item.rfcReceptor} · {fecha(item.fechaEmision)}
                </Text>
                <View style={s.badges}>
                  {item.esAutofactura ? <Badge label="auto" tone="info" /> : null}
                  <Badge label={item.estado} tone={tono(item.estado)} />
                </View>
              </View>
              {item.folioFiscal ? (
                <Text style={s.uuid} numberOfLines={1}>
                  UUID {item.folioFiscal}
                </Text>
              ) : null}
              {item.estado === "vigente" ? (
                <View style={{ marginTop: space.sm }}>
                  <Button
                    label="Cancelar factura"
                    icon="close-circle"
                    variant="outline"
                    onPress={() => setCancelar(item)}
                  />
                </View>
              ) : null}
            </View>
          )}
        />
      )}

      <CancelarModal
        cfdi={cancelar}
        onClose={() => setCancelar(null)}
        onDone={() => {
          setCancelar(null);
          void qc.invalidateQueries({ queryKey: ["cfdis"] });
        }}
      />
    </View>
  );
}

function CancelarModal({
  cfdi,
  onClose,
  onDone,
}: { cfdi: CfdiEmitido | null; onClose: () => void; onDone: () => void }) {
  const [motivo, setMotivo] = useState<MotivoCancelacion>("02");
  const m = useMutation({
    mutationFn: () => cancelarCfdi(cfdi?.id ?? "", motivo),
    onSuccess: onDone,
    onError: (e) => Alert.alert("No se pudo cancelar", e instanceof Error ? e.message : "Error"),
  });
  return (
    <Modal visible={!!cfdi} transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.backdrop}>
        <View style={s.sheet}>
          <Text style={s.sheetTitle}>
            Cancelar factura {cfdi?.serie ?? ""}
            {cfdi?.folio ?? ""}
          </Text>
          <Text style={s.sheetSub}>Motivo de cancelación (SAT)</Text>
          {MOTIVOS.map((mm) => (
            <Pressable
              key={mm.key}
              style={[s.motivo, motivo === mm.key && s.motivoOn]}
              onPress={() => setMotivo(mm.key)}
            >
              <Text style={[s.motivoText, motivo === mm.key && s.motivoTextOn]}>{mm.label}</Text>
            </Pressable>
          ))}
          <View style={{ height: space.md }} />
          <Button
            label="Confirmar cancelación"
            variant="danger"
            busy={m.isPending}
            onPress={() => m.mutate()}
          />
          <View style={{ height: space.sm }} />
          <Button label="Cerrar" variant="ghost" onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable style={[s.chip, active && s.chipOn]} onPress={onPress}>
      <Text style={[s.chipText, active && s.chipTextOn]}>{label}</Text>
    </Pressable>
  );
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
    gap: 6,
    ...shadow.card,
  },
  top: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  folio: { fontWeight: "700", color: colors.ink, fontSize: 15 },
  total: { fontWeight: "800", color: colors.ink, fontSize: 16 },
  receptor: { color: colors.text, fontSize: 14, fontWeight: "600" },
  meta: { color: colors.muted, fontSize: 12, flex: 1 },
  badges: { flexDirection: "row", gap: 6 },
  uuid: { color: colors.faint, fontSize: 11 },
  backdrop: { flex: 1, backgroundColor: "rgba(15,23,42,0.4)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: space.xl,
    gap: space.sm,
  },
  sheetTitle: { fontSize: 18, fontWeight: "800", color: colors.ink },
  sheetSub: { fontSize: 13, fontWeight: "600", color: colors.text },
  motivo: {
    paddingVertical: 12,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.line,
  },
  motivoOn: { backgroundColor: colors.brandLight, borderColor: colors.brand },
  motivoText: { color: colors.text, fontWeight: "600", fontSize: 13 },
  motivoTextOn: { color: colors.brandDark },
});
