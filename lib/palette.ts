/** Decorative identity colors for life areas (name is always shown beside the color). */

export interface AreaColor {
  key: string;
  label: string;
  /** chip / accent color */
  fg: string;
  fgDark: string;
  /** soft wash background */
  bg: string;
  bgDark: string;
}

export const AREA_COLORS: AreaColor[] = [
  { key: "moss", label: "Moss", fg: "#3d7a50", fgDark: "#7cb98a", bg: "#e4efe2", bgDark: "#223528" },
  { key: "terracotta", label: "Terracotta", fg: "#b4543e", fgDark: "#d98a76", bg: "#f6e4de", bgDark: "#38241f" },
  { key: "ochre", label: "Ochre", fg: "#a3781f", fgDark: "#d3a94e", bg: "#f4ead3", bgDark: "#332a17" },
  { key: "sea", label: "Sea", fg: "#3f6e8c", fgDark: "#82aec9", bg: "#e0ebf2", bgDark: "#1f2d38" },
  { key: "plum", label: "Plum", fg: "#7d5876", fgDark: "#b492ac", bg: "#efe3ec", bgDark: "#302331" },
  { key: "clay", label: "Clay", fg: "#8c5f3f", fgDark: "#c09270", bg: "#f2e7dc", bgDark: "#2f2419" },
  { key: "slate", label: "Slate", fg: "#5c6470", fgDark: "#9aa4b2", bg: "#e7e9ec", bgDark: "#262a30" },
  { key: "rose", label: "Rose", fg: "#a04c62", fgDark: "#cf8a9c", bg: "#f5e2e7", bgDark: "#33222a" },
];

export function areaColor(key: string | undefined | null): AreaColor {
  return AREA_COLORS.find((c) => c.key === key) ?? AREA_COLORS[0];
}

/** Sequential moss ramp for heatmaps — light→dark, monotonic lightness. */
export const HEAT_LIGHT = ["#eef3ea", "#dcebda", "#a9cdaa", "#6fa97a", "#417e52", "#2a5e3b"];
export const HEAT_DARK = ["#20241f", "#26382a", "#33553b", "#47774f", "#68a173", "#8fc79a"];

export function heatColor(v: number, max: number, dark: boolean): string {
  const ramp = dark ? HEAT_DARK : HEAT_LIGHT;
  if (v <= 0 || max <= 0) return ramp[0];
  const idx = 1 + Math.min(ramp.length - 2, Math.floor(((ramp.length - 1) * v) / (max + 0.0001)));
  return ramp[idx];
}
