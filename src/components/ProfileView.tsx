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
        <div className='px-4 sm:px-6 lg:hidden'>
          <Tabs items={tabs} activeId={tab} onChange={(id) => setTab(id as TabId)} className='border-b-0' />
        </div>
      </div>

      <div className='flex w-full max-w-5xl gap-12 px-4 py-8 sm:px-6'>
        <nav aria-label='Sections du profil' className='sticky top-24 hidden h-fit w-48 shrink-0 space-y-1 lg:block'>
          {tabs.map((item) => (
            <button
              key={item.id}
              type='button'
              onClick={() => setTab(item.id)}
              aria-current={tab === item.id ? 'page' : undefined}
              className={`flex h-10 w-full items-center justify-between gap-2 rounded-control px-3 text-left text-body transition-colors ${
                tab === item.id ? 'bg-black/5 font-medium text-ink' : 'text-muted hover:bg-black/[0.03] hover:text-ink'
              }`}
            >
              <span className='truncate'>{item.label}</span>
              {typeof item.count === 'number' && item.count > 0 && <span className='text-caption tabular-nums'>{item.count}</span>}
            </button>
          ))}
        </nav>

        <div className='min-w-0 max-w-3xl flex-1 space-y-8'>
          <CardStyleContext.Provider value='section'>
            {tab === 'infos' && (
              <>
                {profile.cv_filename && (
                  <p className='flex items-center gap-3 rounded-control bg-canvas/50 px-4 py-3 text-body text-body'>
                    <FileCheck className='size-4 shrink-0 text-emerald-600' />
                    <span>
                      CV de base : <strong className='font-medium text-ink'>{profile.cv_filename}</strong>. Tes fichiers PDF se gèrent dans « Mes CV ».
                    </span>
                  </p>
                )}

                <PersonalInfoCard {...ready} />

                <CollapsibleBlock title='Expériences professionnelles' count={profile.experiences.length} hint='cliquer pour ouvrir'>
                  <ExperiencesCard {...ready} />
                </CollapsibleBlock>

                <CollapsibleBlock title='Formations et diplômes' count={profile.formations.length} hint='cliquer pour ouvrir'>
                  <FormationsCard {...ready} />
                </CollapsibleBlock>

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
          </CardStyleContext.Provider>
        </div>
      </div>
    </div>
  );
};
