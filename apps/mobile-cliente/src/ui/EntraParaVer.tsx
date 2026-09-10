import { colors, space } from "@/theme";
import { router } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { Button } from "./Button";
import { Icon, type IconName } from "./Icon";

/**
 * Lo personal (pedidos, favoritos, avisos, cuenta) sí necesita cuenta. En vez
 * de mandar al login de golpe, se explica qué hay del otro lado y se deja
 * seguir mirando la tienda.
 */
export function EntraParaVer({
  icono,
  titulo,
  texto,
}: { icono: IconName; titulo: string; texto: string }) {
  return (
    <View style={s.root}>
      <View style={s.circulo}>
        <Icon name={icono} size={30} color={colors.brand} />
      </View>
      <Text style={s.titulo}>{titulo}</Text>
      <Text style={s.texto}>{texto}</Text>
      <View style={s.acciones}>
        <Button label="Entrar o crear cuenta" icon="log-in" onPress={() => router.push("/login")} />
        <Button
          label="Seguir viendo la tienda"
          icon="storefront"
          variant="outline"
          onPress={() => router.replace("/(app)/tienda")}
        />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: space.xl,
    gap: space.sm,
  },
  circulo: {
    width: 64,
    height: 64,
    borderRadius: 999,
    backgroundColor: colors.brandLight,
    alignItems: "center",
    justifyContent: "center",
  },
  titulo: { fontSize: 18, fontWeight: "800", color: colors.ink, textAlign: "center" },
  texto: { fontSize: 14, color: colors.muted, textAlign: "center", lineHeight: 20 },
  acciones: { alignSelf: "stretch", gap: space.sm, marginTop: space.md },
});
