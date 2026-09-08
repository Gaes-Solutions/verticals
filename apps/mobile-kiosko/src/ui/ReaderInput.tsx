import { readerCode } from "@/lib/reader-code";
import { colors, radius, space } from "@/theme";
import { useRef, useState } from "react";
import { Keyboard, StyleSheet, Text, TextInput, View } from "react-native";
import { Button } from "./Button";

export function ReaderInput({
  onScan,
  busy,
}: { onScan: (code: string) => Promise<void>; busy: boolean }) {
  const input = useRef<TextInput>(null);
  const [value, setValue] = useState("");
  const [manual, setManual] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const submit = async (raw: string) => {
    if (busy) return;
    const code = readerCode(raw);
    if (!code) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    setValue("");
    Keyboard.dismiss();
    setManual(false);
    await onScan(code);
    input.current?.focus();
  };
  return (
    <View style={styles.panel}>
      <Text style={styles.label}>Código de barras o SKU</Text>
      <TextInput
        ref={input}
        accessibilityLabel="Código de barras o SKU"
        autoFocus
        value={value}
        onChangeText={setValue}
        onSubmitEditing={(event) => void submit(event.nativeEvent.text)}
        showSoftInputOnFocus={manual}
        blurOnSubmit={false}
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={81}
        returnKeyType="search"
        style={styles.input}
      />
      {invalid ? (
        <Text accessibilityRole="alert" style={{ color: colors.danger }}>
          Introduce un código válido de hasta80 caracteres.
        </Text>
      ) : null}
      <View style={styles.actions}>
        <Button
          label="Consultar precio"
          busy={busy}
          disabled={!readerCode(value)}
          onPress={() => void submit(value)}
        />
        <Button
          label="Escribir código"
          variant="outline"
          disabled={busy}
          onPress={() => {
            setManual(true);
            input.current?.blur();
            setTimeout(() => input.current?.focus(), 0);
          }}
        />
      </View>
      <Text style={styles.hint}>
        Conecta un lector en modo teclado y configura Enter al terminar cada lectura.
      </Text>
    </View>
  );
}
const styles = StyleSheet.create({
  panel: { backgroundColor: colors.card, padding: space.md, gap: space.sm },
  label: { color: colors.text, fontWeight: "600" },
  input: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    padding: space.md,
    color: colors.ink,
    backgroundColor: colors.card,
    fontSize: 18,
  },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  hint: { color: colors.muted, fontSize: 12 },
});
