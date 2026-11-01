import React, { useState } from 'react';
import { Search, Send, FileText, User, Settings as SettingsIcon, Menu, X, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { SidebarItem } from './SidebarItem';

interface AppLayoutProps {
  currentTab: string;
  setCurrentTab: (tab: string) => void;
  appliedJobsCount: number;
  retainedJobsCount: number;
  excludedJobsCount?: number;
  cartCount?: number;
  pilotStatus?: { active: boolean; mode: 'simulation' | 'real' } | null;
  jobsReady: boolean;
  children: React.ReactNode;
}

const TAB_LABELS: Record<string, string> = {
  jobs: 'Offres',
  applications: 'Suivies',
  cart: 'Panier',
  cvs: 'Mes CV',
  profile: 'Profil',
  settings: 'Réglages',
};

const Brand: React.FC<{ collapsed?: boolean }> = ({ collapsed }) => (
  <div className='flex min-w-0 items-center gap-3'>
    <span className='size-2.5 shrink-0 rounded-full bg-accent' />
    {!collapsed && (
      <span className='truncate text-body font-semibold uppercase tracking-wide text-white'>
        JobPilot <span className='font-normal text-white/50'>Suisse</span>
      </span>
    )}
  </div>
);

export const AppLayout: React.FC<AppLayoutProps> = ({
  currentTab,
  setCurrentTab,
  appliedJobsCount,
  retainedJobsCount,
  pilotStatus,
  jobsReady,
  children,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [desktopCollapsed, setDesktopCollapsed] = useState(false);

  const isPilotActive = Boolean(pilotStatus?.active);
  const isRealMode = pilotStatus?.mode === 'real';

  const select = (tab: string) => {
    setCurrentTab(tab);
    setMobileMenuOpen(false);
  };

  const primaryNav = [
    { id: 'jobs', label: 'Offres', icon: Search, count: jobsReady ? retainedJobsCount : undefined },
    { id: 'applications', label: 'Suivies', icon: Send, count: appliedJobsCount },
  ];
  const secondaryNav = [
    { id: 'cvs', label: 'Mes CV', icon: FileText },
    { id: 'profile', label: 'Profil', icon: User },
    { id: 'settings', label: 'Réglages', icon: SettingsIcon },
  ];

  const renderNav = (mobile: boolean) => {
    const collapsed = !mobile && desktopCollapsed;
    const renderItems = (items: Array<{ id: string; label: string; icon: React.ComponentType<{ className?: string }>; count?: number }>) =>
      items.map((item) => (
        <SidebarItem
          key={item.id}
          icon={item.icon}
          label={item.label}
          count={item.count}
          active={currentTab === item.id}
          collapsed={collapsed}
          onClick={() => select(item.id)}
        />
      ));

    return (
      <div className='flex flex-1 flex-col justify-between overflow-y-auto'>
        <div className='space-y-4 p-3'>
          <nav className='space-y-1'>{renderItems(primaryNav)}</nav>
          <nav className='space-y-1 border-t border-white/10 pt-4'>{renderItems(secondaryNav)}</nav>
        </div>

        <button
          type='button'
          onClick={() => select('settings')}
          title='Réglages du pilote'
          className={`flex shrink-0 flex-col gap-1 border-t border-white/10 bg-panel-raised p-4 text-left transition-colors hover:bg-white/5 ${
            collapsed ? 'items-center' : ''
          }`}
        >
          <span className='flex items-center gap-2'>
            <span className={`size-2 shrink-0 rounded-full ${isPilotActive ? 'animate-pulse bg-emerald-500' : 'bg-zinc-500'}`} />
            {!collapsed && <span className='truncate text-caption font-medium text-white/80'>{isPilotActive ? 'Pilote actif' : 'Pilote en pause'}</span>}
          </span>
          {!collapsed && (
            <span className='flex items-center justify-between text-caption text-white/50'>
              Mode
              <span className={isRealMode ? 'font-medium text-accent' : 'font-medium text-white/70'}>{isRealMode ? 'Réel' : 'Simulation'}</span>
            </span>
          )}
        </button>
      </div>
    );
  };

  return (
    <div className='flex h-screen w-screen flex-col overflow-hidden bg-canvas font-sans antialiased md:flex-row'>
      <header className='z-30 flex h-14 shrink-0 select-none items-center justify-between bg-panel px-4 text-white md:hidden'>
        <button
          type='button'
          onClick={() => setMobileMenuOpen(true)}
          className='-ml-2 grid size-10 place-items-center rounded-control hover:bg-white/10'
          aria-label='Ouvrir le menu'
        >
          <Menu className='size-5' />
        </button>
        <span className='text-body font-medium'>{TAB_LABELS[currentTab] ?? 'JobPilot'}</span>
      </header>

      {mobileMenuOpen && (
        <div className='fixed inset-0 z-40 bg-black/60 md:hidden' onClick={() => setMobileMenuOpen(false)} aria-label='Fermer le menu' />
      )}

      <aside
        aria-label='Navigation mobile'
        className={`fixed inset-y-0 left-0 z-50 flex w-64 max-w-[85vw] select-none flex-col bg-panel shadow-overlay transition-transform duration-300 ease-in-out md:hidden ${
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className='flex h-14 shrink-0 items-center justify-between border-b border-white/10 px-4'>
          <button type='button' onClick={() => select('jobs')}>
            <Brand />
          </button>
          <button
            type='button'
            onClick={() => setMobileMenuOpen(false)}
            className='-mr-2 grid size-10 place-items-center rounded-control text-white/70 hover:bg-white/10 hover:text-white'
            aria-label='Fermer le menu'
          >
            <X className='size-5' />
          </button>
        </div>
        {renderNav(true)}
      </aside>

      <aside
        aria-label='Navigation bureau'
        className={`z-20 hidden h-full shrink-0 select-none flex-col border-r border-white/5 bg-panel transition-all duration-200 md:flex ${
          desktopCollapsed ? 'w-16' : 'w-56'
        }`}
      >
        <div className={`flex h-16 shrink-0 items-center border-b border-white/5 ${desktopCollapsed ? 'justify-center' : 'justify-between px-4'}`}>
          {!desktopCollapsed && (
            <button type='button' onClick={() => setCurrentTab('jobs')} title='JobPilot Suisse' className='min-w-0'>
              <Brand />
            </button>
          )}
          <button
            type='button'
            onClick={() => setDesktopCollapsed(!desktopCollapsed)}
            className='grid size-8 place-items-center rounded-control text-white/50 transition-colors hover:bg-white/10 hover:text-white'
            title={desktopCollapsed ? 'Déployer le menu' : 'Rétracter le menu'}
            aria-label={desktopCollapsed ? 'Déployer le menu' : 'Rétracter le menu'}
          >
            {desktopCollapsed ? <PanelLeftOpen className='size-4' /> : <PanelLeftClose className='size-4' />}
          </button>
        </div>
        {renderNav(false)}
      </aside>

      <main className='flex h-full min-w-0 flex-1 flex-col overflow-hidden bg-canvas' id='workspaceArea'>
        {children}
      </main>
    </div>
  );
};
