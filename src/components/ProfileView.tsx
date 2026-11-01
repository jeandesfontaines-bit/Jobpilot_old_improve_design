import React, { useEffect, useState } from 'react';
import { Save, User } from 'lucide-react';
import { Button, Spinner, PageHeader, Tabs } from './ui';
import { SaveFeedback } from './ui/SaveFeedback';
import { useProfileAutosave } from './profile/profileState';
import {
  AdvancedOptionsCard,
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
  const { profile, loading, saveStatus, lastSavedTime, saveErrorMessage, executeSave, handleManualSave } = editor;

  const [tab, setTab] = useState<TabId>(readStoredTab);

  useEffect(() => {
    try {
      window.localStorage.setItem(TAB_STORAGE_KEY, tab);
    } catch {
      // ignoré
    }
  }, [tab]);

  if (loading || !profile) return <Spinner label='Chargement du profil...' />;
  const ready = { ...editor, profile };
  const excludedCount = (profile.excluded_roles || []).length;

  const tabs: Array<{ id: TabId; label: string; count?: number }> = [
    { id: 'infos', label: 'Mes infos' },
    { id: 'criteres', label: 'Mes critères' },
    { id: 'exclusions', label: 'Ce que je ne veux pas', count: excludedCount },
  ];

  return (
    <div className='custom-scrollbar min-h-0 min-w-0 flex-1 overflow-y-auto bg-white'>
      <div className='sticky top-0 z-10 border-b border-line bg-white/95 backdrop-blur'>
        <PageHeader
          title='Mon profil'
          icon={User}
          className='border-b-0'
          actions={
            <>
              <SaveFeedback
                status={saveStatus === 'saved' && !lastSavedTime ? 'idle' : saveStatus}
                savedAt={lastSavedTime}
                error={saveErrorMessage}
                onRetry={executeSave}
              />
              <Button variant='primary' size='sm' onClick={handleManualSave}>
                <Save className='size-4' />
                <span>Enregistrer</span>
              </Button>
            </>
          }
        />
        <div className='px-4 sm:px-6'>
          <Tabs items={tabs} activeId={tab} onChange={(id) => setTab(id as TabId)} className='border-b-0' />
        </div>
      </div>

      <div className='w-full max-w-4xl space-y-4 px-4 py-8 sm:px-6'>
        {tab === 'infos' && (
          <>
            <PersonalInfoCard {...ready} />
            <ExperiencesCard {...ready} />
            <FormationsCard {...ready} />
            <ProfileFromTextCard {...ready} />
            <PrivacyConsentCard {...ready} />
          </>
        )}

        {tab === 'criteres' && (
          <>
            <SearchCriteriaCard {...ready} />
            <AdvancedOptionsCard {...ready} />
          </>
        )}

        {tab === 'exclusions' && (
          <>
            <ExcludedRolesCard {...ready} />
            <NegativeKeywordsCard {...ready} />
          </>
        )}
      </div>
    </div>
  );
};
