export interface SampleCv {
  id: string;
  title: string;
  note: string;
  filename: string;
  text: string;
}

export const SAMPLES: SampleCv[] = [
  {
    id: "camille",
    title: "Camille — mise en page française",
    note: "Sections classiques, dates en toutes lettres, liste de compétences étiquetée.",
    filename: "camille-laurent.txt",
    text: `CAMILLE LAURENT
Développeuse fullstack
Paris · télétravail partiel
camille.laurent@exemple.fr
+33 6 18 42 77 05
linkedin.com/in/camille-laurent
github.com/claurent

PROFIL
Développeuse fullstack avec 6 ans d'expérience sur des produits B2B. J'aime les bases de code tenues et les interfaces nettes.

EXPÉRIENCE PROFESSIONNELLE

Développeuse fullstack
Atelier Numérique SAS · Paris
janvier 2021 – aujourd'hui
- Conception d'une plateforme de suivi de dossiers utilisée par 40 consultants.
- Migration de l'API REST vers une architecture modulaire en TypeScript.
- Encadrement de deux alternants.

Analyste développeuse
Maison Hortense SARL
septembre 2018 – décembre 2020
Lyon
- Automatisation des rapports commerciaux. Le volume traité a augmenté en 2019 sans ajout d'effectif.
- Maintenance d'un outil interne sous Python.

FORMATION

Master Informatique
Université de Lille
2016 – 2018

Licence Informatique
Université de Lille
2013 – 2016

COMPÉTENCES

Langages : TypeScript, Python, SQL
Outils : Git, Docker, PostgreSQL
Savoir-être : pédagogie, esprit de synthèse

LANGUES

Français : langue maternelle
Anglais : courant (C1)
Allemand : notions (A2)

CERTIFICATIONS

AWS Certified Cloud Practitioner — 2022
Pix — compétence numérique, 2021

CENTRES D'INTÉRÊT

Gravure, randonnée, chorale
`,
  },
  {
    id: "jordan",
    title: "Jordan — CV anglais",
    note: "Intitulé et société sur une même ligne, dates en anglais, remote.",
    filename: "jordan-ellis.txt",
    text: `JORDAN ELLIS
Product designer

jordan.ellis@example.com | +1 (415) 555-0138 | San Francisco
https://jordanellis.example

SUMMARY
Product designer focused on complex B2B tools. Previously in design systems and research.

EXPERIENCE

Product Designer, Northwind Labs Inc — San Francisco
March 2022 – Present
- Led the redesign of the billing console.
- Built a component library used by four squads.

UX Designer
Bright Harbor LLC | Remote
June 2019 – February 2022
- Interviewed operations staff and turned the findings into a dispatch workflow.
- The pilot launched in 2020.

EDUCATION

BFA Graphic Design
Rhode Island School of Design
2015 - 2019

SKILLS
Design: Figma, prototyping, design systems
Research: interviews, usability tests
Collaboration, facilitation

LANGUAGES
English — Native
French — Professional working proficiency
Spanish — Elementary

CERTIFICATIONS
NN/g UX Certification, 2023
`,
  },
  {
    id: "anna",
    title: "Anna — CV allemand",
    note: "Mois en allemand et fin ouverte « heute », sans date inventée.",
    filename: "anna-schmidt.txt",
    text: `ANNA SCHMIDT
Softwareentwicklerin
anna.schmidt@beispiel.de

BERUFSERFAHRUNG

Softwareentwicklerin
Nordlicht GmbH · Hamburg
März 2019 – heute
- Entwicklung von Abrechnungsservices und Betreuung der Abnahme.

AUSBILDUNG

B.Sc. Informatik
Universität Hamburg
2015 – 2018

SPRACHEN

Deutsch : Muttersprache
Englisch : fließend
`,
  },
  {
    id: "ambigu",
    title: "Alex — rôles ambigus",
    note: "Les lignes de mission ne disent pas clairement le poste ni l'employeur.",
    filename: "alex-martin.txt",
    text: `Alex Martin

Parcours

Mission data
Structure privée
2019-2021
Accompagnement des équipes métier sur des tableaux de bord.

Appui projet
Cabinet associé
2021-2024
Coordination de trois chantiers transverses.
`,
  },
];
