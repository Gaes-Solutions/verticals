import { camposDireccionMapa } from "@gaespos/api-client";
import { useEffect, useRef, useState } from "react";
import { Linking, Text, View } from "react-native";
import { WebView } from "react-native-webview";
import { DeviceLocationError, deviceLocation } from "../services/device-location";
import { consultarUbicacion } from "../services/ubicacion";
import { colors, space } from "../theme";
import { Button } from "./Button";
import { Input } from "./Input";

type AddressFields = ReturnType<typeof camposDireccionMapa>;
export function AddressMap({
  onSelect,
  disabled,
}: { onSelect: (fields: AddressFields) => void; disabled?: boolean }) {
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const revision = useRef(0);
  const [point, setPoint] = useState<{ lat: number; lon: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState(false);
  const [settings, setSettings] = useState(false);
  useEffect(
    () => () => {
      revision.current++;
    },
    [],
  );
  async function search(current: boolean) {
    if (pending.current || disabled) return;
    pending.current = true;
    const attempt = ++revision.current;
    setBusy(true);
    setError(null);
    setSettings(false);
    try {
      let input: { q: string } | { lat: number; lon: number } = { q: query.trim() };
      if (current) input = await deviceLocation();
      if (attempt !== revision.current) return;
      const result = await consultarUbicacion(input);
      if (attempt !== revision.current) return;
      const lat = Number(result.lat);
      const lon = Number(result.lon);
      if (
        !Number.isFinite(lat) ||
        !Number.isFinite(lon) ||
        Math.abs(lat) > 90 ||
        Math.abs(lon) > 180
      )
        throw new Error("El mapa no encontró esta ubicación. Escribe los datos manualmente.");
      setPoint({ lat, lon });
      setSelected(true);
      onSelect(camposDireccionMapa(result));
    } catch (e) {
      if (attempt === revision.current) {
        if (e instanceof DeviceLocationError) setSettings(e.settings);
        setError(
          e instanceof Error && e.name === "Error"
            ? e.message
            : "No pudimos consultar el mapa. Reintenta o escribe los datos manualmente.",
        );
      }
    } finally {
      if (attempt === revision.current) {
        pending.current = false;
        setBusy(false);
      }
    }
  }
  const mapUrl = point
    ? `https://www.openstreetmap.org/export/embed.html?bbox=${point.lon - 0.005}%2C${point.lat - 0.005}%2C${point.lon + 0.005}%2C${point.lat + 0.005}&layer=mapnik&marker=${point.lat}%2C${point.lon}`
    : null;
  return (
    <View
      style={{
        gap: space.sm,
        borderWidth: 1,
        borderColor: colors.line,
        padding: space.md,
        borderRadius: 16,
      }}
    >
      <Text style={{ color: colors.ink, fontSize: 17, fontWeight: "700" }}>
        Encuentra tu dirección
      </Text>
      <Text style={{ color: colors.muted }}>
        Busca una calle y ciudad o usa la ubicación de tu teléfono.
      </Text>
      <Input
        label="Buscar dirección en el mapa"
        value={query}
        onChangeText={setQuery}
        placeholder="Calle y ciudad"
        editable={!busy && !disabled}
        returnKeyType="search"
        onSubmitEditing={() => {
          if (query.trim().length >= 3) void search(false);
        }}
      />
      <Button
        label="Buscar en el mapa"
        icon="search"
        busy={busy}
        disabled={disabled || query.trim().length < 3}
        onPress={() => void search(false)}
      />
      <Button
        label="Usar mi ubicación actual"
        icon="locate"
        disabled={disabled || busy}
        variant="outline"
        onPress={() => void search(true)}
      />
      {mapUrl && (
        <View style={{ height: 200, overflow: "hidden", borderRadius: 12 }}>
          <WebView
            source={{ uri: mapUrl }}
            originWhitelist={["https://www.openstreetmap.org"]}
            onShouldStartLoadWithRequest={(request) =>
              request.url === "about:blank" ||
              request.url.startsWith("https://www.openstreetmap.org/export/embed.html?")
            }
            onError={() =>
              setError(
                "No se pudo mostrar el mapa. Tus campos siguen disponibles para revisar y guardar.",
              )
            }
            setSupportMultipleWindows={false}
            geolocationEnabled={false}
            allowsFullscreenVideo={false}
            accessibilityLabel="Mapa de la dirección seleccionada"
          />
        </View>
      )}
      {selected && (
        <Text accessibilityRole="alert" style={{ color: colors.brand }}>
          Completamos los datos disponibles. Verifica el número exterior, el código postal y la
          ubicación antes de guardar.
        </Text>
      )}
      {error && (
        <Text accessibilityRole="alert" style={{ color: colors.danger }}>
          {error}
        </Text>
      )}
      {settings && (
        <Button
          label="Abrir ajustes del teléfono"
          variant="ghost"
          onPress={() => {
            void Linking.openSettings().catch(() =>
              setError("Abre los ajustes del teléfono y permite la ubicación para esta app."),
            );
          }}
        />
      )}
      <Text style={{ color: colors.muted, fontSize: 11 }}>
        Datos del mapa: © OpenStreetMap. Siempre puedes corregir los campos.
      </Text>
    </View>
  );
}
