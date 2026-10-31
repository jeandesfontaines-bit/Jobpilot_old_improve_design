import { readTable, mutateTable } from '../db.ts';
import { applyToJob, type CampaignFinalStatus } from './applicationEngine.ts';
import { getZurichDateString } from '../../src/services/zurichTime.ts';

export type CartItemStatus =
  | 'en_attente'
  | 'en_cours'
  | 'envoyee'
  | 'a_verifier'
  | 'intervention'
  | 'echec'
  | 'simulee'
  | 'deja_envoyee';

export interface CartItemStatusDetail {
  status: CartItemStatus;
  final_status?: CampaignFinalStatus;
  label: string;
  message?: string;
  blocked_reason?: string | null;
  cv_used?: string;
  base_ats_cv_filename?: string;
  tailored_cv_filename?: string;
  cover_letter_filename?: string;
  cv_adapted_generated?: boolean;
  letter_generated?: boolean;
  upload_success?: boolean;
  cv_uploaded?: boolean;
  letter_uploaded?: boolean;
  summary_complete?: boolean;
  fields_filled?: string[];
  submitted_unconfirmed?: boolean;
}

export interface CartItem {
  job_id: string | number;
  added_at: string;
  title: string;
  company: string;
  location?: string;
  canton?: string;
  url?: string;
  workload?: string;
  source?: string;
  last_cart_status?: CartItemStatus;
  last_cart_final_status?: CampaignFinalStatus;
  last_cart_label?: string;
  last_cart_message?: string;
  blocked_reason?: string | null;
  cv_used?: string;
  base_ats_cv_filename?: string;
  tailored_cv_filename?: string;
  cover_letter_filename?: string;
  cv_adapted_generated?: boolean;
  letter_generated?: boolean;
  upload_success?: boolean;
  cv_uploaded?: boolean;
  letter_uploaded?: boolean;
  summary_complete?: boolean;
  fields_filled?: string[];
  submitted_unconfirmed?: boolean;
}

export interface CartProcessingState {
  is_running: boolean;
  mode: 'apply' | 'simulate' | 'idle';
  total_count: number;
  current_index: number;
  current_job_id: string | number | null;
  stopped: boolean;
  stop_reason?: string;
  started_at?: string;
  finished_at?: string;
  item_statuses: Record<string | number, CartItemStatusDetail>;
}

export interface CartProcessOptions {
  simulate?: boolean;
  headless?: boolean;
  pauseMs?: number;
  force_resubmit?: boolean;
  confirm_real_send?: boolean;
  jobIds?: Array<string | number>;
}

export interface CartProcessSummary {
  success: boolean;
  mode: 'apply' | 'simulate';
  total_processed: number;
  sent_count: number;
  review_count: number;
  already_submitted_count: number;
  intervention_count: number;
  failed_count: number;
  simulated_count: number;
  stopped: boolean;
  stop_reason?: string;
  remaining_in_cart: number;
  base_ats_cv_filename?: string;
  base_ats_cv_download_url?: string;
  item_statuses: Record<string | number, CartItemStatusDetail>;
}

let activeProcessingState: CartProcessingState = {
  is_running: false,
  mode: 'idle',
  total_count: 0,
  current_index: 0,
  current_job_id: null,
  stopped: false,
  item_statuses: {}
};

let stopRequested = false;

export function getCart(): CartItem[] {
  const items = readTable('cart') || [];
  return Array.isArray(items) ? items : [];
}

export function getCartProcessingState(): CartProcessingState & { items: CartItem[] } {
  return {
    ...activeProcessingState,
    items: getCart()
  };
}

export function stopCartProcessing(): { success: boolean; message: string } {
  if (!activeProcessingState.is_running) {
    return { success: false, message: 'Aucun traitement de panier en cours' };
  }
  stopRequested = true;
  activeProcessingState.stopped = true;
  activeProcessingState.stop_reason = 'Arrêt demandé par l\'utilisateur';
  return { success: true, message: 'Arrêt du panier ordonné avec succès' };
}

export async function addToCart(jobId: string | number): Promise<{ success: boolean; error?: string; cart: CartItem[]; item?: CartItem }> {
  const jobs = readTable('jobs') || [];
  const job = jobs.find((j: any) => String(j.id) === String(jobId));
  if (!job) {
    return { success: false, error: 'Offre d\'emploi non trouvée', cart: getCart() };
  }

  // Refus d'ajout si déjà envoyée
  const applications = readTable('applications') || [];
  const alreadySent = applications.some(
    (a: any) => String(a.job_id) === String(jobId) && (a.status === 'sent' || a.status === 'Envoyée')
  );
  if (alreadySent || job.status === 'Envoyée' || job.status === 'postule') {
    return {
      success: false,
      error: 'Une offre déjà envoyée ne peut pas être ajoutée au panier',
      cart: getCart()
    };
  }

  const currentCart = getCart();
  const existing = currentCart.find((item: CartItem) => String(item.job_id) === String(jobId));
  if (existing) {
    return { success: true, cart: currentCart, item: existing };
  }

  const newItem: CartItem = {
    job_id: job.id,
    added_at: new Date().toISOString(),
    title: job.title || 'Poste sans titre',
    company: job.company || 'Entreprise non spécifiée',
    location: job.location || '',
    canton: job.canton || '',
    url: job.url || '',
    workload: job.workload || '',
    source: job.source || '',
    last_cart_status: 'en_attente',
    last_cart_label: 'En attente'
  };

  const mutation = await mutateTable('cart', (items: any[]) => {
    const list = Array.isArray(items) ? items : [];
    if (list.some((i: any) => String(i.job_id) === String(jobId))) return list;
    return [...list, newItem];
  });

  return { success: true, cart: mutation.data, item: newItem };
}

export async function removeFromCart(jobId: string | number): Promise<{ success: boolean; cart: CartItem[] }> {
  const mutation = await mutateTable('cart', (items: any[]) => {
    const list = Array.isArray(items) ? items : [];
    return list.filter((i: any) => String(i.job_id) !== String(jobId));
  });
  return { success: true, cart: mutation.data };
}

export async function clearCart(): Promise<{ success: boolean; cart: CartItem[] }> {
  const mutation = await mutateTable('cart', () => []);
  return { success: true, cart: mutation.data };
}

function checkZurichDailyQuota(): { exceeded: boolean; current: number; max: number } {
  const settings = (readTable('settings') || [])[0] || {};
  const dailyQuota = Number(settings.daily_submission_quota || settings.daily_application_limit || 5);
  const todayZurichStr = getZurichDateString();
  const applications = readTable('applications') || [];

  const currentTodayCount = applications.filter((a: any) => {
    const dateField = a.sent_at || a.created_at;
    return (a.status === 'sent' || a.status === 'Envoyée') && Boolean(dateField && getZurichDateString(dateField) === todayZurichStr);
  }).length;

  return {
    exceeded: currentTodayCount >= dailyQuota,
    current: currentTodayCount,
    max: dailyQuota
  };
}

export async function processCart(options: CartProcessOptions = {}): Promise<CartProcessSummary> {
  if (activeProcessingState.is_running) {
    throw new Error('Un traitement du panier est déjà en cours');
  }

  const isSimulate = Boolean(options.simulate);
  const isHeadless = options.headless !== false;
  const pauseMs = options.pauseMs ?? 1500;

  const allCartItems = getCart();
  const selectedIds = Array.isArray(options.jobIds) && options.jobIds.length > 0
    ? new Set(options.jobIds.map((id) => String(id)))
    : null;
  const cartItems = selectedIds
    ? allCartItems.filter((item) => selectedIds.has(String(item.job_id)))
    : allCartItems;

  if (cartItems.length === 0) {
    return {
      success: true,
      mode: isSimulate ? 'simulate' : 'apply',
      total_processed: 0,
      sent_count: 0,
      review_count: 0,
      already_submitted_count: 0,
      intervention_count: 0,
      failed_count: 0,
      simulated_count: 0,
      stopped: false,
      remaining_in_cart: allCartItems.length,
      base_ats_cv_download_url: '/api/cvs/base-ats/download',
      item_statuses: {}
    };
  }

  stopRequested = false;
  const initialStatuses: Record<string | number, CartItemStatusDetail> = {};

  for (const item of cartItems) {
    initialStatuses[item.job_id] = {
      status: 'en_attente',
      label: 'En attente'
    };
  }

  activeProcessingState = {
    is_running: true,
    mode: isSimulate ? 'simulate' : 'apply',
    total_count: cartItems.length,
    current_index: 0,
    current_job_id: null,
    stopped: false,
    started_at: new Date().toISOString(),
    item_statuses: initialStatuses
  };

  let sentCount = 0;
  let reviewCount = 0;
  let alreadySubmittedCount = 0;
  let interventionCount = 0;
  let failedCount = 0;
  let simulatedCount = 0;
  let processedCount = 0;
  let lastBaseAtsFilename: string | undefined;
  const successfullySentJobIds: Set<string | number> = new Set();

  try {
    for (let i = 0; i < cartItems.length; i++) {
      const item = cartItems[i];
      activeProcessingState.current_index = i;
      activeProcessingState.current_job_id = item.job_id;

      // 1. Contrôle arrêt utilisateur
      if (stopRequested) {
        activeProcessingState.stopped = true;
        activeProcessingState.stop_reason = 'Arrêté par l\'utilisateur';
        break;
      }

      // 2. Contrôle quota journalier Europe/Zurich (applicable uniquement en envoi réel)
      if (!isSimulate) {
        const quota = checkZurichDailyQuota();
        if (quota.exceeded) {
          activeProcessingState.stopped = true;
          activeProcessingState.stop_reason = `Quota journalier Europe/Zurich atteint (${quota.current} / ${quota.max})`;
          break;
        }
      }

      // 3. Mise à jour de l'état en cours
      activeProcessingState.item_statuses[item.job_id] = {
        status: 'en_cours',
        label: 'En cours...'
      };

      processedCount++;

      try {
        // Exécute séquentiellement applyToJob pour chaque offre sélectionnée
        const result = await applyToJob(item.job_id, {
          headless: isHeadless,
          simulate: isSimulate,
          force_resubmit: Boolean(options.force_resubmit),
          confirm_real_send: options.confirm_real_send
        });

        if (result.base_ats_cv_filename) {
          lastBaseAtsFilename = result.base_ats_cv_filename;
        }

        const isUnconfirmed = Boolean(result.submitted_unconfirmed || (result.automation_result as any)?.submitted_unconfirmed);
        const cvUsed = result.tailored_cv_filename || result.recommended_cv_id || 'CV par défaut';
        const fields = result.automation_result?.details?.fieldsFilled || [];
        const commonDetails = {
          cv_used: cvUsed,
          base_ats_cv_filename: result.base_ats_cv_filename,
          tailored_cv_filename: result.tailored_cv_filename,
          cover_letter_filename: result.cover_letter_filename,
          cv_adapted_generated: Boolean(result.cv_adapted_generated),
          letter_generated: Boolean(result.letter_generated),
          upload_success: Boolean(result.upload_success),
          cv_uploaded: Boolean(result.cv_uploaded),
          letter_uploaded: Boolean(result.letter_uploaded),
          summary_complete: Boolean(result.summary_complete),
          blocked_reason: result.blocked_reason ?? null,
          fields_filled: fields,
          submitted_unconfirmed: isUnconfirmed
        };

        if (result.final_status === 'already_submitted' || result.display_status === 'deja_envoyee') {
          alreadySubmittedCount++;
          activeProcessingState.item_statuses[item.job_id] = {
            ...commonDetails,
            status: 'deja_envoyee',
            final_status: 'already_submitted',
            label: 'Déjà soumise',
            message: result.error || result.automation_result?.message || 'Candidature déjà soumise précédemment',
            submitted_unconfirmed: false
          };
        } else if (isSimulate) {
          const simFailed =
            result.refused ||
            result.automation_result?.status === 'error' ||
            result.automation_result?.status === 'unrecognized_form' ||
            result.automation_result?.status === 'missing_field' ||
            result.automation_result?.details?.summaryComplete === false ||
            !result.cv_adapted_generated ||
            !result.letter_generated;

          if (simFailed) {
            failedCount++;
            activeProcessingState.item_statuses[item.job_id] = {
              ...commonDetails,
              status: 'echec',
              final_status: 'failed',
              label: 'Échec',
              message: result.error || result.automation_result?.message || 'Échec lors de la simulation de l’offre',
              blocked_reason: result.blocked_reason || result.error || result.automation_result?.message || 'Échec de simulation',
              submitted_unconfirmed: false
            };
          } else {
            simulatedCount++;
            reviewCount++;
            activeProcessingState.item_statuses[item.job_id] = {
              ...commonDetails,
              status: 'simulee',
              final_status: 'requires_review',
              label: 'Simulée',
              message: result.automation_result?.message || 'Formulaire prérempli sans soumission',
              submitted_unconfirmed: false
            };
          }
        } else if (result.success && result.display_status === 'envoyee') {
          sentCount++;
          successfullySentJobIds.add(item.job_id);
          activeProcessingState.item_statuses[item.job_id] = {
            ...commonDetails,
            status: 'envoyee',
            final_status: 'sent',
            label: 'Envoyée avec preuve',
            message: result.automation_result?.message || 'Candidature confirmée avec preuve',
            blocked_reason: null,
            submitted_unconfirmed: false
          };
        } else if (result.display_status === 'a_verifier') {
          reviewCount++;
          activeProcessingState.item_statuses[item.job_id] = {
            ...commonDetails,
            status: 'a_verifier',
            final_status: 'requires_review',
            label: 'À vérifier',
            message: result.automation_result?.message || 'Preuve absente ou confirmation incertaine'
          };
        } else if (result.display_status === 'intervention') {
          interventionCount++;
          activeProcessingState.item_statuses[item.job_id] = {
            ...commonDetails,
            status: 'intervention',
            final_status: 'requires_review',
            label: 'Intervention nécessaire',
            message: result.automation_result?.message || 'Champ bloquant ou CAPTCHA détecté'
          };
        } else {
          failedCount++;
          activeProcessingState.item_statuses[item.job_id] = {
            ...commonDetails,
            status: 'echec',
            final_status: 'failed',
            label: 'Échec',
            message: result.error || result.automation_result?.message || 'Échec du traitement'
          };
        }
      } catch (applyErr: any) {
        // Un échec sur une offre n'interrompt pas les suivantes
        failedCount++;
        const errReason = applyErr?.message || 'Erreur inattendue lors de la soumission';
        activeProcessingState.item_statuses[item.job_id] = {
          status: 'echec',
          final_status: 'failed',
          label: 'Échec',
          message: errReason,
          blocked_reason: errReason,
          cv_adapted_generated: false,
          letter_generated: false,
          upload_success: false,
          summary_complete: false
        };
      }

      // Mise à jour de l'item dans la table cart
      const currentStatusInfo = activeProcessingState.item_statuses[item.job_id];
      if (currentStatusInfo) {
        await mutateTable('cart', (currentItems: any[]) => {
          const list = Array.isArray(currentItems) ? currentItems : [];
          return list.map((ci) => {
            if (String(ci.job_id) === String(item.job_id)) {
              return {
                ...ci,
                last_cart_status: currentStatusInfo.status,
                last_cart_final_status: currentStatusInfo.final_status,
                last_cart_label: currentStatusInfo.label,
                last_cart_message: currentStatusInfo.message,
                blocked_reason: currentStatusInfo.blocked_reason,
                cv_used: currentStatusInfo.cv_used,
                base_ats_cv_filename: currentStatusInfo.base_ats_cv_filename,
                tailored_cv_filename: currentStatusInfo.tailored_cv_filename,
                cover_letter_filename: currentStatusInfo.cover_letter_filename,
                cv_adapted_generated: currentStatusInfo.cv_adapted_generated,
                letter_generated: currentStatusInfo.letter_generated,
                upload_success: currentStatusInfo.upload_success,
                cv_uploaded: currentStatusInfo.cv_uploaded,
                letter_uploaded: currentStatusInfo.letter_uploaded,
                summary_complete: currentStatusInfo.summary_complete,
                fields_filled: currentStatusInfo.fields_filled,
                submitted_unconfirmed: currentStatusInfo.submitted_unconfirmed
              };
            }
            return ci;
          });
        });
      }

      // 4. Pause entre chaque offre
      if (i < cartItems.length - 1 && !stopRequested) {
        await new Promise((r) => setTimeout(r, pauseMs));
      }
    }
  } finally {
    // 5. Retrait automatique du panier des seules offres envoyées avec succès
    if (!isSimulate && successfullySentJobIds.size > 0) {
      await mutateTable('cart', (currentItems: any[]) => {
        const list = Array.isArray(currentItems) ? currentItems : [];
        return list.filter((i: any) => !successfullySentJobIds.has(i.job_id));
      });
    }

    activeProcessingState.is_running = false;
    activeProcessingState.current_job_id = null;
    activeProcessingState.finished_at = new Date().toISOString();
  }

  const finalCart = getCart();

  return {
    success: true,
    mode: isSimulate ? 'simulate' : 'apply',
    total_processed: processedCount,
    sent_count: sentCount,
    review_count: reviewCount,
    already_submitted_count: alreadySubmittedCount,
    intervention_count: interventionCount,
    failed_count: failedCount,
    simulated_count: simulatedCount,
    stopped: activeProcessingState.stopped,
    stop_reason: activeProcessingState.stop_reason,
    remaining_in_cart: finalCart.length,
    base_ats_cv_filename: lastBaseAtsFilename,
    base_ats_cv_download_url: '/api/cvs/base-ats/download',
    item_statuses: { ...activeProcessingState.item_statuses }
  };
}
