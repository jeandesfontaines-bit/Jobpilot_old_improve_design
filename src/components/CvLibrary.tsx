import React, { useEffect, useState } from 'react';
import axios from 'axios';

interface Cv { id: string; name: string; createdAt: string; bytes: number; }

export function CvLibrary() {
  const [items, setItems] = useState<Cv[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);

  async function refresh() {
    setLoading(true);
    try {
      const { data } = await axios.get('/api/cvs');
      if (!Array.isArray(data) || !data.every(x => typeof x.id === 'string' && typeof x.name === 'string')) throw new Error('API bibliothèque CV non disponible');
      setItems(data);
      setSelected(current => data.some(x => x.id === current) ? current : data[0]?.id || null);
      setError('');
      setReady(true);
    } catch {
      setReady(false);
      setError('Bibliothèque indisponible : le serveur doit être actif.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void refresh(); }, []);

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true); setError('');
    try {
      for (const file of Array.from(files)) {
        if (!file.name.toLowerCase().endsWith('.pdf') || file.size > 10 * 1024 * 1024)
          throw new Error('PDF uniquement, 10 Mo maximum par fichier.');
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onerror = () => reject(new Error('Lecture du PDF impossible'));
          reader.onload = () => resolve(String(reader.result).split(',')[1]);
          reader.readAsDataURL(file);
        });
        await axios.post('/api/cvs', { name: file.name.replace(/\.pdf$/i, ''), base64_content: base64 });
      }
      await refresh();
    } catch (e: any) {
      setError(e.response?.data?.error || e.message || 'Import impossible');
    } finally {
      setBusy(false);
    }
  }

  const cv = items.find(x => x.id === selected);
  const fileUrl = cv ? `/api/cvs/${encodeURIComponent(cv.id)}/file` : '';

  return (
    <section className="space-y-4" aria-label="Bibliothèque de CV">

      {/* En-tête : liste des CVs + bouton import */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          {loading && <p className="text-sm text-zinc-500">Chargement des CV…</p>}
          {!loading && ready && items.length === 0 && (
            <p className="text-sm text-zinc-500">Aucun CV importé. Utilisez le bouton ci-contre pour ajouter votre premier PDF.</p>
          )}
          {!loading && ready && items.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {items.map(item => (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={item.id === selected}
                  onClick={() => setSelected(item.id)}
                  className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium border transition-colors ${
                    item.id === selected
                      ? 'bg-zinc-900 text-white border-zinc-900'
                      : 'bg-white text-zinc-700 border-zinc-300 hover:border-zinc-500 hover:bg-zinc-50'
                  }`}
                >
                  <span>{item.name}</span>
                  <span className={`text-xs ${item.id === selected ? 'text-zinc-300' : 'text-zinc-400'}`}>
                    {Math.ceil(item.bytes / 1024)} Ko
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Bouton import */}
        <label className={`inline-flex items-center gap-2 cursor-pointer rounded-lg border px-4 py-2 text-sm font-semibold transition-colors ${busy || !ready ? 'opacity-50 pointer-events-none' : 'border-zinc-300 text-zinc-700 bg-white hover:bg-zinc-50 hover:border-zinc-400'}`}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
          </svg>
          <span>{busy ? 'Import en cours…' : 'Importer un PDF'}</span>
          <input
            aria-label="Importer des CV PDF"
            type="file"
            accept="application/pdf,.pdf"
            multiple
            disabled={busy || !ready}
            onChange={e => { void upload(e.target.files); e.target.value = ''; }}
            className="sr-only"
          />
        </label>
      </div>

      {/* Erreur */}
      {error && (
        <div role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 flex items-center justify-between gap-3">
          <span>{error}</span>
          <button type="button" onClick={() => void refresh()} className="underline whitespace-nowrap">Réessayer</button>
        </div>
      )}

      {/* Aperçu du CV sélectionné */}
      {cv && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-zinc-500">
              Importé le {new Date(cv.createdAt).toLocaleDateString('fr-CH')} · {Math.ceil(cv.bytes / 1024)} Ko
            </span>
            <a href={`${fileUrl}?download=1`} className="rounded border border-zinc-300 bg-white px-3 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50">
              Télécharger
            </a>
            <a href={fileUrl} target="_blank" rel="noopener noreferrer" className="rounded border border-zinc-300 bg-white px-3 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50">
              Ouvrir dans un onglet
            </a>
          </div>
          <iframe
            key={cv.id}
            title={`Aperçu du CV : ${cv.name}`}
            src={fileUrl}
            className="w-full rounded-lg border border-zinc-200 bg-zinc-100"
            style={{ height: '65vh', minHeight: 400 }}
          />
          <p className="text-xs text-zinc-400">Si l'aperçu ne s'affiche pas, utilisez « Ouvrir dans un onglet ».</p>
        </div>
      )}

    </section>
  );
}
