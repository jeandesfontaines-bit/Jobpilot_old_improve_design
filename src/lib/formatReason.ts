/**
 * Transforme chaque motif technique ou code machine en phrase claire et lisible pour l'utilisateur.
 * Conforme aux règles d'affichage JobPilot : aucun code technique brut visible.
 */
export function formatReason(codeOrReason?: string | null): string {
  if (!codeOrReason) return '';
  const str = String(codeOrReason).trim();
  if (!str) return '';

  // 1. Salaire minimum : ex: salary_min:130000
  if (str.startsWith('salary_min:')) {
    const val = str.replace('salary_min:', '').trim();
    const num = Number(val.replace(/[^0-9]/g, ''));
    const formatted = num ? num.toLocaleString('fr-CH') + ' CHF' : val;
    return `Salaire annoncé inférieur au minimum souhaité (${formatted})`;
  }

  // 2. Canton exclu ou non retenu : ex: canton:VS, excluded_canton:VS
  if (str.startsWith('excluded_canton:') || str.startsWith('canton:')) {
    const canton = str.split(':')[1]?.trim() || '';
    return `Canton non retenu (${canton})`;
  }

  // 3. Taux d'occupation : ex: workload_max:80
  if (str.startsWith('workload_max:')) {
    const val = str.replace('workload_max:', '').trim();
    return `Taux d'occupation requis supérieur au maximum souhaité (${val}%)`;
  }

  // 4. Poste / Métier exclu : ex: excluded_role:comptable, role:comptable
  if (str.startsWith('excluded_role:') || str.startsWith('role:')) {
    const role = str.split(':')[1]?.trim() || '';
    return `Exclu par la règle de métier : « ${role} »`;
  }

  // 5. Mots-clés négatifs : ex: negative_keyword:stage
  if (str.startsWith('negative_keyword:') || str.startsWith('negative_word:') || str.startsWith('keyword:')) {
    const word = str.split(':')[1]?.trim() || '';
    return `Exclu par le mot-clé négatif : « ${word} »`;
  }

  // 6. Pertinence & critères
  if (str.includes('no_profile_match')) {
    return 'Profil candidat sans correspondance avec cette offre';
  }
  if (str.includes('insufficient_score')) {
    return 'Score de pertinence insuffisant par rapport à tes critères';
  }

  // 7. Statuts d'envoi et pipeline
  if (str === 'submitted_unconfirmed' || str.includes('submitted_unconfirmed')) {
    return 'Formulaire soumis sans page de confirmation explicite (à vérifier)';
  }
  if (str === 'missing_cv_file' || str.includes('Fichier CV configuré introuvable')) {
    return 'CV de base introuvable sur le disque';
  }
  if (str === 'missing_gdpr_consent' || str.includes('Consentement RGPD absent')) {
    return 'Autorisation RGPD non activée dans ton profil';
  }
  if (str === 'daily_quota_exceeded' || str.includes('daily_quota')) {
    return "Quota quotidien d'envois atteint pour aujourd'hui";
  }
  if (str === 'already_submitted' || str.includes('already_submitted')) {
    return 'Cette candidature a déjà été envoyée';
  }
  if (str === 'requires_review' || str.includes('requires_review')) {
    return 'Candidature nécessitant une vérification manuelle';
  }
  if (str === 'simulation_blocked' || str.includes('simulation')) {
    return 'Action simulée sans envoi réel';
  }

  // 8. Règle clé:valeur générique (uniquement si le texte ressemble à un code technique /^[a-z_]+:\S/)
  if (/^[a-z_]+:\S/.test(str) && !str.includes('http')) {
    const parts = str.split(':');
    const label = parts[0]?.trim();
    const value = parts.slice(1).join(':').trim();
    if (value) {
      return `Exclu par la règle « ${label} » (${value})`;
    }
  }

  return str;
}
