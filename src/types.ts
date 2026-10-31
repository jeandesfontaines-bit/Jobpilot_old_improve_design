export interface Job {
  id: number;
  source: string;
  external_id?: string;
  title: string;
  company: string;
  location: string;
  canton: string;
  contract_type?: string;
  workload?: string;
  remote: boolean;
  salary?: string;
  published_at?: string;
  discovered_at?: string;
  url: string;
  description: string;
  status: 'Nouvelle' | 'Intéressante' | 'À postuler' | 'Simulé' | 'Envoyée' | 'Refusée' | 'Archivée';
  score: number;
  alternate_sources?: string | string[];
  is_new?: boolean | number;
  is_excluded?: boolean;
  exclusion_reason?: string;
  matched_exclusions?: string[];
  recommended_cv_id?: string;
  tailored_cv_filename?: string;
  last_application_result?: {
    status: string;
    display_status: 'envoyee' | 'a_verifier' | 'intervention' | 'echec' | 'deja_envoyee' | 'simulee';
    display_label: string;
    message: string;
    timestamp: string;
    submitted_unconfirmed?: boolean;
  };
}

export interface Source {
  name: string;
  display_name: string;
  status: 'actif' | 'erreur' | 'inactif' | 'partiel';
  last_run?: string | null;
  found_count: number;
  new_count: number;
  error_message?: string | null;
  mode?: string;
  window_queried?: string;
  last_successful_start_time?: string;
  last_full_sync_time?: string;
}

export type ApplicationStatus =
  | 'Sélectionnée'
  | 'En préparation'
  | 'Prête à déposer'
  | 'Dépôt en cours'
  | 'Simulé'
  | 'Envoyée'
  | 'À vérifier'
  | 'Intervention nécessaire'
  | 'Échec'
  | 'Brouillon'
  | 'Prête'
  | 'Refusée';

export interface SubmissionProof {
  mode: 'simulation' | 'real';
  is_simulation: boolean;
  channel: 'email' | 'form' | 'site';
  target: string;
  reference: string;
  timestamp: string;
  simulation_date_zurich?: string;
  documents: string[];
  summary: string;
  disclaimer: string;
  notes?: string;
}

export interface Application {
  id: number;
  job_id: number;
  status: ApplicationStatus;
  cover_letter: string;
  cv_filename: string;
  notes?: string;
  sent_at?: string;
  created_at: string;
  title?: string;
  company?: string;
  location?: string;
  canton?: string;
  url?: string;
  source?: string;
  channel?: 'email' | 'form' | 'site';
  channel_target?: string;
  selection_reason?: string;
  blocked_reason?: string;
  is_simulated?: boolean;
  submission_proof?: SubmissionProof;
}

export interface Experience {
  company: string;
  title: string;
  location: string;
  start_date: string;
  end_date: string;
  realizations: string[];
  achievements?: string[];
  description?: string;
  dates?: string;
}

export interface Formation {
  diploma: string;
  institution: string;
  location: string;
  start_date: string;
  end_date: string;
  dates?: string;
}

export interface UserProfile {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  city: string;
  canton: string;
  swiss_permit?: string;
  cv_filename: string;
  cv_path?: string;
  cover_template: string;
  current_title?: string;
  skills: string[];
  experiences: Experience[];
  formations: Formation[];
  languages: string;
  diplomas?: string;
  years_experience?: string;
  sectors?: string[];
  wanted_roles: string[];
  wanted_cantons: string[];
  contract_types?: string[];
  remote_accepted: boolean;
  workload: string;
  salary_min: string;
  positive_keywords: string[];
  negative_keywords: string[];
  avoided_companies: string[];
  excluded_roles?: string[];
  enable_relevance_matching?: boolean;
  privacy_consent?: boolean;
  privacy_consent_date?: string;
  privacy_consent_log?: string[];
}

export interface Settings {
  weights: {
    keywords_title: number;
    keywords_desc: number;
    canton: number;
    remote: number;
    workload: number;
    date: number;
    skills: number;
  };
  positive_keywords: string[];
  negative_keywords: string[];
  accepted_cantons: string[];
  workload_min: number;
  workload_max: number;
  status_interesting_threshold: number;
  status_apply_threshold: number;
  ollama_url: string;
  ollama_model: string;
  ollama_enabled: boolean;
  interval_minutes: number;
  max_candidates_per_cycle: number;
  daily_submission_quota: number;
  auto_scrape_interval?: number;
  daily_application_limit?: number;
  scheduler_active?: boolean;
  scheduler_mode?: 'simulation' | 'real';
  simulation_mode?: boolean;
}

export interface PipelineStatus {
  active: boolean;
  interval_minutes: number;
  mode: 'simulation' | 'real';
  is_running: boolean;
  last_run: string | null;
  next_run: string | null;
  consecutive_errors: number;
  daily_submission_quota: number;
  daily_submissions_count: number;
  max_candidates_per_cycle: number;
  zurich_today_date: string;
  daily_submission_limit?: number;
  last_report?: PipelineRunReport | null;
}

export interface PipelineRunReport {
  timestamp: string;
  duration_ms: number;
  sources_queried: string[];
  jobs_scraped_count: number;
  jobs_new_saved: number;
  jobs_evaluated_count: number;
  selected_count: number;
  prepared_count: number;
  submitted_simulated_count: number;
  blocked_count: number;
  needs_review_count: number;
  items: Array<{
    job_id: number;
    title: string;
    company: string;
    canton: string;
    score: number;
    status: ApplicationStatus;
    reason: string;
    channel?: string;
    proof_ref?: string;
  }>;
}

export interface ScrapingLog {
  id: number;
  source: string;
  level: 'info' | 'warning' | 'error';
  message: string;
  timestamp: string;
}

export type CartItemStatus =
  | 'en_attente'
  | 'en_cours'
  | 'envoyee'
  | 'a_verifier'
  | 'intervention'
  | 'echec'
  | 'simulee'
  | 'deja_envoyee';

export type CampaignFinalStatus = 'sent' | 'requires_review' | 'already_submitted' | 'failed';

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

export interface CartStatusResponse {
  success: boolean;
  is_running: boolean;
  mode: 'apply' | 'simulate' | 'idle';
  total_count: number;
  current_index: number;
  current_job_id: string | number | null;
  stopped: boolean;
  stop_reason?: string;
  started_at?: string;
  finished_at?: string;
  items: CartItem[];
  item_statuses: Record<string | number, CartItemStatusDetail>;
}
