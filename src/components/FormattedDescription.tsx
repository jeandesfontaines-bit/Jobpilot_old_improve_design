import React from 'react';

interface FormattedDescriptionProps {
  text?: string | null;
}

const BULLET = '\u2022';
const BOLD = '@@B@@';

/** Intertitres inutiles : « Description du poste », « Description de l'entreprise », « Job description »... */
const isGenericHeading = (s: string): boolean => {
  const t = s.trim().replace(/\s*:\s*$/, '');
  return /^description\b.{0,30}$/i.test(t) || /^(job description|stellenbeschreibung|aufgaben)$/i.test(t);
};

const toSentence = (s: string): string => {
  const l = s.trim().toLowerCase();
  return l.charAt(0).toUpperCase() + l.slice(1);
};

/** Nettoie le texte brut des scrapers. Affichage seulement : la base n'est pas modifiée. */
const cleanText = (raw: string): string => {
  let t = raw.replace(/\r/g, '');

  // En-tête technique « --- base: meta-keywords: ... title: X --- »
  t = t.replace(/^\s*---[\s\S]{0,600}?---\s*/, '');

  // Titre répété suivi d'une ligne de « ===== »
  const rep = t.match(/^([\s\S]{0,200}?)\s*={5,}\s*/);
  if (rep) t = t.slice(rep[0].length);
  t = t.replace(/={5,}/g, ' ');

  // « Ref 2530746 | Date: 19 Oct 2026 » et variantes (référence + date de publication)
  t = t.replace(
    /\bR[e\u00e9](?:f(?:[e\u00e9]rence)?)?\.?\s*:?\s*[\w\-\/.]+\s*\|\s*(?:Date|Datum)\s*:\s*\d{1,2}[./\s]+(?:\d{1,2}|[A-Za-z\u00c0-\u00ff.]+)[./\s]+\d{4}/gi,
    ' '
  );
  t = t.replace(
    /(^|\s)(?:Date|Datum)\s*:\s*\d{1,2}[./\s]+(?:\d{1,2}|[A-Za-z\u00c0-\u00ff.]+)[./\s]+\d{4}/gi,
    '$1'
  );
  t = t.replace(/(^|\s)R[e\u00e9]f(?:[e\u00e9]rence)?\.?\s*:?\s*[A-Z0-9][\w\-\/.]{3,}\s*\|/gi, '$1');

  // Échappements markdown (un ou plusieurs antislashs) : \* \\- \> \# ...
  t = t.replace(/\\+([`*_{}\[\]()#+\-.!>~|<&=])/g, '$1');
  t = t.replace(/\\/g, ' ');

  // Images / liens vides et codes de suivi des sites
  t = t.replace(/!?\[[^\]]*\]\(\s*\)/g, ' ');
  t = t.replace(/\[\s*\]/g, ' ');
  t = t.replace(/\bj(?:p)?(?:id|it|iy)[a-z0-9]*\d[a-z0-9]*\b/gi, ' ');

  // « Titre ------------ » -> intertitre ; autres suites de tirets supprimées
  t = t.replace(
    /(^|[.!?)*:]\s+)([A-Z\u00c0-\u00dd][^.!?\n]{2,50}?)\s*-{4,}\s*/g,
    (_m, a, b) => `${a}\n**${String(b).trim()}**\n`
  );
  t = t.replace(/-{4,}/g, ' ');

  // Apostrophes remplacées par un tiret : « d-un », « l-équipe »
  let broken = false;
  t = t.replace(/(^|\s)([dlnsjmcqDLNSJMCQ])-(?=[A-Za-z\u00c0-\u00ff])/g, (_m, a, b) => {
    broken = true;
    return `${a}${b}\u2019`;
  });

  // Accents cassés par la source (é/è -> « e- »)
  if (broken || (t.match(/[a-z]e-[a-z]/gi) || []).length >= 6) {
    t = t.replace(/([a-z])(e)-([a-z])/gi, '$1$2$3');
    t = t.replace(/(\s)a-(?=\s)/g, '$1a');
  }

  // Restes d'interface des sites
  t = t.replace(/\b(Afficher plus|Voir plus|Show more|Mehr anzeigen)\b/gi, ' ');

  // « Missions : Texte » en début de phrase -> intertitre
  t = t.replace(
    /([.!?])\s+([A-Z\u00c0-\u00dd][^.!?:\n]{2,40}?)\s:\s+(?=[A-Z\u00c0-\u00dd])/g,
    (_m, p, l) => `${p}\n**${String(l).trim()}**\n`
  );

  // « MISSION DETAILLEE Assurer... » : suite de mots en MAJUSCULES au milieu du texte -> intertitre
  t = t.replace(
    /(^|[\s.!?)])((?:[A-Z\u00c0-\u00dd]{2,}\s+){1,5}[A-Z\u00c0-\u00dd]{2,})(?=\s+[A-Z\u00c0-\u00dd][a-z\u00e0-\u00ff])/g,
    (_m, a, h) => `${a}\n**${toSentence(String(h))}**\n`
  );

  // Gras court juste après une fin de phrase -> intertitre
  t = t.replace(/([.!?)])\s+(\*\*[^*]{3,50}\*\*)\s+/g, '$1\n$2\n');

  // Marqueurs de titre markdown (#, ##) -> saut de ligne
  t = t.replace(/(^|\s)#{1,6}(?=\s|$)/g, '\n');

  // Puces « * » -> saut de ligne + puce
  t = t.replace(/(^|\s)\*\s+/g, `\n${BULLET} `);

  // Astérisques isolés (italiques cassés) supprimés, le gras ** ** est conservé
  t = t.replace(/\*\*/g, BOLD).replace(/\*/g, '').split(BOLD).join('**');

  return t;
};

const chunkParagraph = (p: string, max = 500): string[] => {
  if (p.length <= max) return [p];
  const sentences = p.match(/[^.!?]+(?:[.!?]+|$)\s*/g) || [p];
  const out: string[] = [];
  let cur = '';
  for (const s of sentences) {
    if (cur && (cur + s).length > max) {
      out.push(cur.trim());
      cur = s;
    } else {
      cur += s;
    }
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
};

const renderInline = (s: string): React.ReactNode[] =>
  s
    .split(/(\*\*[^*]+\*\*)/g)
    .filter((p) => p !== '')
    .map((p, i) =>
      p.startsWith('**') && p.endsWith('**') && p.length > 4 ? (
        <strong key={i} className="font-semibold text-zinc-950">
          {p.slice(2, -2)}
        </strong>
      ) : (
        <React.Fragment key={i}>{p.replace(/\*\*/g, '')}</React.Fragment>
      )
    );

const headingCls = 'pt-4 pb-1 text-xs font-bold uppercase tracking-wider text-zinc-900';

export const FormattedDescription: React.FC<FormattedDescriptionProps> = ({ text }) => {
  if (!text) {
    return <p className="text-zinc-400 text-xs">Description non disponible.</p>;
  }

  const lines = cleanText(text)
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter((l) => l && l.replace(/[\u2022*\s]/g, '') !== '');

  let skip = 0;
  while (
    skip < lines.length &&
    lines[skip].startsWith(`${BULLET} `) &&
    lines[skip].length - 2 <= 28
  ) {
    skip += 1;
  }
  const trimmed = skip >= 2 ? lines.slice(skip) : lines;
  const body = trimmed.length > 0 ? trimmed : lines;

  const blocks: React.ReactNode[] = [];
  body.forEach((line, i) => {
    if (line.startsWith(`${BULLET} `)) {
      blocks.push(
        <div key={`b${i}`} className="flex items-start gap-2.5 text-[13px] sm:text-sm text-zinc-800 leading-relaxed py-0.5">
          <span className="text-zinc-400 shrink-0 font-bold">•</span>
          <span>{renderInline(line.slice(2))}</span>
        </div>
      );
      return;
    }

    const h = line.match(/^\*\*([^*]{2,80}?)\*\*\s*(.*)$/);
    if (h) {
      const title = h[1].replace(/\s*:\s*$/, '');
      if (!isGenericHeading(title)) {
        blocks.push(
          <h4 key={`h${i}`} className={headingCls}>
            {title}
          </h4>
        );
      }
      if (h[2]) {
        chunkParagraph(h[2]).forEach((c, j) =>
          blocks.push(
            <p key={`p${i}-${j}`} className="text-[13px] sm:text-sm text-zinc-800 leading-relaxed font-normal py-1">
              {renderInline(c)}
            </p>
          )
        );
      }
      return;
    }

    if (line.length <= 60 && line === line.toUpperCase() && /[A-Z\u00c0-\u00dd]{3}/.test(line)) {
      if (isGenericHeading(line)) return;
      blocks.push(
        <h4 key={`u${i}`} className={headingCls}>
          {toSentence(line)}
        </h4>
      );
      return;
    }

    chunkParagraph(line).forEach((c, j) =>
      blocks.push(
        <p key={`p${i}-${j}`} className="text-[13px] sm:text-sm text-zinc-800 leading-relaxed font-normal py-1">
          {renderInline(c)}
        </p>
      )
    );
  });

  return <div className="space-y-3">{blocks}</div>;
};
