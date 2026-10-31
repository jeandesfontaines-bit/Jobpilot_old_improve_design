import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { SectionLabel } from './SectionLabel';
import { Button } from './Button';

interface DetailPanelProps {
  children: React.ReactNode;
  maxWidth?: 'max-w-none' | 'max-w-2xl' | 'max-w-3xl' | 'max-w-4xl';
}

export const DetailPanel: React.FC<DetailPanelProps> = ({ children, maxWidth = 'max-w-none' }) => (
  <div className="flex-1 min-h-0 min-w-0 overflow-y-auto custom-scrollbar bg-white px-6 sm:px-10 pb-10">
    <div className={`w-full pt-8 ${maxWidth} space-y-8`}>{children}</div>
  </div>
);

interface DetailToolbarProps {
  left?: React.ReactNode;
  right?: React.ReactNode;
}

export const DetailToolbar: React.FC<DetailToolbarProps> = ({ left, right }) => (
  <div className="sticky top-0 z-10 bg-white flex items-center justify-between flex-wrap gap-3 border-b border-zinc-200/80 pb-4">
    <div className="flex items-center gap-2.5 text-sm text-zinc-500">{left}</div>
    <div className="flex items-center gap-3 flex-wrap">{right}</div>
  </div>
);

interface DetailTitleProps {
  meta?: React.ReactNode;
  title: string;
  subtitle?: React.ReactNode;
  badges?: React.ReactNode;
}

export const DetailTitle: React.FC<DetailTitleProps> = ({ meta, title, subtitle, badges }) => (
  <div className="space-y-3">
    {meta && <div className="flex items-center gap-3 text-sm text-zinc-400">{meta}</div>}
    {badges && <div className="flex items-center gap-2 flex-wrap">{badges}</div>}
    <h1 className="text-2xl sm:text-3xl font-extrabold text-zinc-900 tracking-tight leading-tight">{title}</h1>
    {subtitle && <p className="text-base text-zinc-500">{subtitle}</p>}
  </div>
);

interface DetailSectionProps {
  label: string;
  children: React.ReactNode;
  bordered?: boolean;
}

export const DetailSection: React.FC<DetailSectionProps> = ({ label, children, bordered = false }) => (
  <div className={`space-y-3 ${bordered ? 'pt-6 border-t border-zinc-200/80' : ''}`}>
    <SectionLabel>{label}</SectionLabel>
    {children}
  </div>
);

interface DetailFooterProps {
  left?: React.ReactNode;
  right?: React.ReactNode;
}

export const DetailFooter: React.FC<DetailFooterProps> = ({ left, right }) => (
  <div className="shrink-0 border-t border-zinc-200/80 bg-white px-6 sm:px-10 py-4 flex items-center justify-between gap-3">
    <div>{left}</div>
    <div className="flex items-center gap-3">{right}</div>
  </div>
);

export const BackButton: React.FC<{ onClick: () => void; label?: string }> = ({ onClick, label = 'Retour' }) => (
  <Button variant="ghost" size="sm" onClick={onClick} className="sm:hidden">
    <ArrowLeft className="w-4 h-4" />
    {label}
  </Button>
);
