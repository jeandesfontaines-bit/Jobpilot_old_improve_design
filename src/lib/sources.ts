const SOURCE_LABELS: Record<string, string> = {
  job_room: 'Job-Room',
  jobs_ch: 'Jobs.ch',
  jobup_ch: 'Jobup.ch',
  linkedin: 'LinkedIn',
  indeed_ch: 'Indeed.ch',
  jobscout24: 'JobScout24',
  jobwinner: 'Jobwinner',
  jobeo: 'Jobeo',
};

export const sourceLabel = (source?: string | null): string => {
  if (!source) return '';
  return SOURCE_LABELS[source] ?? source;
};
