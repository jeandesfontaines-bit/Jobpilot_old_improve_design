export type Theme = 'light' | 'dark' | 'black';

const KEY = 'jobpilot-theme';

export const getTheme = (): Theme => {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'dark' || v === 'black' || v === 'light') return v;
  } catch (e) {
    /* ignore */
  }
  return 'light';
};

export const applyTheme = (t: Theme) => {
  const el = document.documentElement;
  el.classList.remove('theme-dark', 'theme-black');
  if (t !== 'light') el.classList.add(`theme-${t}`);
};

export const setTheme = (t: Theme) => {
  try {
    localStorage.setItem(KEY, t);
  } catch (e) {
    /* ignore */
  }
  applyTheme(t);
};

export const initTheme = () => applyTheme(getTheme());
