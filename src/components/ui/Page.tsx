import React from 'react';

interface PageProps {
  children: React.ReactNode;
  maxWidth?: 'max-w-3xl' | 'max-w-4xl' | 'max-w-5xl' | 'max-w-6xl';
}

export const Page: React.FC<PageProps> = ({ children, maxWidth = 'max-w-4xl' }) => (
  <div className="flex-1 min-w-0 overflow-y-auto custom-scrollbar bg-white">
    <div className={`${maxWidth} mx-auto px-4 sm:px-8 py-4 sm:py-6 space-y-5 sm:space-y-6`}>{children}</div>
  </div>
);

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}

export const PageHeader: React.FC<PageHeaderProps> = ({ title, description, actions }) => (
  <div className="flex items-center justify-between gap-3 flex-wrap">
    <div className="min-w-0">
      <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-zinc-900">{title}</h1>
      {description && <p className="mt-1 text-sm text-zinc-500">{description}</p>}
    </div>
    {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
  </div>
);
