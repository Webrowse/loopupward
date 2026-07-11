/** Display font choices offered in Settings → Appearance. Only the display
 *  font (headings, quotes) is swappable — Instrument Sans stays the body/UI
 *  font everywhere, since every screen's spacing was tuned around it. */
export const FONT_OPTIONS = [
  { id: "fraunces", label: "Fraunces", sample: "Aa" },
  { id: "lora", label: "Lora", sample: "Aa" },
  { id: "playfair", label: "Playfair", sample: "Aa" },
  { id: "crimson", label: "Crimson", sample: "Aa" },
  { id: "source-serif", label: "Source Serif", sample: "Aa" },
] as const;

export type FontId = (typeof FONT_OPTIONS)[number]["id"];

export const DEFAULT_FONT: FontId = "fraunces";

export function isFontId(v: string | null | undefined): v is FontId {
  return !!v && FONT_OPTIONS.some((f) => f.id === v);
}
