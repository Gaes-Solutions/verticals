import { useAuth } from "@/lib/auth-store";
import {
  type Kiosko,
  type KioskoConfig,
  crearKiosko,
  desactivarKiosko,
  getKioskoConfig,
  listKioskos,
  listSucursales,
  saveKioskoConfig,
} from "@/services/negocio";
import { colors, radius, space } from "@/theme";
import { Badge, Button, Card, EmptyState, Icon, Input, Loading } from "@/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";

const CONTENIDO: Array<{ value: KioskoConfig["contenidoReposo"]; label: string }> = [
  { value: "ambos", label: "Promos + destacados" },
  { value: "promociones", label: "Solo promos" },
  { value: "destacados", label: "Solo destacados" },
];

function visto(iso: string | null): string {
  if (!iso) return "Nunca conectado";
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 2) return "En línea";
  if (min < 60) return `Hace ${min} min`;
  return new Date(iso).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" });
}

export default function Kioskos() {
  const { user } = useAuth();
  const editar =
    user?.isOwner === true || (user?.permissions ?? []).includes("configuracion.actualizar");
  const [alta, setAlta] = useState(false);

  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={s.root}>
      <Text style={s.intro}>
        Tablets en piso de venta: el cliente escanea y ve el precio (el mismo que en caja). Sin uso,
        muestran tus promociones y destacados.
      </Text>
      <Dispositivos editar={editar} onNuevo={() => setAlta(true)} />
      <Configuracion editar={editar} />
      <AltaModal visible={alta} onClose={() => setAlta(false)} />
      <View style={{ height: space.xl }} />
    </ScrollView>
  );
}

function Dispositivos({ editar, onNuevo }: { editar: boolean; onNuevo: () => void }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["kioskos"], queryFn: listKioskos });
  const baja = useMutation({
    mutationFn: desactivarKiosko,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["kioskos"] }),
    onError: (e) => Alert.alert("No se pudo desactivar", e instanceof Error ? e.message : "Error"),
  });

  const confirmarBaja = (k: Kiosko) =>
    Alert.alert("Desactivar kiosko", `"${k.nombre}" dejará de funcionar de inmediato.`, [
      { text: "Cancelar", style: "cancel" },
      { text: "Desactivar", style: "destructive", onPress: () => baja.mutate(k.id) },
    ]);

  return (
    <Card style={s.mt}>
      <View style={s.head}>
        <Text style={s.h}>Dispositivos</Text>
        {editar ? (
          <Pressable style={s.addBtn} onPress={onNuevo}>
            <Icon name="add" size={18} color={colors.white} />
            <Text style={s.addTxt}>Nuevo</Text>
          </Pressable>
        ) : null}
      </View>
      {q.isLoading ? (
        <Loading />
      ) : (q.data ?? []).length === 0 ? (
        <EmptyState icon="tv-outline" title="Aún no tienes kioskos" />
      ) : (
        (q.data ?? []).map((k, i) => (
          <KioskoRow key={k.id} k={k} first={i === 0} editar={editar} onBaja={confirmarBaja} />
        ))
      )}
    </Card>
  );
}

function KioskoRow({
  k,
  first,
  editar,
  onBaja,
}: { k: Kiosko; first: boolean; editar: boolean; onBaja: (k: Kiosko) => void }) {
  let accion = <Badge label="Inactivo" tone="neutral" />;
  if (k.activo) {
    accion = editar ? (
      <Icon name="power" size={22} color={colors.danger} onPress={() => onBaja(k)} />
    ) : (
      <Badge label="Activo" tone="ok" />
    );
  }
  return (
    <View style={[s.row, !first && s.rowBorder]}>
      <View style={s.rowIcon}>
        <Icon name="tv" size={20} color={k.activo ? colors.brand : colors.faint} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.rowTitle}>{k.nombre}</Text>
        <Text style={s.rowSub}>{k.activo ? visto(k.ultimoVisto) : "Desactivado"}</Text>
      </View>
      {accion}
    </View>
  );
}

function AltaModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const suc = useQuery({ queryKey: ["sucursales"], queryFn: listSucursales, enabled: visible });
  const [nombre, setNombre] = useState("");
  const [sucursalId, setSucursalId] = useState("");
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    if (!sucursalId && suc.data?.[0]) setSucursalId(suc.data[0].id);
  }, [suc.data, sucursalId]);

  const crear = useMutation({
    mutationFn: () => crearKiosko(nombre.trim(), sucursalId),
    onSuccess: (r) => {
      setToken(r.token);
      setNombre("");
      void qc.invalidateQueries({ queryKey: ["kioskos"] });
    },
    onError: (e) => Alert.alert("No se pudo crear", e instanceof Error ? e.message : "Error"),
  });

  const cerrar = () => {
    setToken(null);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={cerrar}>
      <View style={s.modal}>
        <View style={s.modalHead}>
          <Text style={s.modalTitle}>{token ? "Kiosko creado" : "Nuevo kiosko"}</Text>
          <Icon name="close" size={26} color={colors.muted} onPress={cerrar} />
        </View>
        <ScrollView contentContainerStyle={s.modalBody} keyboardShouldPersistTaps="handled">
          {token ? (
            <>
              <Text style={s.sub}>
                Pega este token en la app del kiosko en la tablet. Solo se muestra una vez; si lo
                pierdes, desactiva el kiosko y crea otro.
              </Text>
              <View style={s.tokenBox}>
                <Text style={s.token} selectable>
                  {token}
                </Text>
              </View>
              <Button
                label="Compartir token"
                icon="share-social"
                variant="outline"
                onPress={() => void Share.share({ message: token })}
              />
              <View style={{ height: space.sm }} />
              <Button label="Listo" icon="checkmark" onPress={cerrar} />
            </>
          ) : (
            <>
              <Input
                label="Nombre"
                icon="tv"
                value={nombre}
                onChangeText={setNombre}
                placeholder="Ej. Pasillo 3"
                maxLength={80}
              />
              <Text style={s.label}>Sucursal</Text>
              <View style={s.chips}>
                {(suc.data ?? []).map((sc) => (
                  <Chip
                    key={sc.id}
                    label={sc.nombre}
                    on={sucursalId === sc.id}
                    onPress={() => setSucursalId(sc.id)}
                  />
                ))}
              </View>
              <View style={{ height: space.md }} />
              <Button
                label="Crear y obtener token"
                icon="key"
                busy={crear.isPending}
                disabled={!nombre.trim() || !sucursalId}
                onPress={() => crear.mutate()}
              />
            </>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

function Configuracion({ editar }: { editar: boolean }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["kiosko-config"], queryFn: getKioskoConfig });
  const [cfg, setCfg] = useState<KioskoConfig | null>(null);
  useEffect(() => {
    if (q.data) setCfg(q.data);
  }, [q.data]);

  const save = useMutation({
    mutationFn: () => saveKioskoConfig(cfg as KioskoConfig),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["kiosko-config"] });
      Alert.alert("Guardado ✓", "Los kioskos aplican el cambio al reconectar.");
    },
    onError: (e) => Alert.alert("No se pudo guardar", e instanceof Error ? e.message : "Error"),
  });

  if (!cfg) return <Loading />;
  const set = <K extends keyof KioskoConfig>(k: K, v: KioskoConfig[K]) =>
    setCfg((c) => (c ? { ...c, [k]: v } : c));
  const numInput = (
    k: "reposoSegundos" | "precioSegundos" | "slideSegundos",
    label: string,
    icon: "time" | "pricetag" | "images",
  ) => (
    <Input
      label={label}
      icon={icon}
      value={String(cfg[k])}
      editable={editar}
      keyboardType="number-pad"
      onChangeText={(t) => set(k, Number(t.replace(/\D/g, "")) || 0)}
    />
  );
  const colorOk = /^#[0-9a-fA-F]{6}$/.test(cfg.colorAcento);

  return (
    <Card style={s.mt}>
      <Text style={s.h}>Comportamiento</Text>
      <Text style={s.sub}>Aplica a todos los kioskos de tu negocio.</Text>
      <View style={{ height: space.md }} />
      {numInput("reposoSegundos", "Segundos sin uso para pasar a anuncios (5–600)", "time")}
      {numInput("precioSegundos", "Segundos que se muestra el precio (2–60)", "pricetag")}
      {numInput("slideSegundos", "Segundos por anuncio (2–60)", "images")}

      <Text style={s.label}>Contenido en modo comercial</Text>
      <View style={s.chips}>
        {CONTENIDO.map((c) => (
          <Chip
            key={c.value}
            label={c.label}
            on={cfg.contenidoReposo === c.value}
            onPress={() => editar && set("contenidoReposo", c.value)}
          />
        ))}
      </View>

      <Text style={s.label}>Idioma</Text>
      <View style={s.chips}>
        <Chip
          label="Español"
          on={cfg.idioma === "es"}
          onPress={() => editar && set("idioma", "es")}
        />
        <Chip
          label="English"
          on={cfg.idioma === "en"}
          onPress={() => editar && set("idioma", "en")}
        />
      </View>

      <Input
        label="Mensaje de bienvenida"
        icon="chatbubble"
        value={cfg.mensajeBienvenida}
        editable={editar}
        maxLength={120}
        onChangeText={(t) => set("mensajeBienvenida", t)}
      />
      <View style={s.colorRow}>
        <View style={{ flex: 1 }}>
          <Input
            label="Color de acento (hex)"
            icon="color-palette"
            value={cfg.colorAcento}
            editable={editar}
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={7}
            onChangeText={(t) => set("colorAcento", t.startsWith("#") ? t : `#${t}`)}
          />
        </View>
        <View style={[s.swatch, { backgroundColor: colorOk ? cfg.colorAcento : colors.line }]} />
      </View>

      <Toggle
        label="Mostrar existencia al cliente"
        value={cfg.mostrarExistencia}
        disabled={!editar}
        onChange={(v) => set("mostrarExistencia", v)}
      />
      <Toggle
        label="Sonido al escanear"
        value={cfg.sonidoBeep}
        disabled={!editar}
        onChange={(v) => set("sonidoBeep", v)}
      />

      {editar ? (
        <>
          <View style={{ height: space.md }} />
          <Button
            label="Guardar"
            icon="save"
            busy={save.isPending}
            disabled={!colorOk}
            onPress={() => save.mutate()}
          />
        </>
      ) : null}
    </Card>
  );
}

function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable style={[s.chip, on && s.chipOn]} onPress={onPress}>
      <Text style={[s.chipTxt, on && s.chipTxtOn]}>{label}</Text>
    </Pressable>
  );
}

function Toggle({
  label,
  value,
  disabled,
  onChange,
}: { label: string; value: boolean; disabled: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={s.toggle}>
      <Text style={s.toggleTxt}>{label}</Text>
      <Switch
        value={value}
        disabled={disabled}
        onValueChange={onChange}
        trackColor={{ true: colors.brand, false: colors.line }}
      />
    </View>
  );
}

const s = StyleSheet.create({
  root: { padding: space.lg },
  intro: { fontSize: 13, color: colors.muted, lineHeight: 18 },
  mt: { marginTop: space.md },
  head: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: space.sm,
  },
  h: { fontSize: 16, fontWeight: "800", color: colors.ink },
  sub: { fontSize: 13, color: colors.muted, marginTop: 2, lineHeight: 18 },
  label: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.text,
    marginTop: space.md,
    marginBottom: 6,
  },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.brand,
    borderRadius: radius.md,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  addTxt: { color: colors.white, fontWeight: "700", fontSize: 13 },
  row: { flexDirection: "row", alignItems: "center", gap: space.md, paddingVertical: space.sm },
  rowBorder: { borderTopWidth: 1, borderTopColor: colors.line },
  rowIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    backgroundColor: colors.brandLight,
    alignItems: "center",
    justifyContent: "center",
  },
  rowTitle: { fontSize: 15, fontWeight: "700", color: colors.ink },
  rowSub: { fontSize: 12, color: colors.muted, marginTop: 2 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  chip: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 14,
    backgroundColor: colors.card,
  },
  chipOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  chipTxt: { color: colors.ink, fontSize: 13, fontWeight: "600" },
  chipTxtOn: { color: colors.white },
  colorRow: { flexDirection: "row", alignItems: "flex-end", gap: space.md },
  swatch: { width: 44, height: 44, borderRadius: radius.md, marginBottom: 2 },
  toggle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: space.sm,
    marginTop: space.sm,
  },
  toggleTxt: { fontSize: 14, color: colors.ink, flex: 1 },
  modal: { flex: 1, backgroundColor: colors.bg, paddingTop: 48 },
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
  modalBody: { padding: space.lg, gap: space.sm },
  tokenBox: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: space.md,
    borderWidth: 1,
    borderColor: colors.line,
    marginVertical: space.sm,
  },
  token: { fontSize: 13, color: colors.ink, fontWeight: "600" },
});
