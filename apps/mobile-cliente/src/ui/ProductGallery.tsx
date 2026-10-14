import { useCallback, useMemo, useRef, useState } from "react";
import {
  Animated,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, commerce, radius } from "../theme";
import { Icon } from "./Icon";
import { ProductPhoto } from "./ProductPhoto";

export function ProductGallery({
  photos: sourcePhotos,
  title,
}: { photos: string[]; title: string }) {
  const photos = [...new Set(sourcePhotos)];
  const [index, setIndex] = useState(0);
  const [open, setOpen] = useState(false);
  return (
    <View style={s.gallery}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Ampliar imagen de ${title}`}
        disabled={!photos.length}
        onPress={() => setOpen(true)}
      >
        <ProductPhoto uri={photos[index]} label={title} style={s.main} />
        {photos.length > 0 ? (
          <View style={s.zoomHint}>
            <Icon name="expand-outline" size={15} color={commerce.forest} />
            <Text style={s.hint}>Toca para ampliar</Text>
          </View>
        ) : null}
      </Pressable>
      {photos.length > 1 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.thumbnails}
        >
          {photos.map((uri, i) => (
            <Pressable
              key={uri}
              accessibilityRole="button"
              accessibilityLabel={`Ver imagen ${i + 1}`}
              accessibilityState={{ selected: i === index }}
              onPress={() => setIndex(i)}
              style={[s.thumbnail, i === index && s.selected]}
            >
              <ProductPhoto uri={uri} style={s.small} />
            </Pressable>
          ))}
        </ScrollView>
      ) : null}
      <Modal visible={open} animationType="fade" onRequestClose={() => setOpen(false)}>
        <SafeAreaView
          style={s.modal}
          accessibilityViewIsModal
          onAccessibilityEscape={() => setOpen(false)}
        >
          <View style={s.modalHeader}>
            <Text style={s.modalTitle} numberOfLines={2}>
              {title}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Cerrar imagen"
              onPress={() => setOpen(false)}
              style={s.control}
            >
              <Icon name="close" size={25} />
            </Pressable>
          </View>
          {open ? <ZoomPhoto key={`${index}:${open}`} uri={photos[index]} label={title} /> : null}
          <View style={s.paging}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Imagen anterior"
              disabled={index === 0}
              onPress={() => setIndex(index - 1)}
              style={[s.control, index === 0 && s.disabled]}
            >
              <Icon name="chevron-back" />
            </Pressable>
            <Text style={s.hint}>
              {index + 1} / {photos.length}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Imagen siguiente"
              disabled={index >= photos.length - 1}
              onPress={() => setIndex(index + 1)}
              style={[s.control, index >= photos.length - 1 && s.disabled]}
            >
              <Icon name="chevron-forward" />
            </Pressable>
          </View>
        </SafeAreaView>
      </Modal>
    </View>
  );
}
function ZoomPhoto({ uri, label }: { uri?: string; label: string }) {
  const viewport = useWindowDimensions();
  const scale = useRef(new Animated.Value(1)).current;
  const x = useRef(new Animated.Value(0)).current;
  const y = useRef(new Animated.Value(0)).current;
  const current = useRef({ scale: 1, x: 0, y: 0 });
  const initial = useRef({ scale: 1, x: 0, y: 0, distance: 0 });
  const size = useRef({ width: viewport.width, height: viewport.height * 0.6 });
  const [zoom, setZoom] = useState(1);
  const apply = useCallback(
    (next: number, dx = current.current.x, dy = current.current.y) => {
      const v = Math.max(1, Math.min(3, next));
      const maxX = (size.current.width * (v - 1)) / 2;
      const maxY = (size.current.height * (v - 1)) / 2;
      current.current = {
        scale: v,
        x: Math.max(-maxX, Math.min(maxX, dx)),
        y: Math.max(-maxY, Math.min(maxY, dy)),
      };
      scale.setValue(v);
      x.setValue(current.current.x);
      y.setValue(current.current.y);
      setZoom(v);
    },
    [scale, x, y],
  );
  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onPanResponderGrant: (e) => {
          const [a, b] = e.nativeEvent.touches;
          initial.current = {
            ...current.current,
            distance: a && b ? Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY) : 0,
          };
        },
        onPanResponderMove: (e, g) => {
          const [a, b] = e.nativeEvent.touches;
          if (a && b) {
            const distance = Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY);
            if (!initial.current.distance) initial.current = { ...current.current, distance };
            if (initial.current.distance)
              apply((initial.current.scale * distance) / initial.current.distance);
          } else {
            if (initial.current.distance) {
              initial.current = { ...current.current, distance: 0 };
              return;
            }
            apply(current.current.scale, initial.current.x + g.dx, initial.current.y + g.dy);
          }
        },
        onPanResponderTerminationRequest: () => true,
      }),
    [apply],
  );
  return (
    <View style={s.zoomBody}>
      <View
        {...responder.panHandlers}
        style={s.canvas}
        onLayout={(e) => {
          size.current = e.nativeEvent.layout;
        }}
      >
        <Animated.View
          style={[s.imageLayer, { transform: [{ translateX: x }, { translateY: y }, { scale }] }]}
        >
          <ProductPhoto uri={uri} label={label} style={s.full} />
        </Animated.View>
      </View>
      <Text style={[s.hint, { textAlign: "center" }]}>
        Separa dos dedos para ampliar; arrastra para explorar.
      </Text>
      <View style={s.zoomControls}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Reducir imagen"
          disabled={zoom <= 1}
          style={[s.control, zoom <= 1 && s.disabled]}
          onPress={() => apply(zoom - 0.5)}
        >
          <Icon name="remove" />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Restablecer zoom"
          onPress={() => apply(1, 0, 0)}
          style={s.reset}
        >
          <Text style={s.resetText}>{Math.round(zoom * 100)}% · Restablecer</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Ampliar imagen"
          disabled={zoom >= 3}
          style={[s.control, zoom >= 3 && s.disabled]}
          onPress={() => apply(zoom + 0.5)}
        >
          <Icon name="add" />
        </Pressable>
      </View>
    </View>
  );
}
const s = StyleSheet.create({
  gallery: { gap: 10 },
  main: { height: 310, borderRadius: 24 },
  zoomHint: {
    position: "absolute",
    right: 12,
    bottom: 12,
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
    backgroundColor: colors.card,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  hint: { fontSize: 12, color: colors.muted },
  thumbnails: { gap: 10 },
  thumbnail: { padding: 3, borderWidth: 1, borderColor: colors.line, borderRadius: 12 },
  selected: { borderColor: colors.brand, borderWidth: 2, padding: 2 },
  small: { width: 60, height: 60, borderRadius: 9 },
  modal: { flex: 1, backgroundColor: colors.bg },
  modalHeader: { padding: 16, flexDirection: "row", alignItems: "center", gap: 12 },
  modalTitle: { flex: 1, fontSize: 17, fontWeight: "700", color: colors.ink },
  control: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
  },
  zoomBody: { flex: 1, gap: 14 },
  canvas: { flex: 1, overflow: "hidden", backgroundColor: "#f3f5f0" },
  imageLayer: { width: "100%", height: "100%" },
  full: { width: "100%", height: "100%" },
  zoomControls: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 12 },
  reset: { padding: 12 },
  resetText: { color: colors.brand, fontSize: 13, fontWeight: "700" },
  paging: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 22,
    padding: 16,
  },
  disabled: { opacity: 0.35 },
});
