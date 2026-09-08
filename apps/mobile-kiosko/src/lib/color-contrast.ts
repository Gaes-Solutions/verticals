function luminance(hex: string): number | null {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return null;
  const channels = [1, 3, 5].map((offset) => {
    const value = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return (channels[0] ?? 0) * 0.2126 + (channels[1] ?? 0) * 0.7152 + (channels[2] ?? 0) * 0.0722;
}
export function priceColor(accent: string, background: string, fallback: string): string {
  const a = luminance(accent);
  const b = luminance(background);
  if (a === null || b === null) return fallback;
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) >= 3 ? accent : fallback;
}
export function accentForeground(accent: string): string {
  const value = luminance(accent);
  if (value === null) return "#ffffff";
  return (value + 0.05) / 0.05 >= 1.05 / (value + 0.05) ? "#000000" : "#ffffff";
}
