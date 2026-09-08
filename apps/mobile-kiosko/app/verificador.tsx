import { accentForeground, priceColor } from "@/lib/color-contrast";
import { money } from "@/lib/format";
import { kioskFailure } from "@/lib/recovery";
import { type PrecioKiosko, getIdle, getKioskoConfig, getPrecio } from "@/services/kiosko";
import { colors, radius, space } from "@/theme";
import { Button, Icon } from "@/ui";
import { ReaderInput } from "@/ui/ReaderInput";
import { useQuery } from "@tanstack/react-query";
import { CameraView, useCameraPermissions } from "expo-camera";
import { router } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";

type Modo = "espera" | "precio" | "reposo";

export default function Verificador() {
  const [failure, setFailure] = useState<ReturnType<typeof kioskFailure> | null>(null);
  const [cameraError, setCameraError] = useState(false);
  const [readerMode, setReaderMode] = useState(false);
  const inFlight = useRef(false);
  const cfg = useQuery({
    queryKey: ["kiosko-config"],
    queryFn: getKioskoConfig,
    retry: false,
    refetchInterval: 30_000,
    refetchIntervalInBackground: true,
  });
  const [permission, requestPermission] = useCameraPermissions();
  const [modo, setModo] = useState<Modo>("espera");
  const [precio, setPrecio] = useState<PrecioKiosko | null>(null);
  const [buscando, setBuscando] = useState(false);
  const lastScan = useRef<{ codigo: string; at: number }>({ codigo: "", at: 0 });
  const timers = useRef<{
    reposo?: ReturnType<typeof setTimeout>;
    precio?: ReturnType<typeof setTimeout>;
  }>({});

  const {
    colorAcento: acento = colors.brand,
    reposoSegundos = 20,
    precioSegundos = 8,
    slideSegundos = 6,
    mostrarExistencia = false,
    mensajeBienvenida = "Escanea tu producto",
  } = cfg.data ?? {};
  const reposoMs = reposoSegundos * 1000;
  const precioMs = precioSegundos * 1000;

  const askCamera = async () => {
    try {
      if (permission?.canAskAgain === false) await Linking.openSettings();
      else await requestPermission();
    } catch {
      setCameraError(true);
    }
  };
  const configure = () =>
    Alert.alert(
      "Solo para el encargado",
      "¿Deseas abrir la configuración? Necesitarás un token válido del panel para reemplazar el actual.",
      [
        { text: "Cancelar", style: "cancel" },
        { text: "Soy el encargado", onPress: () => router.replace("/setup") },
      ],
    );
  useEffect(
    () => () => {
      if (timers.current.precio) clearTimeout(timers.current.precio);
      if (timers.current.reposo) clearTimeout(timers.current.reposo);
    },
    [],
  );

  // Timer de reposo: en "espera", tras N seg sin escanear → "reposo".
  const armarReposo = useCallback(() => {
    if (timers.current.reposo) clearTimeout(timers.current.reposo);
    timers.current.reposo = setTimeout(() => setModo("reposo"), reposoMs);
  }, [reposoMs]);

  useEffect(() => {
    if (modo === "espera") armarReposo();
    return () => {
      if (timers.current.reposo) clearTimeout(timers.current.reposo);
    };
  }, [modo, armarReposo]);

  const onBarcode = useCallback(
    async (codigo: string) => {
      const now = Date.now();
      if (inFlight.current || failure || !cfg.data || cfg.isError) return;
      if (codigo === lastScan.current.codigo && now - lastScan.current.at < 2500) return;
      lastScan.current = { codigo, at: now };
      inFlight.current = true;
      setBuscando(true);
      if (timers.current.precio) clearTimeout(timers.current.precio);
      if (timers.current.reposo) clearTimeout(timers.current.reposo);
      try {
        const r = await getPrecio(codigo);
        setPrecio(r);
      } catch (error) {
        setPrecio(null);
        setFailure(kioskFailure(error));
        setModo("espera");
        return;
      } finally {
        setBuscando(false);
        inFlight.current = false;
      }
      setModo("precio");
      timers.current.precio = setTimeout(() => {
        setPrecio(null);
        setModo("espera");
      }, precioMs);
    },
    [failure, cfg.data, cfg.isError, precioMs],
  );

  if (cfg.isLoading || (!readerMode && !permission)) {
    return (
      <Centro>
        <ActivityIndicator size="large" color={colors.brand} />
      </Centro>
    );
  }
  const currentFailure = cfg.isError ? kioskFailure(cfg.error) : failure;
  if (currentFailure) {
    return (
      <Centro>
        <Icon name="warning" size={48} color={colors.warn} />
        <Text accessibilityRole="alert" style={s.permTitle}>
          {currentFailure.message}
        </Text>
        <Button
          label="Volver a intentar"
          busy={cfg.isFetching}
          onPress={() => {
            setFailure(null);
            setPrecio(null);
            setModo("espera");
            lastScan.current = { codigo: "", at: 0 };
            void cfg.refetch();
          }}
        />
        <Button label="Configuración del encargado" variant="ghost" onPress={configure} />
      </Centro>
    );
  }
  if (!readerMode && (!permission?.granted || cameraError)) {
    return (
      <Centro>
        <Icon name="camera" size={48} color={colors.faint} />
        <Text style={s.permTitle}>
          {cameraError
            ? "No se pudo abrir la cámara. Revisa los permisos y reinicia la aplicación."
            : "Permiso de cámara requerido"}
        </Text>
        <Pressable
          style={[s.permBtn, { backgroundColor: acento }]}
          onPress={() => {
            setCameraError(false);
            void askCamera();
          }}
        >
          <Text style={[s.permBtnText, { color: accentForeground(acento) }]}>
            {permission?.canAskAgain ? "Permitir cámara" : "Abrir ajustes"}
          </Text>
        </Pressable>
        <Button
          label="Usar lector o escribir código"
          variant="outline"
          onPress={() => setReaderMode(true)}
        />
      </Centro>
    );
  }

  return (
    <View style={s.root}>
      <View style={{ flex: 1 }}>
        {/* Cámara siempre montada (lee códigos), oculta tras el contenido según el modo */}
        {!readerMode && (
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={{
              barcodeTypes: ["ean13", "ean8", "upc_a", "upc_e", "code128", "code39", "qr"],
            }}
            onBarcodeScanned={({ data }) => void onBarcode(data)}
            onMountError={() => setCameraError(true)}
          />
        )}

        {modo === "reposo" ? (
          <Reposo
            acento={acento}
            slideMs={slideSegundos * 1000}
            onSalir={() => setModo("espera")}
          />
        ) : modo === "precio" && precio ? (
          <Precio
            precio={precio}
            acento={acento}
            mostrarExistencia={mostrarExistencia}
            onEscanea={() => {
              setPrecio(null);
              setModo("espera");
            }}
          />
        ) : (
          <Espera
            mensaje={mensajeBienvenida}
            acento={acento}
            buscando={buscando}
            readerMode={readerMode}
          />
        )}

        {/* Toque oculto (esquina) para reconfigurar el dispositivo */}
        <Pressable
          style={s.reconfig}
          accessibilityLabel="Configuración del encargado: mantener pulsado"
          delayLongPress={1500}
          onLongPress={configure}
        />
      </View>
      {readerMode ? <ReaderInput onScan={onBarcode} busy={buscando} /> : null}
      <View style={{ backgroundColor: colors.card }}>
        <Button
          label={readerMode ? "Usar cámara" : "Usar lector o escribir código"}
          variant="ghost"
          onPress={() => setReaderMode(!readerMode)}
        />
      </View>
    </View>
  );
}

function Espera({
  mensaje,
  acento,
  buscando,
  readerMode,
}: { mensaje: string; acento: string; buscando: boolean; readerMode: boolean }) {
  return (
    <View style={[s.overlay, { backgroundColor: "rgba(15,23,42,0.55)" }]}>
      <View style={[s.marco, { borderColor: acento }]}>
        {buscando ? (
          <ActivityIndicator size="large" color={colors.white} />
        ) : (
          <Icon name="barcode" size={64} color={colors.white} />
        )}
      </View>
      <Text style={s.esperaMsg}>{mensaje}</Text>
      <Text style={s.esperaSub}>
        {readerMode
          ? "Escanea con el lector o escribe el código abajo"
          : "Acerca el código de barras a la cámara"}
      </Text>
    </View>
  );
}

function Precio({
  precio,
  acento,
  mostrarExistencia,
  onEscanea,
}: { precio: PrecioKiosko; acento: string; mostrarExistencia: boolean; onEscanea: () => void }) {
  const { width, height } = useWindowDimensions();
  const compact = width < 600;
  if (!precio.encontrado) {
    return (
      <Pressable onPress={onEscanea} style={[s.overlay, { backgroundColor: colors.card }]}>
        <Icon name="alert-circle" size={72} color={colors.warn} />
        <Text style={s.noEnc}>Producto no encontrado</Text>
        <Text style={s.esperaSub2}>Intenta con otro producto o toca para escanear</Text>
      </Pressable>
    );
  }
  return (
    <Pressable style={[s.overlay, s.precioBg]} onPress={onEscanea}>
      <ScrollView
        style={{ width: "100%" }}
        contentContainerStyle={{ flexGrow: 1, justifyContent: "center", alignItems: "center" }}
      >
        <View style={[s.precioRow, compact && { flexDirection: "column", gap: space.md }]}>
          {precio.imagen ? (
            <Image
              source={{ uri: precio.imagen }}
              style={[
                s.foto,
                {
                  width: Math.min(width * 0.35, height * 0.35, 220),
                  height: Math.min(width * 0.35, height * 0.35, 220),
                },
              ]}
              resizeMode="contain"
            />
          ) : (
            <View
              style={[
                s.foto,
                s.fotoPlaceholder,
                {
                  width: Math.min(width * 0.35, height * 0.35, 220),
                  height: Math.min(width * 0.35, height * 0.35, 220),
                },
              ]}
            >
              <Icon name="cube" size={64} color={colors.faint} />
            </View>
          )}
          <View style={{ flex: compact ? undefined : 1, width: compact ? "100%" : undefined }}>
            <Text style={[s.nombre, compact && { fontSize: 24 }]} numberOfLines={3}>
              {precio.nombre}
            </Text>
            <Text style={s.sku}>{precio.sku}</Text>
            {precio.precioAntes ? <Text style={s.antes}>{money(precio.precioAntes)}</Text> : null}
            <Text
              adjustsFontSizeToFit
              numberOfLines={1}
              style={[
                s.precioBig,
                { color: priceColor(acento, colors.card, colors.ink), fontSize: compact ? 52 : 72 },
              ]}
            >
              {money(precio.precioVigente ?? "0")}
            </Text>
            {precio.promoLabel ? (
              <View style={[s.promoTag, { backgroundColor: acento }]}>
                <Text style={[s.promoText, { color: accentForeground(acento) }]}>
                  {precio.promoLabel}
                </Text>
              </View>
            ) : null}
            {mostrarExistencia && precio.existencia != null ? (
              <Text style={s.existencia}>Disponibles: {precio.existencia}</Text>
            ) : null}
          </View>
        </View>
        <Text style={s.tocaEscanea}>Escanea otro producto</Text>
      </ScrollView>
    </Pressable>
  );
}

function Reposo({
  acento,
  slideMs,
  onSalir,
}: { acento: string; slideMs: number; onSalir: () => void }) {
  const idle = useQuery({
    queryKey: ["kiosko-idle"],
    queryFn: getIdle,
    retry: false,
    refetchInterval: 30_000,
    refetchIntervalInBackground: true,
  });
  // Never keep showing an obsolete promotion after a refresh fails.
  const slides = idle.isError ? [] : (idle.data?.slides ?? []);
  const [i, setI] = useState(0);
  useEffect(() => {
    if (slides.length === 0) return;
    const t = setInterval(() => setI((x) => (x + 1) % slides.length), slideMs);
    return () => clearInterval(t);
  }, [slides.length, slideMs]);
  const slide = slides[i % Math.max(slides.length, 1)];
  return (
    <Pressable style={[s.overlay, s.reposoBg]} onPress={onSalir}>
      <ScrollView
        style={{ width: "100%" }}
        contentContainerStyle={{ flexGrow: 1, alignItems: "center", justifyContent: "center" }}
      >
        {idle.isError ? (
          <>
            <Text accessibilityRole="alert" style={s.reposoTexto}>
              {kioskFailure(idle.error).message}
            </Text>
            <Button
              label="Reintentar anuncios"
              busy={idle.isFetching}
              onPress={() => void idle.refetch()}
            />
          </>
        ) : idle.isLoading ? (
          <ActivityIndicator size="large" color={colors.white} />
        ) : slide ? (
          <>
            {slide.imagen ? (
              <Image source={{ uri: slide.imagen }} style={s.reposoImg} resizeMode="cover" />
            ) : (
              <View style={[s.reposoIcon, { backgroundColor: acento }]}>
                <Icon name="megaphone" size={64} color={colors.white} />
              </View>
            )}
            <Text style={s.reposoTitulo}>{slide.titulo}</Text>
            {slide.texto ? <Text style={s.reposoTexto}>{slide.texto}</Text> : null}
          </>
        ) : (
          <View style={[s.reposoIcon, { backgroundColor: acento }]}>
            <Icon name="storefront" size={72} color={colors.white} />
          </View>
        )}
        <Text style={s.reposoHint}>Toca o escanea para verificar un precio</Text>
      </ScrollView>
    </Pressable>
  );
}

function Centro({ children }: { children: React.ReactNode }) {
  return (
    <View
      style={[
        s.root,
        {
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: colors.bg,
          padding: space.lg,
        },
      ]}
    >
      {children}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    padding: space.xxl,
  },
  marco: {
    width: 220,
    height: 140,
    borderWidth: 4,
    borderRadius: radius.lg,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: space.lg,
  },
  esperaMsg: { fontSize: 34, fontWeight: "800", color: colors.white, textAlign: "center" },
  esperaSub: {
    textAlign: "center",
    fontSize: 18,
    color: "rgba(255,255,255,0.8)",
    marginTop: space.sm,
  },
  esperaSub2: { textAlign: "center", fontSize: 18, color: colors.muted, marginTop: space.sm },
  precioBg: { backgroundColor: colors.card },
  precioRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xxl,
    width: "90%",
    maxWidth: 900,
  },
  foto: { width: 220, height: 220, borderRadius: radius.lg, backgroundColor: colors.bg },
  fotoPlaceholder: { alignItems: "center", justifyContent: "center" },
  nombre: { fontSize: 34, fontWeight: "800", color: colors.ink },
  sku: { fontSize: 16, color: colors.faint, marginTop: 4 },
  antes: {
    fontSize: 26,
    color: colors.faint,
    textDecorationLine: "line-through",
    marginTop: space.md,
  },
  precioBig: { fontSize: 84, fontWeight: "900", marginTop: 4 },
  promoTag: {
    alignSelf: "flex-start",
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: radius.pill,
    marginTop: space.sm,
  },
  promoText: { color: colors.white, fontWeight: "800", fontSize: 16 },
  existencia: { fontSize: 18, color: colors.muted, marginTop: space.md },
  tocaEscanea: { marginTop: space.xl, textAlign: "center", fontSize: 16, color: colors.faint },
  noEnc: {
    textAlign: "center",
    fontSize: 30,
    fontWeight: "800",
    color: colors.ink,
    marginTop: space.md,
  },
  reposoBg: { backgroundColor: colors.ink },
  reposoImg: { width: "100%", maxWidth: 700, height: 200, borderRadius: radius.xl },
  reposoIcon: {
    width: 140,
    height: 140,
    borderRadius: radius.xl,
    alignItems: "center",
    justifyContent: "center",
  },
  reposoTitulo: {
    fontSize: 28,
    fontWeight: "800",
    color: colors.white,
    textAlign: "center",
    marginTop: space.xl,
  },
  reposoTexto: {
    fontSize: 22,
    color: "rgba(255,255,255,0.85)",
    textAlign: "center",
    marginTop: space.sm,
  },
  reposoHint: {
    marginTop: space.xl,
    textAlign: "center",
    fontSize: 16,
    color: "rgba(255,255,255,0.6)",
  },
  permTitle: {
    textAlign: "center",
    marginBottom: space.lg,
    fontSize: 22,
    fontWeight: "700",
    color: colors.ink,
    marginTop: space.md,
  },
  permBtn: {
    paddingHorizontal: space.xl,
    paddingVertical: space.md,
    borderRadius: radius.md,
    marginTop: space.lg,
  },
  permBtnText: { color: colors.white, fontWeight: "700", fontSize: 16 },
  reconfig: { position: "absolute", top: 0, right: 0, width: 60, height: 60 },
});
