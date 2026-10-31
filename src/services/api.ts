import axios from 'axios';
import { Job, Source, Application, UserProfile, Settings, CartItem, CartStatusResponse } from '../types.ts';

export async function getDashboardData() {
  const res = await axios.get('/api/dashboard');
  return res.data;
}

export async function getJobsCounts() {
  const res = await axios.get('/api/jobs/counts');
  return res.data as {
    retained: number;
    excluded: number;
    new_ones: number;
    total: number;
  };
}

export async function getJobs(filters?: {
  search?: string;
  canton?: string;
  status?: string;
  source?: string;
  min_score?: number;
  remote?: boolean;
  sort?: string;
  view?: 'active' | 'excluded' | 'all';
  only_excluded?: boolean;
  include_excluded?: boolean;
}) {
  const res = await axios.get('/api/jobs', { params: filters });
  return res.data as Job[];
}

export async function updateJobStatus(id: number, status: string) {
  const res = await axios.patch(`/api/jobs/${id}/status`, { status });
  return res.data;
}

export async function getSources() {
  const res = await axios.get('/api/sources');
  return res.data as Source[];
}

export async function triggerScrape(name: string) {
  const res = await axios.post(`/api/sources/${name}/scrape`);
  return res.data;
}

export async function getUserProfile() {
  const res = await axios.get('/api/profile');
  return res.data as UserProfile;
}

export async function updateUserProfile(profile: UserProfile) {
  const res = await axios.put('/api/profile', profile);
  return res.data;
}

export async function excludeRole(role: string) {
  const res = await axios.post('/api/profile/exclude-role', { role });
  return res.data as {
    success: boolean;
    already_existed?: boolean;
    message?: string;
    excluded_role: string;
    excluded_roles: string[];
    profile: UserProfile;
  };
}

export async function unexcludeRole(role: string) {
  const res = await axios.post('/api/profile/unexclude-role', { role });
  return res.data as { success: boolean; unexcluded_role: string; excluded_roles: string[]; profile: UserProfile };
}

export async function getSettings() {
  const res = await axios.get('/api/settings');
  return res.data as Settings;
}

export async function updateSettings(settings: Settings) {
  const res = await axios.put('/api/settings', settings);
  return res.data;
}

export async function testOllamaConnection(url: string, model: string) {
  const res = await axios.post('/api/settings/test-ollama', { ollama_url: url, ollama_model: model });
  return res.data;
}

export async function getApplications() {
  const res = await axios.get('/api/applications');
  return res.data as Application[];
}

export async function updateApplication(id: number, data: Partial<Application>) {
  const res = await axios.patch(`/api/applications/${id}`, data);
  return res.data;
}

export async function deleteApplication(id: number) {
  const res = await axios.delete(`/api/applications/${id}`);
  return res.data;
}

export async function clearSimulatedApplications() {
  const res = await axios.post('/api/applications/clear-simulated');
  return res.data as { success: boolean; count: number };
}

export async function analyzeCvText(cvText: string) {
  const res = await axios.post('/api/profile/analyze-cv-text', { cv_text: cvText });
  return res.data;
}

export async function generateCvFromText(cvText: string) {
  const res = await axios.post('/api/profile/generate-cv-from-text', { cv_text: cvText });
  return res.data as { success: boolean; filename: string; profile: any };
}

export async function regenerateProfilePdf() {
  const res = await axios.post('/api/profile/regenerate-pdf');
  return res.data as { success: boolean; filename: string };
}

export async function runAiAction(action: 'profile_analysis' | 'summarize' | 'draft_letter', jobId: number) {
  const res = await axios.post('/api/ai/action', { action, job_id: jobId });
  return res.data as { result: string; engine: string; structured?: any; error?: string };
}

export async function getScrapingLogs() {
  const res = await axios.get('/api/logs');
  return res.data;
}

/**
 * Détermine si une source de scraping est éligible au lancement automatique ou groupé.
 * - 'actif'   : éligible (connecteur en service normal)
 * - 'partiel' : éligible (connecteur relançable pour compléter la collecte, ex: Job-Room)
 * - 'erreur'  : éligible (connecteur relançable après échec temporaire)
 * - 'inactif' : EXCLU (connecteur volontairement en pause ou indisponible, ex: Indeed, JobScout24)
 */
export function isSourceRunnable(source?: { status?: string | null } | null): boolean {
  if (!source || !source.status) return false;
  return source.status !== 'inactif';
}

export async function getPipelineStatus() {
  const res = await axios.get('/api/pipeline/status');
  return res.data;
}

export async function togglePipeline(active?: boolean, mode?: 'simulation' | 'real') {
  const res = await axios.post('/api/pipeline/toggle', { active, mode });
  return res.data;
}

export async function triggerPipelineRun() {
  const res = await axios.post('/api/pipeline/run-now');
  return res.data;
}

export async function getSimulationReport() {
  const res = await axios.get('/api/pipeline/simulation-report');
  return res.data;
}

export async function uploadCvFile(filename: string, base64Content: string) {
  const res = await axios.post('/api/profile/upload-cv', { filename, base64_content: base64Content });
  return res.data as { success: boolean; filename: string; path: string; profile?: UserProfile };
}

export async function tailorCv(jobId: number) {
  const res = await axios.post(`/api/jobs/${jobId}/tailor-cv`);
  return res.data as { success: boolean; recommended_cv_id: string; adaptation_reason: string };
}

export async function autoApplyJob(
  jobId: number | string,
  options?: { headless?: boolean; simulate?: boolean; force_resubmit?: boolean }
) {
  const res = await axios.post(`/api/jobs/${jobId}/auto-apply`, options);
  return res.data;
}

export async function getCart() {
  const res = await axios.get('/api/cart');
  return res.data as { success: boolean; items: CartItem[]; count: number };
}

export async function addToCart(jobId: number | string) {
  const res = await axios.post('/api/cart/add', { jobId });
  return res.data as { success: boolean; cart: CartItem[]; count: number; item?: CartItem; error?: string };
}

export async function removeFromCart(jobId: number | string) {
  const res = await axios.post('/api/cart/remove', { jobId });
  return res.data as { success: boolean; cart: CartItem[]; count: number };
}

export async function clearCart() {
  const res = await axios.delete('/api/cart');
  return res.data as { success: boolean; cart: CartItem[]; count: number };
}

export async function getCartStatus() {
  const res = await axios.get('/api/cart/status');
  return res.data as CartStatusResponse;
}

export async function processCartApi(options: {
  simulate?: boolean;
  headless?: boolean;
  pauseMs?: number;
  wait?: boolean;
  confirm_real_send?: boolean;
  jobIds?: Array<string | number>;
}) {
  const res = await axios.post('/api/cart/process', options);
  return res.data;
}

export async function stopCartApi() {
  const res = await axios.post('/api/cart/stop');
  return res.data as { success: boolean; message: string };
}




