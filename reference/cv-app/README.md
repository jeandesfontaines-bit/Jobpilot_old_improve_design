# Référence architecture Cv

Fichiers copiés depuis jeandesfontaines-bit/Cv (projet LoopFlow Suisse) pour servir de référence à l'agent de candidature JobPilot.

- App.tsx : orchestration (quick apply, CV recommandé, banque de réponses, requires_review)
- types-index.ts : modèle de données (UserProfile, CVVersion, JobPosting, ReusableQuestion, AutomationTask)
- server-matcher.ts : matching offre/CV et recommendedCvId
- server-automationEngine.ts : mapping des champs formulaire, flux requires_review, soumission
- components-CVVaultView.tsx : coffre-fort de CV
- components-AutomationView.tsx : centre d'automatisation et banque de réponses

Le fichier src/components/JobDetailModal.tsx du repo Cv contient l'appel api.tailorCV(job.id, job.recommendedCvId) pour la génération de CV adapté par offre ; il n'a pas pu être copié intégralement ici mais sa logique clé est décrite dans App.tsx et automationEngine.

Consigne AI Studio : reprendre cette architecture (profil master -> CV généré par offre -> recommendedCvId -> Playwright -> soumission -> requires_review/banque de réponses) sans réinventer le modèle.