export interface ProspectiveAnalysisResult {
  url: string;
  compatible: boolean;
  reason?: string;
  filledFields: { name: string; value: string }[];
  missingFields: string[];
  unsupportedFields: string[];
  status: 'Pré-remplissage possible' | 'Formulaire non compatible';
  timestamp: string;
}

export function evaluateProspectiveForm(url: string, htmlContent: string): ProspectiveAnalysisResult {
  const timestamp = new Date().toISOString();
  
  // Check if URL belongs to ohws.prospective.ch
  if (!url.includes('ohws.prospective.ch')) {
    return {
      url,
      compatible: false,
      reason: 'URL non reconnue comme Prospective CH',
      filledFields: [],
      missingFields: [],
      unsupportedFields: [],
      status: 'Formulaire non compatible',
      timestamp
    };
  }

  // Required exact selectors check
  const requiredSelectors = [
    "input[name='firstname']",
    "input[name='lastname']",
    "input[name='email']",
    "input[type='file'][name='cv_upload']"
  ];

  // Simple string inspection to simulate strict selector presence in read-only mode
  const hasFirstname = htmlContent.includes("name=\"firstname\"") || htmlContent.includes("name='firstname'");
  const hasLastname = htmlContent.includes("name=\"lastname\"") || htmlContent.includes("name='lastname'");
  const hasEmail = htmlContent.includes("name=\"email\"") || htmlContent.includes("name='email'");
  const hasCvUpload = htmlContent.includes("name=\"cv_upload\"") || htmlContent.includes("name='cv_upload'");

  if (!hasFirstname || !hasLastname || !hasEmail || !hasCvUpload) {
    const missing = [];
    if (!hasFirstname) missing.push("firstname");
    if (!hasLastname) missing.push("lastname");
    if (!hasEmail) missing.push("email");
    if (!hasCvUpload) missing.push("cv_upload");

    return {
      url,
      compatible: false,
      reason: `Sélecteurs manquants ou non conformes: ${missing.join(', ')}`,
      filledFields: [],
      missingFields: missing,
      unsupportedFields: [],
      status: 'Formulaire non compatible',
      timestamp
    };
  }

  // If all 4 exact selectors are present
  const filledFields = [
    { name: 'firstname', value: '[User.FirstName]' },
    { name: 'lastname', value: '[User.LastName]' },
    { name: 'email', value: '[User.Email]' },
    { name: 'cv_upload', value: '[CV Path Local Only - No Upload]' }
  ];

  const missingFields = [
    'phone (Téléphone)',
    'cover_letter (Lettre de motivation)',
    'privacy_consent (Déclaration de confidentialité)',
    'captcha (Vérification humaine)'
  ];

  return {
    url,
    compatible: true,
    filledFields,
    missingFields,
    unsupportedFields: ['Téléphone', 'Lettre de motivation', 'Déclaration de confidentialité', 'CAPTCHA'],
    status: 'Pré-remplissage possible',
    timestamp
  };
}
