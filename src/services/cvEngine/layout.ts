import { isEntryAnchor } from "./dates.ts";
import type { TextLine } from "./types.ts";

function byPosition(a: TextLine, b: TextLine): number {
  return a.y - b.y || a.x - b.x;
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

export function findGutter(lines: TextLine[], pageWidth: number): number | null {
  if (lines.length < 6 || pageWidth <= 0) return null;
  const bins = 80;
  const width = pageWidth / bins;
  const coverage = new Array<number>(bins).fill(0);
  for (const line of lines) {
    if (line.width > pageWidth * 0.62) continue;
    const start = Math.max(0, Math.min(bins - 1, Math.floor(line.x / width)));
    const end = Math.max(start, Math.min(bins - 1, Math.floor((line.x + Math.max(line.width, 1)) / width)));
    for (let index = start; index <= end; index += 1) coverage[index] += 1;
  }
  let best: { at: number; score: number } | null = null;
  for (let index = 10; index < bins - 10; index += 1) {
    if (coverage[index] > 0) continue;
    let left = index;
    let right = index;
    while (left > 8 && coverage[left - 1] === 0) left -= 1;
    while (right < bins - 9 && coverage[right + 1] === 0) right += 1;
    const leftMass = coverage.slice(0, left).reduce((sum, value) => sum + value, 0);
    const rightMass = coverage.slice(right + 1).reduce((sum, value) => sum + value, 0);
    const gap = (right - left + 1) * width;
    if (leftMass < 3 || rightMass < 3 || gap < pageWidth * 0.015) continue;
    const score = gap * Math.min(leftMass, rightMass);
    if (!best || score > best.score) best = { at: ((left + right) / 2) * width, score };
  }
  return best?.at ?? null;
}

function dateRatio(lines: TextLine[]): number {
  if (!lines.length) return 0;
  return lines.filter((line) => isEntryAnchor(line.text)).length / lines.length;
}

function orderPage(lines: TextLine[], notes: string[]): TextLine[] {
  const pageWidth = lines.find((line) => line.pageWidth > 0)?.pageWidth ?? 0;
  const sorted = [...lines].sort(byPosition);
  if (!pageWidth) return sorted;
  const gutter = findGutter(sorted, pageWidth);
  if (gutter == null) return sorted;
  const spans = sorted.filter(
    (line) => line.width > pageWidth * 0.62 || (line.x < gutter - 4 && line.x + line.width > gutter + pageWidth * 0.08),
  );
  const spanIds = new Set(spans);
  const side = sorted.filter((line) => !spanIds.has(line));
  const left = side.filter((line) => line.x + line.width / 2 < gutter);
  const right = side.filter((line) => line.x + line.width / 2 >= gutter);
  if (left.length < 2 || right.length < 2) return sorted;

  const leftNarrow = median(left.map((line) => line.width)) < pageWidth * 0.32;
  const rightNarrow = median(right.map((line) => line.width)) < pageWidth * 0.32;
  const leftDates = leftNarrow && dateRatio(left) >= 0.45 && dateRatio(right) < 0.4;
  const rightDates = rightNarrow && dateRatio(right) >= 0.45 && dateRatio(left) < 0.4;

  let flow: TextLine[];
  if (leftDates || rightDates) {
    notes.push("Colonne étroite composée surtout de dates : elle est intercalée verticalement avec le texte d'en face, pas lue comme un bloc séparé.");
    flow = [...left, ...right].sort(byPosition);
  } else {
    const leftWidth = median(left.map((line) => line.width));
    const rightWidth = median(right.map((line) => line.width));
    const rail = leftWidth <= rightWidth ? left : right;
    const main = leftWidth <= rightWidth ? right : left;
    notes.push("Deux colonnes : la colonne la plus étroite est lue en entier, puis la colonne principale.");
    const minY = Math.min(...side.map((line) => line.y));
    const maxY = Math.max(...side.map((line) => line.y));
    const top = spans.filter((line) => line.y < minY - 2).sort(byPosition);
    const bottom = spans.filter((line) => line.y > maxY + 8).sort(byPosition);
    const middle = spans.filter((line) => !top.includes(line) && !bottom.includes(line));
    const mainFlow = [...main, ...middle].sort(byPosition);
    return [...top, ...[...rail].sort(byPosition), ...mainFlow, ...bottom];
  }

  if (!spans.length) return flow;
  const minY = Math.min(...side.map((line) => line.y));
  const maxY = Math.max(...side.map((line) => line.y));
  const top = spans.filter((line) => line.y < minY - 2).sort(byPosition);
  const bottom = spans.filter((line) => line.y > maxY + 8).sort(byPosition);
  const middle = spans.filter((line) => !top.includes(line) && !bottom.includes(line));
  return [...top, ...[...flow, ...middle].sort(byPosition), ...bottom];
}

export function readingOrder(lines: TextLine[]): { lines: TextLine[]; notes: string[] } {
  const geometric = lines.some((line) => line.pageWidth > 0 && (line.width > 0 || line.x > 0 || line.y > 0));
  if (!geometric) return { lines, notes: [] };
  const notes: string[] = [];
  const pages = new Map<number, TextLine[]>();
  for (const line of lines) {
    const bucket = pages.get(line.page) ?? [];
    bucket.push(line);
    pages.set(line.page, bucket);
  }
  const ordered: TextLine[] = [];
  for (const page of [...pages.keys()].sort((a, b) => a - b)) {
    ordered.push(...orderPage(pages.get(page) ?? [], notes));
  }
  return { lines: ordered, notes: [...new Set(notes)] };
}
