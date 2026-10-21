export type ColorReference = { name: string; hex: string };
export const commonColors: ColorReference[] = [
  { name: "Natural", hex: "#ded8bd" },
  { name: "White", hex: "#f4f4ef" },
  { name: "Grey", hex: "#888888" },
  { name: "Black", hex: "#202020" },
  { name: "Red", hex: "#c93c38" },
  { name: "Orange", hex: "#e88730" },
  { name: "Yellow", hex: "#e4ce39" },
  { name: "Green", hex: "#49705a" },
  { name: "Blue", hex: "#386ca4" },
  { name: "Purple", hex: "#845297" },
  { name: "Pink", hex: "#d78da8" },
  { name: "Brown", hex: "#845d3b" },
];
export function colorDistance(a: string, b: string) {
  const rgb = (hex: string) =>
    [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  if (![a, b].every((v) => /^#[a-f0-9]{6}$/i.test(v))) return Infinity;
  const x = rgb(a),
    y = rgb(b);
  return x.reduce((n, c, i) => n + [2, 4, 3][i] * (c - y[i]) ** 2, 0);
}
export function nameColor(hex: string): ColorReference {
  const nearest = [...commonColors].sort(
    (a, b) => colorDistance(hex, a.hex) - colorDistance(hex, b.hex),
  )[0];
  return { name: nearest.name, hex };
}
export function readColorReference(notes: string): ColorReference | null {
  const match = notes.match(/^Colour reference: (.+) \((#[a-f0-9]{6})\)$/im);
  return match ? { name: match[1], hex: match[2] } : null;
}
export function writeColorReference(
  notes: string,
  color: ColorReference | null,
) {
  if (!color) return notes;
  const rest = notes
    .replace(/^Colour reference: .+ \(#[a-f0-9]{6}\)\r?\n?/gim, "")
    .trim();
  return [
    rest,
    `Colour reference: ${color.name.replace(/[\r\n]/g, " ")} (${color.hex})`,
  ]
    .filter(Boolean)
    .join("\n");
}
