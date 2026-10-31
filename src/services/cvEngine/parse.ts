import { readingOrder } from "./layout.ts";
import { detectDocumentLanguage } from "./lexicon.ts";
import { parseCertificationSection, parseEducationSection, parseExperienceSection, parseProjectSection } from "./entries.ts";
import { parseIdentity } from "./identity.ts";
import { parseInterestSection, parseLanguageSection, parseSkillSection } from "./skills.ts";
import { segment } from "./segment.ts";
import { squash, textToLines } from "./text.ts";
import type { Ambiguity, CvExtraction, Deduction, Observed, TextLine, WarningNote } from "./types.ts";

export interface ParseInput {
  filename: string;
  format: string;
  lines: TextLine[];
  layoutNotes?: string[];
  truncated?: boolean;
}

function citationHolds(text: string, lines: string[]): boolean {
  const parts = text.split(/\n/).map((part) => squash(part)).filter(Boolean);
  if (!parts.length) return false;
  const pool = lines.map((line) => squash(line)).filter(Boolean);
  const blob = pool.join("\n");
  return parts.every((part) => blob.includes(part) || pool.some((line) => line.includes(part)));
}

function verify(cv: Omit<CvExtraction, "verification">): { ok: boolean; checked: number; errors: string[] } {
  const lines = cv.sourceText.split("\n");
  const errors: string[] = [];
  let checked = 0;
  const visit = (value: unknown, path: string) => {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, `${path}[${index}]`));
      return;
    }
    const record = value as Record<string, unknown>;
    if (typeof record.text === "string" && typeof record.line === "string" && typeof record.basis === "string") {
      checked += 1;
      if (!citationHolds(record.text, lines)) errors.push(`${path} : « ${record.text} » ne figure pas dans le texte relu`);
    } else if (typeof record.from === "string" && typeof record.rule === "string" && "value" in record) {
      checked += 1;
      if (!citationHolds(record.from, lines)) errors.push(`${path}.from : « ${record.from} » ne figure pas dans le texte relu`);
    }
    for (const [key, child] of Object.entries(record)) {
      if (child && typeof child === "object") visit(child, `${path}.${key}`);
    }
  };
  visit(
    {
      meta: cv.meta,
      identity: cv.identity,
      profile: cv.profile,
      experiences: cv.experiences,
      education: cv.education,
      skills: cv.skills,
      languages: cv.languages,
      certifications: cv.certifications,
      projects: cv.projects,
      interests: cv.interests,
    },
    "cv",
  );
  return { ok: errors.length === 0, checked, errors };
}

export function parseLines(input: ParseInput): CvExtraction {
  const cleaned = input.lines.map((line) => ({ ...line, text: squash(line.text) }));
  const ordered = readingOrder(cleaned);
  const { blocks, noise } = segment(ordered.lines);
  const identityResult = parseIdentity(blocks, ordered.lines);
  const profileBlocks = blocks.filter((block) => block.kind === "profile");
  const profileLines = profileBlocks.flatMap((block) => block.lines).filter((line) => line.text.trim());
  const experienceBlocks = blocks.filter((block) => block.kind === "experience");
  const experiences = experienceBlocks.length > 0
    ? experienceBlocks.flatMap((block) => parseExperienceSection(block.lines))
    : parseExperienceSection(ordered.lines);
  const education = blocks.filter((block) => block.kind === "education").flatMap((block) => parseEducationSection(block));
  const skills = blocks.filter((block) => block.kind === "skills").flatMap((block) => parseSkillSection(block.lines));
  const languages = blocks.filter((block) => block.kind === "languages").flatMap((block) => parseLanguageSection(block.lines));
  const certifications = blocks
    .filter((block) => block.kind === "certifications")
    .flatMap((block) => parseCertificationSection(block));
  const projects = blocks.filter((block) => block.kind === "projects").flatMap((block) => parseProjectSection(block));
  const interests = blocks.filter((block) => block.kind === "interests").flatMap((block) => parseInterestSection(block.lines));
  const otherSections = blocks
    .filter((block) =>
      ["volunteering", "awards", "publications", "references", "contact", "other"].includes(block.kind),
    )
    .map((block) => ({
      kind: block.kind,
      heading: block.heading,
      lines: block.lines.map((line) => squash(line.text)).filter(Boolean),
    }));

  const ambiguities: Ambiguity[] = [...identityResult.ambiguities];
  for (const entry of experiences) ambiguities.push(...entry.ambiguities);
  for (const entry of education) ambiguities.push(...entry.ambiguities);
  for (const language of languages) {
    if (!language.canon) {
      ambiguities.push({
        code: "language.unlisted",
        message: "Une ligne de la section langues ne correspond à aucune langue du lexique. Elle est conservée brute.",
        candidates: [language.raw],
        evidence: [language.raw],
      });
    }
  }

  const warnings: WarningNote[] = [];
  const sourceText = ordered.lines.map((line) => line.text).join("\n");
  if (!sourceText.trim()) {
    warnings.push({
      code: input.format === "pdf" ? "pdf.no-text" : "file.empty",
      message:
        input.format === "pdf"
          ? "Ce PDF ne contient pas de texte sélectionnable. C'est probablement un scan. Aucun contenu n'a été deviné à partir de l'image."
          : "Le document ne contient pas de texte.",
    });
  }
  if (input.truncated) {
    warnings.push({
      code: "pdf.truncated",
      message: "Seules les 15 premières pages ont été lues. La suite n'est pas extraite et n'est pas inventée.",
    });
  }
  if (!identityResult.identity.fullName && sourceText.trim()) {
    warnings.push({
      code: "name.missing",
      message: "Aucun nom n'a passé le seuil. Le champ reste vide plutôt que d'en proposer un.",
    });
  }
  const lexical = blocks.some((block) => block.kind !== "header");
  if (sourceText.trim() && !lexical) {
    warnings.push({
      code: "sections.none",
      message: "Aucune section reconnue. Le texte reste disponible, mais il n'a pas été rangé en expériences ou formations.",
    });
  }
  const undatedJobs = experiences.filter((entry) => !entry.dates).length;
  if (undatedJobs) {
    warnings.push({
      code: "experience.no-dates",
      message: `${undatedJobs} expérience(s) sans intervalle de dates repérable. Les dates absentes ne sont pas complétées.`,
    });
  }
  const undatedStudies = education.filter((entry) => !entry.dates).length;
  if (undatedStudies) {
    warnings.push({
      code: "education.no-dates",
      message: `${undatedStudies} formation(s) sans intervalle de dates repérable.`,
    });
  }

  const documentLanguage: Deduction<string> | null = sourceText.trim() ? detectDocumentLanguage(sourceText) : null;
  const draft: Omit<CvExtraction, "verification"> = {
    meta: {
      filename: input.filename,
      format: input.format,
      pipeline: ["reading-order", "sections", "identity", "entries", "lexicon-tags", "verify"],
      documentLanguage,
    },
    identity: identityResult.identity,
    profile: {
      heading: profileBlocks[0]?.heading ?? null,
      text: profileLines.length
        ? {
            text: profileLines.map((line) => line.text).join("\n"),
            line: profileLines.map((line) => line.text).join("\n"),
            page: profileLines[0]?.page ?? null,
            confidence: "high",
            basis: "section",
            rule: "Corps de la section profil, copié sans résumé.",
          }
        : null,
    },
    experiences,
    education,
    skills,
    languages,
    certifications,
    projects,
    interests,
    otherSections,
    sections: blocks.map((block) => ({
      kind: block.kind,
      heading: block.heading,
      lines: block.lines.map((line) => line.text).filter((line) => line.trim()),
    })),
    ambiguities,
    warnings,
    noise,
    layoutNotes: [...(input.layoutNotes ?? []), ...ordered.notes],
    sourceText,
  };
  const verification = verify(draft);
  if (!verification.ok) {
    draft.warnings = [
      ...draft.warnings,
      {
        code: "verify.failed",
        message: "Le contrôle interne a trouvé une citation absente du texte relu. Ces champs ne doivent pas être utilisés tels quels.",
      },
    ];
  }
  return { ...draft, verification };
}

export function parseText(text: string, filename = "texte-colle.txt"): CvExtraction {
  return parseLines({ filename, format: "text", lines: textToLines(text) });
}

export type { Observed };
