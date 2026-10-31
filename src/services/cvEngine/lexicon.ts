import type { Deduction, SectionKind } from "./types.ts";
import { deduction, fold, includesPhrase, squash } from "./text.ts";

const HEADING_GROUPS: { kind: SectionKind; phrases: string[] }[] = [
  {
    kind: "experience",
    phrases: [
      "expérience professionnelle",
      "expériences professionnelles",
      "experience professionnelle",
      "experiences professionnelles",
      "parcours professionnel",
      "parcours professionnels",
      "historique professionnel",
      "emplois",
      "expérience",
      "expériences",
      "experience",
      "experiences",
      "parcours",
      "parcours et réalisations",
      "parcours & réalisations",
      "parcours et realisations",
      "parcours & realisations",
      "experiences et realisations",
      "experiences et réalisations",
      "experiences & realisations",
      "experiences & réalisations",
      "work experience",
      "professional experience",
      "employment history",
      "work history",
      "career history",
      "employment",
      "berufserfahrung",
      "beruflicher werdegang",
      "werdegang",
      "experiencia profesional",
      "experiencia laboral",
      "experiencia",
      "esperienza professionale",
      "esperienza lavorativa",
      "expérience de travail",
    ],
  },
  {
    kind: "education",
    phrases: [
      "formation académique",
      "formation academique",
      "formations",
      "formation",
      "études",
      "etudes",
      "scolarité",
      "scolarite",
      "diplômes",
      "education",
      "academic background",
      "ausbildung",
      "formación académica",
      "formacion academica",
      "formación",
      "formacion",
      "istruzione",
      "formazione",
      "studi",
    ],
  },
  {
    kind: "skills",
    phrases: [
      "compétences techniques",
      "competences techniques",
      "compétences professionnelles",
      "competences professionnelles",
      "compétences",
      "competences",
      "savoir-faire",
      "savoir faire",
      "aptitudes",
      "technical skills",
      "core skills",
      "skills",
      "kenntnisse",
      "fähigkeiten",
      "fahigkeiten",
      "habilidades",
      "competenze",
      "expertise",
      "logiciels",
      "outils",
      "software",
      "tools",
    ],
  },
  {
    kind: "languages",
    phrases: [
      "langues étrangères",
      "langues etrangeres",
      "langues vivantes",
      "langues",
      "langue",
      "languages",
      "language skills",
      "sprachen",
      "sprachkenntnisse",
      "idiomas",
      "lingue",
    ],
  },
  {
    kind: "certifications",
    phrases: [
      "certifications",
      "certification",
      "certificats",
      "certificat",
      "certificates",
      "licenses",
      "licences",
      "habilitations",
      "zertifizierungen",
      "zertifikate",
      "certificaciones",
      "certificazioni",
    ],
  },
  {
    kind: "profile",
    phrases: [
      "à propos",
      "a propos",
      "profil professionnel",
      "professional summary",
      "professional profile",
      "profil",
      "profile",
      "summary",
      "about me",
      "about",
      "objectif professionnel",
      "objectif",
      "objectifs",
      "présentation",
      "presentation",
      "zusammenfassung",
      "über mich",
      "uber mich",
      "perfil",
      "profilo",
    ],
  },
  {
    kind: "interests",
    phrases: [
      "centres d'intérêt",
      "centres d'intérêts",
      "centre d'intérêt",
      "centres d interet",
      "loisirs",
      "intérêts",
      "interets",
      "hobbies",
      "interests",
      "interessen",
      "intereses",
      "interessi",
    ],
  },
  {
    kind: "projects",
    phrases: [
      "projets personnels",
      "projets",
      "projet",
      "personal projects",
      "projects",
      "projekte",
      "proyectos",
      "progetti",
    ],
  },
  {
    kind: "volunteering",
    phrases: [
      "bénévolat",
      "benevolat",
      "volontariat",
      "engagement associatif",
      "volontaire",
      "volunteering",
      "volunteer experience",
      "volunteer",
      "ehrenamt",
    ],
  },
  {
    kind: "publications",
    phrases: ["publications", "publication", "publications scientifiques"],
  },
  {
    kind: "awards",
    phrases: ["distinctions", "prix et distinctions", "awards", "honors", "honours", "auszeichnungen"],
  },
  {
    kind: "references",
    phrases: ["références", "references", "referees", "referenzen"],
  },
  {
    kind: "contact",
    phrases: ["coordonnées", "coordonnees", "contact", "contacts", "kontaktdaten", "contacto"],
  },
];

const QUALIFIERS = new Set([
  "professionnelle",
  "professionnelles",
  "professional",
  "professionals",
  "work",
  "history",
  "technique",
  "techniques",
  "technical",
  "personnelle",
  "personnelles",
  "transverse",
  "transverses",
  "cle",
  "cles",
  "vivante",
  "vivantes",
  "etrangere",
  "etrangeres",
  "informatique",
  "informatiques",
  "autre",
  "autres",
  "additionnelle",
  "additionnelles",
  "academique",
  "academiques",
  "continue",
  "initiales",
  "summary",
]);

const CONNECTORS = new Set(["et", "and", "und", "y", "de", "du", "des", "of", "the", "e", "&"]);

let headingIndex: { phrase: string; kind: SectionKind }[] | null = null;

function headings(): { phrase: string; kind: SectionKind }[] {
  if (headingIndex) return headingIndex;
  headingIndex = HEADING_GROUPS.flatMap((group) =>
    group.phrases.map((phrase) => ({ phrase: fold(phrase), kind: group.kind })),
  ).sort((a, b) => b.phrase.length - a.phrase.length);
  return headingIndex;
}

export function matchHeading(foldedLine: string): SectionKind | null {
  const line = foldedLine.replace(/[:：.\-–—]+$/g, "").trim();
  if (!line || line.split(" ").length > 8) return null;
  for (const item of headings()) {
    if (line === item.phrase) return item.kind;
    if (line.startsWith(`${item.phrase} `)) {
      const rest = line.slice(item.phrase.length + 1).split(" ").filter(Boolean);
      if (rest.length > 0 && rest.length <= 4 && rest.every((word) => QUALIFIERS.has(word) || CONNECTORS.has(word))) {
        return item.kind;
      }
    }
  }
  return null;
}

const JOB_PHRASES = [
  "account executive", "account manager", "sales executive", "business developer", "key account manager",
  "responsable des operations", "responsable des relations clients", "co-fondateur", "directeur general",
  "developpeur", "developpeuse", "developer", "ingenieur", "ingenieure", "engineer", "softwareentwickler",
  "softwareentwicklerin", "entwickler", "entwicklerin", "consultant", "consultante", "consulente", "berater",
  "beraterin", "chef de projet", "cheffe de projet", "directeur", "directrice", "director", "responsable",
  "manager", "analyste", "analyst", "charge de", "chargee de", "technicien", "technicienne", "technician",
  "assistant", "assistante", "designer", "architecte", "architect", "administrateur", "administratrice",
  "data scientist", "data analyst", "product owner", "product manager", "product designer", "scrum master",
  "devops", "full stack", "fullstack", "front-end", "frontend", "back-end", "backend", "stagiaire", "intern",
  "alternant", "alternante", "apprenti", "doctorant", "professeur", "professor", "enseignant", "teacher",
  "chercheur", "researcher", "comptable", "accountant", "auditeur", "auditor", "juriste", "avocat", "lawyer",
  "infirmier", "infirmiere", "nurse", "medecin", "commercial", "commerciale", "sales", "recruteur", "recruiter",
  "graphiste", "redacteur", "redactrice", "writer", "editor", "formateur", "formatrice", "coordinateur",
  "coordinatrice", "coordinator", "fondateur", "fondatrice", "founder", "president", "presidente", "gerant",
  "gerante", "specialiste", "specialist", "expert", "experte", "lead", "head of", "officer", "testeur",
  "testeuse", "projektleiter", "projektleiterin", "desarrollador", "desarrolladora", "ingeniero", "ingeniera",
  "sviluppatore", "sviluppatrice", "ux designer", "ui designer", "ux", "qa",
];

const ORG_WORDS = [
  "cabinet", "studio", "agence", "laboratoire", "hopital", "hospital", "mairie", "ministere", "association",
  "fondation", "holding", "groupe", "group", "societe", "company", "banque", "bank", "clinique", "clinic",
  "labs", "lab", "partners", "associes", "eeat", "urban stay", "allstay", "staylike", "miki travel", "holiday agent nice",
];

const LEGAL = ["sasu", "sarl", "eurl", "sas", "sci", "llc", "ltd", "gmbh", "plc", "corp", "inc", "spa", "srl", "bv", "nv", "oy", "ab", "lp", "llp", "sa", "ag", "sl"];

const DEGREE_PHRASES = [
  "doctorat", "phd", "master", "msc", "mba", "licence", "bachelor", "bsc", "bfa", "bts", "dut",
  "baccalaureat", "bac pro", "baccalauréat professionnel", "baccalaureat professionnel", "bep", "cap",
  "brevet federal", "brevet fédéral", "brevet", "cfc", "afp", "ingenieur", "ingenieure", "diplome", "diploma",
  "maitrise", "magistere", "bachelor of", "master of", "high school", "a level", "meng", "beng", "llb", "llm",
];

const SCHOOL_WORDS = [
  "universite", "university", "universitat", "universidad", "universita", "ecole", "school", "hochschule",
  "fachhochschule", "institute", "institut", "iut", "iae", "polytechnique", "lycee", "gymnasium",
  "conservatoire", "faculty", "faculte", "akademie", "academy", "academie", "college",
];

const CITIES = [
  "paris", "lyon", "marseille", "toulouse", "lille", "bordeaux", "nantes", "strasbourg", "rennes",
  "montpellier", "grenoble", "rouen", "dijon", "angers", "reims", "bruxelles", "brussels", "geneve",
  "geneva", "lausanne", "zurich", "montreal", "quebec", "londres", "london", "berlin", "munich", "munchen",
  "hamburg", "frankfurt", "cologne", "koln", "amsterdam", "madrid", "barcelone", "barcelona", "lisbonne",
  "lisbon", "rome", "roma", "milan", "milano", "dublin", "vienne", "vienna", "wien", "prague", "varsovie",
  "stockholm", "oslo", "copenhague", "helsinki", "luxembourg", "new york", "san francisco", "boston",
  "seattle", "chicago", "los angeles", "toronto", "vancouver", "sydney", "melbourne", "singapore",
  "hong kong", "dubai", "tokyo", "seoul", "edinburgh", "manchester", "lyon", "nantes", "bordeaux",
];

const COUNTRIES = [
  "france", "belgique", "belgium", "suisse", "switzerland", "canada", "luxembourg", "allemagne", "germany",
  "espagne", "spain", "italie", "italy", "portugal", "royaume-uni", "united kingdom", "united states",
  "usa", "pays-bas", "netherlands", "autriche", "austria", "irlande", "ireland", "maroc", "tunisie",
  "senegal", "bresil", "brazil", "mexique", "mexico", "inde", "india", "chine", "china", "japon", "japan",
  "australie", "australia", "pologne", "poland", "suede", "sweden", "norvege", "norway", "danemark",
  "denmark", "finlande", "finland", "grece", "greece",
];

const REMOTE_WORDS = [
  "teletravail", "remote", "hybride", "hybrid", "distanciel", "presentiel", "home office", "homeoffice",
  "full remote", "on site", "onsite",
];

const TECH = [
  "javascript", "typescript", "python", "java", "php", "ruby", "swift", "kotlin", "scala", "golang", "rust",
  "sql", "nosql", "html", "css", "react", "vue", "angular", "django", "flask", "spring", "laravel", "nodejs",
  "node", "docker", "kubernetes", "aws", "azure", "gcp", "git", "linux", "postgresql", "postgres", "mysql",
  "mongodb", "redis", "graphql", "figma", "sketch", "photoshop", "illustrator", "jira", "excel", "sap",
  "salesforce", "tableau", "power bi", "spark", "hadoop", "tensorflow", "pytorch", "pandas", "numpy",
  "terraform", "ansible", "jenkins", "gitlab", "github", "snowflake", "bigquery", "matlab", "autocad",
  "revit", "seo", "hubspot", "scrum", "kanban", "agile", "c++", "c#",
];

const SOFT = [
  "communication", "leadership", "travail d'equipe", "esprit d'equipe", "rigueur", "autonomie",
  "adaptabilite", "organisation", "pedagogie", "esprit de synthese", "negociation", "creativite",
  "curiosite", "initiative", "teamwork", "problem solving", "resolution de problemes", "time management",
  "empathie", "facilitation", "collaboration", "prise de parole", "ecoute", "gestion du stress",
  "force de proposition",
];

const LANGUAGES: { canon: string; names: string[]; codes?: string[] }[] = [
  { canon: "Français", names: ["français", "francais", "french", "französisch", "franzosisch"], codes: ["fr"] },
  { canon: "Anglais", names: ["anglais", "english", "englisch"], codes: ["en"] },
  { canon: "Allemand", names: ["allemand", "german", "deutsch"], codes: ["de"] },
  { canon: "Espagnol", names: ["espagnol", "spanish", "español", "espanol", "spanisch"], codes: ["es"] },
  { canon: "Italien", names: ["italien", "italian", "italiano", "italienisch"], codes: ["it"] },
  { canon: "Portugais", names: ["portugais", "portuguese", "português", "portugues", "portugiesisch"], codes: ["pt"] },
  { canon: "Néerlandais", names: ["néerlandais", "neerlandais", "dutch", "niederländisch", "nederlands"], codes: ["nl"] },
  { canon: "Arabe", names: ["arabe", "arabic", "arabisch"], codes: ["ar"] },
  { canon: "Chinois", names: ["chinois", "chinese", "mandarin", "chinesisch"], codes: ["zh"] },
  { canon: "Japonais", names: ["japonais", "japanese", "japanisch"], codes: ["ja"] },
  { canon: "Russe", names: ["russe", "russian", "russisch"], codes: ["ru"] },
  { canon: "Polonais", names: ["polonais", "polish", "polnisch"], codes: ["pl"] },
  { canon: "Turc", names: ["turc", "turkish", "türkisch", "turkisch"], codes: ["tr"] },
  { canon: "Suédois", names: ["suédois", "suedois", "swedish", "schwedisch"], codes: ["sv"] },
  { canon: "Norvégien", names: ["norvégien", "norvegien", "norwegian"], codes: ["no"] },
  { canon: "Danois", names: ["danois", "danish", "dänisch", "danisch"], codes: ["da"] },
  { canon: "Finnois", names: ["finnois", "finnish"], codes: ["fi"] },
  { canon: "Grec", names: ["grec", "greek", "griechisch"], codes: ["el"] },
  { canon: "Hébreu", names: ["hébreu", "hebreu", "hebrew"], codes: ["he"] },
  { canon: "Hindi", names: ["hindi"], codes: ["hi"] },
  { canon: "Coréen", names: ["coréen", "coreen", "korean"], codes: ["ko"] },
  { canon: "Roumain", names: ["roumain", "romanian"], codes: ["ro"] },
  { canon: "Hongrois", names: ["hongrois", "hungarian"], codes: ["hu"] },
  { canon: "Tchèque", names: ["tchèque", "tcheque", "czech"], codes: ["cs"] },
  { canon: "Ukrainien", names: ["ukrainien", "ukrainian"], codes: ["uk"] },
  { canon: "Catalan", names: ["catalan"], codes: ["ca"] },
  { canon: "Basque", names: ["basque", "euskara"] },
  { canon: "Breton", names: ["breton"] },
  { canon: "Latin", names: ["latin"] },
];

function scorePhrases(text: string, phrases: string[], hit: number): number {
  const folded = fold(text);
  let hits = 0;
  for (const phrase of phrases) {
    if (includesPhrase(folded, fold(phrase))) hits += 1;
  }
  if (!hits) return 0;
  return hit + Math.min(hits - 1, 2) * 0.35;
}

export function jobScore(text: string): number {
  return scorePhrases(text, JOB_PHRASES, 1.2);
}

export function hasLegalForm(text: string): boolean {
  const folded = fold(text);
  return LEGAL.some((form) => includesPhrase(folded, form));
}

export function orgScore(text: string): number {
  const folded = fold(text);
  let score = 0;
  if (hasLegalForm(text)) score += 2.4;
  for (const word of ORG_WORDS) {
    if (includesPhrase(folded, word)) score += 1.3;
  }
  if (degreeScore(text) >= 2) score -= 1.2;
  return Math.max(0, score);
}

export function degreeScore(text: string): number {
  return scorePhrases(text, DEGREE_PHRASES, 2);
}

export function schoolScore(text: string): number {
  return scorePhrases(text, SCHOOL_WORDS, 2.2);
}

export function scoreLocation(text: string): number {
  const folded = fold(text);
  if (!folded || folded.length > 48) return 0;
  if (schoolScore(text) >= 2 || degreeScore(text) >= 2) return 0;
  if (hasLegalForm(text)) return 0;
  let score = 0;
  if (REMOTE_WORDS.some((word) => includesPhrase(folded, fold(word)))) score += 2;
  if (COUNTRIES.some((word) => includesPhrase(folded, word))) score += 2;
  if (CITIES.some((word) => includesPhrase(folded, word))) score += 1.8;
  if (/\b\d{4,5}\b/.test(text) && /\p{L}/u.test(text)) score += 1.2;
  if (jobScore(text) >= 1.1) return 0;
  return score;
}

export function classifySkill(text: string): "technique" | "comportementale" | null {
  const folded = fold(text);
  const tech = TECH.some((word) => includesPhrase(folded, fold(word)));
  const soft = SOFT.some((word) => includesPhrase(folded, fold(word)));
  if (tech && !soft) return "technique";
  if (soft && !tech) return "comportementale";
  return null;
}

export function matchLanguageName(text: string): { canon: string; phrase: string } | null {
  const folded = fold(text);
  let best: { canon: string; phrase: string } | null = null;
  for (const language of LANGUAGES) {
    for (const name of language.names) {
      const phrase = fold(name);
      if (includesPhrase(folded, phrase) && (!best || phrase.length > fold(best.phrase).length)) {
        best = { canon: language.canon, phrase: name };
      }
    }
  }
  if (best) return best;
  if (folded.length <= 3) {
    for (const language of LANGUAGES) {
      if (language.codes?.includes(folded)) return { canon: language.canon, phrase: folded };
    }
  }
  return null;
}

export function canonLevel(raw: string): Deduction<{ scheme: "cecrl" | "label"; value: string }> | null {
  const folded = fold(raw);
  const cecr = /(?:^|[^a-z0-9])([abc][12])(?![a-z0-9])/u.exec(folded);
  if (cecr) {
    const value = cecr[1].toUpperCase();
    return deduction(
      { scheme: "cecrl", value },
      raw,
      "high",
      `Le niveau ${value} est écrit dans le document. Le libellé original est conservé à côté.`,
    );
  }
  const labels: { value: string; phrases: string[]; rule: string }[] = [
    {
      value: "natif",
      phrases: ["langue maternelle", "mother tongue", "muttersprache", "natif", "native", "maternelle", "bilingue", "bilingual"],
      rule: "Le document indique une langue maternelle, native ou bilingue. Aucun grade CECRL n'est ajouté.",
    },
    {
      value: "courant",
      phrases: ["courant", "couramment", "fluent", "fluently", "fliessend", "avance", "advanced", "proficient", "c1"],
      rule: "Étiquette interne « courant » à partir du mot écrit. Ce n'est pas un niveau CECRL s'il n'est pas noté.",
    },
    {
      value: "professionnel",
      phrases: ["professional working", "full professional", "professionnel", "professional"],
      rule: "Le document parle d'un niveau professionnel. Aucune équivalence CECRL n'est calculée.",
    },
    {
      value: "intermédiaire",
      phrases: ["intermediaire", "intermediate", "conversationnel", "mittelstufe", "limited working"],
      rule: "Étiquette interne « intermédiaire » à partir du mot écrit, sans grade CECRL inventé.",
    },
    {
      value: "débutant",
      phrases: ["notions", "notion", "debutant", "beginner", "elementary", "basic", "scolaire", "grundkenntnisse", "basique"],
      rule: "Étiquette interne « débutant » à partir du mot écrit (notions, elementary, scolaire…).",
    },
  ];
  for (const label of labels) {
    if (label.phrases.some((phrase) => includesPhrase(folded, fold(phrase)) || folded.includes(fold(phrase)))) {
      return deduction({ scheme: "label", value: label.value }, raw, "medium", label.rule);
    }
  }
  return null;
}

const DOC_WORDS: { label: string; words: string[] }[] = [
  { label: "français", words: ["avec", "dans", "pour", "une", "des", "les", "sur", "par", "est", "cette", "nous", "chez", "aux"] },
  { label: "anglais", words: ["the", "and", "with", "for", "from", "that", "this", "have", "was", "were", "previously", "of", "on", "in", "to", "by"] },
  { label: "allemand", words: ["und", "der", "die", "das", "mit", "fur", "ein", "eine", "von", "ist", "im"] },
  { label: "espagnol", words: ["el", "los", "las", "con", "para", "una", "del", "por", "como"] },
  { label: "italien", words: ["il", "con", "per", "della", "una", "che", "nel", "sono"] },
];

export function detectDocumentLanguage(text: string): Deduction<string> | null {
  const originalTokens = squash(text).split(/\s+/).filter(Boolean);
  const tokens = new Set(originalTokens.map((token) => fold(token)));
  const scored = DOC_WORDS.map((entry) => {
    const hits = entry.words.filter((word) => tokens.has(fold(word)));
    return { label: entry.label, hits };
  }).sort((a, b) => b.hits.length - a.hits.length);
  const top = scored[0];
  const second = scored[1];
  if (!top || top.hits.length < 3 || top.hits.length < (second?.hits.length ?? 0) + 2) return null;
  const example = top.hits[0] ?? "";
  const surface = originalTokens.find((token) => fold(token) === fold(example)) ?? example;
  return deduction(
    top.label,
    surface,
    "low",
    `Indice sur la langue du document, pas une langue déclarée par la personne. Mots-outils ${top.label} relevés : ${top.hits.length}. Exemple présent : « ${surface} ».`,
  );
}

export function trackFromHeading(heading: string | null): Deduction<"stage" | "alternance"> | null {
  if (!heading) return null;
  const folded = fold(heading);
  if (includesPhrase(folded, "alternance") || includesPhrase(folded, "apprentissage") || folded.includes("apprenticeship")) {
    return deduction("alternance", heading, "high", "Le titre de section écrit contient l'alternance ou l'apprentissage.");
  }
  if (/(stage|internship|praktikum|practicum)/.test(folded)) {
    return deduction("stage", heading, "high", "Le titre de section écrit contient un stage ou un internship.");
  }
  return null;
}
