import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import { api } from '../services/api';

function CitationLink({ evidence }) {
  let url;
  try { const parsed = new URL(evidence.source); if (parsed.protocol === 'https:' && !parsed.username && !parsed.password) url = parsed.href; } catch {}
  return url
    ? <a className="underline" href={url} target="_blank" rel="noopener noreferrer">{evidence.title}</a>
    : <span className="font-medium">{evidence.title}</span>;
}

function TagChip({ tag, active, suggested, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
        active
          ? 'text-white border-transparent'
          : suggested
            ? 'border-brand-300 text-brand-600 hover:bg-brand-50'
            : 'border-surface-200 text-surface-500 hover:border-surface-300'
      }`}
      style={active ? { backgroundColor: tag.color || '#ec4899' } : undefined}
    >
      {tag.name}
    </button>
  );
}

function AssetTile({ asset, selected, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left rounded-xl overflow-hidden border transition-all ${selected ? 'border-brand-400 ring-2 ring-brand-300' : 'border-surface-200 hover:border-surface-300'}`}
    >
      <div className="relative aspect-square bg-surface-100">
        <img src={asset.thumbnail_url || asset.file_url} alt={asset.title || asset.file_name} className="w-full h-full object-cover" />
        {selected && (
          <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-brand-500 text-white flex items-center justify-center">
            <Check className="w-3 h-3" />
          </div>
        )}
      </div>
      <div className="p-2 space-y-1">
        <p className="text-[11px] font-medium text-surface-800 truncate">{asset.title || asset.file_name}</p>
        {asset.tag_objects?.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {asset.tag_objects.slice(0, 2).map(t => (
              <span key={t.id} className="text-[9px] px-1.5 py-0.5 rounded-full text-white" style={{ backgroundColor: t.color || '#ec4899' }}>{t.name}</span>
            ))}
          </div>
        )}
      </div>
    </button>
  );
}

// Same term-extraction pattern already used for focus matching in
// server/services/contentIdeas.js and externalEvidence.js.
function extractTerms(text) {
  return [...new Set((text || '').toLowerCase().match(/[a-z0-9]{3,}/g) || [])];
}

export default function ShootAssets({ idea, selectedAssetIds = [], onToggleAsset }) {
  const [allTags, setAllTags] = useState([]);
  const [selectedTagIds, setSelectedTagIds] = useState([]);
  const [matches, setMatches] = useState([]);
  const [loadingMatches, setLoadingMatches] = useState(false);
  const [error, setError] = useState('');
  const [assetCache, setAssetCache] = useState({});
  const attemptedIds = useRef(new Set()); // a deleted asset must not be re-fetched forever

  useEffect(() => {
    api.getTags().then(r => setAllTags(r.data || [])).catch(() => setError('Could not load tags.'));
  }, []);

  const suggestedIds = useMemo(() => {
    const terms = extractTerms(`${idea?.title || ''} ${idea?.hook || ''} ${(idea?.pieces || []).map(p => p.purpose).join(' ')}`);
    if (!terms.length) return new Set();
    const matched = allTags
      .filter(t => {
        const name = t.name.toLowerCase();
        return terms.some(term => name.includes(term) || term.includes(name));
      })
      .sort((a, b) => (b.usage_count || 0) - (a.usage_count || 0))
      .slice(0, 8);
    return new Set(matched.map(t => t.id));
  }, [idea, allTags]);

  const orderedTags = useMemo(() => {
    const suggested = allTags.filter(t => suggestedIds.has(t.id));
    const rest = allTags.filter(t => !suggestedIds.has(t.id));
    return [...suggested, ...rest];
  }, [allTags, suggestedIds]);

  useEffect(() => {
    if (!selectedTagIds.length) { setMatches([]); return; }
    setLoadingMatches(true); setError('');
    api.getMedia({ tags: selectedTagIds.join(','), limit: 60 })
      .then(r => {
        const found = r.data || [];
        setMatches(found);
        setAssetCache(c => ({ ...c, ...Object.fromEntries(found.map(a => [a.id, a])) }));
      })
      .catch(() => setError('Could not load matching assets.'))
      .finally(() => setLoadingMatches(false));
  }, [selectedTagIds]);

  useEffect(() => {
    const missing = selectedAssetIds.filter(id => !assetCache[id] && !attemptedIds.current.has(id));
    if (!missing.length) return;
    missing.forEach(id => attemptedIds.current.add(id));
    Promise.all(missing.map(id => api.getMediaById(id).catch(() => null))).then(loaded => {
      const found = loaded.filter(Boolean);
      if (found.length) setAssetCache(c => ({ ...c, ...Object.fromEntries(found.map(a => [a.id, a])) }));
    });
  }, [selectedAssetIds, assetCache]);

  const selectedAssets = selectedAssetIds.map(id => assetCache[id]).filter(Boolean);

  const toggleTag = (id) => setSelectedTagIds(ids => ids.includes(id) ? ids.filter(i => i !== id) : [...ids, id]);

  return <div className="mt-5 space-y-5">
    {idea?.evidence?.length > 0 && (
      <div className="rounded-xl border border-surface-200 p-4 space-y-2">
        <h4 className="text-sm font-medium">What you're reusing</h4>
        <p className="text-xs text-surface-500">The posts and sources this plan is based on.</p>
        <ul className="space-y-2 mt-1">
          {idea.evidence.map((e, i) => (
            <li key={i} className="text-xs border-l-2 border-brand-200 pl-3">
              <CitationLink evidence={e} />
              <p className="text-surface-600 mt-0.5">{e.quote}</p>
              <p className="text-surface-400 mt-0.5">{e.freshness ? `Refreshed: ${e.freshness}` : `Snapshot: ${new Date(e.captured_at).toLocaleDateString()}`}</p>
            </li>
          ))}
        </ul>
      </div>
    )}

    {selectedAssetIds.length > 0 && (
      <div className="rounded-xl border border-brand-200 p-4 space-y-2">
        <h4 className="text-sm font-medium">{selectedAssetIds.length} asset{selectedAssetIds.length === 1 ? '' : 's'} selected for this shoot</h4>
        <p className="text-xs text-surface-500">Click one to remove it.</p>
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mt-1">
          {selectedAssets.map(asset => (
            <AssetTile key={asset.id} asset={asset} selected onClick={() => onToggleAsset(asset.id)} />
          ))}
        </div>
      </div>
    )}

    <div className="rounded-xl border border-surface-200 p-4 space-y-3">
      <h4 className="text-sm font-medium">Find relevant assets</h4>
      <p className="text-xs text-surface-500">Tags matching this idea are highlighted. Select one or more to see assets that have them.</p>
      {allTags.length === 0 && !error && <p className="text-xs text-surface-400">Loading tags…</p>}
      {allTags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {orderedTags.map(t => (
            <TagChip key={t.id} tag={t} active={selectedTagIds.includes(t.id)} suggested={suggestedIds.has(t.id)} onClick={() => toggleTag(t.id)} />
          ))}
        </div>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
      {loadingMatches && <p className="text-xs text-surface-400">Loading matching assets…</p>}
      {!loadingMatches && selectedTagIds.length > 0 && matches.length === 0 && !error && (
        <p className="text-xs text-surface-400">No assets have all of the selected tags.</p>
      )}
      {matches.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mt-2">
          {matches.map(asset => (
            <AssetTile key={asset.id} asset={asset} selected={selectedAssetIds.includes(asset.id)} onClick={() => onToggleAsset(asset.id)} />
          ))}
        </div>
      )}
    </div>
  </div>;
}
