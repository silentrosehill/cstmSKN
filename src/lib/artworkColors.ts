export type RGB = [number, number, number];
export interface ImagePalette {
  primary: RGB;
  secondary: RGB;
}
const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
export function rgbToHsl([r, g, b]: RGB): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b),
    delta = max - min,
    light = (max + min) / 2;
  if (delta === 0) return [0, 0, light];
  const saturation = delta / (1 - Math.abs(2 * light - 1));
  const hue =
    max === r ? ((g - b) / delta) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
  return [(((hue / 6) % 1) + 1) % 1, saturation, light];
}
export function hslToRgb(h: number, s: number, l: number): RGB {
  const f = (n: number) => {
    const k = (n + h * 12) % 12,
      a = s * Math.min(l, 1 - l);
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
  };
  return [f(0), f(8), f(4)];
}
export function contrast(a: RGB, b: RGB): number {
  const luminance = (rgb: RGB) =>
    rgb
      .map((c) => {
        c /= 255;
        return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      })
      .reduce((n, c, i) => n + c * [0.2126, 0.7152, 0.0722][i], 0);
  const first = luminance(a),
    second = luminance(b);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}
export function paletteFromPixels(pixels: ArrayLike<number>): ImagePalette {
  const bins = new Map<number, { count: number; r: number; g: number; b: number }>();
  for (let i = 0; i + 3 < pixels.length; i += 4) {
    if (pixels[i + 3] < 180) continue;
    const r = pixels[i],
      g = pixels[i + 1],
      b = pixels[i + 2],
      light = (Math.max(r, g, b) + Math.min(r, g, b)) / 510;
    if (light < 0.04 || light > 0.94) continue;
    const key = (r >> 4) * 256 + (g >> 4) * 16 + (b >> 4),
      bin = bins.get(key) ?? { count: 0, r: 0, g: 0, b: 0 };
    bin.count++;
    bin.r += r;
    bin.g += g;
    bin.b += b;
    bins.set(key, bin);
  }
  const colors = [...bins.values()]
    .map((bin) => {
      const rgb: RGB = [
        Math.round(bin.r / bin.count),
        Math.round(bin.g / bin.count),
        Math.round(bin.b / bin.count),
      ];
      const [hue, saturation] = rgbToHsl(rgb);
      return { rgb, hue, saturation, score: bin.count * (0.3 + saturation * 0.7) };
    })
    .sort((a, b) => b.score - a.score);
  const primary = colors[0];
  if (!primary) return { primary: [135, 146, 166], secondary: [135, 146, 166] };
  const secondary = colors.find((color) => {
    const delta = Math.abs(color.hue - primary.hue);
    return Math.min(delta, 1 - delta) > 0.12 && color.saturation > 0.18;
  });
  return { primary: primary.rgb, secondary: secondary?.rgb ?? primary.rgb };
}
const hex = (color: RGB) =>
  `#${color.map((n) => clamp(n, 0, 255).toString(16).padStart(2, "0")).join("")}`;
export function artworkTheme(palette: ImagePalette, mode: string): Record<string, string> {
  const dark = mode !== "light";
  const [h, s] = rgbToHsl(palette.primary),
    [secondaryHue] = rgbToHsl(palette.secondary);
  const neutral = s < 0.08;
  const base = hslToRgb(h, neutral ? 0.035 : clamp(s * 0.35, 0.1, 0.28), dark ? 0.075 : 0.966);
  const panel = hslToRgb(h, neutral ? 0.025 : clamp(s * 0.25, 0.08, 0.2), dark ? 0.115 : 0.985);
  function readable(hue: number, saturation: number, initial: number) {
    let light = initial,
      rgb = hslToRgb(hue, saturation, light);
    for (let i = 0; i < 30 && contrast(rgb, base) < 4.8; i++) {
      light = clamp(light + (dark ? 0.02 : -0.02), 0.08, 0.94);
      rgb = hslToRgb(hue, saturation, light);
    }
    return rgb;
  }
  const accent = readable(h, neutral ? 0.08 : clamp(s * 0.88, 0.32, 0.72), dark ? 0.74 : 0.4);
  return {
    "--art-accent": hex(accent),
    "--art-accent-rgb": accent.join(" "),
    "--art-tint": hex(hslToRgb(h, neutral ? 0.08 : clamp(s, 0.2, 0.7), 0.56)),
    "--art-secondary": hex(hslToRgb(secondaryHue, neutral ? 0.06 : 0.35, 0.48)),
    "--art-base": hex(base),
    "--art-panel": hex(panel),
    "--art-foreground": hex(hslToRgb(h, 0.07, dark ? 0.94 : 0.13)),
    "--art-muted": hex(readable(h, 0.13, dark ? 0.65 : 0.43)),
  };
}
