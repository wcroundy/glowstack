import React from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Eye, Tag, Image as ImagesIcon } from 'lucide-react';

const BADGES = {
  confirmed: { label: 'Matches', className: 'bg-green-500 text-white', Icon: CheckCircle2 },
  partial: { label: 'Partly', className: 'bg-amber-500 text-white', Icon: Eye },
  tags: { label: 'Tags match', className: 'bg-surface-700 text-white', Icon: Tag },
  near: { label: 'Close', className: 'bg-surface-500 text-white', Icon: Tag },
};

/** Thumbnail grid for an assistant message that carries a media_search result. */
export default function MediaSearchResults({ search, compact = false }) {
  const results = search?.results || [];
  if (!results.length) return null;
  const openAll = mediaSearchUrl(search);
  const total = (search.all_ids || results).length;

  return (
    <div className="mt-3">
      <div className={`grid gap-2 ${compact ? 'grid-cols-3' : 'grid-cols-3 sm:grid-cols-4'}`}>
        {results.map(r => {
          const badge = BADGES[r.confidence] || BADGES.near;
          const taken = r.taken_at ? new Date(r.taken_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
          const note = [r.seen, !r.seen && r.missing?.length ? `Missing: ${r.missing.join(', ')}` : '', taken && taken !== r.seen ? `Taken ${taken}` : ''].filter(Boolean).join(' · ');
          return (
            <a
              key={r.id}
              href={r.file_url || r.thumbnail_url || '#'}
              target="_blank"
              rel="noreferrer"
              title={[r.title, note].filter(Boolean).join(' — ')}
              className="group relative block aspect-[3/4] rounded-lg overflow-hidden bg-surface-100 border border-surface-200"
            >
              {r.thumbnail_url && <img src={r.thumbnail_url} alt={r.title || 'Matching asset'} loading="lazy" className="w-full h-full object-cover" />}
              <span className={`absolute top-1 left-1 inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[9px] font-medium ${badge.className}`}>
                <badge.Icon className="w-2.5 h-2.5" />{badge.label}
              </span>
              {note && (
                <span className="absolute inset-x-0 bottom-0 bg-black/60 text-white text-[9px] leading-tight px-1.5 py-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  {note}
                </span>
              )}
            </a>
          );
        })}
      </div>
      <Link to={openAll} className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700">
        <ImagesIcon className="w-3.5 h-3.5" /> View {total > results.length ? `all ${total}` : `these ${total}`} in Media Library
      </Link>
    </div>
  );
}

export const getMediaSearch = (message) =>
  (Array.isArray(message?.tool_calls) ? message.tool_calls.find(t => t?.function === 'media_search')?.result : null) || null;

/** Media Library link for a search's full, best-first result set. */
export function mediaSearchUrl(search) {
  const ids = (search?.all_ids || (search?.results || []).map(r => r.id)).join(',');
  const params = new URLSearchParams({ ids });
  if (search?.summary) params.set('aiq', search.summary);
  return `/media?${params}`;
}
