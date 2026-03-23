import React, { useState, useEffect } from 'react';
import {
  Search, Filter, Grid3X3, List, Heart, Star, Tag, Upload,
  Image as ImageIcon, Video, Sparkles, X, ChevronDown, Eye, Camera, ExternalLink,
  ChevronLeft, ChevronRight as ChevronRightIcon, ChevronsLeft, ChevronsRight, Scissors
} from 'lucide-react';
import { api } from '../services/api';
import GooglePhotosBrowser from '../components/google-photos/GooglePhotosBrowser';
import VideoBreakdown from '../components/VideoBreakdown';

// Build a Google Photos link — combines date + filename for best match
function googlePhotosLink(asset) {
  if (asset.source_url) return asset.source_url;
  const parts = [];
  if (asset.captured_at) {
    const d = new Date(asset.captured_at);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    parts.push(`${year}-${month}-${day}`);
  }
  if (asset.file_name) {
    parts.push(asset.file_name);
  }
  return `https://photos.google.com/search/${encodeURIComponent(parts.join(' '))}`;
}

function TagPill({ tag }) {
  return (
    <span
      className="badge text-white text-[10px]"
      style={{ backgroundColor: tag.color || '#ec4899' }}
    >
      {tag.name}
    </span>
  );
}

function MediaCard({ asset, onSelect }) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      className="card-hover group cursor-pointer overflow-hidden"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => onSelect(asset)}
    >
      {/* Thumbnail */}
      <div className="relative aspect-square bg-surface-100 overflow-hidden">
        <img
          src={asset.thumbnail_url || asset.file_url}
          alt={asset.title}
          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
        />
        {/* Overlays */}
        {asset.file_type === 'video' && (
          <div className="absolute top-2 left-2 badge bg-black/70 text-white">
            <Video className="w-3 h-3 mr-1" />
            {asset.duration_seconds ? `${Math.round(asset.duration_seconds)}s` : 'Video'}
          </div>
        )}
        {asset.parent_asset_id && (
          <div className="absolute top-2 left-2 badge bg-purple-600/80 text-white">
            <Scissors className="w-3 h-3 mr-1" />
            Scene
          </div>
        )}
        {asset.is_favorite && (
          <div className="absolute top-2 right-2">
            <Heart className="w-4 h-4 text-brand-500 fill-brand-500" />
          </div>
        )}
        {asset.ai_quality_score && (
          <div className="absolute bottom-2 right-2 badge bg-black/70 text-white text-[10px]">
            <Star className="w-3 h-3 mr-0.5 text-yellow-400 fill-yellow-400" />
            {(asset.ai_quality_score * 100).toFixed(0)}
          </div>
        )}
        {/* Hover overlay */}
        <div className={`absolute inset-0 bg-black/40 flex items-center justify-center transition-opacity ${hovered ? 'opacity-100' : 'opacity-0'}`}>
          <Eye className="w-6 h-6 text-white" />
        </div>
        {/* Google Photos link overlay */}
        {asset.source === 'google_photos' && (
          <a
            href={googlePhotosLink(asset)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            className={`absolute bottom-2 left-2 bg-white/90 hover:bg-white text-surface-700 rounded-lg px-2 py-1 flex items-center gap-1 text-[10px] font-medium shadow-sm transition-opacity ${hovered ? 'opacity-100' : 'opacity-0'}`}
            title="View in Google Photos"
          >
            <ExternalLink className="w-3 h-3" />
            Google Photos
          </a>
        )}
      </div>

      {/* Info */}
      <div className="p-3">
        <h4 className="text-xs font-medium text-surface-800 truncate">{asset.title || asset.file_name}</h4>
        <p className="text-[11px] text-surface-400 mt-0.5 truncate">{asset.ai_description?.slice(0, 60)}</p>
        {asset.tag_objects?.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {asset.tag_objects.slice(0, 3).map(t => <TagPill key={t.id} tag={t} />)}
            {asset.tag_objects.length > 3 && (
              <span className="badge bg-surface-100 text-surface-500 text-[10px]">+{asset.tag_objects.length - 3}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function MediaDetail({ asset, onClose }) {
  const [captions, setCaptions] = useState(null);
  const [loadingCaptions, setLoadingCaptions] = useState(false);
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [childFrames, setChildFrames] = useState([]);

  useEffect(() => {
    if (asset.file_type === 'video') {
      api.videoBreakdownFrames(asset.id).then(r => setChildFrames(r.frames || [])).catch(() => {});
    }
  }, [asset.id, asset.file_type]);

  const generateCaptions = async () => {
    setLoadingCaptions(true);
    try {
      const result = await api.aiGenerateCaptions(asset.id, 'instagram');
      setCaptions(result.captions);
    } catch (e) { console.error(e); }
    setLoadingCaptions(false);
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b">
          <h3 className="font-semibold text-surface-900">{asset.title || asset.file_name}</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-surface-100"><X className="w-5 h-5" /></button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-0">
          {/* Image */}
          <div className="bg-surface-100 flex items-center justify-center p-4 relative">
            <img src={asset.file_url} alt={asset.title} className="max-w-full max-h-80 rounded-lg object-contain" />
            {asset.source === 'google_photos' && (
              <a
                href={googlePhotosLink(asset)}
                target="_blank"
                rel="noopener noreferrer"
                className="absolute bottom-6 right-6 bg-white/95 hover:bg-white text-surface-700 rounded-xl px-3 py-2 flex items-center gap-1.5 text-xs font-medium shadow-md hover:shadow-lg transition-all"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                View in Google Photos
              </a>
            )}
          </div>

          {/* Details */}
          <div className="p-5 space-y-4">
            {/* AI Description */}
            <div>
              <h4 className="text-xs font-semibold text-surface-500 uppercase tracking-wider mb-1">AI Description</h4>
              <p className="text-sm text-surface-700">{asset.ai_description}</p>
            </div>

            {/* Tags */}
            <div>
              <h4 className="text-xs font-semibold text-surface-500 uppercase tracking-wider mb-2">Tags</h4>
              <div className="flex flex-wrap gap-1.5">
                {asset.tag_objects?.map(t => <TagPill key={t.id} tag={t} />)}
                {asset.ai_tags?.map(t => (
                  <span key={t} className="badge bg-surface-100 text-surface-600 text-[10px]">{t}</span>
                ))}
              </div>
            </div>

            {/* Quality */}
            {asset.ai_quality_score && (
              <div>
                <h4 className="text-xs font-semibold text-surface-500 uppercase tracking-wider mb-1">Quality Score</h4>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-2 bg-surface-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-brand-400 to-brand-600"
                      style={{ width: `${asset.ai_quality_score * 100}%` }}
                    />
                  </div>
                  <span className="text-sm font-medium">{(asset.ai_quality_score * 100).toFixed(0)}%</span>
                </div>
              </div>
            )}

            {/* AI Caption Generator */}
            <div>
              <h4 className="text-xs font-semibold text-surface-500 uppercase tracking-wider mb-2">Caption Ideas</h4>
              {!captions ? (
                <button onClick={generateCaptions} disabled={loadingCaptions} className="btn-primary text-xs">
                  <Sparkles className="w-3.5 h-3.5" />
                  {loadingCaptions ? 'Generating...' : 'Generate AI Captions'}
                </button>
              ) : (
                <div className="space-y-2">
                  {captions.map((c, i) => (
                    <div key={i} className="p-2.5 rounded-lg bg-brand-50 text-xs text-surface-700 border border-brand-100">
                      {c}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Video Breakdown */}
            {asset.file_type === 'video' && (
              <div>
                <h4 className="text-xs font-semibold text-surface-500 uppercase tracking-wider mb-2">Video Breakdown</h4>
                {childFrames.length > 0 ? (
                  <div className="space-y-2">
                    <div className="grid grid-cols-3 gap-1.5">
                      {childFrames.map(frame => (
                        <div key={frame.id} className="relative aspect-square rounded-lg overflow-hidden bg-surface-100 group">
                          <img src={frame.thumbnail_url} alt={frame.scene_description} className="w-full h-full object-cover" />
                          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            <p className="text-[9px] text-white truncate">{frame.scene_description || frame.title}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                    <button
                      onClick={() => setShowBreakdown(true)}
                      className="text-xs text-brand-500 hover:text-brand-600 font-medium"
                    >
                      Re-analyze video
                    </button>
                  </div>
                ) : (
                  <button onClick={() => setShowBreakdown(true)} className="btn-secondary text-xs flex items-center gap-1.5 w-full justify-center">
                    <Scissors className="w-3.5 h-3.5" />
                    Extract Scenes & Outfits
                  </button>
                )}
              </div>
            )}

            {/* Meta */}
            <div className="text-[11px] text-surface-400 space-y-0.5 pt-2 border-t">
              <p>Source: {asset.source === 'google_photos' ? 'Google Photos' : asset.source} · Type: {asset.file_type}</p>
              <p>Created: {new Date(asset.created_at).toLocaleDateString()}</p>
              {asset.width && asset.height && <p>Dimensions: {asset.width} x {asset.height}</p>}
              {asset.duration_seconds && <p>Duration: {asset.duration_seconds}s</p>}
            </div>
          </div>
        </div>

        {/* Video Breakdown Modal */}
        {showBreakdown && (
          <VideoBreakdown
            asset={asset}
            onComplete={(result) => {
              if (result.savedAssets) {
                setChildFrames(prev => [...prev, ...result.savedAssets.map(a => ({
                  id: a.id, title: a.title, thumbnail_url: a.thumbnailUrl,
                  scene_description: a.title, frame_timestamp: a.frameTimestamp,
                }))]);
              }
            }}
            onClose={() => setShowBreakdown(false)}
          />
        )}
      </div>
    </div>
  );
}

const PAGE_SIZE = 50;

export default function MediaLibrary() {
  const [media, setMedia] = useState([]);
  const [tags, setTags] = useState([]);
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState({});
  const [selectedAsset, setSelectedAsset] = useState(null);
  const [viewMode, setViewMode] = useState('grid');
  const [showFilters, setShowFilters] = useState(false);
  const [showGooglePhotos, setShowGooglePhotos] = useState(false);
  const [page, setPage] = useState(1);
  const [totalAssets, setTotalAssets] = useState(0);

  const totalPages = Math.max(1, Math.ceil(totalAssets / PAGE_SIZE));

  const fetchMedia = (params = {}) => {
    const offset = ((params.page || page) - 1) * PAGE_SIZE;
    const queryParams = { ...activeFilter, limit: PAGE_SIZE, offset, ...params };
    delete queryParams.page;
    if (search) queryParams.search = search;
    api.getMedia(queryParams).then(r => {
      setMedia(r.data || []);
      setTotalAssets(r.total || 0);
    });
  };

  const refreshMedia = () => fetchMedia();

  useEffect(() => {
    fetchMedia({ page: 1 });
    api.getTags().then(r => setTags(r.data || []));
  }, []);

  // Apply search/filters — reset to page 1
  useEffect(() => {
    setPage(1);
    fetchMedia({ page: 1 });
  }, [search, activeFilter]);

  // Page change
  useEffect(() => {
    fetchMedia();
  }, [page]);

  const goToPage = (p) => {
    const target = Math.max(1, Math.min(p, totalPages));
    if (target !== page) {
      setPage(target);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const tagCategories = [...new Set(tags.map(t => t.category))];

  return (
    <div className="p-4 lg:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-surface-900">Media Library</h1>
          <p className="text-sm text-surface-500 mt-0.5">{totalAssets} assets · AI-tagged and searchable</p>
        </div>
        <div className="flex gap-2">
          <button
            className={`btn-secondary text-xs ${showGooglePhotos ? 'bg-brand-50 border-brand-200 text-brand-600' : ''}`}
            onClick={() => setShowGooglePhotos(!showGooglePhotos)}
          >
            <Camera className="w-4 h-4" /> Google Photos
          </button>
          <button className="btn-primary">
            <Upload className="w-4 h-4" /> Upload
          </button>
        </div>
      </div>

      {/* Google Photos Browser */}
      {showGooglePhotos && (
        <div className="card p-4 mb-4">
          <GooglePhotosBrowser onImportComplete={() => refreshMedia()} />
        </div>
      )}

      {/* Search & Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
          <input
            type="text"
            className="input pl-10"
            placeholder="Search by title, tags, AI description, products..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          <button
            className={`btn-secondary text-xs ${showFilters ? 'bg-brand-50 border-brand-200 text-brand-600' : ''}`}
            onClick={() => setShowFilters(!showFilters)}
          >
            <Filter className="w-4 h-4" /> Filters
          </button>
          <div className="flex border rounded-xl overflow-hidden">
            <button
              className={`px-3 py-2 text-xs ${viewMode === 'grid' ? 'bg-brand-50 text-brand-600' : 'text-surface-500 hover:bg-surface-50'}`}
              onClick={() => setViewMode('grid')}
            >
              <Grid3X3 className="w-4 h-4" />
            </button>
            <button
              className={`px-3 py-2 text-xs ${viewMode === 'list' ? 'bg-brand-50 text-brand-600' : 'text-surface-500 hover:bg-surface-50'}`}
              onClick={() => setViewMode('list')}
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Filter Panel */}
      {showFilters && (
        <div className="card p-4 mb-4">
          <div className="flex flex-wrap gap-4">
            <div>
              <span className="text-xs font-medium text-surface-500 block mb-1.5">Type</span>
              <div className="flex gap-1.5">
                {['all', 'image', 'video'].map(t => (
                  <button
                    key={t}
                    className={`badge cursor-pointer ${activeFilter.type === t || (!activeFilter.type && t === 'all') ? 'bg-brand-100 text-brand-700' : 'bg-surface-100 text-surface-600 hover:bg-surface-200'}`}
                    onClick={() => setActiveFilter(f => ({ ...f, type: t === 'all' ? undefined : t }))}
                  >
                    {t === 'all' ? 'All' : t === 'image' ? <><ImageIcon className="w-3 h-3 mr-1" />Images</> : <><Video className="w-3 h-3 mr-1" />Videos</>}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <span className="text-xs font-medium text-surface-500 block mb-1.5">Source</span>
              <div className="flex gap-1.5">
                {['all', 'google_photos', 'upload', 'instagram'].map(s => (
                  <button
                    key={s}
                    className={`badge cursor-pointer ${activeFilter.source === s ? 'bg-brand-100 text-brand-700' : 'bg-surface-100 text-surface-600 hover:bg-surface-200'}`}
                    onClick={() => setActiveFilter(f => ({ ...f, source: s === 'all' ? undefined : s }))}
                  >
                    {s === 'all' ? 'All' : s === 'google_photos' ? 'Google Photos' : s.charAt(0).toUpperCase() + s.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <span className="text-xs font-medium text-surface-500 block mb-1.5">Favorites</span>
              <button
                className={`badge cursor-pointer ${activeFilter.favorite ? 'bg-brand-100 text-brand-700' : 'bg-surface-100 text-surface-600 hover:bg-surface-200'}`}
                onClick={() => setActiveFilter(f => ({ ...f, favorite: f.favorite ? undefined : 'true' }))}
              >
                <Heart className="w-3 h-3 mr-1" /> Favorites Only
              </button>
            </div>
          </div>

          {/* Tag filters */}
          <div className="mt-3 pt-3 border-t">
            <span className="text-xs font-medium text-surface-500 block mb-1.5">Tags</span>
            <div className="flex flex-wrap gap-1.5">
              {tags.slice(0, 15).map(tag => (
                <button
                  key={tag.id}
                  className={`badge cursor-pointer transition-colors ${activeFilter.tag === tag.id ? 'text-white' : 'bg-surface-100 text-surface-600 hover:bg-surface-200'}`}
                  style={activeFilter.tag === tag.id ? { backgroundColor: tag.color, color: 'white' } : {}}
                  onClick={() => setActiveFilter(f => ({ ...f, tag: f.tag === tag.id ? undefined : tag.id }))}
                >
                  {tag.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Grid */}
      <div className={
        viewMode === 'grid'
          ? 'grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4'
          : 'space-y-2'
      }>
        {media.map(asset => (
          viewMode === 'grid' ? (
            <MediaCard key={asset.id} asset={asset} onSelect={setSelectedAsset} />
          ) : (
            <div key={asset.id} className="card-hover p-3 flex items-center gap-4 cursor-pointer" onClick={() => setSelectedAsset(asset)}>
              <img src={asset.thumbnail_url} alt="" className="w-16 h-16 rounded-lg object-cover" />
              <div className="flex-1 min-w-0">
                <h4 className="text-sm font-medium truncate">{asset.title}</h4>
                <p className="text-xs text-surface-400 truncate">{asset.ai_description}</p>
                <div className="flex gap-1 mt-1">
                  {asset.tag_objects?.slice(0, 4).map(t => <TagPill key={t.id} tag={t} />)}
                </div>
              </div>
              <div className="text-xs text-surface-400 text-right shrink-0">
                <div>{asset.file_type}</div>
                <div>{asset.source}</div>
              </div>
            </div>
          )
        ))}
      </div>

      {/* Pagination */}
      {totalPages > 1 && media.length > 0 && (
        <div className="flex items-center justify-between mt-6 pt-4 border-t border-surface-100">
          <p className="text-xs text-surface-400">
            Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, totalAssets)} of {totalAssets}
          </p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => goToPage(1)}
              disabled={page === 1}
              className="p-1.5 rounded-lg hover:bg-surface-100 disabled:opacity-30 disabled:cursor-not-allowed"
              title="First page"
            >
              <ChevronsLeft className="w-4 h-4 text-surface-600" />
            </button>
            <button
              onClick={() => goToPage(page - 1)}
              disabled={page === 1}
              className="p-1.5 rounded-lg hover:bg-surface-100 disabled:opacity-30 disabled:cursor-not-allowed"
              title="Previous page"
            >
              <ChevronLeft className="w-4 h-4 text-surface-600" />
            </button>

            {/* Page numbers */}
            {(() => {
              const pages = [];
              let start = Math.max(1, page - 2);
              let end = Math.min(totalPages, start + 4);
              if (end - start < 4) start = Math.max(1, end - 4);

              if (start > 1) {
                pages.push(
                  <button key={1} onClick={() => goToPage(1)}
                    className="w-8 h-8 rounded-lg text-xs font-medium text-surface-600 hover:bg-surface-100">
                    1
                  </button>
                );
                if (start > 2) pages.push(<span key="dots-s" className="text-surface-300 text-xs px-1">...</span>);
              }

              for (let i = start; i <= end; i++) {
                pages.push(
                  <button
                    key={i}
                    onClick={() => goToPage(i)}
                    className={`w-8 h-8 rounded-lg text-xs font-medium transition-colors ${
                      i === page
                        ? 'bg-brand-500 text-white'
                        : 'text-surface-600 hover:bg-surface-100'
                    }`}
                  >
                    {i}
                  </button>
                );
              }

              if (end < totalPages) {
                if (end < totalPages - 1) pages.push(<span key="dots-e" className="text-surface-300 text-xs px-1">...</span>);
                pages.push(
                  <button key={totalPages} onClick={() => goToPage(totalPages)}
                    className="w-8 h-8 rounded-lg text-xs font-medium text-surface-600 hover:bg-surface-100">
                    {totalPages}
                  </button>
                );
              }

              return pages;
            })()}

            <button
              onClick={() => goToPage(page + 1)}
              disabled={page === totalPages}
              className="p-1.5 rounded-lg hover:bg-surface-100 disabled:opacity-30 disabled:cursor-not-allowed"
              title="Next page"
            >
              <ChevronRightIcon className="w-4 h-4 text-surface-600" />
            </button>
            <button
              onClick={() => goToPage(totalPages)}
              disabled={page === totalPages}
              className="p-1.5 rounded-lg hover:bg-surface-100 disabled:opacity-30 disabled:cursor-not-allowed"
              title="Last page"
            >
              <ChevronsRight className="w-4 h-4 text-surface-600" />
            </button>
          </div>
        </div>
      )}

      {media.length === 0 && (
        <div className="text-center py-16 text-surface-400">
          <ImageIcon className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No media found matching your filters</p>
        </div>
      )}

      {/* Detail Modal */}
      {selectedAsset && <MediaDetail asset={selectedAsset} onClose={() => setSelectedAsset(null)} />}
    </div>
  );
}
