| Test | Champs Attendus | Valeur Obtenue | Résultat |
| :--- | :--- | :--- | :--- |
| **Standard CV** | Nom, Expériences (2), Diplôme, Email, Tel, Compétences (5) | Complet (tous les champs remplis) | **Succès** |
| **Section FR** | Nom, Expériences, Diplôme, Compétences (2) | Complet | **Succès** |
| **Manquant** | Pas de Tel/Email, Nom, Exp, Diplôme | Correct | **Succès** |
| **Multiple** | 3 Expériences, 2 Formations | Correct (concaténé) | **Succès** |
| **Anglais** | Nom, Exp, Diplôme, Compétences, Langues | Correct | **Succès** |

### Analyse de fiabilité
Le parseur déterministe basé sur des heuristiques de sections (Regex sur les en-têtes) et des expressions régulières pour les données de contact (Email/Téléphone) fonctionne de manière fiable pour les formats de CV standards. Il ne génère aucune donnée, laissant les champs absents vides. Les cas ambigus sont gérés par défaut (champs vides ou concaténation).

La solution remplit les objectifs sans IA générative, sans API externe et sans aucune installation locale par l'utilisateur.
