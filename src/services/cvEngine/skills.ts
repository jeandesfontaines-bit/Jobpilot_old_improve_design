import { canonLevel, classifySkill, matchLanguageName } from "./lexicon.ts";
import { deduction, isBullet, observed, pageOf, squash, wordCount } from "./text.ts";
import type { LanguageItem, Observed, SkillGroup, SkillItem, TextLine } from "./types.ts";

function looksLikeList(text: string): boolean {
  const value = squash(text);
  const commas = value.split(/[,;|·]/).length;
  return commas >= 2 && wordCount(value) <= 24;
}

function looksLikeProse(text: string): boolean {
  return wordCount(text) > 14 || (wordCount(text) > 8 && /[.!?]/.test(text));
}

function skillItems(text: string, line: TextLine, prose: boolean): SkillItem[] {
  const parts =
    prose || !looksLikeList(text)
      ? [squash(text)].filter(Boolean)
      : text.split(/\s*[,;|/]\s*|\s+·\s+/).map((part) => squash(part)).filter(Boolean);
  return parts.map((part) => {
    const kind = prose ? null : classifySkill(part);
    return {
      text: observed(
        part,
        line.text,
        pageOf(line),
        "high",
        prose ? "section" : "pattern",
        prose
          ? "Phrase laissée entière : la découper inventerait des compétences."
          : "Élément écrit dans la section compétences.",
      ),
      lexicon: kind
        ? deduction(
            kind,
            part,
            "medium",
            kind === "technique"
              ? "Classement « technique » : le libellé contient un outil ou un langage du lexique. Le texte n'est pas réécrit."
              : "Classement « comportementale » : le libellé contient une aptitude du lexique. Le texte n'est pas réécrit.",
          )
        : null,
      prose,
    };
  });
}

export function parseSkillSection(lines: TextLine[]): SkillGroup[] {
  const groups: SkillGroup[] = [];
  let current: SkillGroup = { label: null, items: [] };
  const flush = () => {
    if (current.label || current.items.length) groups.push(current);
    current = { label: null, items: [] };
  };
  const content = lines.filter((line) => line.text.trim());
  for (let index = 0; index < content.length; index += 1) {
    const line = content[index]!;
    const raw = squash(line.text.replace(/^(?:[-•·▪▸►*]\s+)/, ""));
    const colon = /^([^:]{2,32}):\s*(.+)$/.exec(raw);
    if (colon?.[1] && colon[2] && looksLikeList(colon[2]) && wordCount(colon[1]) <= 5) {
      flush();
      groups.push({
        label: observed(squash(colon[1]), line.text, pageOf(line), "high", "label", "Catégorie écrite avant les deux-points."),
        items: skillItems(colon[2], line, false),
      });
      continue;
    }
    const next = content[index + 1];
    const nextRaw = next ? squash(next.text) : "";
    if (
      !isBullet(line.text) &&
      !line.listItem &&
      !looksLikeList(raw) &&
      !looksLikeProse(raw) &&
      wordCount(raw) <= 4 &&
      raw.length <= 36 &&
      next &&
      (looksLikeList(nextRaw) || next.listItem || isBullet(next.text))
    ) {
      flush();
      current = {
        label: observed(
          raw.replace(/:$/, ""),
          line.text,
          pageOf(line),
          "medium",
          "layout",
          "Ligne courte suivie d'une liste : lue comme sous-titre, pas comme une compétence.",
        ),
        items: [],
      };
      continue;
    }
    current.items.push(...skillItems(raw, line, looksLikeProse(raw)));
  }
  flush();
  return groups;
}

function chunksOf(line: string): string[] {
  const raw = squash(line.replace(/^(?:[-•·▪▸►*]\s+)/, ""));
  if (!raw) return [];
  if (looksLikeProse(raw)) return [raw];
  const parts = raw.split(/\s*,\s*|\s*;\s*/).map((part) => squash(part)).filter(Boolean);
  return parts.length ? parts : [raw];
}

export function parseLanguageLine(chunk: string, line: TextLine): LanguageItem {
  let namePart = chunk;
  let levelPart: string | null = null;
  const paren = /^(.+?)\s*\(([^)]+)\)\s*$/.exec(chunk);
  const separated = /^(.+?)\s*[:–—|/]\s*(.+)$/.exec(chunk) ?? /^(.+?)\s+-\s+(.+)$/.exec(chunk);
  if (paren?.[1] && paren[2] && matchLanguageName(paren[1])) {
    namePart = squash(paren[1]);
    levelPart = squash(paren[2]);
  } else if (separated?.[1] && separated[2] && matchLanguageName(separated[1])) {
    namePart = squash(separated[1]);
    levelPart = squash(separated[2]);
  }
  const language = matchLanguageName(namePart);
  return {
    name: observed(
      namePart,
      line.text,
      pageOf(line),
      language ? "high" : "low",
      language ? "pattern" : "section",
      language
        ? "Nom de langue isolé dans le libellé écrit."
        : "Libellé conservé tel quel : aucune langue du lexique n'y a été reconnue.",
    ),
    canon: language
      ? deduction(
          language.canon,
          namePart,
          "medium",
          `Forme canonique du lexique pour « ${namePart} ». Elle ne remplace pas le texte du CV.`,
        )
      : null,
    levelRaw: levelPart
      ? observed(levelPart, line.text, pageOf(line), "high", "pattern", "Niveau écrit à côté du nom de langue.")
      : null,
    levelCanon: levelPart ? canonLevel(levelPart) : null,
    raw: chunk,
  };
}

export function parseLanguageSection(lines: TextLine[]): LanguageItem[] {
  const items: LanguageItem[] = [];
  for (const line of lines) {
    if (!line.text.trim()) continue;
    for (const chunk of chunksOf(line.text)) items.push(parseLanguageLine(chunk, line));
  }
  return items;
}

export function parseInterestSection(lines: TextLine[]): Observed[] {
  const items: Observed[] = [];
  for (const line of lines) {
    const raw = squash(line.text.replace(/^(?:[-•·▪▸►*]\s+)/, ""));
    if (!raw) continue;
    const parts = looksLikeProse(raw) ? [raw] : raw.split(/\s*,\s*|\s*;\s*|\s+·\s+/).map((part) => squash(part)).filter(Boolean);
    for (const part of parts) {
      items.push(
        observed(part, line.text, pageOf(line), "high", "section", "Élément écrit dans la section centres d'intérêt."),
      );
    }
  }
  return items;
}
