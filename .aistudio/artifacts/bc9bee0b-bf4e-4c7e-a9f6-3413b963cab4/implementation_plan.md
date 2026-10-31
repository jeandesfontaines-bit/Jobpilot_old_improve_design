# Plan d'implémentation révisé — Automatisation JobPilot (Mode Simulation Sécurisé)

## 1. État des lieux : Ce qui est déjà implémenté vs Ce qui reste à faire

Afin d'éviter tout doublon de travail et d'assurer une traçabilité rigoureuse, les composants du projet sont clairement distingués :

### Déjà implémenté et validé (Acquis du projet)
- **Scraper public Job-Room** : collecte via les requêtes du site public suisse sans clé API agence, respect des délais de courtoisie et parsing des attributs d'offres.
- **Moteur d'exclusion linguistique français (`checkJobExclusions`)** : filtrage avancé insensible aux variations grammaticales (-al/-aux, singulier/pluriel, féminin/masculin, frontières de mots entiers) validé par **45/45 tests unitaires (`npm test`)**.
- **Persistance atomique sécurisée (`safeWriteJsonAtomic`)** : protection contre la corruption de fichiers pour `jobs.json`, `applications.json`, `profile.json`, `settings.json`.
- **Tableau compact des connecteurs dans Réglages** : affichage type tableur avec statuts, compteurs, et logs dépliables sans panneau maître-détail superflu.

### Ce que ce plan révisé apporte spécifiquement (À réaliser)
1. **Statut dédié `« Simulé »` strictement séparé de `« Envoyée »`** :
   - Aucune candidature simulée ne portera le statut `Envoyée`.
   - L'identifiant de simulation (ex: `SIM-CH-XXXXXX`) est explicitement consigné comme une **référence d'audit de simulation interne**, et non un accusé de réception réel.
2. **Gestion dynamique du CV (zéro nom de fichier codé en dur)** :
   - Lecture du chemin / nom de fichier configuré dans le profil de l'utilisateur (`profile.cv_path` ou `profile.cv_filename`).
   - Vérification de l'existence physique du fichier sur le disque avant toute préparation.
   - En cas d'absence du fichier ou de CV non configuré : transition immédiate au statut `À vérifier` avec motif explicite (`"CV configuré introuvable sur le disque"`).
3. **Paramétrage temporel & Quotas rigoureux (Fuseau Europe/Zurich)** :
   - Unité unique pour l'intervalle : **minutes** (`interval_minutes`).
   - Migration avec rétrocompatibilité : conservation des réglages existants lors du renommage (conversion explicite de `auto_scrape_interval` s'il était exprimé dans une autre unité, sans écraser la valeur enregistrée).
   - **Quota quotidien par jour civil Europe/Zurich** (`daily_submission_quota`) : calculé sur la date civile suisse (`YYYY-MM-DD` en heure de Zurich via `Intl.DateTimeFormat(..., { timeZone: 'Europe/Zurich' })`), avec réinitialisation naturelle à minuit heure suisse, et non sur une fenêtre glissante de 24 heures.
   - **Limite par cycle** (`max_candidates_per_cycle`, ex: 2 candidatures max par passage du planificateur).
4. **Verrouillage absolu du mode simulation** :
   - Aucun envoi réel d'email, aucune soumission de formulaire externe, aucune activation automatique du mode réel au redémarrage ou en fin de cycle.
   - L'activation réelle restera une étape ultérieure, distincte, soumise à une validation explicite de l'utilisateur après examen du bilan.
5. **Respect strict de l'interface & de la navigation existante** :
   - Conservation stricte des 4 onglets : **Offres**, **Candidatures**, **Profil**, **Réglages**.
   - Aucun nouveau menu supérieur, aucun bandeau d'alerte permanent ou flottant.
   - Intégration des paramètres d'automatisation et des connecteurs exclusivement à l'intérieur de la vue **Réglages**.

---

## 2. Architecture Technique Côté Serveur

### A. Modèle de Données & Cycle de Vie des Statuts
Dans `src/types.ts` et `server.ts`, le statut d'une candidature suit un automate d'états reflétant des événements réels :
- `Sélectionnée` : score >= seuil paramétré, zéro exclusion active, aucune candidature préexistante pour cette annonce.
- `En préparation` : analyse des prérequis, détection du canal et des documents configurés.
- `Prête à déposer` : lettre de motivation rédigée selon le profil réel, CV dynamique vérifié et présent sur disque.
- `Dépôt en cours` : simulation du processus d'envoi et d'assemblage du paquet de candidature.
- `Simulé` *(Nouveau statut distinct)* : preuve de simulation générée, dossier archivé avec paramètres d'audit, sans contact externe.
- `À vérifier` : données indispensables manquantes (ex: CV introuvable, canal indéterminé, questions spécifiques à l'offre non couvertes).
- `Intervention nécessaire` : blocage nécessitant une décision humaine (ex: questionnaire spécifique, formulaire avec captcha obligatoire).
- `Échec` : erreur technique rencontrée durant la simulation.
*(Note : Le statut `Envoyée` est conservé dans le typage mais réservé aux futurs envois réels avec confirmation formelle).*

### B. Moteur d'Automatisation (`src/services/autonomousPipeline.ts` & `server.ts`)
- **Planificateur d'arrière-plan** :
  - `interval_minutes` : fréquence de réveil du moteur en minutes.
  - Fonction de migration `migrateSettings(rawSettings)` : si `rawSettings.interval_minutes` est absent mais `rawSettings.auto_scrape_interval` existe, conversion et conservation transparente.
  - Mémorisation de l'état `scheduler_active` (marche / pause) dans `settings.json`. Si le serveur redémarre alors que le planificateur était en pause, il reste en pause. S'il était actif, il redémarre sans re-traiter les offres déjà traitées.
  - Verrou d'exclusion mutuelle (`isCycleRunning`) interdisant les exécutions concurrentes.
- **Vérification du CV dynamique** :
  - Résolution du chemin absolu du CV via les réglages du profil.
  - Vérification via `fs.existsSync`. Si le fichier n'existe pas, l'offre ne passe jamais en dépôt mais bascule en `À vérifier` avec l'explication : `"CV configuré introuvable : [nom_du_fichier]"`.
- **Régulation du débit (Jour civil Europe/Zurich & Quotas)** :
  - Fonction utilitaire : `getZurichDateString(date: Date = new Date()): string` (produit la clé de jour `YYYY-MM-DD` dans le fuseau horaire `Europe/Zurich`).
  - Filtrage des candidatures au statut `Simulé` dont l'horodatage correspond au jour civil de Zurich courant.
  - Si le nombre dépasse ou égale `daily_submission_quota`, le cycle suspend le traitement des nouvelles candidatures pour le reste du jour civil suisse sans erreur, et attend le jour suivant.
  - Limitation du lot en cours (`max_candidates_per_cycle`).
- **Trace d'Audit de Simulation** :
  - Structure d'audit claire :
    ```json
    {
      "simulation_reference": "SIM-CH-2026-XXXXXX",
      "simulation_date_zurich": "2026-10-22 11:05:00 CET",
      "is_simulation": true,
      "disclaimer": "Trace d'audit de simulation interne - Aucun envoi réel effectué",
      "channel_detected": "email" | "formulaire_public" | "portail_externe",
      "target_recipient": "recrutement@entreprise.ch",
      "cv_attached": "mon_cv_reel.pdf",
      "selection_reasons": ["Score 88/100 >= 85", "Canton VD ciblé", "0 exclusion"],
      "blockers": []
    }
    ```

---

## 3. Interface Utilisateur & Intégration

### Navigation & Présentation
- **Strictement 4 onglets horizontaux** :
  - **Offres** (avec badge numérique du nombre total d'offres actives).
  - **Candidatures** (avec badge numérique du nombre de candidatures en cours/simulées).
  - **Profil** (sections repliables une par une, gestion du CV et des compétences).
  - **Réglages** (tableau compact des connecteurs + panneau de contrôle de l'automatisation en simulation).
- **Aucun bandeau permanent** en haut ou en bas d'écran.

### Vue Réglages (Connecteurs & Automatisation)
- Tableau type feuille de calcul des connecteurs (inchangé, épuré).
- Sous-section Automatisation autonome :
  - Interrupteur Marche/Pause du planificateur avec sauvegarde d'état persistant.
  - Champ `Intervalle (en minutes)`.
  - Champ `Limite par cycle (candidatures max)`.
  - Champ `Quota quotidien (jour civil Europe/Zurich)`.
  - Libellé d'état explicite : `Aujourd'hui (Zurich) : X / Y candidatures simulées`.
  - Badge discret : `Mode actuel : Simulation exclusive (aucun envoi réel)`.
  - Bouton d'action ponctuelle : `Exécuter un cycle de simulation maintenant`.

### Vue Candidatures (Visualisation du Pipeline & Bilan de Simulation)
- Onglet ou filtre rapide permettant d'afficher les candidatures au statut `Simulé`, `À vérifier`, `Intervention nécessaire`.
- Fiche de candidature affichant clairement :
  - Badge neutre `Simulé` avec référence d'audit `SIM-CH-...`.
  - Justification précise du choix de l'offre (pourquoi elle a été retenue).
  - Canal cible détecté et coordonnées du destinataire.
  - Documents associés (nom réel du CV vérifié sur disque et aperçu de la lettre générée).
  - Mentions d'alertes claires en cas de passage à `À vérifier` (ex: absence de fichier CV).

---

## 4. Plan de Validation & Vérification

1. **Vérification du calcul jour civil Europe/Zurich** :
   - Test unitaire vérifiant que le comptage quotidien s'appuie sur le calendrier `Europe/Zurich` et s'incrémente/se réinitialise selon la date suisse.
2. **Vérification de la persistance et de la migration de l'intervalle** :
   - Tester le chargement de paramètres avec un ancien champ d'intervalle -> vérifier la conversion propre en `interval_minutes` sans perte de valeur.
   - Tester le redémarrage du serveur et vérifier que le statut Marche/Pause est fidèlement préservé.
3. **Vérification du CV dynamique** :
   - Configurer un CV inexistant dans le profil -> lancer un cycle de simulation -> vérifier que la candidature est automatiquement orientée vers `À vérifier` avec la mention explicite.
   - Configurer un CV valide présent sur disque -> vérifier que la simulation le référence et passe à `Simulé`.
4. **Vérification des quotas et intervalles** :
   - Tester l'arrêt d'un cycle dès que `max_candidates_per_cycle` est atteint.
   - Tester le blocage si `daily_submission_quota` (jour civil Zurich) est atteint.
5. **Vérification du statut `Simulé` et absence totale d'envoi réel** :
   - Confirmer qu'aucune candidature ne reçoit le statut `Envoyée`.
   - Confirmer qu'aucun appel réseau sortant de soumission n'est exécuté.
6. **Compilation et non-régression** :
   - Exécution de `npm test` pour s'assurer que les 45 tests NLP d'exclusion restent à 100% verts, plus les nouveaux tests de dates Zurich et de quotas.
   - Exécution de `compile_applet` pour garantir l'absence d'erreurs TypeScript ou de build.
