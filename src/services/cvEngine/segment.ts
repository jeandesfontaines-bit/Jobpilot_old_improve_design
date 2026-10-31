import { isEntryAnchor } from "./dates.ts";
import { matchHeading } from "./lexicon.ts";
import { fold, isAllCaps, wordCount } from "./text.ts";
import type { Confidence, SectionKind, TextLine } from "./types.ts";

export interface SectionBlock {
  kind: SectionKind | "header";
  heading: string | null;
  lines: TextLine[];
  confidence: Confidence;
}

function median(values: number[]): number {
  if (!values.length) return 12;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 12;
}

export function isNoiseLine(text: string, line: TextLine, bodySize: number): string | null {
  const folded = fold(text);
  if (!folded) return null;
  if (/^(curriculum vitae|cv)$/.test(folded)) {
    return "Intitulé générique du document, pas une information sur la personne.";
  }
  if (/^page \d+( \/ \d+)?$/.test(folded) || /^\d+\s*\/\s*\d+$/.test(folded)) {
    return "Numéro de page.";
  }
  if (/^\d{1,3}$/.test(text) && line.fontSize > 0 && line.fontSize < bodySize * 0.85) {
    return "Numéro isolé, trop petit pour être une année ou un titre.";
  }
  if (/^[-–—_*=.·]{3,}$/.test(text)) return "Filet graphique sans texte.";
  return null;
}

function detectHeading(
  line: TextLine,
  bodySize: number,
  current: SectionKind | "header",
): { kind: SectionKind; confidence: Confidence } | null {
  const text = line.text.trim();
  if (!text) return null;
  const folded = fold(text);
  const lexical = matchHeading(folded);
  if (lexical) {
    return { kind: lexical, confidence: "high" };
  }
  // Very permissive fallback for unrecognized headings that look like headings
  if (line.fontSize >= bodySize * 1.1 && wordCount(text) <= 6) {
    return { kind: "other", confidence: "low" };
  }
  return null;
}

export function segment(lines: TextLine[]): { blocks: SectionBlock[]; noise: { text: string; rule: string }[] } {
  const bodySize = median(lines.filter((line) => wordCount(line.text) > 4).map((line) => line.fontSize || 12));
  const blocks: SectionBlock[] = [];
  const noise: { text: string; rule: string }[] = [];
  let current: SectionBlock = { kind: "header", heading: null, lines: [], confidence: "high" };

  for (const line of lines) {
    const text = line.text.trim();
    if (!text) {
      current.lines.push(line);
      continue;
    }
    const noiseRule = isNoiseLine(text, line, bodySize);
    if (noiseRule) {
      noise.push({ text, rule: noiseRule });
      continue;
    }
    const heading = detectHeading(line, bodySize, current.kind);
    if (heading) {
      blocks.push(current);
      current = { kind: heading.kind, heading: text, lines: [], confidence: heading.confidence };
      continue;
    }
    if (["skills", "languages", "interests"].includes(current.kind) && isEntryAnchor(text)) {
      blocks.push(current);
      current = { kind: "experience", heading: null, lines: [line], confidence: "high" };
      continue;
    }
    current.lines.push(line);
  }
  blocks.push(current);
  return { blocks: blocks.filter((block) => block.kind !== "header" || block.lines.some((line) => line.text.trim())), noise };
}
