import type { SectionBlock } from "./segment.ts";
import { jobScore, matchHeading, scoreLocation, hasLegalForm } from "./lexicon.ts";
import { fold, isAllCaps, observed, pageOf, squash, wordCount } from "./text.ts";
import type { Ambiguity, ContactLink, Identity, LabeledFact, Observed, TextLine } from "./types.ts";

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const URL_RE = /\b(?:https?:\/\/[^\s<>()]+|www\.[^\s<>()]+|(?:linkedin|github|gitlab|behance|dribbble)\.com\/[^\s<>()]+)/gi;
const PHONE_RE = /(?:(?:\+|00)\d{1,3}[\s().-]*)?(?:\(?\d{1,4}\)?[\s().-]*)?(?:\d[\s().-]*){8,}\d/g;

function allMatches(re: RegExp, text: string): string[] {
  return [...text.matchAll(new RegExp(re.source, re.flags))].map((match) => squash(match[0]));
}

function emailsIn(text: string): string[] {
  return allMatches(EMAIL_RE, text);
}

function urlsIn(text: string): string[] {
  return allMatches(URL_RE, text).map((url) => url.replace(/[),.;:]+$/g, ""));
}

function phonesIn(text: string): string[] {
  const found: string[] = [];
  for (const raw of allMatches(PHONE_RE, text)) {
    const digits = raw.replace(/\D/g, "");
    if (digits.length < 10 || digits.length > 15) continue;
    if (/^(?:19|20)\d{2}(?:19|20)\d{2}$/.test(digits)) continue;
    found.push(raw);
  }
  return found;
}

function contactOnly(text: string): boolean {
  const stripped = text
    .replace(new RegExp(EMAIL_RE.source, "gi"), " ")
    .replace(new RegExp(URL_RE.source, "gi"), " ")
    .replace(new RegExp(PHONE_RE.source, "g"), " ")
    .replace(/[|·•,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return stripped.length === 0;
}

function scoreName(line: TextLine, first: boolean, maxFont: number): number {
  const text = squash(line.text);
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length < 2 || words.length > 5 || text.length > 48) return -99;
  if (words.some((word) => /\d/.test(word))) return -99;
  if (matchHeading(fold(text))) return -99;
  if (hasLegalForm(text)) return -99;
  if (scoreLocation(text) >= 1.6) return -99;
  if (/[@|]/.test(text) || emailsIn(text).length || phonesIn(text).length) return -99;
  const particle = /^(de|du|des|la|le|van|von|da|di|ben|el|al|st|saint)$/i;
  if (!words.every((word) => particle.test(word) || /^[\p{Lu}]/u.test(word))) return -99;
  let score = 2;
  if (words.length === 2 || words.length === 3) score += 1.4;
  if (isAllCaps(text)) score += 0.3;
  if (first) score += 0.6;
  if (jobScore(text) >= 1.1) score -= 3;
  if (maxFont > 0 && line.fontSize >= maxFont && line.fontSize > 13) score += 1.2;
  return score;
}

function locationOf(line: string): string | null {
  const parts = line.split(/\s*(?:\||·|•)\s*/).map((part) => squash(part)).filter(Boolean);
  const scored = parts.map((part) => ({
    part,
    score: emailsIn(part).length || phonesIn(part).length || urlsIn(part).length ? 0 : scoreLocation(part),
  }));
  const places = scored.filter((item) => item.score >= 1.6);
  if (!places.length) return null;
  if (places.length === parts.length) return line;
  if (places.length === 1) return places[0]?.part ?? null;
  return null;
}

const FACT_PATTERNS: { label: string; re: RegExp; group: number }[] = [
  { label: "Date de naissance", re: /^(?:date de naissance|né(?:e)? le|birth(?:\s*date)?|geboren am)\s*[:\s]\s*(.+)$/i, group: 1 },
  { label: "Nationalité", re: /^(?:nationalité|nationality|staatsangehörigkeit)\s*[:]\s*(.+)$/i, group: 1 },
  { label: "Mobilité", re: /^(?:mobilité|mobility)\s*[:]\s*(.+)$/i, group: 1 },
  { label: "Disponibilité", re: /^(?:disponibilité|availability)\s*[:]\s*(.+)$/i, group: 1 },
  { label: "Permis", re: /^(?:permis(?: de conduire)?|driving licen[cs]e|führerschein)\s*[:]\s*(.+)$/i, group: 1 },
  { label: "Permis", re: /^(permis\s+[A-Z0-9]{1,3}(?:\s*[,/]\s*[A-Z0-9]{1,3})*)$/i, group: 0 },
];

const HEADLINE_LABEL = /^(?:poste recherché|intitulé du poste|desired (?:position|role))\s*[:]\s*(.+)$/i;
const NAME_LABEL = /^(?:nom(?: complet)?|name)\s*[:]\s*(.+)$/i;

export function parseIdentity(blocks: SectionBlock[], ordered: TextLine[]): { identity: Identity; ambiguities: Ambiguity[] } {
  const header = blocks.find((block) => block.kind === "header")?.lines ?? [];
  const contactLines = blocks.filter((block) => block.kind === "contact").flatMap((block) => block.lines);
  const pool = [...header, ...contactLines];
  const seen = new Set<string>();
  const emails: ContactLink[] = [];
  const phones: ContactLink[] = [];
  const urls: ContactLink[] = [];

  const push = (bucket: ContactLink[], kind: ContactLink["kind"], value: string, line: TextLine) => {
    const key = `${kind}:${fold(value)}`;
    if (seen.has(key)) return;
    seen.add(key);
    bucket.push({
      kind,
      text: observed(
        value,
        line.text,
        pageOf(line),
        "high",
        "pattern",
        kind === "email"
          ? "Adresse écrite avec un @."
          : kind === "phone"
            ? "Numéro écrit dans le document (au moins 10 chiffres). Aucun format n'est réécrit."
            : "URL ou profil LinkedIn / GitHub écrit dans le document.",
      ),
    });
  };

  for (const line of ordered) {
    if (!line.text.trim()) continue;
    for (const email of emailsIn(line.text)) push(emails, "email", email, line);
    for (const phone of phonesIn(line.text)) push(phones, "phone", phone, line);
    for (const url of urlsIn(line.text)) push(urls, "url", url, line);
  }

  const facts: LabeledFact[] = [];
  const consumed = new Set<TextLine>();
  let labeledName: Observed | null = null;
  let labeledHeadline: Observed | null = null;
  for (const line of pool) {
    const text = squash(line.text);
    const nameMatch = NAME_LABEL.exec(text);
    if (nameMatch?.[1]) {
      labeledName = observed(nameMatch[1], text, pageOf(line), "high", "label", "Nom précédé d'un libellé explicite (Nom : ou Name :).");
      consumed.add(line);
    }
    const headlineMatch = HEADLINE_LABEL.exec(text);
    if (headlineMatch?.[1]) {
      labeledHeadline = observed(headlineMatch[1], text, pageOf(line), "high", "label", "Intitulé précédé d'un libellé explicite (Poste recherché :).");
      consumed.add(line);
    }
    for (const fact of FACT_PATTERNS) {
      const match = fact.re.exec(text);
      const value = match?.[fact.group] ?? (fact.group === 0 ? match?.[0] : undefined);
      if (value) {
        facts.push({
          label: fact.label,
          value: observed(value, text, pageOf(line), "high", "label", `Champ précédé du libellé « ${fact.label} ».`),
        });
        consumed.add(line);
      }
    }
  }

  const candidates: { line: TextLine; score: number }[] = [];
  const nonempty = ordered.filter((line) => line.text.trim());
  const firstText = nonempty[0];
  const maxFont = Math.max(0, ...nonempty.map((line) => line.fontSize || 0));
  const namePool = labeledName ? [] : [...pool, ...nonempty.slice(0, 12)];
  const seenLines = new Set<TextLine>();
  for (const line of namePool) {
    if (seenLines.has(line) || consumed.has(line)) continue;
    seenLines.add(line);
    const score = scoreName(line, line === firstText, maxFont);
    if (score >= 3) candidates.push({ line, score });
  }
  candidates.sort((a, b) => b.score - a.score);
  const ambiguities: Ambiguity[] = [];
  let fullName = labeledName;
  if (!fullName && candidates[0] && candidates[1] && candidates[0].score - candidates[1].score < 0.35) {
    ambiguities.push({
      code: "name.ambiguous",
      message: "Plusieurs lignes peuvent être le nom. Aucune n'est retenue.",
      candidates: candidates.slice(0, 3).map((item) => item.line.text),
      evidence: candidates.slice(0, 3).map((item) => item.line.text),
    });
  } else if (!fullName && candidates[0]) {
    fullName = observed(
      candidates[0].line.text,
      candidates[0].line.text,
      pageOf(candidates[0].line),
      candidates[0].line.fontSize > 13 ? "high" : "medium",
      "layout",
      "Ligne courte en capitales, en tête, qui n'est ni une section, ni un e-mail, ni un intitulé de métier du lexique.",
    );
    consumed.add(candidates[0].line);
  }

  let headline = labeledHeadline;
  if (fullName && !headline) {
    const nameText = fullName.text;
    const after = nonempty.findIndex((line) => squash(line.text) === nameText);
    const next = after >= 0 ? nonempty.slice(after + 1, after + 8) : [];
    const line = next.find(
      (item) =>
        item.text.trim() &&
        !contactOnly(item.text) &&
        !consumed.has(item) &&
        wordCount(item.text) <= 8 &&
        !matchHeading(fold(item.text)) &&
        (jobScore(item.text) >= 1.1 || item.bold || item.fontSize > 13)
    );
    if (line) {
      headline = observed(
        line.text,
        line.text,
        pageOf(line),
        jobScore(line.text) >= 1.1 ? "medium" : "low",
        "layout",
        "Ligne courte sous le nom, rapprochée d'un métier ou plus grande que le corps de texte.",
      );
      consumed.add(line);
    }
  }

  let location: Observed | null = null;
  for (const line of header) {
    if (consumed.has(line) || !line.text.trim() || contactOnly(line.text)) continue;
    const place = locationOf(line.text);
    if (!place) continue;
    location = observed(
      place,
      line.text,
      pageOf(line),
      "medium",
      "pattern",
      "Segment d'en-tête rapproché d'une ville, d'un pays ou d'une mention de télétravail. Ce n'est pas une adresse inventée.",
    );
    consumed.add(line);
    break;
  }

  const introLines = header.filter((line) => !consumed.has(line) && wordCount(line.text) >= 12);
  for (const line of introLines) consumed.add(line);
  const intro = introLines.length
    ? observed(
        introLines.map((line) => squash(line.text)).join("\n"),
        introLines.map((line) => squash(line.text)).join("\n"),
        pageOf(introLines[0]),
        "medium",
        "layout",
        "Paragraphe d'en-tête, avant la première section. Copié, pas résumé.",
      )
    : null;

  const unplacedLines = header
    .filter((line) => line.text.trim() && !consumed.has(line) && !contactOnly(line.text))
    .map((line) => squash(line.text));

  const identity: Identity = { fullName, headline, location, intro, emails, phones, urls, facts, unplacedLines };
  return { identity, ambiguities };
}
