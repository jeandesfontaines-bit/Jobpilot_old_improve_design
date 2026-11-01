import React, { useEffect, useRef, useState, useMemo } from 'react';
import {
  Search,
  RefreshCw,
  X,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Link2,
  Check,
  Building2,
  Clock,
  Inbox,
  Send,
  Eye,
  EyeOff,
  FileText,
  ShoppingCart,
  Plus,
  Trash2,
  Square,
  FlaskConical,
  Play
} from 'lucide-react';
import { Job, UserProfile, CartItem, CartStatusResponse } from '../types';
import { JobDetailModal } from './JobDetailModal';
import { FormattedDescription } from './FormattedDescription';
import { sourceLabel } from '../lib/sources';
import { employerLabel, workloadLabel, relativeDate, normalizeJobUrl } from '../lib/jobs';
import { MasterDetail, Spinner, StatusBadge, EmptyState } from './ui';
import { formatReason } from '../lib/formatReason';
import {
  cleanJobTitleForExclusion,
  getDistinctiveShortcut,
  checkRoleConflict,
  matchesExclusion
} from '../services/exclusionMatcher';
import {
  excludeRole,
  unexcludeRole,
  getUserProfile,
  autoApplyJob,
  getCart,
  addToCart,
  removeFromCart,
  clearCart,
  getCartStatus,
  processCartApi,
  stopCartApi
} from '../services/api';

interface JobsViewProps {
  jobs: Job[];
  loading: boolean;
  refreshing: boolean;
  loadError: string | null;
  onReload: () => Promise<void>;
  selectedJob: Job | null;
  onSelectJob: (job: Job) => void;
  onStatusUpdated: (status?: string) => void;
  statusFilter: 'retained' | 'excluded';
  onStatusFilterChange?: (status: 'retained' | 'excluded') => void;
  initialShowCart?: boolean;
  onCartClosed?: () => void;
}

const PAGE_SIZE = 50;

/** Extrait 4 points clés structurés pour la présentation en carte deck selon la maquette */
function extractJobKeyPoints(job: Job): string[] {
  const desc = job.description || '';
  const pts: string[] = [];

  const cleanPoint = (s: string) =>
    s
      .replace(/\\[\-_*\\>]/g, ' ')
      .replace(/\\+/g, ' ')
      .replace(/[*_#]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

  // 1. Contrat & Entrée / Disponibilité
  const contractMatch =
    desc.match(/(?:Type de contrat\s*:?\s*)([^\/\n\r]+)/i) ||
    desc.match(/(?:CDD|CDI|Remplacement|Contrat fixe)[^\.\n\r]{0,80}/i);
  const entryMatch = desc.match(/(?:Date d'entrée\s*:?\s*|Entrée\s*:?\s*)([^\/\n\r]+)/i);
  let p1 = '';
  if (contractMatch) p1 = cleanPoint(contractMatch[1] || contractMatch[0]);
  if (entryMatch) {
    const e = cleanPoint(entryMatch[1] || entryMatch[0]);
    p1 = p1 ? `${p1}. ${e.toLowerCase().startsWith('dès') ? e : `Entrée : ${e}`}` : e;
  }
  if (!p1) {
    p1 = `${job.workload ? `${workloadLabel(job.workload)} · ` : ''}${job.contract_type || 'Contrat fixe'}${
      job.location ? ` à ${job.location}` : ''
    }.`;
  }
  pts.push(p1.slice(0, 140));

  // 2. Horaires / Organisation / Environnement
  const schedMatch =
    desc.match(/(?:Horaires\s*:?\s*)([^\/\n\r]+)/i) ||
    desc.match(/(?:du lundi au [^\.\n\r]+|horaires [^\.\n\r]+|télétravail [^\.\n\r]+|remote [^\.\n\r]+)/i);
  let p2 = '';
  if (schedMatch) p2 = cleanPoint(schedMatch[1] || schedMatch[0]);
  if (!p2) {
    p2 = `Poste basé à ${job.location || job.canton || 'Suisse'} au sein de ${job.company || "l'entreprise"}.`;
  }
  pts.push(p2.slice(0, 140));

  // 3. Missions clés
  const missionHead = desc.match(
    /(?:Que serez-vous amené·e à faire\s*\??|Missions?\s*:?|Vos tâches\s*:?)[\s\S]{0,100}?\*\s+([^\*\n\r]+)/i
  );
  let p3 = '';
  if (missionHead && missionHead[1]) {
    p3 = cleanPoint(missionHead[1]);
  } else {
    const bullets = desc.split('\n').filter((l) => l.trim().startsWith('*') && l.length > 25);
    if (bullets.length > 0) p3 = cleanPoint(bullets[0].replace(/^\*\s*/, ''));
  }
  if (!p3) {
    p3 = `Missions principales et responsabilités associées au rôle de ${job.title}.`;
  }
  pts.push(p3.slice(0, 140));

  // 4. Profil / Qualifications
  const profHead = desc.match(
    /(?:Qu'attendons-nous de vous\s*\??|Profil\s*:?|Les indispensables\s*:?|Exigences\s*:?)[\s\S]{0,100}?\*\s+([^\*\n\r]+)/i
  );
  let p4 = '';
  if (profHead && profHead[1]) {
    p4 = cleanPoint(profHead[1]);
  } else {
    const cf = desc.match(/(?:CFC|Bachelor|Master|Diplôme|Expérience de [0-9]|Formation)[^\.\n\r]{10,100}/i);
    if (cf) p4 = cleanPoint(cf[0]);
  }
  if (!p4) {
    p4 = 'Formation et expérience confirmée, autonomie, rigueur et compétences professionnelles adaptées.';
  }
  pts.push(p4.slice(0, 140));

  return pts;
}

export const JobsView: React.FC<JobsViewProps> = ({
  jobs,
  loading,
  refreshing,
  loadError,
  onReload,
  selectedJob,
  onSelectJob,
  onStatusUpdated,
  statusFilter,
  onStatusFilterChange,
  initialShowCart,
  onCartClosed,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [mobileDetail, setMobileDetail] = useState(false);
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Mode d'affichage : deck de cartes (défaut selon maquette) ou liste master-detail
  const [viewMode, setViewMode] = useState<'deck' | 'list'>('deck');
  const [deckIndex, setDeckIndex] = useState(0);
  const [leavingDir, setLeavingDir] = useState<'left' | 'right' | null>(null);
  const [showFullReader, setShowFullReader] = useState(false);
  const [deckToast, setDeckToast] = useState<{ message: string; onUndo?: () => void } | null>(null);
  const deckToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = (message: string, onUndo?: () => void) => {
    if (deckToastTimer.current) clearTimeout(deckToastTimer.current);
    setDeckToast({ message, onUndo });
    deckToastTimer.current = setTimeout(() => {
      setDeckToast(null);
    }, 4500);
  };

  // Profil utilisateur pour contrôle des conflits avec postes cibles / actuels
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);

  useEffect(() => {
    void getUserProfile().then((p) => setUserProfile(p)).catch(() => {});
  }, [refreshing]);

  // État pour la croix « Pas intéressé » et l'exclusion par titre
  const [excludingJobId, setExcludingJobId] = useState<number | null>(null);
  const [exclusionDraft, setExclusionDraft] = useState('');
  const [excludingLoading, setExcludingLoading] = useState(false);
  const [undoNotification, setUndoNotification] = useState<{
    role: string;
    jobTitle: string;
    alreadyExisted?: boolean;
  } | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Nombre d'autres offres impactées par la règle en cours de frappe
  const otherImpactedCount = useMemo(() => {
    const trimmed = exclusionDraft.trim();
    if (!trimmed || trimmed.length < 2) return 0;
    return jobs.filter(
      (j) => j.id !== excludingJobId && !j.is_excluded && matchesExclusion(j.title, trimmed)
    ).length;
  }, [jobs, excludingJobId, exclusionDraft]);

  // Avertissement de recoupement avec wanted_roles ou current_title
  const roleConflict = useMemo(() => {
    return checkRoleConflict(exclusionDraft, userProfile || undefined);
  }, [exclusionDraft, userProfile]);

  // État pour la postulation en 1 clic et l'Essai
  const [applyingJob, setApplyingJob] = useState<Job | null>(null);
  const [applyHeadless, setApplyHeadless] = useState(true);
  const [isSubmittingApply, setIsSubmittingApply] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [applyFeedback, setApplyFeedback] = useState<{
    status: string;
    message: string;
  } | null>(null);
  const [trialRunningJobId, setTrialRunningJobId] = useState<number | string | null>(null);
  const [actionNotice, setActionNotice] = useState<{
    jobId: number | string;
    jobTitle: string;
    status: string;
    label: string;
    message: string;
    isSuccess: boolean;
  } | null>(null);

  const handleConfirmOneClickApply = async (force_resubmit = false) => {
    if (!applyingJob) return;
    if (force_resubmit) {
      const confirmed = window.confirm(
        "Êtes-vous sûr de vouloir forcer le renvoi de votre candidature ? Vérifiez d'abord sur le site de l'entreprise qu'elle n'est pas déjà reçue."
      );
      if (!confirmed) return;
    }
    setIsSubmittingApply(true);
    setApplyError(null);
    setApplyFeedback(null);
    try {
      const res = await autoApplyJob(applyingJob.id, { headless: applyHeadless, force_resubmit });
      if (res.refused) {
        setApplyError(res.error || 'Postulation refusée');
        return;
      }
      const autoStatus = res.automation_result?.status || '';
      const isSuccess = autoStatus === 'sent' || autoStatus === 'simulated';
      const readableReason = res.automation_result?.message || res.error || (isSuccess ? 'Candidature traitée avec succès.' : 'La postulation automatique n’a pas pu aboutir.');

      await onReload();

      if (!isSuccess) {
        setApplyError(`Échec ou revue requise (${res.display_label || autoStatus || 'erreur'}) : ${readableReason}`);
        setActionNotice({
          jobId: applyingJob.id,
          jobTitle: applyingJob.title,
          status: res.display_status || autoStatus || 'echec',
          label: res.display_label || 'À vérifier / Échec',
          message: readableReason,
          isSuccess: false
        });
        return;
      }

      setApplyFeedback({
        status: res.display_status || autoStatus,
        message: readableReason
      });
      setActionNotice({
        jobId: applyingJob.id,
        jobTitle: applyingJob.title,
        status: res.display_status || autoStatus,
        label: res.display_label || 'Envoyée avec preuve',
        message: readableReason,
        isSuccess: true
      });
      setTimeout(() => {
        setApplyingJob(null);
        setApplyFeedback(null);
      }, 2200);
    } catch (err: any) {
      const errMsg = err?.response?.data?.error || err?.message || 'Erreur lors de la postulation';
      setApplyError(errMsg);
    } finally {
      setIsSubmittingApply(false);
    }
  };

  const handleForceResubmit = async (job: Job) => {
    const confirmed = window.confirm(
      "Êtes-vous sûr de vouloir forcer le renvoi de votre candidature ? Vérifiez d'abord sur le site de l'entreprise qu'elle n'est pas déjà reçue."
    );
    if (!confirmed) return;
    try {
      const res = await autoApplyJob(job.id, { headless: applyHeadless, force_resubmit: true });
      if (res.refused) {
        setActionNotice({
          jobId: job.id,
          jobTitle: job.title,
          status: res.display_status || 'echec',
          label: res.display_label || 'Renvoi refusé',
          message: res.error || 'Renvoi refusé',
          isSuccess: false
        });
        return;
      }
      const autoStatus = res.automation_result?.status || '';
      const isSuccess = autoStatus === 'sent' || autoStatus === 'simulated';
      const readableReason = res.automation_result?.message || res.error || 'Renvoi terminé.';
      setActionNotice({
        jobId: job.id,
        jobTitle: job.title,
        status: res.display_status || autoStatus || (isSuccess ? 'envoyee' : 'echec'),
        label: res.display_label || (isSuccess ? 'Envoyée avec preuve' : 'Échec / À vérifier'),
        message: readableReason,
        isSuccess
      });
      await onReload();
    } catch (err: any) {
      setActionNotice({
        jobId: job.id,
        jobTitle: job.title,
        status: 'echec',
        label: 'Erreur',
        message: err?.response?.data?.error || err?.message || 'Erreur lors du renvoi',
        isSuccess: false
      });
    }
  };

  const handleCartForceResubmit = async (jobId: string | number) => {
    const confirmed = window.confirm(
      "Êtes-vous sûr de vouloir forcer le renvoi de votre candidature ? Vérifiez d'abord sur le site de l'entreprise qu'elle n'est pas déjà reçue."
    );
    if (!confirmed) return;
    try {
      const res = await autoApplyJob(jobId, { headless: cartHeadless, force_resubmit: true });
      if (res.refused) {
        alert(res.error || 'Renvoi refusé');
        return;
      }
      await onReload();
      await loadCart();
      const status = await getCartStatus();
      setCartStatus(status);
    } catch (err: any) {
      alert(err?.response?.data?.error || err?.message || 'Erreur lors du renvoi');
    }
  };

  const handleRunTrial = async (job: Job) => {
    setTrialRunningJobId(job.id);
    setActionNotice(null);
    try {
      const res = await autoApplyJob(job.id, { headless: applyHeadless, simulate: true });
      if (res.refused) {
        setActionNotice({
          jobId: job.id,
          jobTitle: job.title,
          status: res.display_status || 'echec',
          label: res.display_label || 'Essai refusé',
          message: res.error || 'Essai refusé',
          isSuccess: false
        });
        return;
      }
      const autoStatus = res.automation_result?.status || '';
      const isSimulatedSuccess = autoStatus === 'simulated' || autoStatus === 'sent';
      const readableReason = res.automation_result?.message || res.error || (
        isSimulatedSuccess
          ? 'Essai réussi : formulaire atteint, champs préremplis et CV positionné sans soumission.'
          : "L'essai n'a pas pu atteindre ou préremplir le formulaire de candidature."
      );
      await onReload();
      setActionNotice({
        jobId: job.id,
        jobTitle: job.title,
        status: res.display_status || autoStatus || (isSimulatedSuccess ? 'simulee' : 'echec'),
        label: isSimulatedSuccess ? (res.display_label || 'Essai réussi (Simulée)') : `Essai non concluant (${res.display_label || autoStatus || 'Échec'})`,
        message: readableReason,
        isSuccess: isSimulatedSuccess
      });
    } catch (err: any) {
      setActionNotice({
        jobId: job.id,
        jobTitle: job.title,
        status: 'echec',
        label: "Erreur lors de l'essai",
        message: err?.response?.data?.error || err?.message || "Erreur lors de l'essai",
        isSuccess: false
      });
    } finally {
      setTrialRunningJobId(null);
    }
  };

  // État pour le Panier (Fonction 3)
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [selectedCartJobIds, setSelectedCartJobIds] = useState<Array<string | number>>([]);
  const [showCartModal, setShowCartModal] = useState(false);
  const [cartRunning, setCartRunning] = useState(false);
  const [cartHeadless, setCartHeadless] = useState(true);
  const [cartStatus, setCartStatus] = useState<CartStatusResponse | null>(null);
  const [cartNotification, setCartNotification] = useState<string | null>(null);

  useEffect(() => {
    setSelectedCartJobIds((prev) => {
      const currentIds = cartItems.map((i) => i.job_id);
      if (prev.length === 0) return currentIds;
      const kept = prev.filter((id) => currentIds.some((cid) => String(cid) === String(id)));
      return kept.length > 0 ? kept : currentIds;
    });
  }, [cartItems]);

  const toggleCartItemSelection = (jobId: string | number) => {
    setSelectedCartJobIds((prev) =>
      prev.some((id) => String(id) === String(jobId))
        ? prev.filter((id) => String(id) !== String(jobId))
        : [...prev, jobId]
    );
  };

  useEffect(() => {
    if (initialShowCart) {
      setShowCartModal(true);
    }
  }, [initialShowCart]);

  const handleCloseCart = () => {
    if (!cartRunning) {
      setShowCartModal(false);
      onCartClosed?.();
    }
  };

  const loadCart = async () => {
    try {
      const res = await getCart();
      if (res.success && Array.isArray(res.items)) {
        setCartItems(res.items);
      }
    } catch {}
  };

  useEffect(() => {
    void loadCart();
  }, [refreshing]);

  // Polling automatique de l'état du panier pendant l'exécution
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    if (cartRunning) {
      timer = setInterval(async () => {
        try {
          const status = await getCartStatus();
          setCartStatus(status);
          if (Array.isArray(status.items)) {
            setCartItems(status.items);
          }
          if (!status.is_running) {
            setCartRunning(false);
            await onReload();
            await loadCart();
          }
        } catch {}
      }, 800);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [cartRunning]);

  const handleAddToCart = async (jobId: number | string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      const res = await addToCart(jobId);
      if (res.success) {
        setCartItems(res.cart);
        setCartNotification(null);
      } else {
        alert(res.error || "Impossible d'ajouter cette offre au panier");
      }
    } catch (err: any) {
      const msg = err?.response?.data?.error || err?.message || "Erreur lors de l'ajout au panier";
      alert(msg);
    }
  };

  const handleRemoveFromCart = async (jobId: number | string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      const res = await removeFromCart(jobId);
      if (res.success) {
        setCartItems(res.cart);
      }
    } catch {}
  };

  const handleClearCart = async () => {
    if (!confirm('Voulez-vous vraiment vider tout le panier ?')) return;
    try {
      const res = await clearCart();
      if (res.success) {
        setCartItems([]);
      }
    } catch {}
  };

  const handleStartCartProcessing = async (simulate: boolean) => {
    const targetIds = selectedCartJobIds.length > 0
      ? selectedCartJobIds
      : cartItems.map((i) => i.job_id);
    if (targetIds.length === 0) return;

    if (!simulate) {
      const confirmed = window.confirm(
        `Confirmez-vous l'envoi réel des candidatures pour ${targetIds.length} offre(s) sélectionnée(s) dans le panier ?`
      );
      if (!confirmed) return;
    }

    try {
      setCartRunning(true);
      setCartNotification(null);
      await processCartApi({
        simulate,
        headless: cartHeadless,
        wait: false,
        confirm_real_send: !simulate ? true : undefined,
        jobIds: targetIds
      });
    } catch (err: any) {
      setCartRunning(false);
      const msg = err?.response?.data?.error || err?.message || 'Erreur lors du démarrage';
      alert(msg);
    }
  };

  const handleStopCartProcessing = async () => {
    try {
      await stopCartApi();
      const status = await getCartStatus();
      setCartStatus(status);
    } catch {}
  };

  const isJobInCart = (jobId: number | string) => {
    return cartItems.some((item) => String(item.job_id) === String(jobId));
  };

  const isJobAlreadySent = (job: Job) => {
    return (
      (job.status as string) === 'Envoyée' ||
      (job.status as string) === 'postule' ||
      job.last_application_result?.status === 'sent' ||
      job.last_application_result?.status === 'already_submitted'
    );
  };

  const handleStartExclusion = (job: Job, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const cleaned = cleanJobTitleForExclusion(job.title);
    setExcludingJobId(job.id);
    setExclusionDraft(cleaned);
  };

  const handleConfirmExclusion = async (job: Job, roleInput: string) => {
    const roleToExclude = roleInput.trim();
    if (!roleToExclude) return;
    setExcludingLoading(true);
    try {
      const res = await excludeRole(roleToExclude);
      setExcludingJobId(null);
      setExclusionDraft('');
      await onReload();

      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
      undoTimerRef.current = setTimeout(() => {
        setUndoNotification(null);
      }, 6000);

      setUndoNotification({
        role: roleToExclude,
        jobTitle: job.title,
        alreadyExisted: Boolean(res.already_existed),
      });
    } catch (err: any) {
      console.error("Erreur lors de l'exclusion:", err);
    } finally {
      setExcludingLoading(false);
    }
  };

  const handleUndoExclusion = async (role: string, alreadyExisted?: boolean) => {
    if (alreadyExisted) {
      setUndoNotification(null);
      return;
    }
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    setUndoNotification(null);
    try {
      await unexcludeRole(role);
      await onReload();
    } catch (err: any) {
      console.error("Erreur lors de l'annulation de l'exclusion:", err);
    }
  };

  const retainedCount = useMemo(() => jobs.filter(j => !j.is_excluded).length, [jobs]);
  const excludedCount = useMemo(() => jobs.filter(j => j.is_excluded).length, [jobs]);

  // Filtrage principal (retained vs excluded)
  const baseJobs = useMemo(() => {
    return jobs.filter((job) => (statusFilter === 'excluded' ? job.is_excluded : !job.is_excluded));
  }, [jobs, statusFilter]);

  // Filtrage par recherche texte
  const filteredJobs = useMemo(() => {
    if (!searchQuery.trim()) return baseJobs;
    const q = searchQuery.toLowerCase();
    return baseJobs.filter((job) =>
      (job.title || '').toLowerCase().includes(q) ||
      (job.company || '').toLowerCase().includes(q) ||
      (job.location || '').toLowerCase().includes(q) ||
      (job.canton || '').toLowerCase().includes(q)
    );
  }, [baseJobs, searchQuery]);

  const shownJobs = filteredJobs.slice(0, visible);

  // Gestion du job actif et de la navigation
  const currentIndex = Math.max(0, filteredJobs.findIndex((job) => job.id === selectedJob?.id));
  const currentActiveJob = filteredJobs[currentIndex] || null;
  const canPrevious = !!currentActiveJob && currentIndex > 0;
  const canNext = !!currentActiveJob && currentIndex < filteredJobs.length - 1;

  const goTo = (index: number) => {
    const nextJob = filteredJobs[index];
    if (!nextJob) return;
    setVisible((value) => Math.max(value, Math.ceil((index + 1) / PAGE_SIZE) * PAGE_SIZE));
    onSelectJob(nextJob);
  };

  useEffect(() => {
    if (filteredJobs.length && (!selectedJob || !filteredJobs.some((job) => job.id === selectedJob.id))) {
      onSelectJob(filteredJobs[0]);
    }
  }, [filteredJobs, selectedJob, onSelectJob]);

  // Raccourcis clavier (flèches haut/bas)
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || document.querySelector('dialog[open]')) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.closest('button, input, select, textarea, a, [role="listbox"]') || target.isContentEditable)) return;
      if (event.key === 'ArrowDown' && canNext) {
        event.preventDefault();
        goTo(currentIndex + 1);
      }
      if (event.key === 'ArrowUp' && canPrevious) {
        event.preventDefault();
        goTo(currentIndex - 1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [filteredJobs, currentIndex, canPrevious, canNext]);

  useEffect(() => {
    setDeckIndex(0);
  }, [statusFilter, searchQuery]);

  useEffect(() => {
    if (deckIndex >= filteredJobs.length && filteredJobs.length > 0) {
      setDeckIndex(filteredJobs.length - 1);
    }
  }, [filteredJobs.length, deckIndex]);

  const validDeckIndex = Math.min(Math.max(0, deckIndex), Math.max(0, filteredJobs.length - 1));
  const currentDeckJob = filteredJobs[validDeckIndex] || null;

  const handleDeckPass = () => {
    if (filteredJobs.length === 0) return;
    const prevIdx = validDeckIndex;
    setLeavingDir('left');
    setTimeout(() => {
      setDeckIndex((cur) => (cur + 1 < filteredJobs.length ? cur + 1 : 0));
      setLeavingDir(null);
      showToast('Offre passée', () => {
        setDeckIndex(prevIdx);
      });
    }, 220);
  };

  const handleDeckAddToCart = async () => {
    if (!currentDeckJob) return;
    const targetJob = currentDeckJob;
    await handleAddToCart(targetJob.id);
    setLeavingDir('right');
    setTimeout(() => {
      setDeckIndex((cur) => (cur + 1 < filteredJobs.length ? cur + 1 : 0));
      setLeavingDir(null);
      showToast(`« ${targetJob.title.slice(0, 32)} » ajouté au panier`);
    }, 220);
  };

  useEffect(() => {
    if (viewMode !== 'deck') return;
    const onDeckKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const targetTag = (e.target as HTMLElement)?.tagName;
      if (targetTag === 'INPUT' || targetTag === 'TEXTAREA') return;
      if (excludingJobId !== null || applyingJob !== null || showCartModal) return;

      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handleDeckPass();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        void handleDeckAddToCart();
      } else if (e.key === 'Enter') {
        if (!showFullReader && currentDeckJob) {
          e.preventDefault();
          setApplyingJob(currentDeckJob);
          setApplyError(null);
          setApplyFeedback(null);
        }
      } else if (e.key === ' ' && !showFullReader && currentDeckJob) {
        e.preventDefault();
        setShowFullReader(true);
      } else if (e.key === 'Escape' && showFullReader) {
        e.preventDefault();
        setShowFullReader(false);
      }
    };
    window.addEventListener('keydown', onDeckKey);
    return () => window.removeEventListener('keydown', onDeckKey);
  }, [viewMode, currentDeckJob, validDeckIndex, filteredJobs.length, showFullReader, excludingJobId, applyingJob, showCartModal]);

  const copyLink = async () => {
    const validUrl = normalizeJobUrl(currentActiveJob?.url);
    if (!validUrl) return;
    try {
      await navigator.clipboard.writeText(validUrl);
      setCopied(true);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  // ── COLONNE GAUCHE (LISTE D'OFFRES UNIFIÉE) ──
  const list = (
    <div className="flex-1 flex flex-col min-h-0 bg-white">
      {/* Recherche & Contrôles */}
      <div className="p-3 border-b border-zinc-100 space-y-2 bg-zinc-50/50">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="inline-flex items-center p-0.5 bg-zinc-200/70 rounded-lg">
            <button
              type="button"
              onClick={() => onStatusFilterChange?.('retained')}
              className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${
                statusFilter === 'retained'
                  ? 'bg-white text-zinc-900 shadow-2xs'
                  : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              <span>Retenues</span>
              <span className="ml-1.5 text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-zinc-100 text-zinc-700">
                {retainedCount}
              </span>
            </button>
            <button
              type="button"
              onClick={() => onStatusFilterChange?.('excluded')}
              className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${
                statusFilter === 'excluded'
                  ? 'bg-white text-rose-900 shadow-2xs'
                  : 'text-zinc-600 hover:text-rose-900'
              }`}
            >
              <span>Exclues</span>
              <span className="ml-1.5 text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-rose-100 text-rose-700">
                {excludedCount}
              </span>
            </button>
          </div>

          <div className="flex items-center gap-1.5">
            <button type="button" onClick={() => { setDeckIndex(currentIndex); setMobileDetail(false); setShowFullReader(false); setViewMode('deck'); }} className="inline-flex h-8 shrink-0 items-center gap-1 rounded-md px-2 text-xs font-medium text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900" aria-label="Revenir à la vue Cartes">
              <ChevronLeft aria-hidden="true" className="size-3.5" /> Cartes
            </button>
            {/* Bouton Panier avec compteur visible */}
            <button
              type="button"
              onClick={() => setShowCartModal(true)}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold transition-all ${
                cartItems.length > 0
                  ? 'bg-zinc-900 text-white shadow-xs hover:bg-zinc-800'
                  : 'text-zinc-600 hover:text-zinc-900 bg-zinc-200/60 hover:bg-zinc-200'
              }`}
              title="Ouvrir le panier de candidatures"
            >
              <ShoppingCart className="w-3.5 h-3.5" />
              <span>Panier</span>
              <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full ${
                cartItems.length > 0 ? 'bg-zinc-700 text-white' : 'bg-zinc-300/80 text-zinc-800'
              }`}>
                {cartItems.length}
              </span>
            </button>

            <button
              type="button"
              onClick={onReload}
              disabled={refreshing}
              className="p-1.5 text-zinc-500 hover:text-zinc-900 rounded-md hover:bg-zinc-200/60 transition-colors"
              title="Rafraîchir la liste"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>



        {/* Message de résultat d'Essai ou de Postulation (succès ou échec explicite) */}
        {actionNotice && (
          <div
            className={`p-2.5 rounded-lg border shadow-xs flex items-start justify-between gap-2.5 text-xs animate-in fade-in duration-150 ${
              actionNotice.isSuccess
                ? 'bg-emerald-50 border-emerald-200 text-emerald-950'
                : 'bg-rose-50 border-rose-200 text-rose-950'
            }`}
          >
            <div className="space-y-1 min-w-0 flex-1">
              <div className="flex items-center gap-1.5 font-bold flex-wrap">
                <StatusBadge status={actionNotice.status} />
                <span>{actionNotice.label}</span>
                <span className="text-[11px] font-normal opacity-80 truncate">
                  — {actionNotice.jobTitle}
                </span>
              </div>
              <p className="text-[11px] leading-snug break-words">
                {actionNotice.message}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setActionNotice(null)}
              className="text-zinc-400 hover:text-zinc-700 p-0.5 shrink-0"
              title="Fermer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Message de confirmation ou d'annulation d'exclusion */}
        {undoNotification && (
          <div className="p-2.5 bg-zinc-900 text-white rounded-lg shadow-md flex items-center justify-between gap-3 text-xs animate-in fade-in duration-150">
            <div className="flex items-center gap-1.5 truncate">
              <span className={`w-2 h-2 rounded-full shrink-0 ${undoNotification.alreadyExisted ? 'bg-amber-400' : 'bg-rose-400'}`} />
              <span className="truncate">
                {undoNotification.alreadyExisted ? (
                  <>Règle <strong>« {undoNotification.role} »</strong> déjà présente dans vos exclusions.</>
                ) : (
                  <>Règle <strong>« {undoNotification.role} »</strong> ajoutée aux exclusions.</>
                )}
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {!undoNotification.alreadyExisted && (
                <button
                  type="button"
                  onClick={() => void handleUndoExclusion(undoNotification.role, undoNotification.alreadyExisted)}
                  className="px-2.5 py-1 bg-white text-zinc-900 rounded font-bold text-[11px] hover:bg-zinc-100 transition-colors"
                >
                  Annuler
                </button>
              )}
              <button
                type="button"
                onClick={() => setUndoNotification(null)}
                className="text-zinc-400 hover:text-white"
                title="Fermer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Liste des cartes d'offres */}
      <div className="flex-1 overflow-y-auto divide-y divide-zinc-100">
        {loading ? (
          <div className="py-12 flex justify-center">
            <Spinner label="Chargement des offres..." />
          </div>
        ) : filteredJobs.length === 0 ? (
          <EmptyState
            icon={Inbox}
            title="Aucune offre trouvée"
            description="Modifie ta recherche pour voir d'autres résultats."
          />
        ) : (
          <>
            {shownJobs.map((job, idx) => {
              const isSelected = currentActiveJob?.id === job.id;
              const companyName = employerLabel(job);
              const dateStr = relativeDate(job.published_at) || "aujourd'hui";
              const workload = workloadLabel(job.workload);

              return (
                <div
                  key={`${job.id}-${idx}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    onSelectJob(job);
                    setMobileDetail(true);
                  }}
                  onKeyDown={(e) => {
                    if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
                      e.preventDefault();
                      onSelectJob(job);
                      setMobileDetail(true);
                    }
                  }}
                  className={`w-full text-left px-4 py-4 transition-colors block relative cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-zinc-400 ${
                    isSelected
                      ? 'bg-zinc-100/70'
                      : 'hover:bg-zinc-50/50'
                  }`}
                >
                  <div className="space-y-1.5">
                    <div className="grid grid-cols-[minmax(0,1fr)_96px] items-start gap-x-2 gap-y-1">
                      <h3 className="min-w-0 break-words text-sm font-medium leading-5 text-zinc-900 line-clamp-2">{job.title}</h3>
                      <div className="flex shrink-0 items-center gap-2" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                        {!job.is_excluded && <>
                          <button type="button" disabled={isJobAlreadySent(job)} onClick={(e) => void (isJobInCart(job.id) ? handleRemoveFromCart(job.id, e) : handleAddToCart(job.id, e))}
                            aria-label={isJobAlreadySent(job) ? 'Candidature déjà envoyée' : isJobInCart(job.id) ? 'Retirer du panier' : 'Ajouter au panier'}
                            aria-pressed={isJobInCart(job.id)}
                            title={isJobAlreadySent(job) ? 'Déjà envoyée' : isJobInCart(job.id) ? 'Retirer du panier' : 'Ajouter au panier'}
                            className={`grid size-11 shrink-0 place-items-center rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 disabled:opacity-40 ${isJobInCart(job.id) ? 'text-emerald-700 hover:bg-emerald-50' : 'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900'}`}>
                            {isJobInCart(job.id) || isJobAlreadySent(job) ? <Check aria-hidden="true" className="size-[18px]" /> : <Plus aria-hidden="true" className="size-[18px]" />}
                          </button>
                          <button type="button" onClick={(e) => handleStartExclusion(job, e)} aria-label={`Exclure le métier : ${job.title}`} title="Exclure ce métier"
                            className="grid size-11 shrink-0 place-items-center rounded-lg text-zinc-400 transition-colors hover:bg-rose-50 hover:text-rose-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400">
                            <X aria-hidden="true" className="size-[18px]" />
                          </button>
                        </>}
                      </div>
                      <p className="col-span-2 min-w-0 break-words text-xs leading-5 text-zinc-500">{companyName}</p>
                      <p className="min-w-0 text-xs leading-5 text-zinc-500">{[job.canton || job.location || 'Lieu non précisé', workload].filter(Boolean).join(' · ')}</p>
                      <span className="text-right text-xs leading-5 text-zinc-400">{dateStr}</span>
                    </div>

                    {/* Ligne 3 (si présent) : StatusBadge du dernier envoi & motif complet lisible */}
                    {(job.last_application_result || (job.is_excluded && job.exclusion_reason)) && (
                      <div className="pt-0.5 space-y-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {job.last_application_result?.display_status && (
                            <StatusBadge status={job.last_application_result.display_status} />
                          )}
                          {job.is_excluded && job.exclusion_reason && (
                            <span className="inline-block text-[10px] font-semibold text-rose-800 bg-rose-50 border border-rose-200/80 px-2 py-0.5 rounded truncate max-w-full">
                              {formatReason(job.exclusion_reason)}
                            </span>
                          )}
                        </div>
                        {job.last_application_result?.message && (
                          <p
                            className={`text-[11px] leading-snug break-words rounded px-2 py-1 border ${
                              job.last_application_result.status === 'sent' || job.last_application_result.status === 'simulated'
                                ? 'text-emerald-900 bg-emerald-50/70 border-emerald-200/70'
                                : 'text-rose-900 bg-rose-50/80 border-rose-200/80 font-medium'
                            }`}
                          >
                            {job.last_application_result.message}
                          </p>
                        )}
                      </div>
                    )}

                    {/* Alerte & bouton Renvoyer quand même si soumission non confirmée */}
                    {(job.last_application_result?.submitted_unconfirmed || job.last_application_result?.message?.includes('peut-être déjà partie')) && (
                      <div
                        className="mt-1.5 p-2 bg-amber-50 border border-amber-200 rounded text-[11px] text-amber-900 flex items-center justify-between gap-2"
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                      >
                        <span>La candidature est peut-être déjà partie. Vérifie sur le site de l'entreprise avant de renvoyer.</span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleForceResubmit(job);
                          }}
                          className="shrink-0 px-2 py-0.5 text-[10px] font-bold text-amber-950 bg-amber-200 hover:bg-amber-300 border border-amber-300 rounded transition-colors"
                        >
                          Renvoyer quand même
                        </button>
                      </div>
                    )}

                    {/* Formulaire d'exclusion rapide avec champ prérempli et raccourcissable */}
                    {excludingJobId === job.id && (
                      <div
                        className="mt-2.5 p-2.5 bg-amber-50/95 border border-amber-300 rounded-lg space-y-2 shadow-xs cursor-default"
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-center justify-between gap-1 text-[11px] font-bold text-amber-950">
                          <span>Exclure ce métier (« Ce que je ne veux pas »)</span>
                          <button
                            type="button"
                            onClick={() => setExcludingJobId(null)}
                            className="p-0.5 text-zinc-400 hover:text-zinc-600 rounded"
                            title="Fermer"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <input
                            type="text"
                            value={exclusionDraft}
                            onChange={(e) => setExclusionDraft(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                void handleConfirmExclusion(job, exclusionDraft);
                              } else if (e.key === 'Escape') {
                                setExcludingJobId(null);
                              }
                            }}
                            autoFocus
                            placeholder="Intitulé à exclure..."
                            className="min-w-0 basis-full sm:basis-auto flex-1 px-3 py-2 text-sm bg-white border border-amber-300 rounded-md focus:outline-none focus:ring-1 focus:ring-amber-500 text-zinc-900 font-medium"
                          />
                          <button
                            type="button"
                            onClick={() => void handleConfirmExclusion(job, exclusionDraft)}
                            disabled={!exclusionDraft.trim() || excludingLoading}
                            className="px-2.5 py-1 text-xs font-semibold bg-rose-600 text-white rounded-md hover:bg-rose-700 transition-colors disabled:opacity-50 shrink-0"
                          >
                            Exclure
                          </button>
                          <button
                            type="button"
                            onClick={() => setExcludingJobId(null)}
                            className="px-2 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-100 rounded-md shrink-0"
                          >
                            Annuler
                          </button>
                        </div>

                        {/* Raccourci suggéré (deux mots les plus distinctifs) & impact */}
                        <div className="flex flex-wrap items-center justify-between gap-1 text-[11px] pt-0.5">
                          {getDistinctiveShortcut(job.title) && (
                            <span className="text-amber-900">
                              Raccourci suggéré :{' '}
                              <button
                                type="button"
                                onClick={() => setExclusionDraft(getDistinctiveShortcut(job.title))}
                                className="underline font-bold text-amber-950 hover:text-rose-700 transition-colors"
                                title="Cliquer pour appliquer ce raccourci"
                              >
                                « {getDistinctiveShortcut(job.title)} »
                              </button>
                            </span>
                          )}
                          <span className="font-semibold text-amber-900 ml-auto">
                            Cette règle masquera {otherImpactedCount} autre{otherImpactedCount > 1 ? 's' : ''} offre{otherImpactedCount > 1 ? 's' : ''}
                          </span>
                        </div>

                        {/* Avertissement si la règle recoupe wanted_roles ou current_title */}
                        {roleConflict.hasConflict && (
                          <div className="p-2 bg-rose-100/90 border border-rose-300 rounded text-[11px] text-rose-900 font-semibold flex items-center gap-1.5 animate-in fade-in duration-100">
                            <span>⚠️</span>
                            <span>
                              Attention : cette règle recoupe {roleConflict.conflictedWith} !
                            </span>
                          </div>
                        )}
                      </div>
                    )}


                  </div>
                </div>
              );
            })}

            {filteredJobs.length > visible && (
              <div className="p-3 text-center bg-white border-t border-zinc-100">
                <button
                  type="button"
                  onClick={() => setVisible((v) => v + PAGE_SIZE)}
                  className="w-full py-2 px-3 text-xs font-semibold text-zinc-700 bg-zinc-100 hover:bg-zinc-200/80 rounded-lg transition-colors"
                >
                  Afficher plus ({filteredJobs.length - visible} restantes)
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );

  // ── COLONNE DROITE (DÉTAIL DE L'OFFRE) ──
  const detail = currentActiveJob ? (
    <div className="flex-1 flex flex-col min-h-0 bg-white">
      {/* Barre d'outils supérieure dans le détail */}
      <div className="shrink-0 px-4 sm:px-8 py-2.5 border-b border-zinc-100 flex items-center justify-between gap-2 bg-white">
        <div className="flex items-center gap-1 text-xs text-zinc-500">
          <button
            type="button"
            disabled={!canPrevious || loading}
            onClick={() => goTo(currentIndex - 1)}
            className="p-1 rounded hover:bg-zinc-100 disabled:opacity-30 text-zinc-700"
            title="Offre précédente (Flèche haut)"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="font-mono text-[11px] px-1">
            {currentIndex + 1} / {filteredJobs.length}
          </span>
          <button
            type="button"
            disabled={!canNext || loading}
            onClick={() => goTo(currentIndex + 1)}
            className="p-1 rounded hover:bg-zinc-100 disabled:opacity-30 text-zinc-700"
            title="Offre suivante (Flèche bas)"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-2">
          {currentActiveJob.url && (
            <button
              type="button"
              onClick={copyLink}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-zinc-200 text-xs text-zinc-700 bg-white hover:bg-zinc-50 transition-colors"
              title="Copier le lien de l'offre"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Link2 className="w-3.5 h-3.5 text-zinc-400" />}
              <span>{copied ? 'Copié !' : 'Copier le lien'}</span>
            </button>
          )}
        </div>
      </div>

      <JobDetailModal
        key={currentActiveJob.id}
        panel
        job={currentActiveJob}
        onStatusUpdated={onStatusUpdated}
      />
    </div>
  ) : (
    <div className="h-full flex items-center justify-center p-8 text-center text-zinc-400 text-xs">
      Sélectionnez une offre dans la liste pour afficher les détails.
    </div>
  );

  return (
    <div className="flex-1 min-h-0 min-w-0 flex flex-col overflow-hidden bg-transparent relative">
      {viewMode === 'deck' ? (
        <div className="flex-1 min-h-0 min-w-0 flex flex-col overflow-y-auto custom-scrollbar bg-[#eeece7] p-4 sm:p-6 lg:p-8">
          {/* Barre de contexte supérieure */}
          <div className="w-full max-w-[28.5rem] mx-auto mb-4 sm:mb-6 flex flex-wrap items-center justify-between gap-2 text-xs text-[#a1a1a9] px-1 select-none">
            {/* Gauche : 1 / 163 + flèches */}
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="font-semibold text-[#111114]">
                {filteredJobs.length > 0 ? `${validDeckIndex + 1} / ${filteredJobs.length}` : '0 / 0'}
              </span>
              {filteredJobs.length > 1 && (
                <div className="inline-flex items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => setDeckIndex((prev) => Math.max(0, prev - 1))}
                    disabled={validDeckIndex <= 0}
                    className="p-1 rounded hover:bg-black/5 disabled:opacity-30 disabled:pointer-events-none text-zinc-700 transition-colors cursor-pointer"
                    title="Précédente (Flèche gauche)"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeckIndex((prev) => Math.min(filteredJobs.length - 1, prev + 1))}
                    disabled={validDeckIndex >= filteredJobs.length - 1}
                    className="p-1 rounded hover:bg-black/5 disabled:opacity-30 disabled:pointer-events-none text-zinc-700 transition-colors cursor-pointer"
                    title="Suivante (Flèche droite)"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>

            {/* Centre : Retenues / Exclues */}
            <div className="inline-flex items-center p-0.5 rounded-lg bg-black/5 text-[11px] font-medium shrink-0">
              <button
                type="button"
                onClick={() => onStatusFilterChange?.('retained')}
                className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                  statusFilter === 'retained'
                    ? 'bg-white text-zinc-950 shadow-2xs font-bold'
                    : 'text-zinc-600 hover:text-zinc-950'
                }`}
              >
                Retenues ({retainedCount})
              </button>
              <button
                type="button"
                onClick={() => onStatusFilterChange?.('excluded')}
                className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                  statusFilter === 'excluded'
                    ? 'bg-white text-rose-950 shadow-2xs font-bold'
                    : 'text-zinc-600 hover:text-rose-900'
                }`}
              >
                Exclues ({excludedCount})
              </button>
            </div>

            {/* Droite : switcher mode vue */}
            <div className="flex items-center shrink-0">
              <div className="inline-flex items-center p-0.5 rounded-lg bg-black/5 text-[11px] font-medium">
                <button
                  type="button"
                  onClick={() => setViewMode('deck')}
                  className="px-2 py-1 rounded-md transition-all cursor-pointer bg-white text-zinc-950 shadow-2xs font-semibold"
                  title="Vue Carte (défaut)"
                >
                  Carte
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('list')}
                  className="px-2 py-1 rounded-md transition-all cursor-pointer text-zinc-600 hover:text-zinc-950"
                  title="Vue Liste"
                >
                  Liste
                </button>
              </div>
            </div>
          </div>

          {/* Central Deck Stage */}
          <div className="w-full max-w-[28.5rem] mx-auto my-auto flex flex-col justify-center">
            {loading ? (
              <div className="py-20 flex justify-center">
                <Spinner label="Chargement des offres..." />
              </div>
            ) : filteredJobs.length === 0 ? (
              <div className="bg-white rounded-2xl p-8 shadow-md">
                <EmptyState
                  icon={Inbox}
                  title="Aucune offre trouvée"
                  description="Modifie ta recherche ou bascule sur les offres exclues pour voir d'autres résultats."
                />
              </div>
            ) : currentDeckJob ? (
              <>
                <article
                  className={`jobpilot-card p-6 sm:p-8 relative ${
                    leavingDir === 'left'
                      ? 'card-leaving-left'
                      : leavingDir === 'right'
                      ? 'card-leaving-right'
                      : ''
                  }`}
                >
                  {/* Titre avec effet de survol strike-through + bouton exclure */}
                  <div className="card-title-wrap group relative inline-block max-w-full">
                    <h1 className="text-xl sm:text-[1.375rem] font-bold text-[#111114] leading-snug tracking-tight mb-2">
                      {currentDeckJob.title}
                    </h1>
                    {!currentDeckJob.is_excluded && (
                      <button
                        type="button"
                        onClick={() => handleStartExclusion(currentDeckJob)}
                        className="exclude-title-btn cursor-pointer"
                        title="Cliquer pour exclure ce titre"
                      >
                        Cliquer pour exclure ce titre
                      </button>
                    )}
                  </div>

                  {/* Formulaire d'exclusion rapide si activé pour cette offre */}
                  {excludingJobId === currentDeckJob.id && (
                    <div
                      className="mb-4 p-3 bg-amber-50/95 border border-amber-300 rounded-lg space-y-2.5 shadow-sm text-left animate-in fade-in zoom-in-95 duration-100"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex items-center justify-between gap-1 text-[11px] font-bold text-amber-950">
                        <span>Exclure ce métier (« Ce que je ne veux pas »)</span>
                        <button
                          type="button"
                          onClick={() => setExcludingJobId(null)}
                          className="p-0.5 text-zinc-400 hover:text-zinc-600 rounded cursor-pointer"
                          title="Fermer"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <p className="text-[11px] text-zinc-600 leading-snug">
                        Définis la règle qui exclura cette offre et toutes les offres similaires.
                      </p>
                      <input
                        type="text"
                        value={exclusionDraft}
                        onChange={(e) => setExclusionDraft(e.target.value)}
                        placeholder="Mot ou raccourci distinctif..."
                        className="w-full px-2.5 py-1.5 text-xs bg-white border border-amber-300 rounded focus:outline-none focus:border-amber-500 font-semibold text-zinc-900"
                      />
                      {roleConflict.hasConflict && (
                        <div className="p-2 bg-rose-50 border border-rose-200 rounded text-[11px] text-rose-800 font-medium">
                          ⚠️ Attention : recoupement avec « {roleConflict.conflictedWith} ».
                        </div>
                      )}
                      <div className="flex items-center justify-between text-[11px] pt-1">
                        <span className="text-zinc-500">
                          {otherImpactedCount > 0
                            ? `${otherImpactedCount} autre(s) offre(s) impactée(s)`
                            : 'Aucune autre offre impactée'}
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setExcludingJobId(null)}
                            className="px-2.5 py-1 text-xs text-zinc-600 hover:bg-amber-100 rounded cursor-pointer"
                          >
                            Annuler
                          </button>
                          <button
                            type="button"
                            disabled={excludingLoading || !exclusionDraft.trim()}
                            onClick={() => void handleConfirmExclusion(currentDeckJob, exclusionDraft)}
                            className="px-3 py-1 text-xs font-bold bg-[#b32417] text-white hover:bg-[#8f1d12] rounded shadow-2xs disabled:opacity-50 cursor-pointer"
                          >
                            {excludingLoading ? 'Enregistrement...' : "Confirmer l'exclusion"}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Meta : Source · Âge · Entreprise · Lieu · Taux · [Salaire] */}
                  <p className="text-xs sm:text-[13px] font-medium text-[#111114] mb-5 flex flex-wrap items-center gap-1.5 leading-snug">
                    <span className="text-[#71717a] font-normal">{sourceLabel(currentDeckJob.source)}</span>
                    <span className="text-[#a1a1a9]">·</span>
                    <span className="text-[#71717a] font-normal">{relativeDate(currentDeckJob.published_at) || "aujourd'hui"}</span>
                    <span className="text-[#a1a1a9]">·</span>
                    <span className="font-semibold text-zinc-900">{employerLabel(currentDeckJob)}</span>
                    <span className="text-[#a1a1a9]">·</span>
                    <span>
                      {currentDeckJob.canton
                        ? `${currentDeckJob.location || currentDeckJob.canton} (${currentDeckJob.canton})`
                        : currentDeckJob.location || 'Suisse'}
                    </span>
                    <span className="text-[#a1a1a9]">·</span>
                    <span>{workloadLabel(currentDeckJob.workload) || '100%'}</span>
                    {currentDeckJob.salary && (
                      <>
                        <span className="text-[#a1a1a9]">·</span>
                        <span className="text-[#b3261e] font-semibold">
                          {currentDeckJob.salary}
                        </span>
                      </>
                    )}
                  </p>

                  {/* Motif d'exclusion si l'offre est exclue */}
                  {currentDeckJob.is_excluded && currentDeckJob.exclusion_reason && (
                    <div className="mb-4 p-2.5 bg-rose-50 border border-rose-200 rounded-lg text-xs font-medium text-rose-800">
                      Motif d’exclusion : {formatReason(currentDeckJob.exclusion_reason)}
                    </div>
                  )}

                  {/* Points clés avec puce rouge • */}
                  <ul className="points space-y-3.5 my-4">
                    {extractJobKeyPoints(currentDeckJob).map((pt, i) => (
                      <li
                        key={i}
                        className="grid grid-cols-[0.75rem_1fr] gap-2.5 text-[13px] sm:text-[13.5px] leading-relaxed text-[#55555c]"
                      >
                        <span className="text-[#e10600] font-bold select-none">•</span>
                        <span>{pt}</span>
                      </li>
                    ))}
                  </ul>

                  {/* Bouton Offre complète → */}
                  <button
                    type="button"
                    onClick={() => {
                      onSelectJob(currentDeckJob);
                      setShowFullReader(true);
                    }}
                    className="mt-6 text-[14px] font-semibold text-[#20201e] hover:text-[#e10600] transition-colors flex items-center gap-1.5 cursor-pointer text-left"
                  >
                    <span>Offre complète</span>
                    <span aria-hidden="true">→</span>
                  </button>
                </article>

                {/* Actions sous la carte */}
                <div className="actions mt-6 sm:mt-8 flex items-center justify-center gap-3.5">
                  {/* 👎 Pas intéressé */}
                  <button
                    type="button"
                    onClick={handleDeckPass}
                    aria-label="Pas intéressé"
                    title="Pas intéressé (Flèche gauche)"
                    className="h-11 w-11 rounded-lg bg-white text-zinc-700 hover:text-[#e10600] hover:bg-[#fdf2f0] flex items-center justify-center text-lg font-medium shadow-xs transition-colors cursor-pointer"
                  >
                    👎
                  </button>

                  {/* Postuler (rouge principal) */}
                  <button
                    type="button"
                    onClick={() => {
                      setApplyingJob(currentDeckJob);
                      setApplyError(null);
                      setApplyFeedback(null);
                    }}
                    className="h-11 px-6 rounded-lg bg-[#e10600] hover:bg-[#c90500] text-white font-semibold text-sm tracking-tight shadow-sm transition-colors cursor-pointer flex items-center justify-center gap-2"
                  >
                    <Send className="w-3.5 h-3.5 text-white" />
                    <span>Postuler</span>
                  </button>

                  {/* + Ajouter au panier */}
                  <button
                    type="button"
                    onClick={handleDeckAddToCart}
                    aria-label="Ajouter au panier"
                    title="Ajouter au panier (Flèche droite)"
                    className={`h-11 w-11 rounded-lg text-lg font-semibold flex items-center justify-center shadow-xs transition-colors cursor-pointer ${
                      isJobInCart(currentDeckJob.id)
                        ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200'
                        : 'bg-white text-zinc-700 hover:text-[#e10600] hover:bg-[#fdf2f0]'
                    }`}
                  >
                    {isJobInCart(currentDeckJob.id) ? '✓' : '+'}
                  </button>
                </div>


              </>
            ) : null}
          </div>
        </div>
      ) : (
        <MasterDetail list={list} detail={detail} mobileDetail={mobileDetail} />
      )}

      {/* Modal de confirmation « Postuler en 1 clic » */}
      {applyingJob && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-150"
          onClick={() => !isSubmittingApply && setApplyingJob(null)}
        >
          <div
            className="bg-white rounded-xl shadow-2xl border border-zinc-200 max-w-md w-full p-5 space-y-4 animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 pb-3 border-b border-zinc-100">
              <div className="space-y-0.5">
                <div className="flex items-center gap-1.5 text-xs font-bold text-zinc-500 uppercase tracking-wide">
                  <Send className="w-3.5 h-3.5 text-zinc-900" />
                  <span>Postuler en 1 clic</span>
                </div>
                <h3 className="text-sm font-bold text-zinc-900 leading-snug">
                  {applyingJob.title}
                </h3>
                <p className="text-xs text-zinc-600">
                  {applyingJob.company} {applyingJob.canton ? `(${applyingJob.canton})` : ''}
                </p>
              </div>
              <button
                type="button"
                disabled={isSubmittingApply}
                onClick={() => setApplyingJob(null)}
                className="text-zinc-400 hover:text-zinc-600 p-1"
                title="Fermer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Document CV utilisé */}
            <div className="p-3 bg-zinc-50 border border-zinc-200 rounded-lg space-y-1">
              <div className="flex items-center gap-1.5 text-xs font-bold text-zinc-700">
                <FileText className="w-3.5 h-3.5 text-zinc-500" />
                <span>CV transmis à l'employeur</span>
              </div>
              <p className="text-xs font-mono text-zinc-900 font-semibold truncate">
                {applyingJob.recommended_cv_id || userProfile?.cv_filename || 'CV_EN_Jean_Desfontaines_10.pdf'}
              </p>
              <p className="text-[11px] text-zinc-500">
                Le document PDF officiel configuré dans votre profil sera téléversé automatiquement.
              </p>
            </div>

            {/* Choix du mode navigateur */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-zinc-700 block">
                Mode d'exécution Playwright
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={isSubmittingApply}
                  onClick={() => setApplyHeadless(true)}
                  className={`p-2.5 rounded-lg border text-left transition-all ${
                    applyHeadless
                      ? 'border-zinc-900 bg-zinc-900 text-white shadow-xs'
                      : 'border-zinc-200 bg-white text-zinc-800 hover:bg-zinc-50'
                  }`}
                >
                  <div className="flex items-center gap-1.5 font-bold text-xs">
                    <EyeOff className="w-3.5 h-3.5" />
                    <span>En arrière-plan</span>
                  </div>
                  <p className={`text-[10px] mt-1 ${applyHeadless ? 'text-zinc-300' : 'text-zinc-500'}`}>
                    Silencieux, rapide et autonome
                  </p>
                </button>

                <button
                  type="button"
                  disabled={isSubmittingApply}
                  onClick={() => setApplyHeadless(false)}
                  className={`p-2.5 rounded-lg border text-left transition-all ${
                    !applyHeadless
                      ? 'border-zinc-900 bg-zinc-900 text-white shadow-xs'
                      : 'border-zinc-200 bg-white text-zinc-800 hover:bg-zinc-50'
                  }`}
                >
                  <div className="flex items-center gap-1.5 font-bold text-xs">
                    <Eye className="w-3.5 h-3.5" />
                    <span>Voir le navigateur</span>
                  </div>
                  <p className={`text-[10px] mt-1 ${!applyHeadless ? 'text-zinc-300' : 'text-zinc-500'}`}>
                    Fenêtre visible pour observer
                  </p>
                </button>
              </div>
            </div>

            {/* Erreur éventuelle */}
            {applyError && (
              <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800 font-medium space-y-2">
                <div>{applyError}</div>
                {applyError.includes('peut-être déjà partie') && (
                  <div className="pt-1 flex items-center justify-between gap-2 bg-amber-50 p-2 border border-amber-200 rounded text-amber-900">
                    <span>La candidature est peut-être déjà partie. Vérifie sur le site de l'entreprise avant de renvoyer.</span>
                    <button
                      type="button"
                      disabled={isSubmittingApply}
                      onClick={() => void handleConfirmOneClickApply(true)}
                      className="shrink-0 px-2.5 py-1 text-xs font-bold bg-amber-600 text-white hover:bg-amber-700 rounded transition-colors shadow-2xs disabled:opacity-50"
                    >
                      Renvoyer quand même
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Feedback succès */}
            {applyFeedback && (
              <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-900 font-semibold flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{applyFeedback.message}</span>
              </div>
            )}

            {/* Boutons d'action */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-100">
              <button
                type="button"
                disabled={isSubmittingApply}
                onClick={() => setApplyingJob(null)}
                className="px-3 py-1.5 text-xs font-semibold text-zinc-600 hover:bg-zinc-100 rounded-lg transition-colors"
              >
                Annuler
              </button>
              <button
                type="button"
                disabled={isSubmittingApply}
                onClick={() => void handleConfirmOneClickApply()}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold bg-zinc-900 text-white hover:bg-zinc-800 rounded-lg transition-colors disabled:opacity-50 shadow-xs"
              >
                {isSubmittingApply ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Postulation en cours...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5" />
                    <span>Confirmer la postulation</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal du Panier de candidatures (Fonction 3) */}
      {showCartModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-150"
          onClick={handleCloseCart}
        >
          <div
            className="bg-white rounded-xl shadow-2xl border border-zinc-200 max-w-2xl w-full max-h-[88vh] flex flex-col p-5 space-y-4 animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Entête Panier */}
            <div className="flex items-start justify-between gap-3 pb-3 border-b border-zinc-100">
              <div className="space-y-0.5">
                <div className="flex items-center gap-1.5 text-xs font-bold text-zinc-500 uppercase tracking-wide">
                  <ShoppingCart className="w-3.5 h-3.5 text-zinc-900" />
                  <span>Panier de candidatures</span>
                </div>
                <h3 className="text-sm font-bold text-zinc-900 leading-snug">
                  {cartItems.length} offre{cartItems.length > 1 ? 's' : ''} dans le panier
                </h3>
                <p className="text-xs text-zinc-500">
                  Traitement séquentiel avec pause, quota quotidien Europe/Zurich et preuve certifiée.
                </p>
              </div>
              <button
                type="button"
                disabled={cartRunning}
                onClick={handleCloseCart}
                className="text-zinc-400 hover:text-zinc-600 p-1"
                title="Fermer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Bannière en cours ou arrêt */}
            {cartRunning && (
              <div className="p-3 bg-zinc-900 text-white rounded-lg flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-xs">
                  <RefreshCw className="w-4 h-4 animate-spin text-zinc-400" />
                  <div>
                    <span className="font-bold">Traitement en cours... </span>
                    <span className="text-zinc-300">
                      Offre {(cartStatus?.current_index || 0) + 1} sur {cartStatus?.total_count || cartItems.length}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void handleStopCartProcessing()}
                  className="inline-flex items-center gap-1 px-3 py-1 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded shadow-xs"
                >
                  <Square className="w-3 h-3 fill-current" />
                  <span>Arrêter</span>
                </button>
              </div>
            )}

            {cartStatus?.stopped && cartStatus.stop_reason && (
              <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900 font-medium flex items-center justify-between gap-2">
                <span>Panier interrompu : {cartStatus.stop_reason}</span>
                <span className="text-[10px] text-amber-700 font-mono">Quota / Arrêt respecté</span>
              </div>
            )}

            {/* Options et boutons d'action du panier */}
            <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-zinc-50 border border-zinc-200/80 rounded-lg">
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-xs font-bold text-zinc-700">Mode :</span>
                <button
                  type="button"
                  disabled={cartRunning}
                  onClick={() => setCartHeadless(!cartHeadless)}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded border transition-colors ${
                    cartHeadless
                      ? 'bg-zinc-900 text-white border-zinc-900'
                      : 'bg-white text-zinc-800 border-zinc-300 hover:bg-zinc-100'
                  }`}
                  title="Basculer entre exécution en tâche de fond et navigateur visible"
                >
                  {cartHeadless ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  <span>{cartHeadless ? 'En arrière-plan' : 'Voir le navigateur'}</span>
                </button>

                <a
                  href="/api/cvs/base-ats/download"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-zinc-700 bg-white hover:bg-zinc-100 border border-zinc-300 rounded transition-colors"
                  title="Télécharger le CV de base ATS-friendly généré à partir de la base candidat"
                >
                  <FileText className="w-3.5 h-3.5 text-zinc-600" />
                  <span>CV de base ATS</span>
                </a>
              </div>

              <div className="flex items-center gap-2">
                {cartItems.length > 0 && !cartRunning && (
                  <button
                    type="button"
                    onClick={() => void handleClearCart()}
                    className="p-1.5 text-zinc-400 hover:text-rose-600 text-xs rounded hover:bg-rose-50"
                    title="Vider le panier"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}

                <button
                  type="button"
                  disabled={cartRunning || cartItems.length === 0 || selectedCartJobIds.length === 0}
                  onClick={() => void handleStartCartProcessing(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-zinc-700 bg-white hover:bg-zinc-100 border border-zinc-300 rounded-lg transition-colors disabled:opacity-50 shadow-2xs"
                  title="Simuler sans soumettre aucun formulaire"
                >
                  <FlaskConical className="w-3.5 h-3.5 text-zinc-600" />
                  <span>Simuler ({selectedCartJobIds.length || cartItems.length})</span>
                </button>

                <button
                  type="button"
                  disabled={cartRunning || cartItems.length === 0 || selectedCartJobIds.length === 0}
                  onClick={() => void handleStartCartProcessing(false)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold text-white bg-zinc-900 hover:bg-zinc-800 rounded-lg transition-colors disabled:opacity-50 shadow-xs"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Postuler ({selectedCartJobIds.length || cartItems.length})</span>
                </button>
              </div>
            </div>

            {/* Résumé global de la campagne (traitées, envoyées, à vérifier, déjà soumises, échouées) */}
            {cartStatus && cartStatus.finished_at && !cartRunning && (
              <div className="p-2.5 bg-zinc-50 border border-zinc-200 rounded-lg text-[11px] flex flex-wrap items-center justify-between gap-2">
                <span className="font-bold text-zinc-800">Résumé de la campagne :</span>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="px-2 py-0.5 bg-white border border-zinc-200 rounded font-semibold text-zinc-700">
                    Traitées : {Object.keys(cartStatus.item_statuses || {}).length}
                  </span>
                  <span className="px-2 py-0.5 bg-emerald-50 border border-emerald-200 rounded font-semibold text-emerald-800">
                    Envoyées : {Object.values(cartStatus.item_statuses || {}).filter((s) => s.final_status === 'sent' || s.status === 'envoyee').length}
                  </span>
                  <span className="px-2 py-0.5 bg-amber-50 border border-amber-200 rounded font-semibold text-amber-800">
                    À vérifier : {Object.values(cartStatus.item_statuses || {}).filter((s) => s.final_status === 'requires_review' || s.status === 'a_verifier' || s.status === 'simulee' || s.status === 'intervention').length}
                  </span>
                  <span className="px-2 py-0.5 bg-sky-50 border border-sky-200 rounded font-semibold text-sky-800">
                    Déjà soumises : {Object.values(cartStatus.item_statuses || {}).filter((s) => s.final_status === 'already_submitted' || s.status === 'deja_envoyee').length}
                  </span>
                  <span className="px-2 py-0.5 bg-rose-50 border border-rose-200 rounded font-semibold text-rose-800">
                    Échouées : {Object.values(cartStatus.item_statuses || {}).filter((s) => s.final_status === 'failed' || s.status === 'echec').length}
                  </span>
                </div>
              </div>
            )}

            {/* Liste scrollable des offres dans le panier */}
            <div className="flex-1 overflow-y-auto min-h-0 space-y-2 pr-1">
              {cartItems.length === 0 ? (
                <EmptyState
                  icon={ShoppingCart}
                  title="Ton panier est vide"
                  description="Ajoute des offres depuis la liste en cliquant sur « Ajouter au panier »."
                />
              ) : (
                cartItems.map((item) => {
                  const statusInfo = cartStatus?.item_statuses?.[item.job_id];
                  const itemStatus = statusInfo?.status || item.last_cart_status || 'en_attente';
                  const finalStatus = statusInfo?.final_status || item.last_cart_final_status;
                  const itemMessage = statusInfo?.message || item.last_cart_message;
                  const blockedReason = statusInfo?.blocked_reason ?? item.blocked_reason;
                  const cvUsed = statusInfo?.cv_used || item.cv_used;
                  const letterUsed = statusInfo?.cover_letter_filename || item.cover_letter_filename;
                  const cvAdaptedGen = statusInfo?.cv_adapted_generated ?? item.cv_adapted_generated;
                  const letterGen = statusInfo?.letter_generated ?? item.letter_generated;
                  const uploadOk = statusInfo?.upload_success ?? item.upload_success;
                  const summaryOk = statusInfo?.summary_complete ?? item.summary_complete;
                  const fields = statusInfo?.fields_filled || item.fields_filled;
                  const isSelected = selectedCartJobIds.some((id) => String(id) === String(item.job_id));

                  return (
                    <div
                      key={item.job_id}
                      className="p-3 border border-zinc-200 rounded-lg bg-white hover:border-zinc-300 transition-colors space-y-1.5"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-2 min-w-0">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            disabled={cartRunning}
                            onChange={() => toggleCartItemSelection(item.job_id)}
                            className="mt-0.5 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900"
                            title="Sélectionner cette offre pour la campagne"
                          />
                          <div className="min-w-0">
                            <h4 className="text-xs font-bold text-zinc-900 truncate">{item.title}</h4>
                            <p className="text-[11px] text-zinc-600 truncate">
                              {item.company} {item.canton ? `(${item.canton})` : ''} {item.workload ? `• ${item.workload}` : ''}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <StatusBadge status={itemStatus} />

                          {!cartRunning && (
                            <button
                              type="button"
                              onClick={() => void handleRemoveFromCart(item.job_id)}
                              className="text-zinc-400 hover:text-rose-600 p-1"
                              title="Retirer du panier"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Métadonnées de campagne par offre */}
                      {(cvUsed || letterUsed || itemMessage || finalStatus || (fields && fields.length > 0)) && (
                        <div className="text-[11px] bg-zinc-50 border border-zinc-150 p-2 rounded space-y-1">
                          <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                            {cvAdaptedGen !== undefined && (
                              <span className={`px-1.5 py-0.5 rounded border ${cvAdaptedGen ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800'}`}>
                                CV adapté : {cvAdaptedGen ? 'Oui' : 'Non'}
                              </span>
                            )}
                            {letterGen !== undefined && (
                              <span className={`px-1.5 py-0.5 rounded border ${letterGen ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800'}`}>
                                Lettre PDF : {letterGen ? 'Oui' : 'Non'}
                              </span>
                            )}
                            {uploadOk !== undefined && (
                              <span className={`px-1.5 py-0.5 rounded border ${uploadOk ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-amber-50 border-amber-200 text-amber-800'}`}>
                                Upload : {uploadOk ? 'Réussi' : 'Incomplet'}
                              </span>
                            )}
                            {summaryOk !== undefined && (
                              <span className={`px-1.5 py-0.5 rounded border ${summaryOk ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-amber-50 border-amber-200 text-amber-800'}`}>
                                Récapitulatif : {summaryOk ? 'Complet (vert)' : 'Incomplet'}
                              </span>
                            )}
                            {finalStatus && (
                              <span className="px-1.5 py-0.5 rounded border bg-white border-zinc-200 font-mono text-zinc-700">
                                Statut final : {finalStatus}
                              </span>
                            )}
                          </div>
                          {cvUsed && (
                            <div className="flex items-center gap-1 text-zinc-700 font-mono text-[10px]">
                              <FileText className="w-3 h-3 text-zinc-400 shrink-0" />
                              <span>CV : <strong className="text-zinc-900">{cvUsed}</strong>{letterUsed ? ` | Lettre : ${letterUsed}` : ''}</span>
                            </div>
                          )}
                          {fields && fields.length > 0 && (
                            <p className="text-[10px] text-zinc-500 truncate">
                              Champs préremplis : {fields.join(', ')}
                            </p>
                          )}
                          {blockedReason && (
                            <p className="text-[10px] text-rose-700 font-medium">
                              Blocage : {blockedReason}
                            </p>
                          )}
                          {itemMessage && itemMessage !== blockedReason && (
                            <p className="text-[11px] text-zinc-600 italic">
                              {itemMessage}
                            </p>
                          )}
                        </div>
                      )}

                      {/* Alerte et bouton Renvoyer quand même dans le panier */}
                      {(statusInfo?.submitted_unconfirmed || item.submitted_unconfirmed || itemMessage?.includes('peut-être déjà partie')) && (
                        <div className="p-2 bg-amber-50 border border-amber-200 rounded text-[11px] text-amber-900 flex items-center justify-between gap-2">
                          <span>La candidature est peut-être déjà partie. Vérifie sur le site de l'entreprise avant de renvoyer.</span>
                          <button
                            type="button"
                            disabled={cartRunning}
                            onClick={() => void handleCartForceResubmit(item.job_id)}
                            className="shrink-0 px-2 py-0.5 text-[10px] font-bold text-amber-950 bg-amber-200 hover:bg-amber-300 border border-amber-300 rounded transition-colors disabled:opacity-50"
                          >
                            Renvoyer quand même
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* Note d'information de bas de page */}
            <div className="pt-2 border-t border-zinc-100 flex items-center justify-between text-[11px] text-zinc-500">
              <span>Seules les offres envoyées avec preuve certifiée sont automatiquement retirées du panier.</span>
              <button
                type="button"
                disabled={cartRunning}
                onClick={handleCloseCart}
                className="px-3 py-1 text-xs font-semibold text-zinc-600 hover:bg-zinc-100 rounded-lg transition-colors"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Full Reader Overlay / Modal (selon maquette HTML 2) */}
      {showFullReader && currentDeckJob && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-[#faf9f7] flex flex-col overflow-hidden animate-in fade-in duration-150"
        >
          <header className="h-14 shrink-0 px-6 sm:px-10 border-b border-[#e9e7e2] flex items-center justify-between bg-[#faf9f7] select-none">
            <button
              type="button"
              onClick={() => setShowFullReader(false)}
              className="text-xs sm:text-sm font-semibold text-[#484950] hover:text-[#111114] transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <span>← Revenir à l’offre</span>
            </button>
            <div className="flex items-center gap-4">
              <span className="text-xs text-[#a1a1a9] hidden sm:inline">
                {sourceLabel(currentDeckJob.source)} · {relativeDate(currentDeckJob.published_at) || "aujourd'hui"}
              </span>
              <div className="flex items-center gap-2">
                {!currentDeckJob.is_excluded && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setApplyingJob(currentDeckJob);
                        setApplyError(null);
                        setApplyFeedback(null);
                      }}
                      className="px-3.5 py-1.5 rounded-lg bg-[#e10600] hover:bg-[#c90500] text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer"
                    >
                      Postuler
                    </button>
                    <button
                      type="button"
                      onClick={(e) => void handleAddToCart(currentDeckJob.id, e)}
                      className="px-3 py-1.5 rounded-lg border border-zinc-300 bg-white hover:bg-zinc-50 text-xs font-semibold text-zinc-800 transition-colors cursor-pointer"
                    >
                      {isJobInCart(currentDeckJob.id) ? 'Au panier ✓' : '+ Panier'}
                    </button>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => setShowFullReader(false)}
                  className="p-1 text-zinc-400 hover:text-zinc-700 ml-2 cursor-pointer"
                  title="Fermer (Échap)"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          </header>

          <div className="flex-1 overflow-y-auto px-6 py-8 sm:py-12 custom-scrollbar">
            <article className="max-w-[48rem] mx-auto space-y-6">
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold text-[#111114] leading-tight tracking-tight mb-2">
                  {currentDeckJob.title}
                </h1>
                <p className="text-sm font-medium text-zinc-600 flex flex-wrap items-center gap-1.5">
                  <span className="font-semibold text-zinc-950">{employerLabel(currentDeckJob)}</span>
                  <span className="text-zinc-400">·</span>
                  <span>
                    {currentDeckJob.canton
                      ? `${currentDeckJob.location || currentDeckJob.canton} (${currentDeckJob.canton})`
                      : currentDeckJob.location || 'Suisse'}
                  </span>
                  <span className="text-zinc-400">·</span>
                  <span>{workloadLabel(currentDeckJob.workload) || '100%'}</span>
                  {currentDeckJob.salary && (
                    <>
                      <span className="text-zinc-400">·</span>
                      <span className="text-[#b3261e] font-semibold">
                        {currentDeckJob.salary}
                      </span>
                    </>
                  )}
                </p>
              </div>

              {currentDeckJob.url && (
                <div className="pt-1">
                  <a
                    href={normalizeJobUrl(currentDeckJob.url)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-[#e10600] hover:underline font-medium"
                  >
                    <span>Voir l’annonce originale sur {sourceLabel(currentDeckJob.source)}</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              )}

              <div className="border-t border-[#e9e7e2] pt-6">
                <FormattedDescription text={currentDeckJob.description} />
              </div>
            </article>
          </div>
        </div>
      )}

      {/* Toast de retour / Undo */}
      {deckToast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-[#1f2024] text-white rounded-lg px-4 py-2.5 text-xs font-medium shadow-xl flex items-center gap-3 animate-in fade-in slide-in-from-bottom-2 duration-150">
          <span>{deckToast.message}</span>
          {deckToast.onUndo && (
            <button
              type="button"
              onClick={() => {
                deckToast.onUndo?.();
                setDeckToast(null);
              }}
              className="text-[#e10600] hover:underline font-bold text-xs cursor-pointer"
            >
              Annuler
            </button>
          )}
        </div>
      )}
    </div>
  );
};
