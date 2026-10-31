import React, { useState } from 'react';
import {
  Search,
  Send,
  FileText,
  User,
  Settings as SettingsIcon,
  Menu,
  X,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';

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

interface NavGroupItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  count?: number;
}

export const AppLayout: React.FC<AppLayoutProps> = ({
  currentTab,
  setCurrentTab,
  appliedJobsCount,
  retainedJobsCount,
  cartCount,
  pilotStatus,
  jobsReady,
  children,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [desktopCollapsed, setDesktopCollapsed] = useState(false);

  const isPilotActive = Boolean(pilotStatus?.active);
  const isRealMode = pilotStatus?.mode === 'real';

  const handleSelectTab = (tab: string) => {
    setCurrentTab(tab);
    setMobileMenuOpen(false);
  };

  const currentTabLabel = () => {
    switch (currentTab) {
      case 'jobs':
        return 'Offres';
      case 'applications':
        return 'Suivies';
      case 'cart':
        return 'Panier';
      case 'cvs':
        return 'Mes CV';
      case 'profile':
        return 'Profil';
      case 'settings':
        return 'Réglages';
      default:
        return 'JobPilot';
    }
  };

  // Contenu partagé du menu de navigation
  const renderNavContent = (isMobileDrawer = false) => (
    <div className="flex-1 flex flex-col justify-between overflow-y-auto">
      <div className="px-2 sm:px-3 py-2 space-y-4">
        {/* Navigation principale */}
        <nav className="space-y-0.5">
          {/* Offres */}
          <button
            type="button"
            onClick={() => handleSelectTab('jobs')}
            className={`w-full group flex items-center ${
              !isMobileDrawer && desktopCollapsed ? 'justify-center' : 'justify-between'
            } px-2.5 py-2.5 rounded-md text-[13px] tracking-tight transition-colors ${
              currentTab === 'jobs'
                ? 'text-white font-semibold bg-white/10'
                : 'text-[#a1a1a9] hover:text-white hover:bg-white/5 font-medium'
            }`}
            title="Offres d'emploi"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <Search className="w-4 h-4 shrink-0 text-[#a1a1a9] group-hover:text-white" />
              {(isMobileDrawer || !desktopCollapsed) && <span>Offres</span>}
            </div>
            {jobsReady && (isMobileDrawer || !desktopCollapsed) && (
              <span className="text-xs font-semibold text-[#a1a1aa] group-hover:text-white">
                {retainedJobsCount}
              </span>
            )}
          </button>

          {/* Suivies / Candidatures */}
          <button
            type="button"
            onClick={() => handleSelectTab('applications')}
            className={`w-full group flex items-center ${
              !isMobileDrawer && desktopCollapsed ? 'justify-center' : 'justify-between'
            } px-2.5 py-2.5 rounded-md text-[13px] tracking-tight transition-colors ${
              currentTab === 'applications'
                ? 'text-white font-semibold bg-white/10'
                : 'text-[#a1a1a9] hover:text-white hover:bg-white/5 font-medium'
            }`}
            title="Candidatures suivies"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <Send className="w-4 h-4 shrink-0 text-[#a1a1a9] group-hover:text-white" />
              {(isMobileDrawer || !desktopCollapsed) && <span>Suivies</span>}
            </div>
            {(isMobileDrawer || !desktopCollapsed) && (
              <span className="text-xs font-semibold text-[#a1a1aa] group-hover:text-white">
                {appliedJobsCount}
              </span>
            )}
          </button>


        </nav>

        <hr className="border-0 border-t border-white/10 my-2 mx-1" />

        <nav className="space-y-0.5">
          {/* Mes CV */}
          <button
            type="button"
            onClick={() => handleSelectTab('cvs')}
            className={`w-full group flex items-center ${
              !isMobileDrawer && desktopCollapsed ? 'justify-center' : 'justify-between'
            } px-2.5 py-2.5 rounded-md text-[13px] tracking-tight transition-colors ${
              currentTab === 'cvs'
                ? 'text-white font-semibold bg-white/10'
                : 'text-[#a1a1a9] hover:text-white hover:bg-white/5 font-medium'
            }`}
            title="Mes CVs"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <FileText className="w-4 h-4 shrink-0 text-[#a1a1a9] group-hover:text-white" />
              {(isMobileDrawer || !desktopCollapsed) && <span>Mes CV</span>}
            </div>
          </button>

          {/* Profil */}
          <button
            type="button"
            onClick={() => handleSelectTab('profile')}
            className={`w-full group flex items-center ${
              !isMobileDrawer && desktopCollapsed ? 'justify-center' : 'justify-between'
            } px-2.5 py-2.5 rounded-md text-[13px] tracking-tight transition-colors ${
              currentTab === 'profile'
                ? 'text-white font-semibold bg-white/10'
                : 'text-[#a1a1a9] hover:text-white hover:bg-white/5 font-medium'
            }`}
            title="Mon Profil"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <User className="w-4 h-4 shrink-0 text-[#a1a1a9] group-hover:text-white" />
              {(isMobileDrawer || !desktopCollapsed) && <span>Profil</span>}
            </div>
          </button>

          {/* Réglages */}
          <button
            type="button"
            onClick={() => handleSelectTab('settings')}
            className={`w-full group flex items-center ${
              !isMobileDrawer && desktopCollapsed ? 'justify-center' : 'justify-between'
            } px-2.5 py-2.5 rounded-md text-[13px] tracking-tight transition-colors ${
              currentTab === 'settings'
                ? 'text-white font-semibold bg-white/10'
                : 'text-[#a1a1a9] hover:text-white hover:bg-white/5 font-medium'
            }`}
            title="Paramètres & Pilote"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <SettingsIcon className="w-4 h-4 shrink-0 text-[#a1a1a9] group-hover:text-white" />
              {(isMobileDrawer || !desktopCollapsed) && <span>Réglages</span>}
            </div>
          </button>
        </nav>
      </div>

      {/* ── BAS DE LA BARRE : état du Pilote auto + mode ── */}
      <div className="p-3 border-t border-white/10 bg-[#191a1d] shrink-0">
        <div
          onClick={() => handleSelectTab('settings')}
          className="cursor-pointer rounded p-2 hover:bg-white/5 transition-colors flex flex-col gap-1"
          title="Accéder aux réglages du pilote"
        >
          <div
            className={`flex items-center ${
              !isMobileDrawer && desktopCollapsed ? 'justify-center' : 'justify-start'
            } gap-2`}
          >
            <span
              className={`w-2 h-2 rounded-full shrink-0 ${
                isPilotActive ? 'bg-emerald-500 animate-pulse' : 'bg-zinc-500'
              }`}
            />
            {(isMobileDrawer || !desktopCollapsed) && (
              <span className="text-[11px] font-semibold text-zinc-300 truncate">
                {isPilotActive ? 'Pilote actif' : 'Pilote en pause'}
              </span>
            )}
          </div>
          {(isMobileDrawer || !desktopCollapsed) && (
            <div className="flex items-center justify-between text-[10px] text-[#71717a] pt-1">
              <span>Mode</span>
              <span className={isRealMode ? 'text-[#e10600] font-semibold' : 'text-zinc-400 font-semibold'}>
                {isRealMode ? 'Réel' : 'Simulation'}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="h-screen w-screen flex flex-col md:flex-row overflow-hidden bg-[#eeece7] font-sans antialiased">
      {/* ── BARRE MOBILE SUPÉRIEURE (visible uniquement sur mobile pour libérer 100% de la largeur) ── */}
      <header className="md:hidden h-14 px-3 bg-[#1f2024] text-white flex items-center justify-between shrink-0 z-30 border-b-2 border-white/20 select-none shadow-sm">
        <button
          type="button"
          onClick={() => setMobileMenuOpen(true)}
          className="flex items-center gap-2.5 px-4 py-2 rounded-lg bg-[#e10600]/20 hover:bg-[#e10600]/30 active:scale-95 text-sm font-bold text-white transition-all cursor-pointer border border-[#e10600]/50 shadow-sm"
          aria-label="Ouvrir le menu"
          title="Ouvrir le menu"
        >
          <Menu className="w-5 h-5 text-white" />
          <span className="font-bold tracking-tight">Menu</span>
        </button>

        <div className="flex items-center gap-2">
          <span className="text-[11px] font-medium text-zinc-300 px-2.5 py-1 rounded-md bg-white/5 border border-white/10">
            {currentTabLabel()}
          </span>
        </div>
      </header>

      {/* ── BACKDROP MOBILE (ferme/rétracte le menu au clic extérieur) ── */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-xs z-40 md:hidden transition-opacity duration-200"
          onClick={() => setMobileMenuOpen(false)}
          aria-label="Fermer le menu"
        />
      )}

      {/* ── TIROIR MOBILE RÉTRACTABLE (0px de place perdue quand fermé !) ── */}
      <aside
        aria-label="Navigation mobile"
        className={`fixed inset-y-0 left-0 w-64 max-w-[85vw] bg-[#1f2024] text-[#a1a1a9] select-none z-50 flex flex-col shadow-2xl border-r border-[#ffffff15] transform transition-transform duration-300 ease-in-out md:hidden ${
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* En-tête mobile avec bouton Rétracter très visible */}
        <div className="h-14 flex items-center justify-between px-4 border-b border-white/10 shrink-0 bg-[#191a1d]">
          <div
            className="flex items-center gap-2.5 cursor-pointer"
            onClick={() => handleSelectTab('jobs')}
          >
            <div className="w-2.5 h-2.5 rounded-full bg-[#e10600] shrink-0" />
            <div>
              <strong className="text-white text-[13px] font-extrabold tracking-tight leading-none uppercase block">
                JobPilot
              </strong>
              <small className="text-[8px] font-medium tracking-[0.18em] text-[#71717a] uppercase block mt-0.5">
                Suisse
              </small>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setMobileMenuOpen(false)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium text-zinc-300 hover:text-white bg-white/10 hover:bg-white/15 transition-colors cursor-pointer"
            title="Rétracter le menu"
            aria-label="Rétracter le menu"
          >
            <X className="w-4 h-4 text-white" />
            <span>Rétracter</span>
          </button>
        </div>

        {renderNavContent(true)}
      </aside>

      {/* ── BARRE LATÉRALE BUREAU (Desktop) : Rétractable / Déployable ── */}
      <aside
        aria-label="Navigation bureau"
        className={`hidden md:flex shrink-0 h-full flex-col bg-[#1f2024] text-[#a1a1a9] select-none z-20 border-r border-[#ffffff0f] transition-all duration-200 ${
          desktopCollapsed ? 'w-16' : 'w-52'
        }`}
      >
        {/* En-tête / Brand + Bouton Rétracter bureau */}
        <div className="h-16 flex items-center justify-between px-3 sm:px-4 shrink-0 border-b border-white/5">
          <div
            className="flex items-center gap-2.5 cursor-pointer hover:opacity-90 transition-opacity min-w-0"
            onClick={() => setCurrentTab('jobs')}
            title="JobPilot Suisse"
          >
            <div className="w-2.5 h-2.5 rounded-full bg-[#e10600] shrink-0" />
            {!desktopCollapsed && (
              <div className="truncate">
                <strong className="text-white text-[14px] font-extrabold tracking-tight leading-none uppercase block">
                  JobPilot
                </strong>
                <small className="text-[8.5px] font-medium tracking-[0.2em] text-[#71717a] uppercase block mt-0.5">
                  Suisse
                </small>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => setDesktopCollapsed(!desktopCollapsed)}
            className="p-1 rounded text-zinc-500 hover:text-white hover:bg-white/10 transition-colors"
            title={desktopCollapsed ? 'Déployer le menu' : 'Rétracter le menu'}
            aria-label={desktopCollapsed ? 'Déployer le menu' : 'Rétracter le menu'}
          >
            {desktopCollapsed ? (
              <PanelLeftOpen className="w-4 h-4" />
            ) : (
              <PanelLeftClose className="w-4 h-4" />
            )}
          </button>
        </div>

        {renderNavContent(false)}
      </aside>

      {/* ── CONTENU PRINCIPAL (100% de largeur disponible sur mobile !) ── */}
      <main className="flex-1 flex flex-col min-w-0 h-full overflow-hidden bg-[#eeece7]" id="workspaceArea">
        {children}
      </main>
    </div>
  );
};
