import React from 'react';

export const TextLink: React.FC<React.AnchorHTMLAttributes<HTMLAnchorElement>> = ({
  className = '',
  children,
  ...props
}) => (
  <a className={`inline-flex items-center gap-2 text-sm font-medium text-zinc-700 hover:text-zinc-950 ${className}`} {...props}>
    {children}
  </a>
);
