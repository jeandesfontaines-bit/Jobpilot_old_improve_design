export const fmtDate = (value?: string | null, empty = ''): string => {
  if (!value) return empty;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleDateString('fr-CH');
};

export const fmtTime = (value?: string | null, empty = ''): string => {
  if (!value) return empty;
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? String(value)
    : d.toLocaleTimeString('fr-CH', { hour: '2-digit', minute: '2-digit' });
};

export const fmtDateTime = (value?: string | null, empty = ''): string => {
  if (!value) return empty;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleString('fr-CH');
};
