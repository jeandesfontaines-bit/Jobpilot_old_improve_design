import { evaluateProspectiveForm, ProspectiveAnalysisResult } from './prospectiveAdapter.ts';
import * as fs from 'fs';
import * as path from 'path';

const LOG_FILE = path.join(process.cwd(), 'data', 'prospective_adapter_logs.json');

export function runAdapterTest() {
  const sampleHtmlCompatible = `
    <form>
      <input type="text" name="firstname" />
      <input type="text" name="lastname" />
      <input type="email" name="email" />
      <input type="file" name="cv_upload" />
      <input type="checkbox" name="privacy" />
    </form>
  `;

  const sampleHtmlIncompatible = `
    <form>
      <input type="text" name="fname" />
      <input type="text" name="lname" />
    </form>
  `;

  const testUrls = [
    { url: 'https://ohws.prospective.ch/public/v1/jobs/13658d11-a0bc-48c4-aee5-018254a1eb72/', html: sampleHtmlCompatible },
    { url: 'https://ohws.prospective.ch/public/v1/jobs/incompatible-job', html: sampleHtmlIncompatible },
    { url: 'https://example.com/apply', html: sampleHtmlCompatible }
  ];

  const results: ProspectiveAnalysisResult[] = testUrls.map(t => evaluateProspectiveForm(t.url, t.html));

  // Ensure data directory exists
  const dataDir = path.dirname(LOG_FILE);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  fs.writeFileSync(LOG_FILE, JSON.stringify(results, null, 2), 'utf8');
  console.log('Adapter test results saved to', LOG_FILE);
  return results;
}

runAdapterTest();
