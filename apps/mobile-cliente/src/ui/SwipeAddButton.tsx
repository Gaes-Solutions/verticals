import { useCallback, useMemo, useRef, useState } from "react";
import { Animated, PanResponder, Pressable, StyleSheet, Text, View } from "react-native";
import { swipeComplete, swipeIntent } from "../lib/swipe";
import { colors, radius } from "../theme";
import { Icon } from "./Icon";

/** Tap remains the primary action; a deliberate right swipe is optional. */
export function SwipeAddButton({
  onAdd,
  disabled = false,
  compact = false,
}: {
  onAdd: () => void;
  disabled?: boolean;
  compact?: boolean;
}) {
  const latest = useRef({ onAdd, disabled });
  latest.current = { onAdd, disabled };
  const width = useRef(250);
  const cancelled = useRef(false);
  const suppressTap = useRef(false);
  const touchStart = useRef({ x: 0, y: 0 });
  const fill = useRef(new Animated.Value(0)).current;
  const [dragging, setDragging] = useState(false);
  const reset = useCallback(() => {
    fill.setValue(0);
    setDragging(false);
  }, [fill]);
  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponderCapture: (_event, g) =>
          !latest.current.disabled && swipeIntent(g.dx, g.dy, g.numberActiveTouches),
        onPanResponderGrant: (event) => {
          cancelled.current = cancelled.current || event.nativeEvent.touches.length > 1;
          suppressTap.current = true;
          setDragging(true);
        },
        onPanResponderMove: (event, g) => {
          if (event.nativeEvent.touches.length > 1 || g.numberActiveTouches > 1)
            cancelled.current = true;
          fill.setValue(cancelled.current ? 0 : Math.max(0, Math.min(g.dx / width.current, 1)));
        },
        onPanResponderRelease: (_event, g) => {
          const complete = swipeComplete(g.dx, g.dy, width.current, cancelled.current);
          reset();
          if (complete && !latest.current.disabled) latest.current.onAdd();
        },
        onPanResponderTerminate: () => {
          cancelled.current = true;
          suppressTap.current = true;
          reset();
        },
        onPanResponderTerminationRequest: () => true,
      }),
    [fill, reset],
  );
  return (
    <View
      {...responder.panHandlers}
      onLayout={(e) => {
        width.current = e.nativeEvent.layout.width;
      }}
      style={[s.root, compact && s.compact, disabled && s.disabled]}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          s.fill,
          { width: fill.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] }) },
        ]}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Agregar al carrito"
        accessibilityHint="Toca para agregar. También puedes deslizar a la derecha."
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPressIn={() => {
          suppressTap.current = false;
          cancelled.current = false;
        }}
        onTouchStart={(e) => {
          const touch = e.nativeEvent.touches[0];
          if (e.nativeEvent.touches.length === 1 && touch)
            touchStart.current = { x: touch.pageX, y: touch.pageY };
          if (e.nativeEvent.touches.length > 1) {
            cancelled.current = true;
            suppressTap.current = true;
          }
        }}
        onTouchMove={(e) => {
          const touch = e.nativeEvent.touches[0];
          if (e.nativeEvent.touches.length > 1) {
            cancelled.current = true;
            suppressTap.current = true;
          }
          if (
            touch &&
            Math.hypot(touch.pageX - touchStart.current.x, touch.pageY - touchStart.current.y) > 12
          )
            suppressTap.current = true;
        }}
        onTouchCancel={() => {
          cancelled.current = true;
          suppressTap.current = true;
          reset();
        }}
        onPress={() => {
          if (!suppressTap.current && !cancelled.current) onAdd();
          cancelled.current = false;
        }}
        style={({ pressed }) => [s.button, compact && s.compactButton, pressed && s.pressed]}
      >
        <Icon
          name={dragging ? "arrow-forward" : "add"}
          size={compact ? 18 : 22}
          color={colors.white}
        />
        <View style={s.words}>
          <Text style={[s.label, compact && s.compactLabel]}>
            {compact ? "Agregar" : "Agregar al carrito"}
          </Text>
          {!compact && <Text style={s.hint}>Toca o desliza a la derecha →</Text>}
        </View>
      </Pressable>
    </View>
  );
}
const s = StyleSheet.create({
  root: {
    borderRadius: radius.md,
    overflow: "hidden",
    backgroundColor: colors.brand,
    minHeight: 58,
  },
  compact: { minHeight: 44, borderRadius: 10 },
  fill: { position: "absolute", top: 0, bottom: 0, left: 0, backgroundColor: "#145b48" },
  button: {
    minHeight: 58,
    flexDirection: "row",
    gap: 10,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  compactButton: { minHeight: 44, paddingHorizontal: 8, paddingVertical: 8 },
  words: { flexShrink: 1 },
  label: { color: colors.white, fontSize: 16, fontWeight: "800" },
  compactLabel: { fontSize: 13 },
  hint: { color: colors.onBrandMuted, fontSize: 12, marginTop: 2 },
  pressed: { opacity: 0.85 },
  disabled: { opacity: 0.45 },
});
