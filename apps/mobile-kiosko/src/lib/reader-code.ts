export function readerCode(value: string): string | null {
  const code = value.trim();
  if (
    !code ||
    code.length > 80 ||
    Array.from(code).some(
      (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
    )
  )
    return null;
  return code;
}
