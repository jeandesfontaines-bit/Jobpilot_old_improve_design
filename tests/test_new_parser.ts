import { parseCvText } from "../src/services/cvParser.ts";

const cvText = `
JEAN DESFONTAINES
+41 (0) 76 639 75 60
jean.desfontaines@me.com
rue des voisins 8, 1205 Genève
ACCOUNT EXECUTIVE
Nationalité Française
Résident Suisse (permis B)
01 janvier 1991 (34 ans)
PROFILE
Je suis spécialisé dans la gestion de comptes stratégiques et l’implémentation de solutions digitales.
Passionné par le développement de relations de confiance à long terme et l’optimisation de
l’expérience client, je souhaite évoluer vers un poste qui allie innovation et excellence opérationnelle.
PARCOURS & RÉALISATIONS
eEAT·Food-tech & solutions HACCP digitales·Nyon (VD), Suisse 03/2022 - 01/2025
Account manager
- Garanti un taux de rétention de 98 % sur un portefeuille de 500+ clients
- Piloté l’onboarding clients : déployé 8 000+ capteurs IoT et 1 000+ applications
- Conçu et animé 350+ formations hybrides pour 1 500+ professionnels
- Créé un centre d’aide digital de 54 articles : -35 % de tickets et 98 % de satisfaction
COMPÉTENCES
- Gestion de comptes
- Onboarding client
- Projets SaaS/IoT
- Automatisation
- Coordination équipes
- Négociation
- Analyse KPI
Urban Stay·Séjours corporate & relocation·Londres, Royaume-Uni 03/2019 - 11/2019
Responsable des opérations
- Augmenté la satisfaction client de 10 % en 5 mois via un système NPS
- Piloté les opérations de 200+ appartements (20+ prestataires, 95 % d’occupation)
LANGUES
- Français
langue maternelle
- Anglais
bilingue (C2)
Allstay·Séjours corporate & relocation·Londres, Royaume-Uni 01/2018 - 02/2019
Responsable des relations clients
- Développé un réseau de 70+ partenaires B2B (contrats, négociation, fidélisation)
- Encadré une équipe de 3 collaborateurs (recrutement, formation, suivi KPI)
- Optimisé les conversions et revenus sur 900+ réservations mensuelles
Staylike·Exploitation locative meublée ·Londres, Royaume-Uni 04/2015 - 09/2017
Co-fondateur & directeur général
- Défini et dirigé la stratégie globale : offre, vision produit, performance opérationnelle
- Structuré l’expérience client : réservation, communication, paiements
- Mis en place les processus internes et dirigé une équipe hybride
LOGICIELS
- Salesforce – Hubspot
- Asana – Slack – Notion
- Mavenoid – Zapier
- Microsoft 365
- Google Workspace
Miki Travel·Grossiste & Tour opérateur B2B·Londres, Royaume-Uni 03/2015 - 11/2016
Responsable Groupes Asie (Paris & IDF)
- Géré les relations entre 160+ hôtels parisiens et 30+ agences japonaises
- Renégocié les conditions d’annulation/modification (volumes 100 000+ CHF/mois)
Holiday Agent Nice·Gestion locative meublée ·Nice, France 01/2013 - 02/2015
Co-fondateur
- Créé et développer un portefeuille de 148+ appartements (France, Italie, Espagne)
- Négocié des accords avec Booking.com, Expedia et géré les opérations terrain
- Dirigé la stratégie marketing : site web, contenus, acquisition client
DIPLÔMES
BTS Commerce
Émile Dubois, Paris, France
Équivalent au Brevet Fédéral
09/2010 – 07/2012
BAC PRO Commerce
Pierre Lescot, Paris, France
Équivalent au CFC
09/2008 – 07/2010
BEP Comptabilité
Gustave Eiffel, Paris, France
Équivalent à l’AFP
09/2006 – 07/2008
`;

const parsed = parseCvText(cvText);
console.log(JSON.stringify(parsed, null, 2));
