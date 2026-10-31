import { anchorOnLine, dateRule, findDateRanges, isEntryAnchor, lineIsMostlyDate, toParsed } from "./dates.ts";
import { degreeScore, jobScore, matchHeading, orgScore, schoolScore, scoreLocation, trackFromHeading } from "./lexicon.ts";
import type { SectionBlock } from "./segment.ts";
import { deduction, fold, isBullet, observed, pageOf, squash, wordCount } from "./text.ts";
import type { Ambiguity, Certification, Dated, Education, Experience, ProjectItem, TextLine } from "./types.ts";

const ACTION =
  /^(mise|mises|developpement|creation|gestion|pilotage|conception|implementation|participation|encadrement|maintenance|automatisation|built|led|developed|designed|managed|implemented|responsible|entwicklung|konzeption|migration|refonte|support|suivi|animation|coordination|analyse|redaction|organisation|optimisation|deploiement|contribution|realisation|accompagnement|entretien|interviewed)/i;

function headerLike(text: string): boolean {
  const value = squash(text);
  if (!value || isBullet(value) || isEntryAnchor(value)) return false;
  if (value.length > 100 || wordCount(value) > 12) return false;
  if (/[.!?]/.test(value) && wordCount(value) >= 6) return false;
  if (ACTION.test(value.toLowerCase()) && wordCount(value) >= 4) return false;
  return true;
}

function splitByGaps(lines: TextLine[]): TextLine[][] {
  const blocks: TextLine[][] = [];
  let current: TextLine[] = [];
  const flush = () => {
    if (current.some((line) => line.text.trim())) blocks.push(current);
    current = [];
  };
  for (const line of lines) {
    if (!line.text.trim()) {
      flush();
      continue;
    }
    const prev = current[current.length - 1];
    if (prev && line.y > 0 && prev.y > 0 && line.height > 0 && line.y > prev.y + prev.height + line.height * 1.15) {
      flush();
    }
    current.push(line);
  }
  flush();
  return blocks;
}

export function splitEntries(lines: TextLine[]): TextLine[][] {
  const anchors: number[] = [];
  lines.forEach((line, index) => {
    if (line.text.trim() && isEntryAnchor(line.text)) anchors.push(index);
  });
  if (!anchors.length) return splitByGaps(lines);

  let above = 0;
  let below = 0;
  for (const anchor of anchors) {
    const prev = lines[anchor - 1];
    const next = lines[anchor + 1];
    if (prev && headerLike(prev.text)) above += 1;
    if (next && headerLike(next.text)) below += 1;
  }
  const dateFirst = below > above;

  if (dateFirst) {
  const entries: TextLine[][] = anchors.map((anchor, index) => lines.slice(anchor, anchors[index + 1] ?? lines.length));
  const first = anchors[0] ?? 0;
  if (first > 0) {
    const pre = lines.slice(0, first).filter((line) => line.text.trim());
    if (pre.length && entries[0] && pre.every((line) => headerLike(line.text))) entries[0] = [...pre, ...entries[0]];
    else if (pre.length) entries.unshift(pre);
  }
  return entries.filter((entry) => entry.some((line) => line.text.trim()));
  }

  const starts = anchors.map((anchor, index) => {
    const floor = index === 0 ? 0 : (anchors[index - 1] ?? 0) + 1;
    let start = anchor;
    for (let cursor = anchor - 1; cursor >= floor && anchor - cursor <= 5; cursor -= 1) {
      const text = lines[cursor]?.text.trim() ?? "";
      if (!text || !headerLike(text)) break;
      start = cursor;
    }
    return start;
  });
  const entries = starts.map((start, index) => lines.slice(start, starts[index + 1] ?? lines.length));
  const firstStart = starts[0] ?? 0;
  if (firstStart > 0) {
    const pre = lines.slice(0, firstStart).filter((line) => line.text.trim());
    if (pre.length) entries.unshift(pre);
  }
  return entries.filter((entry) => entry.some((line) => line.text.trim()));
}

interface Piece {
  text: string;
  line: TextLine;
}

function splitComma(text: string): string[] {
  const parts = text.split(/\s*,\s*/).map((part) => squash(part)).filter(Boolean);
  if (parts.length <= 1 || parts.length > 4) return text ? [text] : [];
  if (parts.some((part) => part.length > 48 || wordCount(part) > 6)) return [text];
  return parts;
}

function explode(line: TextLine): Piece[] {
  let working = squash(line.text);
  if (!working || lineIsMostlyDate(working)) return [];
  const ranges = findDateRanges(working).filter((range) => range.isRange || range.openEnded);
  for (const range of ranges) working = squash(working.replace(range.raw, " "));
  if (!working) return [];
  const chunks = working.split(/\s*(?:\||·|•)\s*|\s+[—–]\s+|\s+-\s+(?=[\p{Lu}])/u);
  const pieces: Piece[] = [];
  for (const chunk of chunks) {
    for (const part of chunk.split(/\s+(?:chez|at|@)\s+/i)) {
      for (const bit of splitComma(squash(part))) pieces.push({ text: bit, line });
    }
  }
  return pieces.filter((piece) => piece.text);
}

function collectHeader(entry: TextLine[]): TextLine[] {
  const header: TextLine[] = [];
  for (const line of entry) {
    const text = line.text.trim();
    if (!text) continue;
    if (isBullet(text) || line.listItem) break;
    if (wordCount(text) > 14) break;
    if (ACTION.test(text.toLowerCase()) && wordCount(text) >= 4) break;
    if (/[.!?]/.test(text) && wordCount(text) >= 5 && !isEntryAnchor(text)) break;
    header.push(line);
  }
  return header;
}

function datedFrom(entry: TextLine[]): Dated | null {
  for (const line of entry) {
    const anchor = anchorOnLine(line.text);
    if (!anchor) continue;
    const info = dateRule(anchor);
    return {
      raw: observed(anchor.raw, line.text, pageOf(line), "high", "pattern", "Intervalle écrit sur la ligne, détaché du reste sans reformulation."),
      parsed: deduction(toParsed(anchor), anchor.raw, info.confidence, info.rule),
    };
  }
  return null;
}

export function extractRealizations(lines: TextLine[]): string[] {
  const items: string[] = [];
  let current = "";

  for (const line of lines) {
    const text = squash(line.text);
    if (!text) continue;
    if (matchHeading(fold(text))) break;

    const bulletMatch = /^\s*(?:[-–—•·▪▸►*●○◆◇■□➔→]|\d{1,2}[.)])\s+(.+)$/u.exec(text);
    if (bulletMatch && bulletMatch[1]) {
      if (current) items.push(current);
      current = bulletMatch[1].trim();
    } else if (/^\s*[-–—•·▪▸►*●○◆◇■□➔→]\s*$/u.test(text)) {
      continue;
    } else if (line.listItem) {
      if (current) items.push(current);
      current = text.replace(/^\s*[-–—•·▪▸►*●○◆◇■□➔→]\s*/u, "").trim();
    } else {
      if (!current) {
        current = text;
      } else {
        if (/[.!?]$/.test(current) || /^[\p{Lu}]/u.test(text)) {
          items.push(current);
          current = text;
        } else {
          current += " " + text;
        }
      }
    }
  }
  if (current) items.push(current);
  return items.filter(Boolean);
}

function descriptionFrom(entry: TextLine[], header: TextLine[]): { text: string; line: TextLine; realizations: string[] } | null {
  const used = new Set(header);
  const rawBody = entry.filter((line) => line.text.trim() && !used.has(line) && !lineIsMostlyDate(line.text));
  if (!rawBody.length) return null;

  const body: TextLine[] = [];
  for (const line of rawBody) {
    const t = squash(line.text);
    if (!isEntryAnchor(t) && matchHeading(fold(t))) {
      break;
    }
    body.push(line);
  }
  if (!body.length) return null;

  const realizations = extractRealizations(body);
  return {
    text: body.map((line) => squash(line.text)).join("\n"),
    line: body[0]!,
    realizations
  };
}

interface Choice {
  title: Piece | null;
  org: Piece | null;
  location: Piece | null;
  ambiguity: Ambiguity | null;
  unplaced: string[];
}

function choose(pieces: Piece[], mode: "experience" | "education"): Choice {
  const isEquiv = (text: string) => /^(?:équivalent|equivalent)\s+(?:au|à|a|du|de|to)\b/i.test(squash(text));
  const scored = pieces.map((piece) => ({
    piece,
    title: mode === "experience"
      ? jobScore(piece.text)
      : (isEquiv(piece.text) ? -99 : degreeScore(piece.text)),
    org: mode === "experience"
      ? orgScore(piece.text)
      : (isEquiv(piece.text) ? -99 : schoolScore(piece.text)),
    loc: scoreLocation(piece.text),
  }));
  const used = new Set<Piece>();
  let location: Piece | null = null;
  const bestLoc = [...scored].sort((a, b) => b.loc - a.loc)[0];
  if (bestLoc && bestLoc.loc >= 1.6) {
    location = bestLoc.piece;
    used.add(bestLoc.piece);
  }
  const pool = scored.filter((item) => !used.has(item.piece) && !isEquiv(item.piece.text));
  let title: Piece | null = null;
  let org: Piece | null = null;
  let ambiguity: Ambiguity | null = null;

  if (mode === "education" && location) {
    // A piece on the same line as location is typically the school (e.g. "Émile Dubois, Paris, France")
    const schoolOnLocLine = pool.find((item) => item.piece.line === location!.line);
    if (schoolOnLocLine) {
      org = schoolOnLocLine.piece;
      used.add(schoolOnLocLine.piece);
    }
  }

  const remainingPool = pool.filter((item) => item.piece !== org);
  const titleBest = [...remainingPool].sort((a, b) => b.title - a.title)[0];
  const orgBest = [...remainingPool].sort((a, b) => b.org - a.org)[0];
  const titleOk = !!titleBest && titleBest.title >= (mode === "experience" ? 1.1 : 1.4);
  const orgOk = !!orgBest && (orgBest.org >= (mode === "experience" ? 1.2 : 1.4) || (mode === "experience" && orgScore(orgBest.piece.text) >= 2.4));

  if (!org && titleOk && orgOk && titleBest && orgBest && titleBest.piece !== orgBest.piece) {
    title = titleBest.piece;
    org = orgBest.piece;
  } else if (!org && titleOk && orgOk && titleBest && titleBest.piece === orgBest?.piece) {
    const margin = Math.abs(titleBest.title - titleBest.org);
    if (margin < 0.55) {
      ambiguity = {
        code: "entry.role.ambiguous",
        message: "Le même libellé ressemble à la fois à un poste et à une organisation. Rien n'est tranché.",
        candidates: remainingPool.map((item) => item.piece.text),
        evidence: remainingPool.map((item) => item.piece.line.text),
      };
    } else if (titleBest.title > titleBest.org) title = titleBest.piece;
    else org = titleBest.piece;
  } else if (titleOk && titleBest) {
    title = titleBest.piece;
    if (mode === "education" && !org) {
      const remainingOrg = remainingPool.find((item) => item.piece !== title);
      if (remainingOrg) org = remainingOrg.piece;
    }
  } else if (!org && orgOk && orgBest) {
    org = orgBest.piece;
    if (mode === "education") {
      const remainingTitle = remainingPool.find((item) => item.piece !== org);
      if (remainingTitle) title = remainingTitle.piece;
    }
  } else if (!title && mode === "education" && remainingPool.length > 0) {
    title = remainingPool[0].piece;
  } else if (remainingPool.length && !title && !org) {
    if (mode === "education" && remainingPool.length >= 2) {
      title = remainingPool[0].piece;
      org = remainingPool[1].piece;
    } else if (mode === "education" && remainingPool.length === 1) {
      title = remainingPool[0].piece;
    } else {
      ambiguity = {
        code: "entry.role.ambiguous",
        message:
          mode === "experience"
            ? "Poste et organisation non départagés : aucun indice net (métier, forme juridique, établissement)."
            : "Diplôme et établissement non départagés : aucun indice net dans les lignes d'en-tête.",
        candidates: remainingPool.map((item) => item.piece.text),
        evidence: [...new Set(remainingPool.map((item) => item.piece.line.text))],
      };
    }
  }

  const taken = new Set([title, org, location].filter(Boolean));
  const unplaced = pieces.filter((piece) => !taken.has(piece)).map((piece) => piece.text);
  return { title, org, location, ambiguity, unplaced };
}

function observePiece(piece: Piece | null, rule: string, basis: "pattern" | "section" = "pattern") {
  if (!piece) return null;
  return observed(piece.text, piece.line.text, pageOf(piece.line), "medium", basis, rule);
}

export function parseExperienceSection(allLines: TextLine[]): Experience[] {
  return splitEntries(allLines).map((entry) => {
    // We only want to parse entries that look like experiences
    const header = collectHeader(entry);
    const pieces = header.flatMap((line) => explode(line));
    const choice = choose(pieces, "experience");
    // Only accept if it has at least a title or org
    if (!choice.title && !choice.org) return null;

    // Filter out if this looks like an education entry rather than an experience
    const degScore = choice.title ? degreeScore(choice.title.text) : 0;
    const jScore = choice.title ? jobScore(choice.title.text) : 0;
    const schScore = choice.org ? schoolScore(choice.org.text) : 0;
    if ((degScore >= 1.4 && degScore > jScore) || (schScore >= 1.4 && degScore >= 1.0)) {
      return null;
    }

    const body = descriptionFrom(entry, header);
    const ambiguities = choice.ambiguity ? [choice.ambiguity] : [];
    return {
      sectionHeading: "experience", // Simplified
      title: observePiece(choice.title, "Ligne rapprochée d'un métier du lexique (développeur, responsable, designer…)."),
      organization: observePiece(choice.org, "Ligne rapprochée d'une organisation (forme juridique ou mot comme cabinet, labs, groupe)."),
      location: observePiece(choice.location, "Segment rapproché d'un lieu ou d'une mention de télétravail / remote."),
      dates: datedFrom(entry),
      description: body
        ? observed(body.text, body.text, pageOf(body.line), "high", "section", "Lignes de l'entrée qui ne sont ni le titre, ni l'organisation, ni la date.")
        : null,
      realizations: body?.realizations ?? [],
      unplaced: choice.unplaced,
      rawLines: entry.map((line) => squash(line.text)).filter(Boolean),
      track: null,
      ambiguities,
    };
  }).filter((e) => e !== null) as Experience[];
}

export function parseEducationSection(block: SectionBlock): Education[] {
  return splitEntries(block.lines).map((entry) => {
    const header = collectHeader(entry);
    const pieces = header.flatMap((line) => explode(line));
    const choice = choose(pieces, "education");
    const body = descriptionFrom(entry, header);
    return {
      sectionHeading: block.heading,
      degree: observePiece(choice.title, "Ligne rapprochée d'un diplôme du lexique (master, licence, BTS, bachelor…)."),
      school: observePiece(choice.org, "Ligne rapprochée d'un établissement (université, école, school, Hochschule…)."),
      location: observePiece(choice.location, "Segment rapproché d'un lieu, distinct de l'établissement."),
      dates: datedFrom(entry),
      details: body
        ? observed(body.text, body.text, pageOf(body.line), "high", "section", "Précisions écrites sous le diplôme, non réécrites.")
        : null,
      unplaced: choice.unplaced,
      rawLines: entry.map((line) => squash(line.text)).filter(Boolean),
      ambiguities: choice.ambiguity ? [choice.ambiguity] : [],
    };
  });
}

function splitLoose(lines: TextLine[]): TextLine[][] {
  const items: TextLine[][] = [];
  let current: TextLine[] = [];
  const flush = () => {
    if (current.some((line) => line.text.trim())) items.push(current);
    current = [];
  };
  for (const line of lines) {
    const text = line.text.trim();
    if (!text) {
      flush();
      continue;
    }
    const fresh = isBullet(text) || line.listItem || /^[\p{Lu}\d]/u.test(text);
    if (fresh && current.length) flush();
    current.push(line);
  }
  flush();
  return items;
}

export function parseCertificationSection(block: SectionBlock): Certification[] {
  return splitLoose(block.lines).map((entry) => {
    const rawLines = entry.map((line) => squash(line.text)).filter(Boolean);
    const joined = rawLines.join(" ");
    const ranges = findDateRanges(joined);
    const last = [...ranges].reverse().find((range) => joined.trimEnd().endsWith(range.raw.trim()));
    let name = joined;
    let dates: Dated | null = null;
    if (last) {
      const remainder = squash(joined.slice(0, last.index));
      if (remainder) {
        name = remainder.replace(/[\s,–—\-|:]+$/g, "").trim();
        const info = dateRule(last);
        dates = {
          raw: observed(last.raw, joined, pageOf(entry[0]), "high", "pattern", "Date écrite en fin de certification."),
          parsed: deduction(toParsed(last), last.raw, info.confidence, info.rule),
        };
      }
    }
    let issuerText: string | null = null;
    const issued = /^(.*?)(?:\s*[–—|]\s*)(?:délivré par|issued by|delivered by)\s+(.+)$/i.exec(name);
    if (issued?.[1] && issued[2]) {
      issuerText = squash(issued[2]);
      name = squash(issued[1]);
    }
    return {
      name: observed(name || joined, joined, pageOf(entry[0]), "high", "section", "Intitulé conservé depuis la section certifications."),
      issuer: issuerText
        ? observed(issuerText, joined, pageOf(entry[0]), "high", "label", "Émetteur introduit explicitement par « délivré par » ou « issued by ».")
        : null,
      dates,
      rawLines,
    };
  });
}

export function parseProjectSection(block: SectionBlock): ProjectItem[] {
  return splitEntries(block.lines).map((entry) => {
    const header = collectHeader(entry);
    const first = header.find((line) => !lineIsMostlyDate(line.text));
    const body = descriptionFrom(entry, first ? [first, ...header.filter((line) => lineIsMostlyDate(line.text))] : header);
    return {
      title: first
        ? observed(squash(first.text), first.text, pageOf(first), "medium", "layout", "Première ligne courte du bloc projet. Ce n'est un titre que par position.")
        : null,
      dates: datedFrom(entry),
      description: body
        ? observed(body.text, body.text, pageOf(body.line), "high", "section", "Reste du bloc projet, copié tel quel.")
        : null,
      rawLines: entry.map((line) => squash(line.text)).filter(Boolean),
    };
  });
}
