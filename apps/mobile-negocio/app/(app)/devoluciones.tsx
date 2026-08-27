import { fecha } from "@/lib/format";
import {
  type MetodoReembolso,
  type Solicitud,
  aprobarDevolucion,
  listDevoluciones,
  rechazarDevolucion,
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

const ESTADOS = ["solicitada", "aprobada", "rechazada", "cancelada"];
const METODOS: { key: MetodoReembolso; label: string }[] = [
  { key: "efectivo", label: "Efectivo" },
  { key: "tarjeta_misma", label: "Misma tarjeta" },
  { key: "saldo_a_favor", label: "Saldo a favor" },
  { key: "vale", label: "Vale" },
  { key: "transferencia", label: "Transferencia" },
];

function tono(e: string): "ok" | "danger" | "warn" | "neutral" {
  if (e === "aprobada") return "ok";
  if (e === "rechazada") return "danger";
  if (e === "solicitada") return "warn";
  return "neutral";
}

export default function Devoluciones() {
  const qc = useQueryClient();
  const [filtro, setFiltro] = useState("");
  const [accion, setAccion] = useState<{ sol: Solicitud; tipo: "aprobar" | "rechazar" } | null>(
    null,
  );
  const q = useQuery({
    queryKey: ["devoluciones", filtro],
    queryFn: () => listDevoluciones(filtro || undefined),
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
          <Chip key={e} label={e} active={filtro === e} onPress={() => setFiltro(e)} />
        ))}
      </ScrollView>

      {q.isLoading ? (
        <Loading />
      ) : (
        <FlatList
          contentContainerStyle={s.list}
          data={q.data ?? []}
          keyExtractor={(x) => x.id}
          refreshing={q.isFetching}
          onRefresh={() => q.refetch()}
          ListEmptyComponent={
            <EmptyState icon="return-down-back-outline" title="Sin devoluciones" />
          }
          renderItem={({ item }) => (
            <View style={s.card}>
              <View style={s.top}>
                <Text style={s.folio}>#{item.folio}</Text>
                <Badge label={item.estado} tone={tono(item.estado)} />
              </View>
              <Text style={s.cliente}>
                {item.cliente?.nombre ?? item.pedido?.emailComprador ?? "Cliente"}
              </Text>
              <Text style={s.motivo} numberOfLines={2}>
                {item.motivo}
              </Text>
              <Text style={s.meta}>
                {item.items.length} artículo(s) · {fecha(item.createdAt)}
              </Text>
              {item.estado === "solicitada" ? (
                <View style={s.acciones}>
                  <View style={{ flex: 1 }}>
                    <Button
                      label="Aprobar"
                      icon="checkmark"
                      onPress={() => setAccion({ sol: item, tipo: "aprobar" })}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Button
                      label="Rechazar"
                      icon="close"
                      variant="outline"
                      onPress={() => setAccion({ sol: item, tipo: "rechazar" })}
                    />
                  </View>
                </View>
              ) : null}
            </View>
          )}
        />
      )}

      <AccionModal
        accion={accion}
        onClose={() => setAccion(null)}
        onDone={() => {
          setAccion(null);
          void qc.invalidateQueries({ queryKey: ["devoluciones"] });
        }}
      />
    </View>
  );
}

function AccionModal({
  accion,
  onClose,
  onDone,
}: {
  accion: { sol: Solicitud; tipo: "aprobar" | "rechazar" } | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [motivo, setMotivo] = useState("");
  const [metodo, setMetodo] = useState<MetodoReembolso>("efectivo");

  const m = useMutation({
    mutationFn: () =>
      accion?.tipo === "aprobar"
        ? aprobarDevolucion(accion.sol.id, metodo)
        : rechazarDevolucion(accion?.sol.id ?? "", motivo),
    onSuccess: () => {
      setMotivo("");
      onDone();
    },
    onError: (e) => Alert.alert("No se pudo", e instanceof Error ? e.message : "Error"),
  });

  const esAprobar = accion?.tipo === "aprobar";

  return (
    <Modal visible={!!accion} transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.backdrop}>
        <View style={s.sheet}>
          <Text style={s.sheetTitle}>
            {esAprobar ? "Aprobar devolución" : "Rechazar devolución"} #{accion?.sol.folio}
          </Text>
          {esAprobar ? (
            <>
              <Text style={s.sheetLabel}>Método de reembolso</Text>
              <View style={s.metodos}>
                {METODOS.map((mm) => (
                  <Pressable
                    key={mm.key}
                    style={[s.metodo, metodo === mm.key && s.metodoOn]}
                    onPress={() => setMetodo(mm.key)}
                  >
                    <Text style={[s.metodoText, metodo === mm.key && s.metodoTextOn]}>
                      {mm.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </>
          ) : (
            <>
              <Text style={s.sheetLabel}>Motivo del rechazo</Text>
              <TextInput
                style={s.input}
                value={motivo}
                onChangeText={setMotivo}
                placeholder="Explica por qué se rechaza…"
                placeholderTextColor={colors.faint}
                multiline
              />
            </>
          )}
          <View style={{ height: space.md }} />
          <Button
            label={esAprobar ? "Confirmar aprobación" : "Confirmar rechazo"}
            variant={esAprobar ? "primary" : "danger"}
            busy={m.isPending}
            disabled={!esAprobar && motivo.trim().length < 3}
            onPress={() => m.mutate()}
          />
          <View style={{ height: space.sm }} />
          <Button label="Cancelar" variant="ghost" onPress={onClose} />
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
  cliente: { color: colors.text, fontSize: 14, fontWeight: "600" },
  motivo: { color: colors.muted, fontSize: 14 },
  meta: { color: colors.faint, fontSize: 12 },
  acciones: { flexDirection: "row", gap: space.sm, marginTop: space.sm },
  backdrop: { flex: 1, backgroundColor: "rgba(15,23,42,0.4)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: space.xl,
  },
  sheetTitle: { fontSize: 18, fontWeight: "800", color: colors.ink, marginBottom: space.md },
  sheetLabel: { fontSize: 13, fontWeight: "600", color: colors.text, marginBottom: space.sm },
  metodos: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  metodo: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: radius.md,
    backgroundColor: colors.brandLight,
  },
  metodoOn: { backgroundColor: colors.brand },
  metodoText: { color: colors.brandDark, fontWeight: "700" },
  metodoTextOn: { color: colors.white },
  input: {
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    padding: space.md,
    fontSize: 15,
    color: colors.ink,
    minHeight: 80,
    textAlignVertical: "top",
  },
});
