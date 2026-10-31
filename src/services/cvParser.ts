import { parseText } from "./cvEngine/parse.ts";
import type { Dated } from "./cvEngine/types.ts";

export interface WorkExperience {
  company: string;
  title: string;
  location: string;
  start_date: string;
  end_date: string;
  dates: string;
  realizations: string[];
  achievements: string[];
  description: string;
}

export interface Education {
  institution: string;
  diploma: string;
  location: string;
  start_date: string;
  end_date: string;
  dates: string;
}

export interface ParsedCv {
  first_name?: string;
  last_name?: string;
  current_title?: string;
  email?: string;
  phone?: string;
  city?: string;
  skills: string[];
  languages: string;
  experiences: WorkExperience[];
  formations: Education[];
  diplomas: Education[];
}

function formatDatePoint(point: { year: number; month: number | null } | null | undefined): string {
  if (!point) return '';
  if (point.month != null) {
    return `${String(point.month).padStart(2, '0')}/${point.year}`;
  }
  return String(point.year);
}

function extractDates(dated: Dated | null | undefined): { start_date: string; end_date: string; dates: string } {
  if (!dated) {
    return { start_date: '', end_date: '', dates: 'Dates non spécifiées' };
  }
  const parsed = dated.parsed?.value;
  if (!parsed) {
    const raw = dated.raw?.text || '';
    const parts = raw.split(/\s*[-–—/]\s*|\s+(?:au|à|a|to|until)\s+/i);
    const start_date = parts[0]?.trim() || '';
    const end_date = parts[1]?.trim() || (raw.toLowerCase().includes('présent') ? 'Présent' : '');
    return { start_date, end_date, dates: raw };
  }

  const start_date = formatDatePoint(parsed.start);
  let end_date = '';
  if (parsed.openEnded) {
    end_date = 'Présent';
  } else if (parsed.end) {
    end_date = formatDatePoint(parsed.end);
  }

  const dates = start_date && end_date ? `${start_date} - ${end_date}` : (start_date || end_date || 'Dates non spécifiées');
  return { start_date, end_date, dates };
}

function formatName(name: string | undefined): { first_name?: string; last_name?: string } {
  if (!name) return {};
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return {};
  const capitalize = (s: string) => s.length ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : '';
  const first = capitalize(parts[0]);
  const last = parts.slice(1).map(capitalize).join(' ');
  return { first_name: first, last_name: last };
}

export function parseCvText(text: string): ParsedCv {
  const extraction = parseText(text);
  const name = formatName(extraction.identity.fullName?.text);

  const formations: Education[] = extraction.education.map(edu => {
    const dates = extractDates(edu.dates);
    return {
      institution: edu.school?.text || 'Institution',
      diploma: edu.degree?.text || 'Diplôme',
      location: edu.location?.text || '',
      start_date: dates.start_date,
      end_date: dates.end_date,
      dates: dates.dates
    };
  });

  const experiences: WorkExperience[] = extraction.experiences.map(exp => {
    const dates = extractDates(exp.dates);
    const realizations = exp.realizations && exp.realizations.length > 0
      ? exp.realizations
      : (exp.description?.text
          ? exp.description.text
              .split('\n')
              .map(line => line.replace(/^\s*[-–—•·▪▸►*]\s*/u, '').trim())
              .filter(Boolean)
          : []);

    return {
      company: exp.organization?.text || 'Entreprise non spécifiée',
      title: exp.title?.text || 'Poste non spécifié',
      location: exp.location?.text || 'Suisse',
      start_date: dates.start_date,
      end_date: dates.end_date,
      dates: dates.dates,
      realizations,
      achievements: realizations,
      description: realizations.join('\n')
    };
  });

  // Extract skills and tools, deduplicating them
  const rawSkills = extraction.skills.flatMap(group => group.items.map(item => item.text.text));
  const cleanSkills = Array.from(new Set(rawSkills.map(s => s.trim()).filter(Boolean)));

  return {
    first_name: name.first_name,
    last_name: name.last_name,
    current_title: extraction.identity.headline?.text || undefined,
    email: extraction.identity.emails[0]?.text.text,
    phone: extraction.identity.phones[0]?.text.text,
    city: extraction.identity.location?.text || undefined,
    skills: cleanSkills,
    languages: extraction.languages.map(l => l.name.text).join(', '),
    experiences,
    formations,
    diplomas: formations
  };
}
