export type Confidence = "high" | "medium" | "low";

export type Basis = "label" | "pattern" | "layout" | "section";

/** A span that is copied from the document, never rewritten. */
export interface Observed {
  text: string;
  line: string;
  page: number | null;
  confidence: Confidence;
  basis: Basis;
  rule: string;
}

/** A value computed from a span. It is not claimed to be written as-is. */
export interface Deduction<T> {
  value: T;
  from: string;
  confidence: Confidence;
  rule: string;
}

export interface Ambiguity {
  code: "name.ambiguous" | "entry.role.ambiguous" | "language.unlisted" | "field.ambiguous";
  message: string;
  candidates: string[];
  evidence: string[];
}

export interface WarningNote {
  code:
    | "name.missing"
    | "sections.none"
    | "pdf.no-text"
    | "pdf.truncated"
    | "layout.columns"
    | "layout.date-margin"
    | "experience.no-dates"
    | "education.no-dates"
    | "file.empty"
    | "verify.failed";
  message: string;
}

export interface DateParts {
  year: number;
  month: number | null;
}

export interface ParsedRange {
  start: DateParts | null;
  end: DateParts | null;
  openEnded: boolean;
}

export interface Dated {
  raw: Observed;
  parsed: Deduction<ParsedRange> | null;
}

export interface ContactLink {
  kind: "email" | "phone" | "url";
  text: Observed;
}

export interface LabeledFact {
  label: string;
  value: Observed;
}

export interface Identity {
  fullName: Observed | null;
  headline: Observed | null;
  location: Observed | null;
  intro: Observed | null;
  emails: ContactLink[];
  phones: ContactLink[];
  urls: ContactLink[];
  facts: LabeledFact[];
  unplacedLines: string[];
}

export interface Experience {
  sectionHeading: string | null;
  title: Observed | null;
  organization: Observed | null;
  location: Observed | null;
  dates: Dated | null;
  description: Observed | null;
  realizations?: string[];
  unplaced: string[];
  rawLines: string[];
  track: Deduction<"stage" | "alternance"> | null;
  ambiguities: Ambiguity[];
}

export interface Education {
  sectionHeading: string | null;
  degree: Observed | null;
  school: Observed | null;
  location: Observed | null;
  dates: Dated | null;
  details: Observed | null;
  unplaced: string[];
  rawLines: string[];
  ambiguities: Ambiguity[];
}

export interface SkillItem {
  text: Observed;
  lexicon: Deduction<"technique" | "comportementale"> | null;
  prose: boolean;
}

export interface SkillGroup {
  label: Observed | null;
  items: SkillItem[];
}

export interface LanguageItem {
  name: Observed;
  canon: Deduction<string> | null;
  levelRaw: Observed | null;
  levelCanon: Deduction<{ scheme: "cecrl" | "label"; value: string }> | null;
  raw: string;
}

export interface Certification {
  name: Observed;
  issuer: Observed | null;
  dates: Dated | null;
  rawLines: string[];
}

export interface ProjectItem {
  title: Observed | null;
  dates: Dated | null;
  description: Observed | null;
  rawLines: string[];
}

export interface OtherSection {
  kind: string;
  heading: string | null;
  lines: string[];
}

export interface SectionView {
  kind: string;
  heading: string | null;
  lines: string[];
}

export type SectionKind =
  | "profile"
  | "experience"
  | "education"
  | "skills"
  | "languages"
  | "certifications"
  | "projects"
  | "interests"
  | "volunteering"
  | "awards"
  | "publications"
  | "references"
  | "contact"
  | "other";

export interface TextLine {
  text: string;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  bold: boolean;
  italic: boolean;
  headingHint: boolean;
  listItem: boolean;
  pageWidth: number;
}

export interface CvExtraction {
  meta: {
    filename: string;
    format: string;
    pipeline: string[];
    documentLanguage: Deduction<string> | null;
  };
  identity: Identity;
  profile: { heading: string | null; text: Observed | null };
  experiences: Experience[];
  education: Education[];
  skills: SkillGroup[];
  languages: LanguageItem[];
  certifications: Certification[];
  projects: ProjectItem[];
  interests: Observed[];
  otherSections: OtherSection[];
  sections: SectionView[];
  ambiguities: Ambiguity[];
  warnings: WarningNote[];
  noise: { text: string; rule: string }[];
  layoutNotes: string[];
  verification: { ok: boolean; checked: number; errors: string[] };
  sourceText: string;
}
