import { useEffect, useRef, useState, type FormEvent } from 'react';
import { analyzeCvText, getUserProfile, updateUserProfile } from '../../services/api';
import { Experience, Formation, UserProfile } from '../../types';

export type SaveState = 'saved' | 'saving' | 'pending' | 'error';

export const normalizeProfile = (data: any): UserProfile => {
  const rawExp = data?.experiences;
  const experiences: Experience[] = Array.isArray(rawExp)
    ? rawExp.map((exp: any) => {
        const realizations = Array.isArray(exp.realizations)
          ? exp.realizations
          : Array.isArray(exp.achievements)
          ? exp.achievements
          : exp.description
          ? String(exp.description).split('\n').filter(Boolean)
          : [];
        const dates = exp.dates || [exp.start_date, exp.end_date].filter(Boolean).join(' - ');
        return {
          company: exp.company || '',
          title: exp.title || '',
          location: exp.location || '',
          start_date: exp.start_date || (exp.dates ? exp.dates.split(/[-\u2013\u2014]/)[0]?.trim() : '') || '',
          end_date: exp.end_date || (exp.dates ? exp.dates.split(/[-\u2013\u2014]/)[1]?.trim() : '') || '',
          realizations,
          achievements: realizations,
          description: realizations.join('\n'),
          dates,
        };
      })
    : rawExp && typeof rawExp === 'string' && rawExp.trim().length > 0
    ? [{
        company: 'Profil H\u00e9rit\u00e9',
        title: 'Historique',
        location: 'N/A',
        start_date: 'N/A',
        end_date: 'N/A',
        realizations: rawExp.split('\n').filter(Boolean),
        achievements: rawExp.split('\n').filter(Boolean),
        description: rawExp,
        dates: 'N/A',
      }]
    : [];

  const rawForm = data?.formations;
  const formations: Formation[] = Array.isArray(rawForm)
    ? rawForm.map((form: any) => {
        const dates = form.dates || [form.start_date, form.end_date].filter(Boolean).join(' - ');
        return {
          diploma: form.diploma || form.degree || '',
          institution: form.institution || form.school || '',
          location: form.location || '',
          start_date: form.start_date || (form.dates ? form.dates.split(/[-\u2013\u2014]/)[0]?.trim() : '') || '',
          end_date: form.end_date || (form.dates ? form.dates.split(/[-\u2013\u2014]/)[1]?.trim() : '') || '',
          dates,
        };
      })
    : rawForm && typeof rawForm === 'string' && rawForm.trim().length > 0
    ? [{
        diploma: rawForm,
        institution: 'Profil H\u00e9rit\u00e9',
        location: 'N/A',
        start_date: 'N/A',
        end_date: 'N/A',
        dates: 'N/A',
      }]
    : [];

  return {
    first_name: data?.first_name || '',
    last_name: data?.last_name || '',
    email: data?.email || '',
    phone: data?.phone || '',
    city: data?.city || '',
    canton: data?.canton || '',
    swiss_permit: data?.swiss_permit || '',
    cv_filename: data?.cv_filename || '',
    cover_template: data?.cover_template || '',
    current_title: data?.current_title || '',
    skills: Array.isArray(data?.skills) ? data.skills : [],
    experiences,
    formations,
    languages: data?.languages || '',
    diplomas: data?.diplomas || '',
    years_experience: data?.years_experience || '',
    sectors: Array.isArray(data?.sectors) ? data.sectors : [],
    wanted_roles: Array.isArray(data?.wanted_roles) ? data.wanted_roles : [],
    wanted_cantons: Array.isArray(data?.wanted_cantons) ? data.wanted_cantons : [],
    contract_types: Array.isArray(data?.contract_types) ? data.contract_types : [],
    remote_accepted: data?.remote_accepted ?? true,
    workload: data?.workload || '80-100%',
    salary_min: data?.salary_min || '',
    positive_keywords: Array.isArray(data?.positive_keywords) ? data.positive_keywords : [],
    negative_keywords: Array.isArray(data?.negative_keywords) ? data.negative_keywords : [],
    avoided_companies: Array.isArray(data?.avoided_companies) ? data.avoided_companies : [],
    excluded_roles: Array.isArray(data?.excluded_roles) ? data.excluded_roles : [],
  };
};

export function useProfileAutosave() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<SaveState>('saved');
  const [lastSavedTime, setLastSavedTime] = useState<string | null>(null);
  const [saveErrorMessage, setSaveErrorMessage] = useState<string | null>(null);
  const [cvPasteText, setCvPasteText] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [cvSuccess, setCvSuccess] = useState<string | null>(null);
  const [cvError, setCvError] = useState<string | null>(null);
  const [newExcludedRole, setNewExcludedRole] = useState('');
  const [editingExcludedIndex, setEditingExcludedIndex] = useState<number | null>(null);
  const [editingExcludedValue, setEditingExcludedValue] = useState('');

  const lastSavedJsonRef = useRef('');
  const latestProfileRef = useRef<UserProfile | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSavingRef = useRef(false);
  const pendingSaveRef = useRef(false);
  const inFlightJsonRef = useRef<string | null>(null);

  const executeSave = async () => {
    if (isSavingRef.current) {
      pendingSaveRef.current = true;
      return;
    }
    const profileToSave = latestProfileRef.current;
    if (!profileToSave) return;
    const profileJson = JSON.stringify(profileToSave);
    if (profileJson === lastSavedJsonRef.current) {
      setSaveStatus('saved');
      return;
    }
    isSavingRef.current = true;
    inFlightJsonRef.current = profileJson;
    setSaveStatus('saving');
    let saveSucceeded = false;
    try {
      await updateUserProfile(profileToSave);
      saveSucceeded = true;
      lastSavedJsonRef.current = profileJson;
      setLastSavedTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
      setSaveErrorMessage(null);
    } catch (err: any) {
      setSaveStatus('error');
      setSaveErrorMessage(err.message || 'Erreur de sauvegarde');
    } finally {
      isSavingRef.current = false;
      inFlightJsonRef.current = null;
      const latestJson = latestProfileRef.current ? JSON.stringify(latestProfileRef.current) : null;
      const needsAnotherSave =
        saveSucceeded &&
        (pendingSaveRef.current || (latestJson !== null && latestJson !== lastSavedJsonRef.current));
      pendingSaveRef.current = false;
      if (needsAnotherSave) void executeSave();
      else if (!saveSucceeded) setSaveStatus('error');
      else if (latestJson === lastSavedJsonRef.current) setSaveStatus('saved');
    }
  };

  useEffect(() => {
    getUserProfile()
      .then((data) => {
        const normalized = normalizeProfile(data);
        setProfile(normalized);
        latestProfileRef.current = normalized;
        lastSavedJsonRef.current = JSON.stringify(normalized);
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    latestProfileRef.current = profile;
    if (!profile) return;
    const currentJson = JSON.stringify(profile);
    if (isSavingRef.current) {
      pendingSaveRef.current = currentJson !== inFlightJsonRef.current;
      if (pendingSaveRef.current) setSaveStatus('pending');
      return;
    }
    if (currentJson !== lastSavedJsonRef.current) {
      setSaveStatus('pending');
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = setTimeout(() => void executeSave(), 800);
    } else {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      setSaveStatus('saved');
    }
  }, [profile]);

  useEffect(() => {
    const handleUnload = () => {
      if (latestProfileRef.current && JSON.stringify(latestProfileRef.current) !== lastSavedJsonRef.current) {
        navigator.sendBeacon?.(
          '/api/profile',
          new Blob([JSON.stringify(latestProfileRef.current)], { type: 'application/json' })
        );
      }
    };
    window.addEventListener('beforeunload', handleUnload);
    return () => window.removeEventListener('beforeunload', handleUnload);
  }, []);

  const handleManualSave = async (e?: FormEvent) => {
    if (e) e.preventDefault();
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    await executeSave();
  };

  const handleAnalyzeCv = async () => {
    if (!cvPasteText.trim()) {
      setCvError('Veuillez coller le texte de votre CV avant de lancer l\u2019analyse.');
      return;
    }
    setAnalyzing(true);
    setCvError(null);
    setCvSuccess(null);
    try {
      const res = await analyzeCvText(cvPasteText);
      if (res.success && res.parsed_data) {
        const p = res.parsed_data;
        const normalizedExps = Array.isArray(p.experiences)
          ? p.experiences.map((exp: any) => ({
              company: exp.company || '',
              title: exp.title || '',
              location: exp.location || '',
              start_date: exp.start_date || '',
              end_date: exp.end_date || '',
              dates: exp.dates || [exp.start_date, exp.end_date].filter(Boolean).join(' - '),
              realizations: exp.realizations || exp.achievements || (exp.description ? String(exp.description).split('\n').filter(Boolean) : []),
              achievements: exp.realizations || exp.achievements || [],
              description: exp.description || (exp.realizations ? exp.realizations.join('\n') : ''),
            }))
          : [];
        const normalizedForms = Array.isArray(p.formations || p.diplomas)
          ? (p.formations || p.diplomas).map((form: any) => ({
              diploma: form.diploma || form.degree || '',
              institution: form.institution || form.school || '',
              location: form.location || '',
              start_date: form.start_date || '',
              end_date: form.end_date || '',
              dates: form.dates || [form.start_date, form.end_date].filter(Boolean).join(' - '),
            }))
          : [];
        setProfile((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            first_name: p.first_name || prev.first_name,
            last_name: p.last_name || prev.last_name,
            current_title: p.current_title || prev.current_title,
            email: p.email || prev.email,
            phone: p.phone || prev.phone,
            city: p.city || prev.city,
            skills: Array.from(new Set([...(prev.skills || []), ...(p.skills || [])])),
            languages: p.languages || prev.languages,
            experiences: normalizedExps.length > 0 ? normalizedExps : prev.experiences,
            formations: normalizedForms.length > 0 ? normalizedForms : prev.formations,
          };
        });
        setCvSuccess('CV analys\u00e9. Les champs d\u00e9tect\u00e9s ont \u00e9t\u00e9 remplis et enregistr\u00e9s.');
        void executeSave();
      }
    } catch (err: any) {
      setCvError(err.response?.data?.error || err.message || 'Erreur lors de l\u2019analyse du CV.');
    } finally {
      setAnalyzing(false);
    }
  };

  const updateExperience = (idx: number, field: keyof Experience, value: any) => {
    setProfile((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        experiences: prev.experiences.map((exp, i) => {
          if (i !== idx) return exp;
          const updated = { ...exp, [field]: value };
          if (field === 'realizations') {
            updated.achievements = value;
            updated.description = Array.isArray(value) ? value.join('\n') : String(value);
          }
          if (field === 'start_date' || field === 'end_date') {
            updated.dates = [field === 'start_date' ? value : exp.start_date, field === 'end_date' ? value : exp.end_date].filter(Boolean).join(' - ');
          }
          return updated;
        }),
      };
    });
  };

  const addExperience = () => {
    setProfile((prev) => prev ? {
      ...prev,
      experiences: [...prev.experiences, { company: '', title: '', location: '', start_date: '', end_date: '', dates: '', realizations: [], achievements: [], description: '' }],
    } : prev);
  };

  const removeExperience = (idx: number) => {
    setProfile((prev) => prev ? { ...prev, experiences: prev.experiences.filter((_, i) => i !== idx) } : prev);
  };

  const updateFormation = (idx: number, field: keyof Formation, value: string) => {
    setProfile((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        formations: prev.formations.map((form, i) => {
          if (i !== idx) return form;
          const updated = { ...form, [field]: value };
          if (field === 'start_date' || field === 'end_date') {
            updated.dates = [field === 'start_date' ? value : form.start_date, field === 'end_date' ? value : form.end_date].filter(Boolean).join(' - ');
          }
          return updated;
        }),
      };
    });
  };

  const addFormation = () => {
    setProfile((prev) => prev ? {
      ...prev,
      formations: [...prev.formations, { diploma: '', institution: '', location: '', start_date: '', end_date: '', dates: '' }],
    } : prev);
  };

  const removeFormation = (idx: number) => {
    setProfile((prev) => prev ? { ...prev, formations: prev.formations.filter((_, i) => i !== idx) } : prev);
  };

  const handleAddExcludedRole = () => {
    if (!profile) return;
    const trimmed = newExcludedRole.trim();
    if (!trimmed) return;
    const current = profile.excluded_roles || [];
    if (!current.includes(trimmed)) setProfile({ ...profile, excluded_roles: [...current, trimmed] });
    setNewExcludedRole('');
  };

  const handleRemoveExcludedRole = (idx: number) => {
    if (!profile) return;
    setProfile({ ...profile, excluded_roles: (profile.excluded_roles || []).filter((_, i) => i !== idx) });
  };

  const handleSaveEditExcludedRole = (idx: number) => {
    if (!profile) return;
    const trimmed = editingExcludedValue.trim();
    if (!trimmed) handleRemoveExcludedRole(idx);
    else {
      const current = [...(profile.excluded_roles || [])];
      current[idx] = trimmed;
      setProfile({ ...profile, excluded_roles: current });
    }
    setEditingExcludedIndex(null);
    setEditingExcludedValue('');
  };

  return {
    profile, setProfile, loading, saveStatus, lastSavedTime, saveErrorMessage, executeSave, handleManualSave,
    cvPasteText, setCvPasteText, analyzing, cvSuccess, cvError, handleAnalyzeCv,
    updateExperience, addExperience, removeExperience, updateFormation, addFormation, removeFormation,
    newExcludedRole, setNewExcludedRole, editingExcludedIndex, setEditingExcludedIndex, editingExcludedValue, setEditingExcludedValue,
    handleAddExcludedRole, handleRemoveExcludedRole, handleSaveEditExcludedRole,
  };
}
