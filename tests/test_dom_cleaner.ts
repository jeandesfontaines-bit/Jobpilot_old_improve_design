import * as cheerio from 'cheerio';
import { stripDomNoise, cleanJobDescription } from '../src/services/swissJobHelpers.ts';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ ÉCHEC : ${message}`);
    process.exit(1);
  } else {
    console.log(`  ✓ ${message}`);
  }
}

console.log('\n=== TEST SUITE : Durcissement des Parseurs DOM & Nettoyage de Bruit ===');

// 1. Tests sur stripDomNoise (Cheerio DOM Tree)
console.log('\n1. Test de suppression des éléments parasites DOM (stripDomNoise)...');

const htmlWithNoise = `
  <html>
    <head>
      <title>Offre d'emploi</title>
      <script>var tracking = true;</script>
      <style>.btn { color: red; }</style>
    </head>
    <body>
      <header><nav><a href="/">Accueil</a></nav></header>
      <div id="onetrust-consent-sdk"><p>Nous utilisons des cookies...</p></div>
      <div class="didomi-popup-container"><p>Gérer les cookies</p></div>
      <div id="CybotCookiebotDialog"><p>Cookiebot consent</p></div>
      <div class="cookie-banner-wrapper">Accepter les cookies</div>
      
      <main>
        <h1>Développeur Full Stack TypeScript</h1>
        <div class="social-share-buttons">
          <a href="https://facebook.com/sharer">Partager sur Facebook</a>
          <a href="https://linkedin.com/shareArticle">Partager sur LinkedIn</a>
          <button aria-label="Partager cette annonce">Partager</button>
        </div>
        <div class="job-content">
          <p>Super opportunité en Suisse à Genève.</p>
          <p>Nous cherchons un ingénieur passionné pour partager notre vision de l'innovation.</p>
        </div>
        <div class="report-job-container">
          <button class="report-job">Signaler l'offre</button>
          <div class="similar-jobs">Offres similaires...</div>
          <div class="job-alert">Créer une alerte</div>
        </div>
      </main>
      <footer><p>&copy; 2026 Tous droits réservés</p></footer>
    </body>
  </html>
`;

const $ = cheerio.load(htmlWithNoise);
stripDomNoise($);

assert($('header').length === 0, 'Les balises <header> ont été supprimées');
assert($('nav').length === 0, 'Les balises <nav> ont été supprimées');
assert($('footer').length === 0, 'Les balises <footer> ont été supprimées');
assert($('#onetrust-consent-sdk').length === 0, 'La bannière OneTrust a été supprimée');
assert($('.didomi-popup-container').length === 0, 'La popup Didomi a été supprimée');
assert($('#CybotCookiebotDialog').length === 0, 'Le dialogue Cookiebot a été supprimé');
assert($('.cookie-banner-wrapper').length === 0, 'Les classes contenant "cookie" ont été supprimées');
assert($('.social-share-buttons').length === 0, 'Les widgets de partage social ont été supprimés');
assert($('.report-job-container').find('.report-job').length === 0, 'Le bouton de signalement a été supprimé');
assert($('.job-content').text().includes('Super opportunité'), 'Le contenu légitime de l\'annonce est intact');
assert($('.job-content').text().includes('partager notre vision'), 'Les expressions avec "partager" dans le texte légitime sont préservées');

// 2. Tests sur cleanJobDescription (Texte & Nettoyage de bruit)
console.log('\n2. Test de nettoyage textuel et suppression de bruit (cleanJobDescription)...');

const noisyText1 = `
  Opportunité chez Ottos !
  ### Partager cette offre d'emploi ###
  * * * * *
  ### Votre interlocutrice RH ###
  **Maeva Vogt**
`;
const cleaned1 = cleanJobDescription(noisyText1);
assert(!cleaned1.includes('Partager cette offre'), 'Le bloc "### Partager cette offre d\'emploi ###" est retiré');
assert(!cleaned1.includes('* * * * *'), 'La suite d\'étoiles "* * * * *" est retirée');
assert(cleaned1.includes('Opportunité chez Ottos !'), 'Le texte principal de l\'annonce est préservé');
assert(cleaned1.includes('Votre interlocutrice RH'), 'Le contact RH légitime est préservé');

const noisyText2 = `
  Nous nous réjouissons d'accueillir votre candidature !** Partager sur * * * * *
  Postulez dès aujourd'hui.
`;
const cleaned2 = cleanJobDescription(noisyText2);
assert(!cleaned2.includes('Partager sur * * * * *'), 'Le suffixe "Partager sur * * * * *" est retiré');
assert(cleaned2.includes('candidature !**'), 'La fin de phrase avant le bruit est préservée');
assert(cleaned2.includes('Postulez dès aujourd\'hui.'), 'La suite du texte est préservée');

const noisyGermanText = `
  Lassen Sie Ihrer Kreativität freien Lauf.
  ### Diesen Job teilen ###
  * * * * *
  ### Ihre HR-Ansprechpartnerin ###
  Sharina Thürig
`;
const cleanedGerman = cleanJobDescription(noisyGermanText);
assert(!cleanedGerman.includes('Diesen Job teilen'), 'Le bloc allemand "### Diesen Job teilen ###" est retiré');
assert(cleanedGerman.includes('Kreativität freien Lauf.'), 'Le texte allemand principal est préservé');

const legitimatePartager = `
  Notre équipe aime partager des valeurs communes : bienveillance, rigueur et innovation.
  Une clinique Unique, Respectueuse, Innovatrice et Responsable.
`;
const cleanedLegit = cleanJobDescription(legitimatePartager);
assert(cleanedLegit.includes('partager des valeurs communes'), 'La phrase légitime "partager des valeurs communes" est intacte');
assert(cleanedLegit.includes('Unique, Respectueuse, Innovatrice'), 'Le descriptif de l\'entreprise est intact');

const cookieNoticeText = `
  Ce site utilise des cookies pour améliorer votre expérience utilisateur.
  Paramètres des cookies
  Développeur React avec 3 ans d'expérience requis.
`;
const cleanedCookie = cleanJobDescription(cookieNoticeText);
assert(!cleanedCookie.includes('Ce site utilise des cookies'), 'Le paragraphe cookie est supprimé');
assert(!cleanedCookie.includes('Paramètres des cookies'), 'La ligne "Paramètres des cookies" est supprimée');
assert(cleanedCookie.includes('Développeur React avec 3 ans'), 'L\'exigence métier est préservée');

console.log('\n===============================================================');
console.log('SUCCÈS : TOUS LES TESTS DE DURCISSEMENT DOM ET TEXTE SONT VALIDÉS !');
console.log('===============================================================\n');
