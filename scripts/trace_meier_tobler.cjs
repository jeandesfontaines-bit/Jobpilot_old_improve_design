const axios = require('axios');
const cheerio = require('cheerio');

async function inspectPath() {
  const annUrl = 'https://www.jobup.ch/fr/emplois/detail/b7773ad4-1ba1-4565-bc30-d7779b914234/';
  const prospUrl = 'https://ohws.prospective.ch/public/v1/jobs/13658d11-a0bc-48c4-aee5-018254a1eb72/';

  console.log('--- INSPECTION PARCOURS MEIER TOBLER ---');
  console.log('DATE:', new Date().toISOString());

  console.log('\nETAPE 1 : Annonce Jobup');
  const res1 = await axios.get(annUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  console.log('URL:', annUrl, 'Status:', res1.status);
  
  console.log('\nETAPE 2 : Annonce Prospective');
  const res2 = await axios.get(prospUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  console.log('URL:', prospUrl, 'Status:', res2.status);
  
  const $ = cheerio.load(res2.data);
  let applyLink = '';
  $('a').each((_, el) => {
    const txt = $(el).text().trim().toLowerCase();
    const href = $(el).attr('href');
    if (txt.includes('postul') || txt.includes('candidat') || (href && href.includes('apply'))) {
      applyLink = href;
    }
  });
  console.log('Lien postuler détecté:', applyLink);
  
  if (applyLink) {
     const fullApplyUrl = applyLink.startsWith('http') ? applyLink : 'https://ohws.prospective.ch' + applyLink;
     console.log('\nETAPE 3 : ATS Connector / Formulaire');
     const res3 = await axios.get(fullApplyUrl, { 
        maxRedirects: 5,
        headers: { 'User-Agent': 'Mozilla/5.0' }
     });
     console.log('URL finale:', res3.request.res.responseUrl);
     console.log('Status:', res3.status);
     const $3 = cheerio.load(res3.data);
     console.log('Titre page:', $3('title').text());
     console.log('--- CHAMPS FORMULAIRE ---');
     $3('input, select, textarea').each((_, el) => {
       const tagName = el.tagName;
       const type = $(el).attr('type') || '';
       const name = $(el).attr('name') || '';
       const required = $(el).attr('required') !== undefined;
       console.log(`- Tag: ${tagName}, Type: ${type}, Name: ${name}, Required: ${required}`);
     });
     console.log('-------------------------');
  }
}
inspectPath();
