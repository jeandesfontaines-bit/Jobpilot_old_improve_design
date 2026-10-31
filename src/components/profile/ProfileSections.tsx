import React from 'react';
import {
  Ban, Briefcase, ChevronDown, Compass, FileText, GraduationCap, Plus, RefreshCw, Search, Tag,
  Upload, User, X, Edit2, Check, Trash2, ShieldCheck,
} from 'lucide-react';
import { Alert, Button, Card, CardHeader, Field, Input, Select, TagInput, Textarea, Collapsible, Chip } from '../ui';
import { UserProfile } from '../../types';
import { useProfileAutosave } from './profileState';

import { uploadCvFile } from '../../services/api';

type Editor = ReturnType<typeof useProfileAutosave> & { profile: UserProfile };

// ── Bloc repliable (utilise le composant UI standard) ─────────────────────────────
export const CollapsibleBlock = Collapsible;

export const CvImportCard: React.FC<Pick<Editor, 'cvPasteText' | 'setCvPasteText' | 'analyzing' | 'cvSuccess' | 'cvError' | 'handleAnalyzeCv' | 'profile' | 'setProfile'>> = ({
  cvPasteText, setCvPasteText, analyzing, cvSuccess, cvError, handleAnalyzeCv, profile, setProfile,
}) => {
  const [uploading, setUploading] = React.useState(false);
  const [uploadFeedback, setUploadFeedback] = React.useState<string | null>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadFeedback(null);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const resultStr = reader.result as string;
          const base64 = resultStr.includes(',') ? resultStr.split(',')[1] : resultStr;
          if (!base64) throw new Error('Échec de lecture du fichier');
          const res = await uploadCvFile(file.name, base64);
          setProfile({ ...profile, cv_filename: res.filename });
          setUploadFeedback(`CV « ${res.filename} » téléversé et enregistré sur le serveur.`);
        } catch (subErr: any) {
          setUploadFeedback(`Erreur : ${subErr.message || 'Téléversement impossible'}`);
        } finally {
          setUploading(false);
        }
      };
      reader.readAsDataURL(file);
    } catch (err: any) {
      setUploadFeedback(`Erreur : ${err.message || 'Téléversement impossible'}`);
      setUploading(false);
    }
  };

  return (
    <Card>
      <CardHeader title="Document CV & Analyse" icon={<FileText />} right={<span className="text-xs font-medium text-zinc-500">Document persistant</span>} />
      
      <div className="rounded-lg border border-zinc-200 bg-zinc-50/70 p-4 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <span className="text-xs font-semibold text-zinc-700 block">Fichier CV configuré pour les candidatures</span>
            <span className="font-mono text-sm font-bold text-zinc-900">
              {profile.cv_filename || 'Aucun fichier CV configuré'}
            </span>
          </div>
          <label className="inline-flex items-center gap-1.5 cursor-pointer rounded-md bg-white border border-zinc-300 px-3 py-1.5 text-xs font-semibold text-zinc-700 shadow-sm hover:bg-zinc-50">
            <Upload className="h-3.5 w-3.5 text-zinc-500" />
            <span>{uploading ? 'Téléversement…' : 'Choisir un fichier CV (PDF)'}</span>
            <input type="file" accept=".pdf,.doc,.docx" onChange={handleFileUpload} disabled={uploading} className="sr-only" />
          </label>
        </div>
        {uploadFeedback && (
          <Alert tone={uploadFeedback.includes('Erreur') ? 'error' : 'success'}>
            {uploadFeedback}
          </Alert>
        )}
        <p className="text-[11px] text-zinc-500">
          Ce fichier est vérifié sur le disque avant chaque simulation de candidature. S'il est absent, la candidature bascule automatiquement au statut « À vérifier ».
        </p>
      </div>

      <div className="pt-2 border-t border-zinc-100 space-y-2">
        <span className="text-xs font-semibold text-zinc-700 block">Analyser le texte du CV par copier-coller</span>
        <p className="text-xs text-zinc-500 leading-relaxed">Collez le texte brut de votre CV pour pré-remplir automatiquement les expériences, formations et compétences ci-dessous.</p>
        <Textarea rows={4} className="font-mono text-xs" value={cvPasteText} onChange={(e) => setCvPasteText(e.target.value)} placeholder="Collez ici le contenu de votre CV..." />
        <Button onClick={handleAnalyzeCv} disabled={analyzing} size="sm">
          {analyzing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
          <span>{analyzing ? 'Analyse du CV en cours...' : 'Analyser le texte du CV'}</span>
        </Button>
      </div>
      {cvSuccess && <Alert tone="success">{cvSuccess}</Alert>}
      {cvError && <Alert tone="error">{cvError}</Alert>}
    </Card>
  );
};

// ── Remplir le profil depuis le texte d'un CV (secondaire, replié) ────────────
export const ProfileFromTextCard: React.FC<Pick<Editor, 'cvPasteText' | 'setCvPasteText' | 'analyzing' | 'cvSuccess' | 'cvError' | 'handleAnalyzeCv'>> = ({
  cvPasteText, setCvPasteText, analyzing, cvSuccess, cvError, handleAnalyzeCv,
}) => (
  <CollapsibleBlock title="Remplir mon profil depuis le texte d’un CV" hint="copier-coller">
    <div className="space-y-3">
      <p className="text-xs text-zinc-500 leading-relaxed">
        Colle le texte de ton CV : l’app pré-remplit tes expériences, formations et compétences. Cette action peut remplacer ce qui est déjà saisi. Tes fichiers PDF se gèrent dans l’onglet « Mes CV ».
      </p>
      <Textarea rows={5} className="font-mono text-xs" value={cvPasteText} onChange={(e) => setCvPasteText(e.target.value)} placeholder="Colle ici le contenu de ton CV..." />
      <Button onClick={handleAnalyzeCv} disabled={analyzing || !cvPasteText.trim()} size="sm">
        {analyzing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
        <span>{analyzing ? 'Analyse en cours...' : 'Analyser et remplir mon profil'}</span>
      </Button>
      {cvSuccess && <Alert tone="success">{cvSuccess}</Alert>}
      {cvError && <Alert tone="error">{cvError}</Alert>}
    </div>
  </CollapsibleBlock>
);

export const PersonalInfoCard: React.FC<Pick<Editor, 'profile' | 'setProfile'>> = ({ profile, setProfile }) => (
  <Card>
    <CardHeader title="Informations personnelles et coordonnées" icon={<User />} />
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      <Field label="Prénom"><Input value={profile.first_name || ''} onChange={(e) => setProfile({ ...profile, first_name: e.target.value })} /></Field>
      <Field label="Nom"><Input value={profile.last_name || ''} onChange={(e) => setProfile({ ...profile, last_name: e.target.value })} /></Field>
      <Field label="Intitulé / Poste recherché"><Input value={profile.current_title || ''} onChange={(e) => setProfile({ ...profile, current_title: e.target.value })} /></Field>
      <Field label="Email"><Input type="email" value={profile.email || ''} onChange={(e) => setProfile({ ...profile, email: e.target.value })} /></Field>
      <Field label="Téléphone"><Input value={profile.phone || ''} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} /></Field>
      <Field label="Ville et adresse"><Input value={profile.city || ''} onChange={(e) => setProfile({ ...profile, city: e.target.value })} /></Field>
      <Field label="Canton de résidence"><Input value={profile.canton || ''} onChange={(e) => setProfile({ ...profile, canton: e.target.value })} /></Field>
      <Field label="Permis de travail en Suisse">
        <Select
          value={profile.swiss_permit || ''}
          onChange={(e) => setProfile({ ...profile, swiss_permit: e.target.value })}
        >
          <option value="">-- Sélectionnez votre permis --</option>
          <option value="Nationalité suisse">Nationalité suisse / Citoyen</option>
          <option value="Permis C (Établissement)">Permis C (Établissement)</option>
          <option value="Permis B (Séjour)">Permis B (Séjour avec travail)</option>
          <option value="Permis G (Frontalier)">Permis G (Frontalier)</option>
          <option value="Permis L (Courte durée)">Permis L (Courte durée)</option>
          <option value="Citoyen UE/AELE (sans permis)">Citoyen UE/AELE (sans permis)</option>
          <option value="Hors UE/AELE (nécessite visa)">Hors UE/AELE (nécessite visa)</option>
        </Select>
      </Field>
      <Field label="Langues"><Input value={profile.languages || ''} onChange={(e) => setProfile({ ...profile, languages: e.target.value })} /></Field>
      <Field label="Diplômes"><Input value={profile.diplomas || ''} onChange={(e) => setProfile({ ...profile, diplomas: e.target.value })} /></Field>
    </div>
  </Card>
);

export const ExperiencesCard: React.FC<Pick<Editor, 'profile' | 'updateExperience' | 'addExperience' | 'removeExperience'>> = ({
  profile, updateExperience, addExperience, removeExperience,
}) => (
  <Card>
    <CardHeader title={`Expériences professionnelles (${profile.experiences.length})`} icon={<Briefcase />} right={<Button size="sm" onClick={addExperience}><Plus className="w-3.5 h-3.5" /><span>Ajouter</span></Button>} />
    {profile.experiences.map((exp, idx) => (
      <div key={`exp-${idx}-${exp.company || ''}`} className="rounded-lg border border-zinc-200 bg-zinc-50/70 p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <span className="font-semibold text-zinc-950">{exp.company || 'Nouvelle entreprise'}{exp.title ? ` · ${exp.title}` : ''}</span>
          <Button size="sm" variant="danger" onClick={() => removeExperience(idx)}><X className="w-3.5 h-3.5" /><span>Supprimer</span></Button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Entreprise"><Input value={exp.company} onChange={(e) => updateExperience(idx, 'company', e.target.value)} /></Field>
          <Field label="Intitulé du poste"><Input value={exp.title} onChange={(e) => updateExperience(idx, 'title', e.target.value)} /></Field>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Field label="Lieu"><Input value={exp.location} onChange={(e) => updateExperience(idx, 'location', e.target.value)} /></Field>
          <Field label="Date de début"><Input value={exp.start_date} onChange={(e) => updateExperience(idx, 'start_date', e.target.value)} /></Field>
          <Field label="Date de fin"><Input value={exp.end_date} onChange={(e) => updateExperience(idx, 'end_date', e.target.value)} /></Field>
        </div>
        <Field label="Réalisations" hint={`${(exp.realizations || []).length} puces`}>
          <Textarea rows={4} value={(exp.realizations || []).join('\n')} onChange={(e) => updateExperience(idx, 'realizations', e.target.value.split('\n'))} />
        </Field>
      </div>
    ))}
    <Button className="w-full" onClick={addExperience}><Plus className="w-4 h-4" /><span>Ajouter une expérience</span></Button>
  </Card>
);

export const FormationsCard: React.FC<Pick<Editor, 'profile' | 'updateFormation' | 'addFormation' | 'removeFormation'>> = ({
  profile, updateFormation, addFormation, removeFormation,
}) => (
  <Card>
    <CardHeader title={`Formations et diplômes (${profile.formations.length})`} icon={<GraduationCap />} right={<Button size="sm" onClick={addFormation}><Plus className="w-3.5 h-3.5" /><span>Ajouter</span></Button>} />
    {profile.formations.map((form, idx) => (
      <div key={`form-${idx}-${form.diploma || ''}`} className="rounded-lg border border-zinc-200 bg-zinc-50/70 p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <span className="font-semibold text-zinc-950">{form.diploma || 'Nouveau diplôme'}</span>
          <Button size="sm" variant="danger" onClick={() => removeFormation(idx)}><X className="w-3.5 h-3.5" /><span>Supprimer</span></Button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Diplôme"><Input value={form.diploma} onChange={(e) => updateFormation(idx, 'diploma', e.target.value)} /></Field>
          <Field label="Établissement"><Input value={form.institution} onChange={(e) => updateFormation(idx, 'institution', e.target.value)} /></Field>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Field label="Lieu"><Input value={form.location} onChange={(e) => updateFormation(idx, 'location', e.target.value)} /></Field>
          <Field label="Date de début"><Input value={form.start_date} onChange={(e) => updateFormation(idx, 'start_date', e.target.value)} /></Field>
          <Field label="Date de fin"><Input value={form.end_date} onChange={(e) => updateFormation(idx, 'end_date', e.target.value)} /></Field>
        </div>
      </div>
    ))}
    <Button className="w-full" onClick={addFormation}><Plus className="w-4 h-4" /><span>Ajouter une formation</span></Button>
  </Card>
);

const SWISS_CANTONS = [
  'GE', 'VD', 'VS', 'FR', 'NE', 'JU', 'BE', 'TI', 'ZH', 'BS', 'BL', 'LU', 'AG',
  'SO', 'SG', 'ZG', 'TG', 'GR', 'SZ', 'SH', 'AI', 'AR', 'GL', 'NW', 'OW', 'UR',
];

export const SearchCriteriaCard: React.FC<Pick<Editor, 'profile' | 'setProfile'>> = ({ profile, setProfile }) => {
  const wanted = (profile.wanted_cantons || []).map((c) => String(c).trim().toUpperCase());

  const toggleCanton = (code: string) => {
    const next = new Set(wanted);
    if (next.has(code)) next.delete(code);
    else next.add(code);
    const known = SWISS_CANTONS.filter((c) => next.has(c));
    const others = Array.from(next).filter((c) => !SWISS_CANTONS.includes(c));
    setProfile({ ...profile, wanted_cantons: [...known, ...others] });
  };

  return (
    <Card>
      <CardHeader title="Critères de recherche" icon={<Compass />} />
      <p className="text-sm text-zinc-600">
        Ces critères servent à garder ou écarter les offres. Un champ vide veut dire « aucune limite ».
      </p>

      <div className="space-y-2">
        <span className="text-sm font-semibold text-zinc-800 block">Cantons</span>
        <div className="flex flex-wrap gap-1.5">
          {SWISS_CANTONS.map((code) => {
            const active = wanted.includes(code);
            return (
              <button
                key={code}
                type="button"
                aria-pressed={active}
                onClick={() => toggleCanton(code)}
                className={`rounded-md border px-2.5 py-1 text-xs font-mono font-semibold transition-colors ${
                  active
                    ? 'border-zinc-900 bg-zinc-900 text-white'
                    : 'border-zinc-200 bg-white text-zinc-600 hover:border-zinc-400'
                }`}
              >
                {code}
              </button>
            );
          })}
        </div>
        <p className="text-xs text-zinc-500">
          {wanted.length === 0
            ? 'Aucun canton coché : toute la Suisse est acceptée.'
            : `Seules les offres de ${wanted.join(', ')} sont gardées. Une offre dont le canton est inconnu est conservée.`}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Salaire annuel minimum (CHF)" hint="Vide = aucune limite. Une offre sans salaire affiché est conservée.">
          <Input inputMode="numeric" placeholder="ex. 120000" value={profile.salary_min || ''} onChange={(e) => setProfile({ ...profile, salary_min: e.target.value })} />
        </Field>
        <Field label="Taux d'occupation maximum (%)" hint="Ex. 90 : on garde les offres qui permettent de travailler à 90 % ou moins. Vide ou 100 = aucune limite.">
          <Input inputMode="numeric" placeholder="ex. 90" value={profile.workload || ''} onChange={(e) => setProfile({ ...profile, workload: e.target.value })} />
        </Field>
      </div>

      <label className="flex items-center gap-2.5 cursor-pointer">
        <input type="checkbox" checked={profile.remote_accepted} onChange={(e) => setProfile({ ...profile, remote_accepted: e.target.checked })} className="w-4 h-4 rounded accent-zinc-900" />
        <span className="text-sm font-medium text-zinc-800">Télétravail accepté</span>
      </label>

      <TagInput label="Postes ciblés" tone="indigo" values={profile.wanted_roles || []} onChange={(wanted_roles) => setProfile({ ...profile, wanted_roles })} />
    </Card>
  );
};

export const AdvancedOptionsCard: React.FC<Pick<Editor, 'profile' | 'setProfile'>> = ({ profile, setProfile }) => (
  <CollapsibleBlock title="Options avancées" hint="compétences, mots-clés positifs, pertinence">
    <div className="space-y-5">
      <p className="text-xs text-zinc-500 leading-relaxed">
        Utile surtout pour adapter ton CV à chaque offre. Tu peux ignorer ce bloc.
      </p>
      <TagInput label="Compétences" tone="emerald" values={profile.skills || []} onChange={(skills) => setProfile({ ...profile, skills })} />
      <TagInput label="Mots-clés positifs" tone="emerald" values={profile.positive_keywords || []} onChange={(positive_keywords) => setProfile({ ...profile, positive_keywords })} />
      <label className="flex items-center gap-2.5 cursor-pointer pt-1">
        <input
          type="checkbox"
          checked={Boolean(profile.enable_relevance_matching)}
          onChange={(e) => setProfile({ ...profile, enable_relevance_matching: e.target.checked })}
          className="w-4 h-4 rounded accent-zinc-900"
        />
        <span className="text-sm font-medium text-zinc-800">
          Filtrage strict par pertinence métier (matching avec les compétences et postes du profil)
        </span>
      </label>
    </div>
  </CollapsibleBlock>
);

export const ExcludedRolesCard: React.FC<Pick<Editor, 'profile' | 'setProfile'>> = ({ profile, setProfile }) => {
  const roles = profile.excluded_roles || [];
  const [draft, setDraft] = React.useState('');
  const [search, setSearch] = React.useState('');
  const [editingIndex, setEditingIndex] = React.useState<number | null>(null);
  const [editingValue, setEditingValue] = React.useState('');
  const [notice, setNotice] = React.useState<string | null>(null);

  const clean = (value: string) => value.trim().replace(/\s+/g, ' ');

  const handleAdd = () => {
    const incoming = draft.split(/[\n,;]+/).map(clean).filter(Boolean);
    if (incoming.length === 0) return;
    const known = new Set(roles.map((r) => r.toLowerCase()));
    const fresh: string[] = [];
    for (const role of incoming) {
      const key = role.toLowerCase();
      if (!known.has(key)) {
        known.add(key);
        fresh.push(role);
      }
    }
    const skipped = incoming.length - fresh.length;
    if (fresh.length > 0) {
      setProfile({ ...profile, excluded_roles: [...roles, ...fresh] });
    }
    if (fresh.length === 0) setNotice('Ces règles existent déjà.');
    else if (skipped > 0) setNotice(`${fresh.length} règle(s) ajoutée(s), ${skipped} déjà présente(s).`);
    else setNotice(`${fresh.length} règle(s) ajoutée(s).`);
    setDraft('');
  };

  const removeAt = (index: number) => {
    setProfile({ ...profile, excluded_roles: roles.filter((_, i) => i !== index) });
    if (editingIndex === index) {
      setEditingIndex(null);
      setEditingValue('');
    }
  };

  const cancelEdit = () => {
    setEditingIndex(null);
    setEditingValue('');
  };

  const saveEdit = (index: number) => {
    const value = clean(editingValue);
    cancelEdit();
    if (!value || value === roles[index]) return;
    const duplicate = roles.some((r, i) => i !== index && r.toLowerCase() === value.toLowerCase());
    if (duplicate) {
      setNotice('Cette règle existe déjà.');
      return;
    }
    setProfile({ ...profile, excluded_roles: roles.map((r, i) => (i === index ? value : r)) });
  };

  // Les règles les plus récentes s'affichent en premier
  const indexed = roles.map((role, index) => ({ role, index })).reverse();
  const query = search.trim().toLowerCase();
  const visible = query ? indexed.filter((item) => item.role.toLowerCase().includes(query)) : indexed;

  return (
    <Card>
      <CardHeader
        title="Ce que je ne veux pas — titres d’offres"
        icon={<Ban />}
        right={<span className="text-xs font-semibold text-zinc-500">{roles.length} règle{roles.length > 1 ? 's' : ''}</span>}
      />
      <p className="text-sm text-zinc-600 leading-relaxed">
        Une offre dont le <strong>titre</strong> contient tous les mots d’une règle est masquée. La description n’est jamais lue. Exemple : « vendeur boulangerie ».
      </p>

      <div className="flex gap-2">
        <Input
          value={draft}
          placeholder="Ex: comptable, téléconseiller"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleAdd();
            }
          }}
        />
        <Button variant="danger" onClick={handleAdd} disabled={!draft.trim()}>
          <Plus className="w-4 h-4" />
          <span>Ajouter</span>
        </Button>
      </div>
      <p className="text-xs text-zinc-500">Tu peux en ajouter plusieurs d’un coup en les séparant par une virgule.</p>
      {notice && <p className="text-xs font-medium text-emerald-700">{notice}</p>}

      {roles.length === 0 ? (
        <p className="text-sm text-zinc-500">Aucune exclusion active.</p>
      ) : (
        <div className="space-y-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher dans mes règles…"
              className="w-full rounded-lg border border-zinc-200 bg-white py-2 pl-9 pr-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none"
            />
          </div>
          {query && (
            <p className="text-xs text-zinc-500">{visible.length} résultat(s) sur {roles.length}</p>
          )}

          <div className="max-h-[400px] overflow-y-auto rounded-lg border border-zinc-200 bg-zinc-50/60 p-3 custom-scrollbar">
            {visible.length === 0 ? (
              <p className="text-sm text-zinc-500">Aucune règle ne correspond à « {search} ».</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {visible.map(({ role, index }) =>
                  editingIndex === index ? (
                    <span key={`edit-${index}`} className="inline-flex items-center gap-1 rounded-full border border-zinc-300 bg-white px-2 py-1">
                      <input
                        autoFocus
                        value={editingValue}
                        onChange={(e) => setEditingValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            saveEdit(index);
                          } else if (e.key === 'Escape') {
                            cancelEdit();
                          }
                        }}
                        aria-label="Modifier la règle"
                        className="w-44 bg-transparent text-xs text-zinc-900 focus:outline-none"
                      />
                      <button type="button" onClick={() => saveEdit(index)} aria-label="Valider" className="text-emerald-700">
                        <Check className="h-3.5 w-3.5" />
                      </button>
                      <button type="button" onClick={cancelEdit} aria-label="Annuler" className="text-zinc-500">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  ) : (
                    <Chip
                      key={`${role}-${index}`}
                      label={role}
                      variant="danger"
                      onClick={() => {
                        setEditingIndex(index);
                        setEditingValue(role);
                      }}
                      onRemove={() => removeAt(index)}
                    />
                  )
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </Card>
  );
};

export const NegativeKeywordsCard: React.FC<Pick<Editor, 'profile' | 'setProfile'>> = ({ profile, setProfile }) => (
  <CollapsibleBlock title="Mots interdits (titre et description)" count={(profile.negative_keywords || []).length} hint="avancé">
    <div className="space-y-3">
      <p className="text-xs text-zinc-500 leading-relaxed">
        Contrairement aux règles ci-dessus, ces mots sont cherchés dans le titre ET dans la description de l’offre. À utiliser avec précaution.
      </p>
      <TagInput label="Mots-clés exclus" tone="rose" values={profile.negative_keywords || []} onChange={(negative_keywords) => setProfile({ ...profile, negative_keywords })} />
    </div>
  </CollapsibleBlock>
);

export const KeywordsCard: React.FC<Pick<Editor, 'profile' | 'setProfile'>> = ({ profile, setProfile }) => (
  <Card>
    <CardHeader title="Mots-clés" icon={<Tag />} />
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <TagInput label="Mots-clés positifs" tone="emerald" values={profile.positive_keywords || []} onChange={(positive_keywords) => setProfile({ ...profile, positive_keywords })} />
      <TagInput label="Mots-clés exclus" tone="rose" values={profile.negative_keywords || []} onChange={(negative_keywords) => setProfile({ ...profile, negative_keywords })} />
    </div>
  </Card>
);

export const PrivacyConsentCard: React.FC<Pick<Editor, 'profile' | 'setProfile'>> = ({ profile, setProfile }) => {
  const handleToggle = (checked: boolean) => {
    const now = new Date().toISOString();
    const logEntry = `[${now}] ${checked ? 'Consentement accordé' : 'Consentement révoqué'} par l'utilisateur.`;
    const logs = profile.privacy_consent_log ? [logEntry, ...profile.privacy_consent_log] : [logEntry];
    setProfile({
      ...profile,
      privacy_consent: checked,
      privacy_consent_date: checked ? now : profile.privacy_consent_date,
      privacy_consent_log: logs
    });
  };

  return (
    <Card>
      <CardHeader title="Autorisation et dépôt des données (RGPD / Suisse)" icon={<ShieldCheck className="w-5 h-5 text-emerald-600" />} />
      <div className="space-y-4">
        <label className="flex items-start gap-3 cursor-pointer p-4 bg-zinc-50 border border-zinc-200 rounded-lg hover:bg-zinc-100/60 transition-colors">
          <input
            type="checkbox"
            checked={Boolean(profile.privacy_consent)}
            onChange={(e) => handleToggle(e.target.checked)}
            className="w-5 h-5 mt-0.5 rounded accent-emerald-600"
          />
          <div className="space-y-1">
            <span className="text-sm font-bold text-zinc-900 block">
              « Autoriser le dépôt de mes données et de mon CV aux employeurs via les formulaires de candidature »
            </span>
            <p className="text-xs text-zinc-600 leading-relaxed">
              En cochant cette case, vous accordez l’autorisation explicite à l’agent d’automatisation JobPilot de cocher la déclaration de confidentialité et de téléverser votre CV et vos données personnelles sur les portails de recrutement externes (Prospective, Jobup, etc.).
            </p>
          </div>
        </label>

        {profile.privacy_consent && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-900 space-y-1">
            <div className="font-semibold flex items-center gap-1.5">
              <Check className="w-4 h-4 text-emerald-600" />
              <span>Autorisation active</span>
            </div>
            {profile.privacy_consent_date && (
              <div>Date d’autorisation : {new Date(profile.privacy_consent_date).toLocaleString('fr-CH')}</div>
            )}
          </div>
        )}

        {profile.privacy_consent_log && profile.privacy_consent_log.length > 0 && (
          <div className="space-y-1.5 pt-2 border-t border-zinc-100">
            <span className="text-xs font-semibold text-zinc-700 block">Journal des autorisations</span>
            <div className="bg-zinc-900 text-zinc-100 font-mono text-[11px] p-3 rounded-lg max-h-36 overflow-y-auto space-y-1">
              {profile.privacy_consent_log.map((log, idx) => (
                <div key={`log-${idx}-${log}`} className="opacity-90">{log}</div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
};
