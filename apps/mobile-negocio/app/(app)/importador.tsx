import {
  type FilaPrecio,
  type FilaProducto,
  importarPrecios,
  importarProductos,
} from "@/services/negocio";
import { colors, radius, shadow, space } from "@/theme";
import { Button, Card, Icon } from "@/ui";
import { useMutation } from "@tanstack/react-query";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";
import { useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

type Modo = "productos" | "precios";

function parseCsv(texto: string): string[][] {
  return texto
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .map((l) => l.split(/[,;\t]/).map((c) => c.trim().replace(/^"|"$/g, "")));
}

export default function Importador() {
  const [modo, setModo] = useState<Modo>("productos");
  const [nombreArchivo, setNombreArchivo] = useState<string | null>(null);
  const [filas, setFilas] = useState<string[][]>([]);
  const [error, setError] = useState<string | null>(null);

  const elegir = async () => {
    setError(null);
    const r = await DocumentPicker.getDocumentAsync({
      type: ["text/csv", "text/comma-separated-values", "text/plain", "*/*"],
    });
    if (r.canceled || !r.assets?.[0]) return;
    const asset = r.assets[0];
    try {
      const texto = await FileSystem.readAsStringAsync(asset.uri);
      const parsed = parseCsv(texto);
      setFilas(parsed);
      setNombreArchivo(asset.name);
    } catch {
      setError("No se pudo leer el archivo.");
    }
  };

  // Detecta si la primera fila es encabezado (contiene "sku"/"nombre"/"precio").
  const primeraEsHeader = filas[0]?.some((c) => /sku|nombre|precio/i.test(c)) ?? false;
  const datos = primeraEsHeader ? filas.slice(1) : filas;

  const importar = useMutation({
    mutationFn: async () => {
      if (modo === "productos") {
        const f: FilaProducto[] = datos
          .filter((r) => r[0] && r[1] && r[2])
          .map((r) => ({
            skuPadre: r[0] as string,
            nombre: r[1] as string,
            precioBase: r[2] as string,
            ...(r[3] ? { stockInicial: r[3] } : {}),
          }));
        return importarProductos(f);
      }
      const f: FilaPrecio[] = datos
        .filter((r) => r[0] && r[1])
        .map((r) => ({ sku: r[0] as string, precioBase: r[1] as string }));
      return importarPrecios(f);
    },
    onSuccess: (res) => {
      setFilas([]);
      setNombreArchivo(null);
      Alert.alert(
        "Importación lista ✓",
        `${res.creados ?? 0} creados · ${res.actualizados ?? 0} actualizados${res.errores ? ` · ${res.errores} con error` : ""}`,
      );
    },
    onError: (e) => Alert.alert("No se pudo importar", e instanceof Error ? e.message : "Error"),
  });

  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={s.root}>
      <Text style={s.intro}>
        Sube un archivo CSV para cargar datos en lote, directo desde tu teléfono.
      </Text>

      <View style={s.tabs}>
        <Tab
          label="Productos"
          active={modo === "productos"}
          onPress={() => {
            setModo("productos");
            setFilas([]);
            setNombreArchivo(null);
          }}
        />
        <Tab
          label="Precios"
          active={modo === "precios"}
          onPress={() => {
            setModo("precios");
            setFilas([]);
            setNombreArchivo(null);
          }}
        />
      </View>

      <Card style={s.mt}>
        <Text style={s.h}>Formato del CSV</Text>
        <Text style={s.formato}>
          {modo === "productos"
            ? "Columnas: skuPadre, nombre, precioBase, stockInicial (opcional)"
            : "Columnas: sku, precioBase"}
        </Text>
        <Text style={s.formatoHint}>
          Separadas por coma. La primera fila puede ser el encabezado.
        </Text>
      </Card>

      <Pressable style={s.picker} onPress={elegir}>
        <Icon name="cloud-upload" size={24} color={colors.brand} />
        <Text style={s.pickerText}>{nombreArchivo ?? "Elegir archivo CSV"}</Text>
      </Pressable>
      {error ? <Text style={s.error}>{error}</Text> : null}

      {datos.length > 0 ? (
        <Card style={s.mt}>
          <Text style={s.h}>{datos.length} fila(s) detectadas</Text>
          {datos.slice(0, 4).map((r, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: preview de filas del CSV
            <Text key={i} style={s.fila} numberOfLines={1}>
              {r.join(" · ")}
            </Text>
          ))}
          {datos.length > 4 ? <Text style={s.mas}>+{datos.length - 4} más…</Text> : null}
          <View style={{ height: space.md }} />
          <Button
            label={`Importar ${datos.length} ${modo}`}
            icon="checkmark-done"
            busy={importar.isPending}
            onPress={() => importar.mutate()}
          />
        </Card>
      ) : null}
      <View style={{ height: space.xl }} />
    </ScrollView>
  );
}

function Tab({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable style={[s.tab, active && s.tabOn]} onPress={onPress}>
      <Text style={[s.tabText, active && s.tabTextOn]}>{label}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  root: { padding: space.lg },
  intro: { color: colors.muted, fontSize: 14, marginBottom: space.md },
  tabs: { flexDirection: "row", gap: space.sm },
  tab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: radius.pill,
    backgroundColor: colors.card,
    alignItems: "center",
    ...shadow.card,
  },
  tabOn: { backgroundColor: colors.brand },
  tabText: { color: colors.text, fontWeight: "600" },
  tabTextOn: { color: colors.white },
  mt: { marginTop: space.md },
  h: { fontSize: 15, fontWeight: "800", color: colors.ink, marginBottom: 4 },
  formato: { color: colors.text, fontSize: 14, fontWeight: "600" },
  formatoHint: { color: colors.faint, fontSize: 12, marginTop: 4 },
  picker: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.sm,
    backgroundColor: colors.brandLight,
    borderRadius: radius.md,
    paddingVertical: space.lg,
    marginTop: space.md,
    borderWidth: 1,
    borderColor: colors.brand,
    borderStyle: "dashed",
  },
  pickerText: { color: colors.brandDark, fontWeight: "700", fontSize: 15 },
  error: { color: colors.danger, fontSize: 14, marginTop: space.sm },
  fila: { color: colors.text, fontSize: 13, paddingVertical: 3, fontVariant: ["tabular-nums"] },
  mas: { color: colors.faint, fontSize: 12, marginTop: 4 },
});
