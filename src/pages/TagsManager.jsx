import React, { useState, useEffect } from 'react';
import {
  Tags, Plus, Trash2, Sparkles, Loader2, AlertCircle,
  CheckCircle2, Hash, Palette, FolderOpen, Wand2,
} from 'lucide-react';
import { api } from '../services/api';

const TAG_COLORS = [
  '#ec4899', '#f43f5e', '#ef4444', '#f97316', '#eab308',
  '#84cc16', '#22c55e', '#14b8a6', '#06b6d4', '#3b82f6',
  '#6366f1', '#8b5cf6', '#a855f7', '#d946ef',
];

const TAG_CATEGORIES = [
  { value: 'content_type', label: 'Content Type' },
  { value: 'aesthetic', label: 'Aesthetic' },
  { value: 'product', label: 'Product' },
  { value: 'brand', label: 'Brand' },
  { value: 'platform', label: 'Platform' },
  { value: 'campaign', label: 'Campaign' },
  { value: 'custom', label: 'Custom' },
];

export default function TagsManager() {
  const [tags, setTags] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Create form
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState('#ec4899');
  const [newCategory, setNewCategory] = useState('custom');
  const [creating, setCreating] = useState(false);

  // Delete confirmation
  const [deleteId, setDeleteId] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // AI auto-tag
  const [autoTagging, setAutoTagging] = useState(false);
  const [autoTagResult, setAutoTagResult] = useState(null);

  // Filter
  const [filterCategory, setFilterCategory] = useState('');

  useEffect(() => {
    loadTags();
  }, []);

  const loadTags = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.getTags();
      setTags(res.data || []);
    } catch (err) {
      setError('Failed to load tags');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    setError('');
    try {
      const tag = await api.createTag({ name: newName.trim(), color: newColor, category: newCategory });
      setTags(prev => [tag, ...prev]);
      setNewName('');
      setNewColor('#ec4899');
      setNewCategory('custom');
      setShowCreate(false);
    } catch (err) {
      setError('Failed to create tag');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id) => {
    setDeleting(true);
    setError('');
    try {
      await api.deleteTag(id);
      setTags(prev => prev.filter(t => t.id !== id));
      setDeleteId(null);
    } catch (err) {
      setError('Failed to delete tag');
    } finally {
      setDeleting(false);
    }
  };

  const handleAutoTag = async () => {
    setAutoTagging(true);
    setAutoTagResult(null);
    setError('');
    try {
      const result = await api.aiAutoTag();
      setAutoTagResult(result);
      // Reload tags to get updated usage counts
      loadTags();
    } catch (err) {
      setError('AI auto-tagging failed: ' + err.message);
    } finally {
      setAutoTagging(false);
    }
  };

  const filteredTags = filterCategory
    ? tags.filter(t => t.category === filterCategory)
    : tags;

  const categoryLabel = (cat) => TAG_CATEGORIES.find(c => c.value === cat)?.label || cat;

  // Group tags by category for display
  const groupedTags = {};
  filteredTags.forEach(tag => {
    const cat = tag.category || 'custom';
    if (!groupedTags[cat]) groupedTags[cat] = [];
    groupedTags[cat].push(tag);
  });

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-surface-900 flex items-center gap-2">
            <Tags className="w-7 h-7 text-brand-500" />
            Tag Manager
          </h1>
          <p className="text-sm text-surface-500 mt-1">
            Create and manage tags, then let AI auto-tag your media assets.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleAutoTag}
            disabled={autoTagging || tags.length === 0}
            className="btn-secondary text-sm flex items-center gap-2"
          >
            {autoTagging ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Auto-tagging...</>
            ) : (
              <><Wand2 className="w-4 h-4" /> AI Auto-Tag</>
            )}
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="btn-primary text-sm flex items-center gap-2"
          >
            <Plus className="w-4 h-4" /> New Tag
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 rounded-xl px-4 py-3">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* AI Auto-Tag Result */}
      {autoTagResult && (
        <div className="bg-brand-50 border border-brand-200 rounded-xl px-4 py-3 space-y-1">
          <div className="flex items-center gap-2 text-sm font-medium text-brand-700">
            <CheckCircle2 className="w-4 h-4" />
            AI Auto-Tagging Complete
          </div>
          <p className="text-sm text-brand-600">{autoTagResult.message}</p>
          <div className="flex flex-wrap gap-3 text-xs text-brand-500 mt-1">
            <span>Assets processed: {autoTagResult.totalAssetsProcessed}</span>
            <span>Assets tagged: {autoTagResult.tagged}</span>
            <span>Tags applied: {autoTagResult.totalNewTags}</span>
            {autoTagResult.aiPowered && (
              <span className="flex items-center gap-1"><Sparkles className="w-3 h-3" /> AI Vision powered</span>
            )}
          </div>
        </div>
      )}

      {/* Create Tag Form */}
      {showCreate && (
        <div className="card p-5 space-y-4">
          <h3 className="font-semibold text-surface-800 flex items-center gap-2">
            <Plus className="w-4 h-4" /> Create New Tag
          </h3>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* Name */}
              <div>
                <label className="block text-xs font-medium text-surface-500 mb-1.5">
                  <Hash className="w-3 h-3 inline mr-1" />Tag Name
                </label>
                <input
                  type="text"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  placeholder="e.g. GRWM, Skincare, Flat Lay"
                  className="input w-full"
                  autoFocus
                />
              </div>

              {/* Category */}
              <div>
                <label className="block text-xs font-medium text-surface-500 mb-1.5">
                  <FolderOpen className="w-3 h-3 inline mr-1" />Category
                </label>
                <select
                  value={newCategory}
                  onChange={e => setNewCategory(e.target.value)}
                  className="input w-full"
                >
                  {TAG_CATEGORIES.map(c => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              </div>

              {/* Color */}
              <div>
                <label className="block text-xs font-medium text-surface-500 mb-1.5">
                  <Palette className="w-3 h-3 inline mr-1" />Color
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {TAG_COLORS.map(color => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setNewColor(color)}
                      className={`w-6 h-6 rounded-full transition-all ${
                        newColor === color ? 'ring-2 ring-offset-2 ring-brand-500 scale-110' : 'hover:scale-110'
                      }`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <button type="submit" disabled={creating || !newName.trim()} className="btn-primary text-sm">
                {creating ? <><Loader2 className="w-4 h-4 animate-spin" /> Creating...</> : 'Create Tag'}
              </button>
              <button
                type="button"
                onClick={() => { setShowCreate(false); setNewName(''); }}
                className="btn-ghost text-sm"
              >
                Cancel
              </button>
              {newName.trim() && (
                <span
                  className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full text-white ml-auto"
                  style={{ backgroundColor: newColor }}
                >
                  {newName.trim()}
                </span>
              )}
            </div>
          </form>
        </div>
      )}

      {/* Category Filter */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => setFilterCategory('')}
          className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${
            !filterCategory ? 'bg-brand-500 text-white' : 'bg-surface-100 text-surface-600 hover:bg-surface-200'
          }`}
        >
          All ({tags.length})
        </button>
        {TAG_CATEGORIES.map(cat => {
          const count = tags.filter(t => t.category === cat.value).length;
          if (count === 0) return null;
          return (
            <button
              key={cat.value}
              onClick={() => setFilterCategory(filterCategory === cat.value ? '' : cat.value)}
              className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${
                filterCategory === cat.value ? 'bg-brand-500 text-white' : 'bg-surface-100 text-surface-600 hover:bg-surface-200'
              }`}
            >
              {cat.label} ({count})
            </button>
          );
        })}
      </div>

      {/* Tags List */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-brand-500" />
          <span className="ml-2 text-sm text-surface-500">Loading tags...</span>
        </div>
      ) : filteredTags.length === 0 ? (
        <div className="card p-12 text-center">
          <Tags className="w-10 h-10 text-surface-300 mx-auto mb-3" />
          <h3 className="font-semibold text-surface-700 mb-1">
            {tags.length === 0 ? 'No tags yet' : 'No tags in this category'}
          </h3>
          <p className="text-sm text-surface-400 mb-4">
            {tags.length === 0
              ? 'Create your first tag to start organizing your media assets.'
              : 'Try selecting a different category filter.'}
          </p>
          {tags.length === 0 && (
            <button onClick={() => setShowCreate(true)} className="btn-primary text-sm">
              <Plus className="w-4 h-4" /> Create First Tag
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(groupedTags).map(([category, categoryTags]) => (
            <div key={category}>
              <h3 className="text-xs font-semibold text-surface-400 uppercase tracking-wider mb-3">
                {categoryLabel(category)}
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {categoryTags.map(tag => (
                  <div
                    key={tag.id}
                    className="card px-4 py-3 flex items-center justify-between group hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className="w-3 h-3 rounded-full flex-shrink-0"
                        style={{ backgroundColor: tag.color || '#ec4899' }}
                      />
                      <div className="min-w-0">
                        <p className="font-medium text-sm text-surface-800 truncate">{tag.name}</p>
                        <p className="text-xs text-surface-400">
                          {tag.usage_count || 0} asset{(tag.usage_count || 0) !== 1 ? 's' : ''}
                        </p>
                      </div>
                    </div>

                    {deleteId === tag.id ? (
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => handleDelete(tag.id)}
                          disabled={deleting}
                          className="text-xs text-red-600 hover:text-red-700 font-medium"
                        >
                          {deleting ? 'Deleting...' : 'Confirm'}
                        </button>
                        <button
                          onClick={() => setDeleteId(null)}
                          className="text-xs text-surface-400 hover:text-surface-600"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setDeleteId(tag.id)}
                        className="p-1.5 rounded-lg text-surface-300 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
