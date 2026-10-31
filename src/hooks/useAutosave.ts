import { useCallback, useEffect, useRef, useState } from 'react';

export type AutosaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

export function useAutosave<T>(value: T | null, persist: (value: T) => Promise<unknown>) {
  const [status, setStatus] = useState<AutosaveStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const baseline = useRef<string | undefined>(undefined);
  const latest = useRef<T | null>(null);
  const persistRef = useRef(persist);
  const mounted = useRef(false);
  const running = useRef<Promise<void> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  persistRef.current = persist;

  const flush = useCallback((): Promise<void> => {
    if (timer.current) clearTimeout(timer.current);
    if (running.current) return running.current;
    if (latest.current === null || baseline.current === undefined || JSON.stringify(latest.current) === baseline.current) return Promise.resolve();
    const write = async () => {
      try {
        while (latest.current !== null && JSON.stringify(latest.current) !== baseline.current) {
          const snapshot = latest.current;
          const json = JSON.stringify(snapshot);
          if (mounted.current) { setStatus('saving'); setError(null); }
          await persistRef.current(snapshot);
          baseline.current = json;
        }
        if (mounted.current) { setStatus('saved'); setSavedAt(Date.now()); }
      } catch (cause: any) {
        if (mounted.current) {
          setError(cause?.response?.data?.error || cause?.message || 'Enregistrement impossible');
          setStatus('error');
        }
      }
    };
    running.current = write().finally(() => { running.current = null; });
    return running.current;
  }, []);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (timer.current) clearTimeout(timer.current);
      void flush();
    };
  }, [flush]);

  useEffect(() => {
    latest.current = value;
    if (timer.current) clearTimeout(timer.current);
    if (value === null) return;
    const json = JSON.stringify(value);
    if (baseline.current === undefined) { baseline.current = json; return; }
    if (running.current) return;
    if (json === baseline.current) { setStatus('idle'); setError(null); return; }
    setStatus('pending');
    timer.current = setTimeout(() => { void flush(); }, 800);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [value, flush]);

  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => {
      if (latest.current !== null && baseline.current !== undefined && JSON.stringify(latest.current) !== baseline.current) {
        event.preventDefault(); event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, []);

  return { status, error, savedAt, retry: flush };
}
