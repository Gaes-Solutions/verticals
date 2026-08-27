import {
  type DireccionInput,
  crearDireccion,
  eliminarDireccion,
  listDirecciones,
} from "@/services/cliente";
import { colors, radius, shadow, space } from "@/theme";
import { Badge, Button, EmptyState, Icon, Input, Loading } from "@/ui";
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

export default function Direcciones() {
  const qc = useQueryClient();
  const [nueva, setNueva] = useState(false);
  const q = useQuery({ queryKey: ["direcciones"], queryFn: listDirecciones });
  const borrar = useMutation({
    mutationFn: (id: string) => eliminarDireccion(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["direcciones"] }),
    onError: (e) => Alert.alert("No se pudo", e instanceof Error ? e.message : "Error"),
  });
  if (q.isLoading) return <Loading />;

  return (
    <View style={s.root}>
      <FlatList
        contentContainerStyle={s.list}
        data={q.data ?? []}
        keyExtractor={(d) => d.id}
        refreshing={q.isFetching}
        onRefresh={() => q.refetch()}
        ListHeaderComponent={
          <Pressable style={s.nuevaBtn} onPress={() => setNueva(true)}>
            <Icon name="add-circle" size={22} color={colors.brand} />
            <Text style={s.nuevaText}>Agregar dirección</Text>
          </Pressable>
        }
        ListEmptyComponent={<EmptyState icon="location-outline" title="Sin direcciones" />}
        renderItem={({ item }) => (
          <View style={s.card}>
            <View style={s.icon}>
              <Icon name="location" size={20} color={colors.brand} />
            </View>
            <View style={{ flex: 1 }}>
              <View style={s.top}>
                <Text style={s.etiqueta}>{item.etiqueta}</Text>
                {item.isDefaultEnvio ? <Badge label="principal" tone="brand" /> : null}
              </View>
              <Text style={s.dir}>
                {item.calle} {item.numeroExterior ?? ""}
                {item.colonia ? `, ${item.colonia}` : ""}
              </Text>
              <Text style={s.dir}>
                {item.municipio ? `${item.municipio}, ` : ""}
                {item.estado} · CP {item.codigoPostal}
              </Text>
            </View>
            <Icon
              name="trash-outline"
              size={22}
              color={colors.danger}
              onPress={() =>
                Alert.alert("Eliminar", `¿Borrar "${item.etiqueta}"?`, [
                  { text: "No" },
                  { text: "Sí", style: "destructive", onPress: () => borrar.mutate(item.id) },
                ])
              }
            />
          </View>
        )}
      />
      <NuevaModal
        visible={nueva}
        onClose={() => setNueva(false)}
        onDone={() => {
          setNueva(false);
          void qc.invalidateQueries({ queryKey: ["direcciones"] });
        }}
      />
    </View>
  );
}

function NuevaModal({
  visible,
  onClose,
  onDone,
}: { visible: boolean; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState<DireccionInput>({
    etiqueta: "",
    calle: "",
    estado: "",
    codigoPostal: "",
  });
  const set = (k: keyof DireccionInput) => (v: string) => setF((p) => ({ ...p, [k]: v }));
  const m = useMutation({
    mutationFn: () => crearDireccion(f),
    onSuccess: () => {
      setF({ etiqueta: "", calle: "", estado: "", codigoPostal: "" });
      onDone();
    },
    onError: (e) => Alert.alert("No se pudo guardar", e instanceof Error ? e.message : "Error"),
  });
  const valido =
    f.etiqueta.trim() && f.calle.trim() && f.estado.trim() && /^\d{5}$/.test(f.codigoPostal);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={s.modalRoot}>
        <View style={s.modalHead}>
          <Text style={s.modalTitle}>Nueva dirección</Text>
          <Pressable onPress={onClose}>
            <Icon name="close" size={26} color={colors.muted} />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={s.form}>
          <Input
            label="Etiqueta"
            icon="pricetag"
            value={f.etiqueta}
            onChangeText={set("etiqueta")}
            placeholder="Casa, Oficina…"
          />
          <Input
            label="Calle"
            icon="map"
            value={f.calle}
            onChangeText={set("calle")}
            placeholder="Calle"
          />
          <Input
            label="Número exterior"
            icon="home"
            value={f.numeroExterior ?? ""}
            onChangeText={set("numeroExterior")}
            placeholder="123"
          />
          <Input
            label="Colonia"
            value={f.colonia ?? ""}
            onChangeText={set("colonia")}
            placeholder="Colonia"
          />
          <Input
            label="Municipio"
            value={f.municipio ?? ""}
            onChangeText={set("municipio")}
            placeholder="Municipio"
          />
          <Input
            label="Estado"
            value={f.estado}
            onChangeText={set("estado")}
            placeholder="Estado"
          />
          <Input
            label="Código postal"
            icon="mail"
            value={f.codigoPostal}
            onChangeText={set("codigoPostal")}
            placeholder="00000"
            keyboardType="number-pad"
            maxLength={5}
          />
          <Button
            label="Guardar dirección"
            icon="save"
            busy={m.isPending}
            disabled={!valido}
            onPress={() => m.mutate()}
          />
          <View style={{ height: space.xl }} />
        </ScrollView>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  list: { padding: space.lg, gap: space.sm },
  nuevaBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.sm,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    paddingVertical: space.md,
    marginBottom: space.sm,
    ...shadow.card,
  },
  nuevaText: { color: colors.brand, fontWeight: "700", fontSize: 15 },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: space.md,
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    ...shadow.card,
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    backgroundColor: colors.brandLight,
    alignItems: "center",
    justifyContent: "center",
  },
  top: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.sm,
  },
  etiqueta: { fontWeight: "700", color: colors.ink, fontSize: 15 },
  dir: { color: colors.muted, fontSize: 13, marginTop: 2 },
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
  form: { padding: space.lg, gap: space.md },
});
