/**
 * Générateur de CV et de Lettre de Motivation PDF Suisse professionnel via pdf-lib.
 * Produit des documents PDF A4 ATS-friendly, standards pour le marché suisse,
 * directement prêts à être soumis par l'agent de candidature.
 */
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

export interface CvProfileData {
  first_name?: string;
  last_name?: string;
  current_title?: string;
  email?: string;
  phone?: string;
  city?: string;
  canton?: string;
  swiss_permit?: string;
  skills?: string[];
  languages?: string;
  experiences?: Array<{
    title: string;
    company: string;
    location?: string;
    start_date?: string;
    end_date?: string;
    dates?: string;
    realizations?: string[];
  }>;
  formations?: Array<{
    diploma: string;
    institution: string;
    location?: string;
    start_date?: string;
    end_date?: string;
    dates?: string;
  }>;
}

export interface CoverLetterPdfData {
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  city?: string;
  canton?: string;
  company?: string;
  job_title?: string;
  job_location?: string;
  date_str?: string;
  body_text: string;
}

/**
 * Normalise les caractères Unicode hors table WinAnsi pour éviter toute erreur d'encodage pdf-lib.
 */
export function sanitizePdfText(input: string | undefined | null): string {
  if (!input) return '';
  return String(input)
    .replace(/[\u2018\u2019\u201A\u2032]/g, "'")
    .replace(/[\u201C\u201D\u201E\u2033]/g, '"')
    .replace(/[\u2013\u2014\u2212]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/\u0153/g, 'oe')
    .replace(/\u0152/g, 'OE')
    .replace(/[\u00A0\u202F\u2009]/g, ' ')
    .replace(/\u00B7/g, '.')
    // Supprimer les caractères hors plage Latin-1 / WinAnsi de base (hors sauts de ligne)
    .replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/g, '');
}

function wrapText(text: string, maxWidth: number, font: any, size: number): string[] {
  const clean = sanitizePdfText(text).replace(/\r\n/g, '\n');
  const paragraphs = clean.split('\n');
  const allLines: string[] = [];

  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) {
      allLines.push('');
      continue;
    }
    const words = trimmed.split(/\s+/);
    let currentLine = '';

    for (const w of words) {
      const testLine = currentLine ? `${currentLine} ${w}` : w;
      const width = font.widthOfTextAtSize(testLine, size);
      if (width <= maxWidth) {
        currentLine = testLine;
      } else {
        if (currentLine) allLines.push(currentLine);
        currentLine = w;
      }
    }
    if (currentLine) allLines.push(currentLine);
  }
  return allLines;
}

export async function generateCvPdfBuffer(profile: CvProfileData): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontOblique = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);

  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const margin = 45;
  const contentWidth = pageWidth - margin * 2;

  let page = pdfDoc.addPage([pageWidth, pageHeight]);
  let y = pageHeight - margin;

  // Couleurs soignées (élégance suisse sobre)
  const colorPrimary = rgb(0.08, 0.1, 0.14);    // Noir d'encre doux
  const colorSecondary = rgb(0.25, 0.28, 0.35); // Gris ardoise soutenu
  const colorMuted = rgb(0.45, 0.48, 0.55);     // Gris moyen pour métadonnées
  const colorLine = rgb(0.85, 0.87, 0.9);       // Ligne discrète
  const colorAccent = rgb(0.12, 0.35, 0.65);    // Bleu sobre discret pour titres

  function checkPageBreak(neededHeight: number) {
    if (y - neededHeight < margin) {
      page = pdfDoc.addPage([pageWidth, pageHeight]);
      y = pageHeight - margin;
    }
  }

  // 1. EN-TÊTE DU CV
  const fullName = sanitizePdfText([profile.first_name, profile.last_name].filter(Boolean).join(' ') || 'Candidat');
  page.drawText(fullName.toUpperCase(), {
    x: margin,
    y: y - 18,
    size: 20,
    font: fontBold,
    color: colorPrimary,
  });
  y -= 26;

  if (profile.current_title) {
    page.drawText(sanitizePdfText(profile.current_title).toUpperCase(), {
      x: margin,
      y: y - 12,
      size: 11,
      font: fontBold,
      color: colorAccent,
    });
    y -= 18;
  }

  // Coordonnées & Statut légal suisse
  const contacts = [
    profile.email,
    profile.phone,
    [profile.city, profile.canton].filter(Boolean).join(' '),
    profile.swiss_permit ? `Autorisation : ${profile.swiss_permit}` : null,
  ]
    .filter(Boolean)
    .map((c) => sanitizePdfText(c as string));

  if (contacts.length > 0) {
    page.drawText(contacts.join('  -  '), {
      x: margin,
      y: y - 9,
      size: 9,
      font: fontRegular,
      color: colorSecondary,
    });
    y -= 16;
  }

  // Ligne de séparation élégante sous l'en-tête
  y -= 4;
  page.drawLine({
    start: { x: margin, y },
    end: { x: pageWidth - margin, y },
    thickness: 1,
    color: colorLine,
  });
  y -= 16;

  function drawSectionHeader(title: string) {
    checkPageBreak(30);
    page.drawText(sanitizePdfText(title).toUpperCase(), {
      x: margin,
      y: y - 10,
      size: 10,
      font: fontBold,
      color: colorAccent,
    });
    y -= 14;
    page.drawLine({
      start: { x: margin, y },
      end: { x: pageWidth - margin, y },
      thickness: 0.5,
      color: colorLine,
    });
    y -= 12;
  }

  // 2. EXPÉRIENCES PROFESSIONNELLES
  const experiences = profile.experiences || [];
  if (experiences.length > 0) {
    drawSectionHeader('Experiences professionnelles');

    for (const exp of experiences) {
      const dates = sanitizePdfText(exp.dates || [exp.start_date, exp.end_date].filter(Boolean).join(' - ') || '');
      checkPageBreak(40);

      const expTitle = sanitizePdfText(exp.title || 'Poste');
      page.drawText(expTitle, {
        x: margin,
        y: y - 10,
        size: 10,
        font: fontBold,
        color: colorPrimary,
      });

      if (dates) {
        const dateWidth = fontBold.widthOfTextAtSize(dates, 9);
        page.drawText(dates, {
          x: pageWidth - margin - dateWidth,
          y: y - 10,
          size: 9,
          font: fontBold,
          color: colorSecondary,
        });
      }
      y -= 13;

      const subInfo = sanitizePdfText([exp.company, exp.location].filter(Boolean).join(', '));
      if (subInfo) {
        page.drawText(subInfo, {
          x: margin,
          y: y - 9,
          size: 9,
          font: fontOblique,
          color: colorMuted,
        });
        y -= 13;
      }

      const realizations = (exp.realizations || []).filter(Boolean);
      for (const r of realizations) {
        const bulletLines = wrapText(r, contentWidth - 14, fontRegular, 8.5).filter(Boolean);
        checkPageBreak(bulletLines.length * 11 + 4);

        page.drawText('-', {
          x: margin + 2,
          y: y - 8,
          size: 9,
          font: fontBold,
          color: colorAccent,
        });

        for (const line of bulletLines) {
          page.drawText(line, {
            x: margin + 12,
            y: y - 8,
            size: 8.5,
            font: fontRegular,
            color: colorPrimary,
          });
          y -= 10.5;
        }
      }
      y -= 6;
    }
    y -= 8;
  }

  // 3. FORMATIONS ET DIPLÔMES
  const formations = profile.formations || [];
  if (formations.length > 0) {
    drawSectionHeader('Formations & Diplomes');

    for (const form of formations) {
      const dates = sanitizePdfText(form.dates || [form.start_date, form.end_date].filter(Boolean).join(' - ') || '');
      checkPageBreak(25);

      const diploma = sanitizePdfText(form.diploma || 'Diplome');
      page.drawText(diploma, {
        x: margin,
        y: y - 9,
        size: 9.5,
        font: fontBold,
        color: colorPrimary,
      });

      if (dates) {
        const dateWidth = fontRegular.widthOfTextAtSize(dates, 8.5);
        page.drawText(dates, {
          x: pageWidth - margin - dateWidth,
          y: y - 9,
          size: 8.5,
          font: fontRegular,
          color: colorMuted,
        });
      }
      y -= 12;

      const subInst = sanitizePdfText([form.institution, form.location].filter(Boolean).join(', '));
      if (subInst) {
        page.drawText(subInst, {
          x: margin,
          y: y - 8.5,
          size: 8.5,
          font: fontOblique,
          color: colorMuted,
        });
        y -= 12;
      }
      y -= 3;
    }
    y -= 8;
  }

  // 4. COMPÉTENCES & OUTILS
  const skills = (profile.skills || []).map((s) => sanitizePdfText(s)).filter(Boolean);
  if (skills.length > 0) {
    drawSectionHeader('Competences cles & Outils');
    const skillsText = skills.join('   -   ');
    const skillLines = wrapText(skillsText, contentWidth, fontRegular, 8.5).filter(Boolean);

    for (const line of skillLines) {
      checkPageBreak(12);
      page.drawText(line, {
        x: margin,
        y: y - 8.5,
        size: 8.5,
        font: fontRegular,
        color: colorSecondary,
      });
      y -= 12;
    }
    y -= 8;
  }

  // 5. LANGUES
  if (profile.languages) {
    drawSectionHeader('Langues');
    checkPageBreak(15);
    page.drawText(sanitizePdfText(profile.languages), {
      x: margin,
      y: y - 8.5,
      size: 8.5,
      font: fontRegular,
      color: colorSecondary,
    });
    y -= 14;
  }

  return await pdfDoc.save();
}

/**
 * Génère un PDF A4 de lettre de motivation adaptée à l'offre.
 */
export async function generateCoverLetterPdfBuffer(data: CoverLetterPdfData): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const margin = 50;
  const contentWidth = pageWidth - margin * 2;

  let page = pdfDoc.addPage([pageWidth, pageHeight]);
  let y = pageHeight - margin;

  const colorPrimary = rgb(0.08, 0.1, 0.14);
  const colorSecondary = rgb(0.25, 0.28, 0.35);
  const colorAccent = rgb(0.12, 0.35, 0.65);

  function checkPageBreak(neededHeight: number) {
    if (y - neededHeight < margin) {
      page = pdfDoc.addPage([pageWidth, pageHeight]);
      y = pageHeight - margin;
    }
  }

  // En-tête expéditeur
  const fullName = sanitizePdfText([data.first_name, data.last_name].filter(Boolean).join(' ') || 'Candidat');
  page.drawText(fullName, {
    x: margin,
    y: y - 14,
    size: 13,
    font: fontBold,
    color: colorPrimary,
  });
  y -= 18;

  const senderSub = [
    data.email,
    data.phone,
    [data.city, data.canton].filter(Boolean).join(' '),
  ]
    .filter(Boolean)
    .map((s) => sanitizePdfText(s as string))
    .join('  |  ');

  if (senderSub) {
    page.drawText(senderSub, {
      x: margin,
      y: y - 10,
      size: 9,
      font: fontRegular,
      color: colorSecondary,
    });
    y -= 24;
  }

  // Destinataire & Date
  const companyLine = sanitizePdfText(data.company || 'Service du Recrutement');
  page.drawText(companyLine, {
    x: margin,
    y: y - 10,
    size: 10,
    font: fontBold,
    color: colorPrimary,
  });
  y -= 14;

  const dateStr = sanitizePdfText(data.date_str || new Date().toLocaleDateString('fr-CH'));
  const cityStr = sanitizePdfText(data.city || 'Geneve');
  page.drawText(`${cityStr}, le ${dateStr}`, {
    x: margin,
    y: y - 10,
    size: 9.5,
    font: fontRegular,
    color: colorSecondary,
  });
  y -= 24;

  // Objet
  const subjectText = sanitizePdfText(`Objet : Candidature au poste de ${data.job_title || 'Collaborateur'}`);
  const subjectLines = wrapText(subjectText, contentWidth, fontBold, 10.5).filter(Boolean);
  for (const line of subjectLines) {
    page.drawText(line, {
      x: margin,
      y: y - 11,
      size: 10.5,
      font: fontBold,
      color: colorAccent,
    });
    y -= 15;
  }
  y -= 10;

  // Corps de la lettre
  const bodyLines = wrapText(data.body_text || '', contentWidth, fontRegular, 10);
  for (const line of bodyLines) {
    if (line === '') {
      y -= 8;
      continue;
    }
    checkPageBreak(16);
    page.drawText(line, {
      x: margin,
      y: y - 10,
      size: 10,
      font: fontRegular,
      color: colorPrimary,
    });
    y -= 14;
  }

  // Signature
  checkPageBreak(40);
  y -= 16;
  page.drawText(fullName, {
    x: margin,
    y: y - 10,
    size: 10,
    font: fontBold,
    color: colorPrimary,
  });

  return await pdfDoc.save();
}
