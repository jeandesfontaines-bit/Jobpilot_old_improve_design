import { parseCvText } from '../src/services/cvParser';

const testCvText = `Jean Desfontaines
Senior Full Stack Engineer
Email: jean.desfontaines@email.ch
Phone: +41 79 123 45 67

Experiences
1. Tech Lead at SwissTech, Genève (2022 - Present) - Lead architecture and team of 8 engineers.
2. Senior Full Stack Developer at FinTech Geneva, Genève (2019 - 2022) - Developed real-time trading dashboards.
3. Software Engineer at InnovateCH, Lausanne (2016 - 2019) - Built microservices with Node.js and TypeScript.
4. Full Stack Developer at WebAgency SA, Lausanne (2014 - 2016) - Created custom web apps for Swiss clients.
5. Junior Developer at StartUp Vaud, Yverdon (2012 - 2014) - Assisted in React & Python development.
6. Intern at EPFL Lab, Lausanne (2011 - 2012) - Research on distributed databases.

Education
1. Master en Informatique, EPFL, Lausanne (2009 - 2011)
2. Bachelor en Systèmes d'Information, UNIGE, Genève (2006 - 2009)
3. Certificat d'Études Avancées en Cybersécurité, HEIG-VD (2018)

Skills: React, TypeScript, Node.js, Python, Docker, PostgreSQL, AWS, Git, Agile
Languages: Français (Natif), Anglais (C1 courant)`;

console.log("=== RUNNING PARSER TEST WITH JEAN DESFONTAINES CV ===");
const parsed = parseCvText(testCvText);
console.log(JSON.stringify(parsed, null, 2));
