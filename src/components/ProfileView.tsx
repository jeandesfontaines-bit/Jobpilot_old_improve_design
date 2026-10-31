import React, { useEffect, useState } from 'react';
import { Save, FileCheck, User } from 'lucide-react';
import { Button, Spinner, PageHeader, Tabs } from './ui';
import { CardStyleContext } from './ui/Card';
import { SaveFeedback } from './ui/SaveFeedback';
import { useProfileAutosave } from './profile/profileState';
import {
  AdvancedOptionsCard,
  CollapsibleBlock,
  ExcludedRolesCard,
  ExperiencesCard,
  FormationsCard,
  NegativeKeywordsCard,
  PersonalInfoCard,
  PrivacyConsentCard,
  ProfileFromTextCard,
  SearchCriteriaCard,
} from './profile/ProfileSections';

type TabId = 'infos' | 'criteres' | 'exclusions';

const TAB_STORAGE_KEY = 'jobpilot_profile_tab';

function readStoredTab(): TabId {
  try {
    const stored = window.localStorage.getItem(TAB_STORAGE_KEY);
    if (stored === 'criteres' || stored === 'exclusions') return stored;
  } catch {
    // stockage local indisponible : on garde l'onglet par défaut
  }
  return 'infos';
}

export const ProfileView: React.FC = () => {
  const editor = useProfileAutosave();
  const {
    profile,
    loading,
    saveStatus,
    lastSavedTime,
    saveErrorMessage,
    executeSave,
    handleManualSave,
  } = editor;

  const [tab, setTab] = useState<TabId>(readStoredTab);

  useEffect(() => {
    try {
      window.localStorage.setItem(TAB_STORAGE_KEY, tab);
    } catch {
      // ignoré
    }
  }, [tab]);

  if (loading || !profile) return <Spinner label="Chargement du profil..." />;
  const ready = { ...editor, profile };
  const excludedCount = (profile.excluded_roles || []).length;

  const tabs: Array<{ id: TabId; label: string; count?: number }> = [
    { id: 'infos', label: 'Mes infos' },
    { id: 'criteres', label: 'Mes critères' },
    { id: 'exclusions', label: 'Ce que je ne veux pas', count: excludedCount },
  ];

  return (
    <div className="flex-1 min-w-0 min-h-0 overflow-y-auto custom-scrollbar bg-white">
      {/* ── BARRE SUPÉRIEURE : PageHeader et Tabs ── */}
      <div className="sticky top-0 z-10 bg-white/95 backdrop-blur border-b border-zinc-200/90">
        <PageHeader
          title="Mon profil"
          icon={User}
          className="border-b-0"
          actions={
            <div className="flex items-center gap-3">
              <SaveFeedback
                status={saveStatus === 'saved' && !lastSavedTime ? 'idle' : saveStatus}
                savedAt={lastSavedTime}
                error={saveErrorMessage}
                onRetry={executeSave}
              />
              <Button size="sm" onClick={handleManualSave} className="inline-flex items-center gap-1.5 font-semibold">
                <Save className="w-3.5 h-3.5" />
                <span>Enregistrer</span>
              </Button>
            </div>
          }
        />

        <div className="px-4 sm:px-6">
          <Tabs
            items={tabs}
            activeId={tab}
            onChange={(id) => setTab(id as TabId)}
            className="border-b-0"
          />
        </div>
      </div>

      <div className="w-full px-4 sm:px-8 py-6 space-y-6">
        <CardStyleContext.Provider value="section">
          {tab === 'infos' && (
            <div className="space-y-6">
              {profile.cv_filename && (
                <p className="flex items-center gap-2 text-xs text-zinc-600">
                  <FileCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>
                    CV de base : <strong className="font-semibold text-zinc-900">{profile.cv_filename}</strong> — tes fichiers PDF se gèrent dans l’onglet « Mes CV ».
                  </span>
                </p>
              )}

              <PersonalInfoCard {...ready} />

              <CollapsibleBlock title="Expériences professionnelles" count={profile.experiences.length} hint="cliquer pour ouvrir">
                <ExperiencesCard {...ready} />
              </CollapsibleBlock>

              <CollapsibleBlock title="Formations et diplômes" count={profile.formations.length} hint="cliquer pour ouvrir">
                <FormationsCard {...ready} />
              </CollapsibleBlock>

              <ProfileFromTextCard {...ready} />

              <PrivacyConsentCard {...ready} />
            </div>
          )}

          {tab === 'criteres' && (
            <div className="space-y-6">
              <SearchCriteriaCard {...ready} />
              <AdvancedOptionsCard {...ready} />
            </div>
          )}

          {tab === 'exclusions' && (
            <div className="space-y-6">
              <ExcludedRolesCard {...ready} />
              <NegativeKeywordsCard {...ready} />
            </div>
          )}
        </CardStyleContext.Provider>
      </div>
    </div>
  );
};
