const axios = require('axios');
const cheerio = require('cheerio');

async function inspectPath() {
  const annUrl = 'https://www.jobup.ch/fr/emplois/detail/b7773ad4-1ba1-4565-bc30-d7779b914234/';
  
  console.log('--- INSPECTION MEIER TOBLER ---');
  console.log('Annonce URL:', annUrl);

  // 1. Get Jobup page
  const res1 = await axios.get(annUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const $1 = cheerio.load(res1.data);
  
  // Find "Postuler" link
  let applyUrl = '';
  $1('a').each((_, el) => {
    console.log('Link text:', $1(el).text().trim(), 'Href:', $1(el).attr('href'));
    const txt = $1(el).text().toLowerCase();
    if (txt.includes('postul')) {
      applyUrl = $1(el).attr('href');
    }
  });
  
  if (!applyUrl) {
    console.log('Lien de postulation non trouvé.');
    return;
  }
  
  console.log('Lien de postulation:', applyUrl);
  
  // 2. Follow redirect to Prospective
  const res2 = await axios.get(applyUrl, { 
    maxRedirects: 5,
    headers: { 'User-Agent': 'Mozilla/5.0' }
  });
  
  console.log('URL finale:', res2.request.res.responseUrl);
  
  // 3. Inspect fields
  const $3 = cheerio.load(res2.data);
  console.log('Titre formulaire:', $3('title').text().trim());
  
  console.log('\n--- CHAMPS FORMULAIRE ---');
  $3('input, select, textarea').each((_, el) => {
    const tagName = el.tagName;
    const type = $3(el).attr('type') || '';
    const name = $3(el).attr('name') || '';
    const required = $3(el).attr('required') !== undefined;
    const label = $3(`label[for="${$3(el).attr('id')}"]`).text().trim() || $3(el).prev('label').text().trim();
    
    console.log(`- Label: ${label}, Tag: ${tagName}, Type: ${type}, Name: ${name}, Required: ${required}`);
  });
}

inspectPath().catch(err => console.error(err));
