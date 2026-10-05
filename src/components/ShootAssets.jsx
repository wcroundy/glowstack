import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ExternalLink, Plus } from 'lucide-react';
import { api } from '../services/api';

const POST_PREFIX = 'app-post-';

function safeHttps(value) {
  try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password ? u.href : null; } catch { return null; }
}

// Words too generic to say anything about what an idea is about.
const GENERIC = new Set(['the', 'and', 'for', 'with', 'day', 'new', 'best', 'from', 'that', 'this', 'your', 'you', 'are', 'was']);
const stem = w => (w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w);
const words = text => (text || '').toLowerCase().match(/[a-z0-9]{3,}/g) || [];

function PostCard({ post }) {
  const url = safeHttps(post.post_url);
  const metrics = [['views', post.views], ['reach', post.reach], ['likes', post.likes], ['comments', post.comments], ['shares', post.shares], ['saves', post.saves], ['clicks', post.clicks]]
    .filter(([, v]) => typeof v === 'number' && v > 0);
  const [thumbOk, setThumbOk] = useState(true);
  return (
    <div className="flex gap-3 rounded-lg border border-surface-200 p-3">
      {post.thumbnail_url && thumbOk && (
        <img src={post.thumbnail_url} alt="" onError={() => setThumbOk(false)} className="w-16 h-16 rounded-md object-cover shrink-0 bg-surface-100" />
      )}
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-xs font-medium text-surface-800 capitalize">
          {post.platform} {post.post_type || 'post'}
          {post.published_at && <span className="font-normal text-surface-400"> · {new Date(post.published_at).toLocaleDateString()}</span>}
        </p>
        {post.caption && <p className="text-xs text-surface-600 line-clamp-2">{post.caption}</p>}
        {metrics.length > 0 && <p className="text-[11px] text-surface-400">{metrics.map(([k, v]) => `${v.toLocaleString()} ${k}`).join(' · ')}</p>}
        {url && (
          <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-brand-600 hover:underline">
            View post <ExternalLink className="w-3 h-3" />
          </a>
        )}
      </div>
    </div>
  );
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
        {asset.matched_tags?.length > 0 && <p className="text-[10px] text-brand-600 truncate">{asset.matched_tags.join(' · ')}</p>}
        {asset.tag_objects?.length > 0 && !asset.matched_tags && (
          <div className="flex flex-wrap gap-1">
            {asset.tag_objects.slice(0, 2).map(t => (
              <span key={t.id} className="text-[9px] px-1.5 py-0.5 rounded-full text-white" style={{ backgroundColor: t.color || '#ec4899' }}>{t.name}</span>
            ))}
          </div>
        )}
        <p className={`text-[10px] font-medium flex items-center gap-0.5 ${selected ? 'text-brand-600' : 'text-surface-400'}`}>
          {selected ? <><Check className="w-3 h-3" /> Added to idea</> : <><Plus className="w-3 h-3" /> Add to idea</>}
        </p>
      </div>
    </button>
  );
}

export default function ShootAssets({ idea, selectedAssetIds = [], onToggleAsset }) {
  const [allTags, setAllTags] = useState([]);
  const [selectedTagIds, setSelectedTagIds] = useState([]);
  const [matches, setMatches] = useState([]);
  const [loadingMatches, setLoadingMatches] = useState(false);
  const [suggested, setSuggested] = useState([]);
  const [loadingSuggested, setLoadingSuggested] = useState(true);
  const [posts, setPosts] = useState([]);
  const [error, setError] = useState('');
  const [assetCache, setAssetCache] = useState({});
  const attemptedIds = useRef(new Set()); // a deleted asset must not be re-fetched forever

  useEffect(() => {
    api.getTags().then(r => setAllTags(r.data || [])).catch(() => setError('Could not load tags.'));
  }, []);

  // Posts the idea cites: resolve them to the real post records so they can be shown (and linked).
  const { postEvidence, otherEvidence } = useMemo(() => {
    const seen = new Set(), postEvidence = [], otherEvidence = [];
    for (const e of idea?.evidence || []) {
      if (e.source_id?.startsWith(POST_PREFIX)) {
        if (!seen.has(e.source_id)) { seen.add(e.source_id); postEvidence.push(e); }
      } else otherEvidence.push(e);
    }
    return { postEvidence, otherEvidence };
  }, [idea]);

  useEffect(() => {
    let cancelled = false;
    Promise.all(postEvidence.map(e => api.getPost(e.source_id.slice(POST_PREFIX.length)).catch(() => null)))
      .then(loaded => { if (!cancelled) setPosts(loaded.filter(Boolean)); });
    return () => { cancelled = true; };
  }, [postEvidence]);

  // Tags relevant to this idea: whole-word matches (light plural stemming) against what the
  // idea is actually about, most-mentioned first, popularity as the tie-break.
  const relevantTags = useMemo(() => {
    const text = `${idea?.title || ''} ${idea?.hook || ''} ${(idea?.pieces || []).map(p => p.purpose).join(' ')} ${idea?.shoot_notes || ''} ${idea?.link_notes || ''}`;
    const counts = new Map();
    for (const w of words(text)) if (!GENERIC.has(w)) counts.set(stem(w), (counts.get(stem(w)) || 0) + 1);
    if (!counts.size) return [];
    return allTags
      .map(t => ({ tag: t, score: words(t.name).filter(w => !GENERIC.has(w)).reduce((sum, w) => sum + (counts.get(stem(w)) || 0), 0) }))
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score || (b.tag.usage_count || 0) - (a.tag.usage_count || 0))
      .map(x => x.tag);
  }, [idea, allTags]);

  const suggestedTagIds = useMemo(() => new Set(relevantTags.slice(0, 8).map(t => t.id)), [relevantTags]);
  const suggestionKey = relevantTags.slice(0, 6).map(t => t.id).join(',');

  // Existing assets that carry the most of those tags — no tag-picking needed.
  useEffect(() => {
    if (!allTags.length) return;
    if (!suggestionKey) { setSuggested([]); setLoadingSuggested(false); return; }
    setLoadingSuggested(true);
    api.suggestMedia(suggestionKey, 12)
      .then(r => {
        const found = r.data || [];
        setSuggested(found);
        setAssetCache(c => ({ ...c, ...Object.fromEntries(found.map(a => [a.id, a])) }));
      })
      .catch(() => setError('Could not load suggested assets.'))
      .finally(() => setLoadingSuggested(false));
  }, [suggestionKey, allTags.length]);

  const orderedTags = useMemo(() => {
    const top = allTags.filter(t => suggestedTagIds.has(t.id));
    const rest = allTags.filter(t => !suggestedTagIds.has(t.id));
    return [...top, ...rest];
  }, [allTags, suggestedTagIds]);

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

  // Selected assets we haven't seen yet (e.g. right after reopening a saved draft).
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
  const addAllSuggested = () => suggested.filter(a => !selectedAssetIds.includes(a.id)).forEach(a => onToggleAsset(a.id));
  const notYetAdded = suggested.filter(a => !selectedAssetIds.includes(a.id)).length;

  return <div className="mt-5 space-y-5">
    {(postEvidence.length > 0 || otherEvidence.length > 0) && (
      <div className="rounded-xl border border-surface-200 p-4 space-y-3">
        <div>
          <h4 className="text-sm font-medium">What you're reusing</h4>
          <p className="text-xs text-surface-500">The posts this plan is based on.</p>
        </div>
        {posts.length > 0 && <div className="space-y-2">{posts.map(p => <PostCard key={p.id} post={p} />)}</div>}
        {postEvidence.length > 0 && posts.length === 0 && <p className="text-xs text-surface-400">Loading posts…</p>}
        {otherEvidence.length > 0 && (
          <details>
            <summary className="cursor-pointer text-xs text-surface-500">Other sources this plan is based on ({otherEvidence.length})</summary>
            <ul className="space-y-2 mt-2">
              {otherEvidence.map((e, i) => (
                <li key={i} className="text-xs border-l-2 border-brand-200 pl-3">
                  <span className="font-medium">{e.title}</span>
                  <p className="text-surface-600 mt-0.5">{e.quote}</p>
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    )}

    {selectedAssetIds.length > 0 && (
      <div className="rounded-xl border border-brand-200 p-4 space-y-2">
        <h4 className="text-sm font-medium">{selectedAssetIds.length} asset{selectedAssetIds.length === 1 ? '' : 's'} selected for this shoot</h4>
        <p className="text-xs text-surface-500">Saved with this idea. Click one to remove it.</p>
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mt-1">
          {selectedAssets.map(asset => (
            <AssetTile key={asset.id} asset={asset} selected onClick={() => onToggleAsset(asset.id)} />
          ))}
        </div>
      </div>
    )}

    <div className="rounded-xl border border-surface-200 p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="text-sm font-medium">Suggested assets</h4>
          <p className="text-xs text-surface-500">
            {relevantTags.length > 0
              ? <>Existing assets tagged {relevantTags.slice(0, 3).map(t => t.name).join(', ')}{relevantTags.length > 3 ? ' and more' : ''} — the tags this idea is about.</>
              : 'Existing assets that fit this idea.'}
          </p>
        </div>
        {notYetAdded > 1 && <button type="button" className="btn-secondary text-xs shrink-0" onClick={addAllSuggested}>Add all {notYetAdded}</button>}
      </div>
      {loadingSuggested && <p className="text-xs text-surface-400">Finding assets…</p>}
      {!loadingSuggested && suggested.length === 0 && (
        <p className="text-xs text-surface-400">{relevantTags.length === 0 ? 'No tags matched this idea’s wording — browse by tag below.' : 'No tagged assets match yet.'}</p>
      )}
      {suggested.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
          {suggested.map(asset => (
            <AssetTile key={asset.id} asset={asset} selected={selectedAssetIds.includes(asset.id)} onClick={() => onToggleAsset(asset.id)} />
          ))}
        </div>
      )}
    </div>

    <details className="rounded-xl border border-surface-200 p-4">
      <summary className="cursor-pointer text-sm font-medium">Browse all assets by tag</summary>
      <div className="mt-3 space-y-3">
        <p className="text-xs text-surface-500">Select one or more tags to see assets that have all of them.</p>
        {allTags.length === 0 && !error && <p className="text-xs text-surface-400">Loading tags…</p>}
        {allTags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {orderedTags.map(t => (
              <TagChip key={t.id} tag={t} active={selectedTagIds.includes(t.id)} suggested={suggestedTagIds.has(t.id)} onClick={() => toggleTag(t.id)} />
            ))}
          </div>
        )}
        {loadingMatches && <p className="text-xs text-surface-400">Loading matching assets…</p>}
        {!loadingMatches && selectedTagIds.length > 0 && matches.length === 0 && !error && (
          <p className="text-xs text-surface-400">No assets have all of the selected tags.</p>
        )}
        {matches.length > 0 && (
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {matches.map(asset => (
              <AssetTile key={asset.id} asset={asset} selected={selectedAssetIds.includes(asset.id)} onClick={() => onToggleAsset(asset.id)} />
            ))}
          </div>
        )}
      </div>
    </details>
    {error && <p className="text-xs text-red-600">{error}</p>}
  </div>;
}
