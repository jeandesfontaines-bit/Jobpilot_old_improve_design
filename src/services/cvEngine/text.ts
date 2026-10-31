import type { Basis, Confidence, Deduction, Observed, TextLine } from "./types.ts";

export function squash(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .trim();
}

export function fold(value: string): string {
  return squash(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/ß/g, "ss")
    .replace(/['’]/g, "'")
    .replace(/\./g, "")
    .replace(/[^a-z0-9+&#'/\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function wordCount(value: string): number {
  const t = squash(value);
  return t ? t.split(/\s+/).length : 0;
}

export function isAllCaps(value: string): boolean {
  const letters = value.replace(/[^\p{L}]/gu, "");
  return letters.length >= 2 && letters === letters.toUpperCase() && letters !== letters.toLowerCase();
}

export function includesPhrase(folded: string, phrase: string): boolean {
  if (!phrase) return false;
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, "u").test(folded);
}

export function isBullet(text: string): boolean {
  return /^\s*(?:[-–—•·▪▸►*]|\d{1,2}[.)])\s+\S/.test(text);
}

export function plainLine(text: string, extra?: Partial<TextLine>): TextLine {
  return {
    text,
    page: 1,
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    fontSize: extra?.headingHint ? 16 : 12,
    bold: false,
    italic: false,
    headingHint: false,
    listItem: false,
    pageWidth: 0,
    ...extra,
  };
}

export function textToLines(text: string): TextLine[] {
  const rows = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  return rows.map((raw) => plainLine(raw.trim(), { listItem: isBullet(raw) }));
}

export function observed(
  text: string,
  line: string,
  page: number | null,
  confidence: Confidence,
  basis: Basis,
  rule: string,
): Observed {
  return { text: squash(text), line: squash(line), page, confidence, basis, rule };
}

export function deduction<T>(value: T, from: string, confidence: Confidence, rule: string): Deduction<T> {
  return { value, from: squash(from), confidence, rule };
}

export function pageOf(line: TextLine | undefined): number | null {
  return line?.page ?? null;
}
