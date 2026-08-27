import { fecha } from "@/lib/format";
import {
  type Pregunta,
  listPreguntas,
  rechazarPregunta,
  responderPregunta,
} from "@/services/negocio";
import { colors, radius, shadow, space } from "@/theme";
import { Badge, Button, EmptyState, Loading } from "@/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Alert, FlatList, Modal, StyleSheet, Text, TextInput, View } from "react-native";

export default function Preguntas() {
  const qc = useQueryClient();
  const [responder, setResponder] = useState<Pregunta | null>(null);
  const q = useQuery({ queryKey: ["preguntas"], queryFn: listPreguntas });

  const rechazar = useMutation({
    mutationFn: (id: string) => rechazarPregunta(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["preguntas"] }),
    onError: (e) => Alert.alert("No se pudo", e instanceof Error ? e.message : "Error"),
  });

  if (q.isLoading) return <Loading />;

  return (
    <View style={s.root}>
      <FlatList
        contentContainerStyle={s.list}
        data={q.data ?? []}
        keyExtractor={(p) => p.id}
        refreshing={q.isFetching}
        onRefresh={() => q.refetch()}
        ListEmptyComponent={<EmptyState icon="help-circle-outline" title="Sin preguntas" />}
        renderItem={({ item }) => (
          <View style={s.card}>
            <View style={s.top}>
              <Text style={s.pregunta}>{item.pregunta}</Text>
              <Badge label={item.estado} tone={item.respuesta ? "ok" : "warn"} />
            </View>
            <Text style={s.meta}>
              {item.cliente?.nombre ?? "Cliente"}
              {item.productoPublicado ? ` · ${item.productoPublicado.tituloPublico}` : ""} ·{" "}
              {fecha(item.createdAt)}
            </Text>
            {item.respuesta ? (
              <View style={s.respBox}>
                <Text style={s.respText}>R: {item.respuesta}</Text>
              </View>
            ) : (
              <View style={s.acciones}>
                <View style={{ flex: 1 }}>
                  <Button label="Responder" icon="chatbubble" onPress={() => setResponder(item)} />
                </View>
                <View style={{ flex: 1 }}>
                  <Button
                    label="Rechazar"
                    icon="close"
                    variant="outline"
                    onPress={() => rechazar.mutate(item.id)}
                  />
                </View>
              </View>
            )}
          </View>
        )}
      />
      <ResponderModal
        pregunta={responder}
        onClose={() => setResponder(null)}
        onDone={() => {
          setResponder(null);
          void qc.invalidateQueries({ queryKey: ["preguntas"] });
        }}
      />
    </View>
  );
}

function ResponderModal({
  pregunta,
  onClose,
  onDone,
}: { pregunta: Pregunta | null; onClose: () => void; onDone: () => void }) {
  const [texto, setTexto] = useState("");
  const m = useMutation({
    mutationFn: () => responderPregunta(pregunta?.id ?? "", texto.trim()),
    onSuccess: () => {
      setTexto("");
      onDone();
    },
    onError: (e) => Alert.alert("No se pudo", e instanceof Error ? e.message : "Error"),
  });
  return (
    <Modal visible={!!pregunta} transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.backdrop}>
        <View style={s.sheet}>
          <Text style={s.sheetTitle}>Responder pregunta</Text>
          <Text style={s.sheetQ}>{pregunta?.pregunta}</Text>
          <TextInput
            style={s.input}
            value={texto}
            onChangeText={setTexto}
            placeholder="Tu respuesta…"
            placeholderTextColor={colors.faint}
            multiline
          />
          <View style={{ height: space.md }} />
          <Button
            label="Publicar respuesta"
            icon="send"
            busy={m.isPending}
            disabled={!texto.trim()}
            onPress={() => m.mutate()}
          />
          <View style={{ height: space.sm }} />
          <Button label="Cancelar" variant="ghost" onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  list: { padding: space.lg, gap: space.sm },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: space.md,
    gap: 6,
    ...shadow.card,
  },
  top: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: space.sm,
  },
  pregunta: { fontWeight: "700", color: colors.ink, fontSize: 15, flex: 1 },
  meta: { color: colors.faint, fontSize: 12 },
  respBox: { backgroundColor: colors.brandLight, borderRadius: radius.sm, padding: space.sm },
  respText: { color: colors.brandDark, fontSize: 13 },
  acciones: { flexDirection: "row", gap: space.sm, marginTop: space.sm },
  backdrop: { flex: 1, backgroundColor: "rgba(15,23,42,0.4)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: space.xl,
  },
  sheetTitle: { fontSize: 18, fontWeight: "800", color: colors.ink },
  sheetQ: { color: colors.muted, fontSize: 14, marginVertical: space.sm },
  input: {
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    padding: space.md,
    fontSize: 15,
    color: colors.ink,
    minHeight: 90,
    textAlignVertical: "top",
  },
});
