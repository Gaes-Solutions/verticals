import { fecha } from "@/lib/format";
import { type Resena, listResenas, moderarResena, responderResena } from "@/services/negocio";
import { colors, radius, shadow, space } from "@/theme";
import { Badge, Button, EmptyState, Icon, Loading } from "@/ui";
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

const ESTADOS = ["pendiente", "aprobada", "rechazada"];
function tono(e: string): "warn" | "ok" | "danger" | "neutral" {
  if (e === "pendiente") return "warn";
  if (e === "aprobada") return "ok";
  if (e === "rechazada") return "danger";
  return "neutral";
}
function Estrellas({ n }: { n: number }) {
  return (
    <View style={{ flexDirection: "row" }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Icon
          key={i}
          name={i <= n ? "star" : "star-outline"}
          size={15}
          color={i <= n ? colors.warn : colors.faint}
        />
      ))}
    </View>
  );
}

export default function Resenas() {
  const qc = useQueryClient();
  const [filtro, setFiltro] = useState("");
  const [responder, setResponder] = useState<Resena | null>(null);
  const q = useQuery({
    queryKey: ["resenas", filtro],
    queryFn: () => listResenas(filtro || undefined),
  });

  const moderar = useMutation({
    mutationFn: ({ id, estado }: { id: string; estado: "aprobada" | "rechazada" }) =>
      moderarResena(id, estado),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["resenas"] }),
    onError: (e) => Alert.alert("No se pudo", e instanceof Error ? e.message : "Error"),
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
          keyExtractor={(r) => r.id}
          refreshing={q.isFetching}
          onRefresh={() => q.refetch()}
          ListEmptyComponent={<EmptyState icon="star-outline" title="Sin reseñas" />}
          // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: render de tarjeta con estados condicionales
          renderItem={({ item }) => (
            <View style={s.card}>
              <View style={s.top}>
                <Estrellas n={item.rating} />
                <Badge label={item.estado} tone={tono(item.estado)} />
              </View>
              {item.titulo ? <Text style={s.titulo}>{item.titulo}</Text> : null}
              {item.comentario ? <Text style={s.coment}>{item.comentario}</Text> : null}
              <Text style={s.meta}>
                {item.cliente?.nombre ?? "Cliente"} · {item.productoPublicado.tituloPublico} ·{" "}
                {fecha(item.createdAt)}
              </Text>
              {item.respuestaTienda ? (
                <View style={s.respBox}>
                  <Text style={s.respText}>Tu respuesta: {item.respuestaTienda}</Text>
                </View>
              ) : null}
              <View style={s.acciones}>
                {item.estado === "pendiente" ? (
                  <>
                    <View style={{ flex: 1 }}>
                      <Button
                        label="Aprobar"
                        icon="checkmark"
                        onPress={() => moderar.mutate({ id: item.id, estado: "aprobada" })}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Button
                        label="Rechazar"
                        icon="close"
                        variant="outline"
                        onPress={() => moderar.mutate({ id: item.id, estado: "rechazada" })}
                      />
                    </View>
                  </>
                ) : (
                  <View style={{ flex: 1 }}>
                    <Button
                      label={item.respuestaTienda ? "Editar respuesta" : "Responder"}
                      icon="chatbubble"
                      variant="outline"
                      onPress={() => setResponder(item)}
                    />
                  </View>
                )}
              </View>
            </View>
          )}
        />
      )}
      <ResponderModal
        resena={responder}
        onClose={() => setResponder(null)}
        onDone={() => {
          setResponder(null);
          void qc.invalidateQueries({ queryKey: ["resenas"] });
        }}
      />
    </View>
  );
}

function ResponderModal({
  resena,
  onClose,
  onDone,
}: { resena: Resena | null; onClose: () => void; onDone: () => void }) {
  const [texto, setTexto] = useState("");
  const m = useMutation({
    mutationFn: () => responderResena(resena?.id ?? "", texto.trim()),
    onSuccess: () => {
      setTexto("");
      onDone();
    },
    onError: (e) => Alert.alert("No se pudo", e instanceof Error ? e.message : "Error"),
  });
  return (
    <Modal visible={!!resena} transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.backdrop}>
        <View style={s.sheet}>
          <Text style={s.sheetTitle}>Responder reseña</Text>
          <TextInput
            style={s.input}
            value={texto}
            onChangeText={setTexto}
            placeholder="Escribe tu respuesta pública…"
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
  titulo: { fontWeight: "700", color: colors.ink, fontSize: 15 },
  coment: { color: colors.text, fontSize: 14 },
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
  sheetTitle: { fontSize: 18, fontWeight: "800", color: colors.ink, marginBottom: space.md },
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
