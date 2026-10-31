import { isBullet, squash } from "./text.ts";
import type { ParsedRange } from "./types.ts";

const MONTHS: { name: string; month: number }[] = [
  ["janvier", 1], ["janv", 1], ["january", 1], ["januar", 1], ["enero", 1], ["gennaio", 1], ["janeiro", 1], ["jan", 1],
  ["février", 2], ["fevrier", 2], ["févr", 2], ["fevr", 2], ["february", 2], ["februar", 2], ["febrero", 2], ["febbraio", 2], ["fevereiro", 2], ["feb", 2], ["fév", 2], ["fev", 2],
  ["mars", 3], ["march", 3], ["marzo", 3], ["marz", 3], ["märz", 3], ["março", 3], ["marco", 3], ["mar", 3],
  ["avril", 4], ["april", 4], ["abril", 4], ["aprile", 4], ["apr", 4], ["avr", 4],
  ["mai", 5], ["may", 5], ["mayo", 5], ["maggio", 5], ["maio", 5],
  ["juin", 6], ["june", 6], ["junio", 6], ["giugno", 6], ["junho", 6], ["juni", 6], ["jun", 6],
  ["juillet", 7], ["july", 7], ["julio", 7], ["luglio", 7], ["julho", 7], ["juli", 7], ["juil", 7], ["jul", 7],
  ["août", 8], ["aout", 8], ["august", 8], ["agosto", 8], ["aug", 8],
  ["septembre", 9], ["september", 9], ["septiembre", 9], ["setiembre", 9], ["settembre", 9], ["setembro", 9], ["sept", 9], ["sep", 9],
  ["octobre", 10], ["october", 10], ["octubre", 10], ["ottobre", 10], ["outubro", 10], ["oktober", 10], ["oct", 10],
  ["novembre", 11], ["november", 11], ["noviembre", 11], ["novembre", 11], ["novembro", 11], ["nov", 11],
  ["décembre", 12], ["decembre", 12], ["december", 12], ["diciembre", 12], ["dicembre", 12], ["dezembro", 12], ["dezember", 12], ["déc", 12], ["dec", 12], ["dez", 12],
]
  .map(([name, month]) => ({ name: name as string, month: month as number }))
  .sort((a, b) => b.name.length - a.name.length);

const MONTH_ALT = MONTHS.map((m) => m.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
const MONTH_RE = new RegExp(`^(${MONTH_ALT})\\.?$`, "iu");
const PRESENT =
  "(?:aujourd['’]hui|présent|present|actuel(?:le)?|en cours|ce jour|à ce jour|a ce jour|maintenant|now|current(?:ly)?|ongoing|today|heute|aktuell|gegenwart|actualidad|actualmente|attuale|heden|atual(?:mente)?)";
const PRESENT_RE = new RegExp(`^(?:${PRESENT})$`, "iu");
const YEAR = "(?:19|20)\\d{2}";

export interface RawDate {
  raw: string;
  index: number;
  start: { year: number; month: number | null } | null;
  end: { year: number; month: number | null } | null;
  openEnded: boolean;
  isRange: boolean;
}

function monthIndex(token: string): number | null {
  const m = MONTH_RE.exec(token.trim());
  if (!m) return null;
  const found = MONTHS.find((item) => item.name.toLowerCase() === m[1].toLowerCase());
  return found?.month ?? null;
}

function isBoundary(text: string, index: number): boolean {
  if (index <= 0) return true;
  return !/[\p{L}\p{N}]/u.test(text[index - 1] ?? "");
}

function parsePoint(text: string, index: number): { year: number; month: number | null; raw: string; next: number } | null {
  const slice = text.slice(index);
  const monthYear = new RegExp(
    `^(?:(?:0?[1-9]|[12]\\d|3[01])(?:er)?\\s+)?(${MONTH_ALT})\\.?\\s+(${YEAR})`,
    "iu",
  ).exec(slice);
  if (monthYear) {
    return {
      year: Number(monthYear[2]),
      month: monthIndex(monthYear[1]),
      raw: monthYear[0],
      next: index + monthYear[0].length,
    };
  }
  const numeric = /^(0?[1-9]|1[0-2])[/.-]((?:19|20)\d{2})(?!\d)/u.exec(slice);
  if (numeric) {
    return { year: Number(numeric[2]), month: Number(numeric[1]), raw: numeric[0], next: index + numeric[0].length };
  }
  const iso = /^((?:19|20)\d{2})[/.-](0?[1-9]|1[0-2])(?!\d)/u.exec(slice);
  if (iso) {
    return { year: Number(iso[1]), month: Number(iso[2]), raw: iso[0], next: index + iso[0].length };
  }
  const year = new RegExp(`^(${YEAR})(?!\\d)`, "u").exec(slice);
  if (year) {
    return { year: Number(year[1]), month: null, raw: year[0], next: index + year[0].length };
  }
  return null;
}

const SINCE_RE = /^(?:depuis|since|ab|desde|dal)\s+/iu;
const SEP_RE = /^\s*(?:[-–—−/]|(?:au|à|a|to|until|jusqu['’]?(?:à|a|au|en)?|bis|hasta|tot))\s*/iu;

export function findDateRanges(text: string): RawDate[] {
  const found: RawDate[] = [];
  let i = 0;
  while (i < text.length) {
    if (!isBoundary(text, i)) {
      i += 1;
      continue;
    }
    const since = SINCE_RE.exec(text.slice(i));
    const cursor = since ? i + since[0].length : i;
    const start = parsePoint(text, cursor);
    if (!start || (since && !isBoundary(text, cursor))) {
      i += 1;
      continue;
    }
    const sep = SEP_RE.exec(text.slice(start.next));
    if (sep) {
      const after = start.next + sep[0].length;
      const present = new RegExp(`^(?:${PRESENT})`, "iu").exec(text.slice(after));
      if (present && isBoundary(text, after)) {
        const next = after + present[0].length;
        found.push({
          raw: text.slice(i, next),
          index: i,
          start: { year: start.year, month: start.month },
          end: null,
          openEnded: true,
          isRange: true,
        });
        i = next;
        continue;
      }
      const end = parsePoint(text, after);
      if (end) {
        found.push({
          raw: text.slice(i, end.next),
          index: i,
          start: { year: start.year, month: start.month },
          end: { year: end.year, month: end.month },
          openEnded: false,
          isRange: true,
        });
        i = end.next;
        continue;
      }
    }
    if (since) {
      found.push({
        raw: text.slice(i, start.next),
        index: i,
        start: { year: start.year, month: start.month },
        end: null,
        openEnded: true,
        isRange: true,
      });
      i = start.next;
      continue;
    }
    found.push({
      raw: start.raw,
      index: start.raw === text.slice(cursor, start.next) ? cursor : i,
      start: { year: start.year, month: start.month },
      end: null,
      openEnded: false,
      isRange: false,
    });
    i = start.next;
  }
  return found;
}

export function isEntryAnchor(line: string): boolean {
  const text = squash(line);
  if (!text || text.length > 180) return false;
  const ranges = findDateRanges(text);
  return ranges.some((item) => item.isRange || item.openEnded);
}

function wordish(value: string): number {
  return value ? value.split(/\s+/).filter(Boolean).length : 0;
}

export function anchorOnLine(line: string): RawDate | null {
  if (!isEntryAnchor(line)) return null;
  const ranges = findDateRanges(line);
  return ranges.find((item) => item.isRange || item.openEnded) ?? ranges[0] ?? null;
}

export function toParsed(raw: RawDate): ParsedRange {
  return {
    start: raw.start,
    end: raw.end,
    openEnded: raw.openEnded,
  };
}

export function dateRule(raw: RawDate): { confidence: "high" | "medium"; rule: string } {
  if (raw.openEnded) {
    return {
      confidence: "high",
      rule: `Fin ouverte : le document écrit « ${raw.raw.trim()} ». Aucune date du jour n'est substituée.`,
    };
  }
  const months = raw.start?.month != null || raw.end?.month != null;
  return {
    confidence: "high",
    rule: months
      ? `Découpage calendaire de « ${raw.raw.trim()} » (mois reconnus dans le texte).`
      : `Découpage de « ${raw.raw.trim()} » en années. Le mois n'est pas écrit.`,
  };
}

export function lineIsMostlyDate(line: string): boolean {
  const anchor = anchorOnLine(line);
  if (!anchor) return false;
  const rest = squash(line).replace(anchor.raw, "").replace(/[|·•,–—\-]/g, " ").trim();
  return wordish(rest) <= 2;
}

export { PRESENT_RE };
