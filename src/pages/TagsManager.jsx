import React, { useState, useEffect } from 'react';
import {
  Tags, Plus, Trash2, Sparkles, Loader2, AlertCircle,
  CheckCircle2, Hash, Palette, FolderOpen, Wand2, X, DollarSign, CreditCard,
  ThumbsUp, ThumbsDown, Lightbulb, Check, Image as ImageIcon, History, Clock,
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
  const [showAutoTagConfirm, setShowAutoTagConfirm] = useState(false);
  const [assetCount, setAssetCount] = useState(null);
  const [untaggedCount, setUntaggedCount] = useState(null);
  const [autoTagScope, setAutoTagScope] = useState('untagged'); // 'all' | 'untagged'
  const [showQuotaError, setShowQuotaError] = useState(false);
  const [quotaErrorMessage, setQuotaErrorMessage] = useState('');

  // Batch progress
  const [batchProgress, setBatchProgress] = useState(null); // { processed, total, tagged, newTags }

  // Tag suggestions review
  const [suggestedTags, setSuggestedTags] = useState([]); // from AI response
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestionDecisions, setSuggestionDecisions] = useState({}); // { index: 'accept' | 'reject' }
  const [acceptingTags, setAcceptingTags] = useState(false);

  // Auto-tag history
  const [autoTagHistory, setAutoTagHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Filter
  const [filterCategory, setFilterCategory] = useState('');

  useEffect(() => {
    loadTags();
    loadHistory();
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

  const loadHistory = async () => {
    setHistoryLoading(true);
    try {
      const res = await api.getAutoTagRuns(10);
      setAutoTagHistory(res.data || []);
    } catch (err) {
      // non-critical — don't show error
    } finally {
      setHistoryLoading(false);
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

  // Cost estimation: ~1,500 tokens per thumbnail image + ~200 tokens prompt/response
  // gpt-4o-mini: $0.15 per 1M input, $0.60 per 1M output
  const estimateCost = (count) => {
    const inputTokensPerAsset = 1700;
    const outputTokensPerAsset = 80;
    const totalInput = count * inputTokensPerAsset;
    const totalOutput = count * outputTokensPerAsset;
    const inputCost = (totalInput / 1_000_000) * 0.15;
    const outputCost = (totalOutput / 1_000_000) * 0.60;
    return inputCost + outputCost;
  };

  const [totalAllAssets, setTotalAllAssets] = useState(null); // includes videos

  const promptAutoTag = async () => {
    try {
      const [counts, mediaRes] = await Promise.all([
        api.getMediaCounts(),
        api.getMedia({ limit: 1, offset: 0 }),
      ]);
      setAssetCount(counts.total || 0);       // images only
      setUntaggedCount(counts.untagged || 0);  // untagged images only
      setTotalAllAssets(mediaRes.total || 0);  // all assets including videos
      setAutoTagScope(counts.untagged > 0 ? 'untagged' : 'all');
      setShowAutoTagConfirm(true);
    } catch (err) {
      setError('Failed to get asset count');
    }
  };

  const BATCH_SIZE = 50; // images per API call — keeps each request under Vercel's 60s timeout

  const handleAutoTag = async () => {
    setShowAutoTagConfirm(false);
    setAutoTagging(true);
    setAutoTagResult(null);
    setSuggestedTags([]);
    setError('');

    const scopeCount = autoTagScope === 'untagged' ? untaggedCount : assetCount;
    let totalProcessed = 0;
    let totalTagged = 0;
    let totalNewTags = 0;
    let allSuggestions = {}; // aggregate suggestions across batches by lowercase name
    let offset = 0;
    let done = false;

    // Create a run record
    let runId = null;
    try {
      const run = await api.createAutoTagRun(autoTagScope);
      runId = run.id;
    } catch (_) {} // non-critical

    setBatchProgress({ processed: 0, total: scopeCount, tagged: 0, newTags: 0 });

    try {
      while (!done) {
        const result = await api.aiAutoTag({
          untaggedOnly: autoTagScope === 'untagged',
          limit: BATCH_SIZE,
          offset,
        });

        totalProcessed += result.totalAssetsProcessed || 0;
        totalTagged += result.tagged || 0;
        totalNewTags += result.totalNewTags || 0;

        // Aggregate suggestions across batches
        if (result.suggestedTags) {
          for (const sug of result.suggestedTags) {
            const key = sug.name.toLowerCase();
            if (!allSuggestions[key]) {
              allSuggestions[key] = { name: sug.name, assetIds: new Set(sug.assetIds), count: sug.count };
            } else {
              sug.assetIds.forEach(id => allSuggestions[key].assetIds.add(id));
              allSuggestions[key].count += sug.count;
            }
          }
        }

        setBatchProgress({ processed: totalProcessed, total: scopeCount, tagged: totalTagged, newTags: totalNewTags });

        if (result.batchComplete || result.totalAssetsProcessed === 0) {
          done = true;
        } else {
          offset = result.nextOffset || (offset + BATCH_SIZE);
        }
      }

      // Build final result
      const finalSuggestions = Object.values(allSuggestions)
        .map(s => ({ name: s.name, assetIds: [...s.assetIds], count: s.count }))
        .sort((a, b) => b.count - a.count);

      const finalResult = {
        tagged: totalTagged,
        totalAssetsProcessed: totalProcessed,
        totalNewTags,
        aiPowered: true,
        suggestedTags: finalSuggestions,
        message: `AI analyzed ${totalProcessed.toLocaleString()} images and applied ${totalNewTags.toLocaleString()} tags to ${totalTagged.toLocaleString()} images`,
      };

      setAutoTagResult(finalResult);
      loadTags();

      // Log completed run
      if (runId) {
        api.updateAutoTagRun(runId, {
          status: 'completed',
          total_images_processed: totalProcessed,
          total_images_tagged: totalTagged,
          total_tags_applied: totalNewTags,
          suggested_tags_count: finalSuggestions.length,
        }).catch(() => {});
      }
      loadHistory();

      // If AI suggested new tags, show the review modal
      if (finalSuggestions.length > 0) {
        setSuggestedTags(finalSuggestions);
        setSuggestionDecisions({});
        setShowSuggestions(true);
      }
    } catch (err) {
      if (err.code === 'openai_insufficient_quota') {
        setQuotaErrorMessage(err.message);
        setShowQuotaError(true);
      } else {
        setError('AI auto-tagging failed: ' + err.message);
      }
      // Log failed/partial run
      if (runId) {
        api.updateAutoTagRun(runId, {
          status: totalProcessed > 0 ? 'partial' : 'failed',
          total_images_processed: totalProcessed,
          total_images_tagged: totalTagged,
          total_tags_applied: totalNewTags,
          error_message: err.message,
        }).catch(() => {});
      }
      loadHistory();

      // Still show partial results if we processed some before the error
      if (totalProcessed > 0) {
        setAutoTagResult({
          tagged: totalTagged,
          totalAssetsProcessed: totalProcessed,
          totalNewTags,
          aiPowered: true,
          message: `Processed ${totalProcessed.toLocaleString()} images before error. Applied ${totalNewTags.toLocaleString()} tags to ${totalTagged.toLocaleString()} images.`,
        });
        loadTags();
      }
    } finally {
      setAutoTagging(false);
      setBatchProgress(null);
    }
  };

  const toggleSuggestion = (index) => {
    setSuggestionDecisions(prev => {
      const current = prev[index];
      if (current === 'accept') return { ...prev, [index]: 'reject' };
      return { ...prev, [index]: 'accept' };
    });
  };

  const handleAcceptSuggestions = async () => {
    const accepted = suggestedTags
      .filter((_, i) => suggestionDecisions[i] === 'accept')
      .map(s => ({
        name: s.name,
        assetIds: s.assetIds,
        color: TAG_COLORS[Math.floor(Math.random() * TAG_COLORS.length)],
        category: 'ai_suggested',
      }));

    if (accepted.length === 0) {
      setShowSuggestions(false);
      return;
    }

    setAcceptingTags(true);
    try {
      await api.aiAcceptSuggestedTags(accepted);
      loadTags();
      setShowSuggestions(false);
    } catch (err) {
      setError('Failed to create accepted tags: ' + err.message);
    } finally {
      setAcceptingTags(false);
    }
  };

  const filteredTags = filterCategory
    ? tags.filter(t => t.category === filterCategory)
    : tags;

  const categoryLabel = (cat) => {
    if (cat === 'ai_suggested') return 'AI Suggested';
    return TAG_CATEGORIES.find(c => c.value === cat)?.label || cat;
  };

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
            onClick={promptAutoTag}
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

      {/* Batch Progress */}
      {autoTagging && batchProgress && (
        <div className="card p-5 space-y-3 border-brand-200 bg-brand-50/50">
          <div className="flex items-center gap-2 text-sm font-medium text-brand-700">
            <Loader2 className="w-4 h-4 animate-spin" />
            AI Auto-Tagging in Progress...
          </div>
          <div className="w-full bg-brand-100 rounded-full h-3 overflow-hidden">
            <div
              className="bg-brand-500 h-3 rounded-full transition-all duration-500 ease-out"
              style={{ width: `${batchProgress.total > 0 ? Math.min(100, (batchProgress.processed / batchProgress.total) * 100) : 0}%` }}
            />
          </div>
          <div className="flex flex-wrap gap-4 text-xs text-brand-600">
            <span>{batchProgress.processed.toLocaleString()} / {batchProgress.total.toLocaleString()} images analyzed</span>
            <span>{batchProgress.tagged.toLocaleString()} images tagged</span>
            <span>{batchProgress.newTags.toLocaleString()} tags applied</span>
          </div>
          <p className="text-xs text-brand-400">
            Processing in batches of {BATCH_SIZE}. Please keep this page open.
          </p>
        </div>
      )}

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

      {/* Auto-Tag History */}
      {autoTagHistory.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-surface-600 flex items-center gap-2">
            <History className="w-4 h-4" />
            Auto-Tag History
          </h3>
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-surface-50 text-left text-xs font-medium text-surface-500 uppercase tracking-wider">
                  <th className="px-4 py-2.5">Date</th>
                  <th className="px-4 py-2.5">Scope</th>
                  <th className="px-4 py-2.5 text-right">Images</th>
                  <th className="px-4 py-2.5 text-right">Tagged</th>
                  <th className="px-4 py-2.5 text-right">Tags Applied</th>
                  <th className="px-4 py-2.5">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-100">
                {autoTagHistory.map(run => (
                  <tr key={run.id} className="hover:bg-surface-50/50">
                    <td className="px-4 py-3 text-surface-700">
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-surface-400" />
                        {new Date(run.started_at).toLocaleDateString('en-US', {
                          month: 'short', day: 'numeric', year: 'numeric',
                        })}
                        <span className="text-surface-400 text-xs">
                          {new Date(run.started_at).toLocaleTimeString('en-US', {
                            hour: 'numeric', minute: '2-digit',
                          })}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                        run.scope === 'untagged'
                          ? 'bg-blue-50 text-blue-600'
                          : 'bg-purple-50 text-purple-600'
                      }`}>
                        {run.scope === 'untagged' ? 'Untagged only' : 'All images'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-surface-700 tabular-nums">
                      {(run.total_images_processed || 0).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right text-surface-700 tabular-nums">
                      {(run.total_images_tagged || 0).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right text-surface-700 tabular-nums">
                      {(run.total_tags_applied || 0).toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                        run.status === 'completed' ? 'bg-green-50 text-green-600' :
                        run.status === 'running' ? 'bg-amber-50 text-amber-600' :
                        run.status === 'partial' ? 'bg-orange-50 text-orange-600' :
                        'bg-red-50 text-red-600'
                      }`}>
                        {run.status === 'completed' ? 'Completed' :
                         run.status === 'running' ? 'Running' :
                         run.status === 'partial' ? 'Partial' : 'Failed'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* AI Tag Suggestions Review Modal */}
      {showSuggestions && suggestedTags.length > 0 && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowSuggestions(false)}>
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b flex-shrink-0">
              <h3 className="font-semibold text-surface-900 flex items-center gap-2">
                <Lightbulb className="w-5 h-5 text-amber-500" />
                AI Tag Suggestions
              </h3>
              <button onClick={() => setShowSuggestions(false)} className="p-1.5 rounded-lg hover:bg-surface-100">
                <X className="w-5 h-5 text-surface-400" />
              </button>
            </div>
            <div className="p-5 space-y-4 overflow-y-auto flex-1">
              <p className="text-sm text-surface-600">
                AI found <span className="font-semibold">{suggestedTags.length}</span> new tag{suggestedTags.length !== 1 ? 's' : ''} that
                could help organize your media. Accept or reject each one — accepted tags will be created and applied to matching assets.
              </p>

              <div className="space-y-2">
                {suggestedTags.map((suggestion, index) => {
                  const decision = suggestionDecisions[index];
                  const isAccepted = decision === 'accept';
                  const isRejected = decision === 'reject';

                  return (
                    <div
                      key={index}
                      className={`rounded-xl border p-3 flex items-center justify-between transition-colors ${
                        isAccepted ? 'border-green-200 bg-green-50' :
                        isRejected ? 'border-surface-200 bg-surface-50 opacity-50' :
                        'border-surface-200 bg-white'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm text-surface-800">{suggestion.name}</span>
                          {isAccepted && <Check className="w-3.5 h-3.5 text-green-600" />}
                        </div>
                        <p className="text-xs text-surface-400 mt-0.5">
                          Would apply to {suggestion.count} asset{suggestion.count !== 1 ? 's' : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 ml-3 flex-shrink-0">
                        <button
                          onClick={() => toggleSuggestion(index)}
                          className={`p-2 rounded-lg transition-colors ${
                            isAccepted
                              ? 'bg-green-100 text-green-700'
                              : 'hover:bg-green-50 text-surface-400 hover:text-green-600'
                          }`}
                          title="Accept"
                        >
                          <ThumbsUp className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => {
                            setSuggestionDecisions(prev => ({
                              ...prev,
                              [index]: prev[index] === 'reject' ? undefined : 'reject',
                            }));
                          }}
                          className={`p-2 rounded-lg transition-colors ${
                            isRejected
                              ? 'bg-surface-200 text-surface-600'
                              : 'hover:bg-red-50 text-surface-400 hover:text-red-500'
                          }`}
                          title="Reject"
                        >
                          <ThumbsDown className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="p-5 border-t flex-shrink-0">
              <div className="flex items-center justify-between">
                <p className="text-xs text-surface-400">
                  {Object.values(suggestionDecisions).filter(d => d === 'accept').length} accepted,{' '}
                  {Object.values(suggestionDecisions).filter(d => d === 'reject').length} rejected,{' '}
                  {suggestedTags.length - Object.keys(suggestionDecisions).length} undecided
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowSuggestions(false)}
                    className="btn-ghost text-sm"
                  >
                    Skip All
                  </button>
                  <button
                    onClick={handleAcceptSuggestions}
                    disabled={acceptingTags || Object.values(suggestionDecisions).filter(d => d === 'accept').length === 0}
                    className="btn-primary text-sm flex items-center gap-2"
                  >
                    {acceptingTags ? (
                      <><Loader2 className="w-4 h-4 animate-spin" /> Creating...</>
                    ) : (
                      <>
                        <Check className="w-4 h-4" />
                        Create {Object.values(suggestionDecisions).filter(d => d === 'accept').length} Tag{Object.values(suggestionDecisions).filter(d => d === 'accept').length !== 1 ? 's' : ''}
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* OpenAI Insufficient Quota Modal */}
      {showQuotaError && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowQuotaError(false)}>
          <div className="bg-white rounded-2xl max-w-md w-full shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b">
              <h3 className="font-semibold text-surface-900 flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-red-500" />
                Insufficient OpenAI Credits
              </h3>
              <button onClick={() => setShowQuotaError(false)} className="p-1.5 rounded-lg hover:bg-surface-100">
                <X className="w-5 h-5 text-surface-400" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-sm text-surface-700">
                The OpenAI API returned an insufficient quota error. This means your account doesn't have enough credits to process the request.
              </p>

              <div className="bg-red-50 rounded-xl p-4 space-y-2">
                <p className="text-xs font-medium text-red-700">Error from OpenAI:</p>
                <p className="text-xs text-red-600">{quotaErrorMessage}</p>
              </div>

              <div className="bg-surface-50 rounded-xl p-4 space-y-2">
                <p className="text-sm font-medium text-surface-800">How to fix this:</p>
                <ol className="text-sm text-surface-600 space-y-1.5 list-decimal list-inside">
                  <li>Go to <a href="https://platform.openai.com/account/billing" target="_blank" rel="noopener noreferrer" className="text-brand-600 underline hover:text-brand-700">platform.openai.com/account/billing</a></li>
                  <li>Add a payment method or load prepaid credits</li>
                  <li>Even $5 in credits is enough to tag thousands of images</li>
                  <li>Come back and try AI Auto-Tag again</li>
                </ol>
              </div>

              <button
                onClick={() => setShowQuotaError(false)}
                className="btn-primary text-sm w-full"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AI Auto-Tag Confirmation Modal */}
      {showAutoTagConfirm && assetCount !== null && (() => {
        const scopeCount = autoTagScope === 'untagged' ? untaggedCount : assetCount;
        return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowAutoTagConfirm(false)}>
          <div className="bg-white rounded-2xl max-w-md w-full shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b">
              <h3 className="font-semibold text-surface-900 flex items-center gap-2">
                <Wand2 className="w-5 h-5 text-brand-500" />
                AI Auto-Tag
              </h3>
              <button onClick={() => setShowAutoTagConfirm(false)} className="p-1.5 rounded-lg hover:bg-surface-100">
                <X className="w-5 h-5 text-surface-400" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              {/* Images-only notice */}
              <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-xl px-3.5 py-2.5">
                <ImageIcon className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                <div className="text-xs text-amber-700">
                  <span className="font-medium">Images only.</span> Auto-tagging analyzes image content using AI vision. Videos are excluded because a single thumbnail isn't reliable for accurate tagging.
                  {totalAllAssets > assetCount && (
                    <span className="block mt-1 text-amber-600">
                      Your library has {totalAllAssets.toLocaleString()} total assets — {assetCount.toLocaleString()} images and {(totalAllAssets - assetCount).toLocaleString()} videos.
                    </span>
                  )}
                </div>
              </div>

              {/* Scope toggle */}
              <div className="space-y-2">
                <p className="text-xs font-medium text-surface-500">Tag which images?</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setAutoTagScope('untagged')}
                    className={`flex-1 text-sm px-3 py-2.5 rounded-xl border font-medium transition-colors ${
                      autoTagScope === 'untagged'
                        ? 'border-brand-300 bg-brand-50 text-brand-700'
                        : 'border-surface-200 bg-white text-surface-600 hover:bg-surface-50'
                    }`}
                  >
                    Untagged only
                    <span className="block text-xs font-normal mt-0.5 opacity-70">{(untaggedCount || 0).toLocaleString()} images</span>
                  </button>
                  <button
                    onClick={() => setAutoTagScope('all')}
                    className={`flex-1 text-sm px-3 py-2.5 rounded-xl border font-medium transition-colors ${
                      autoTagScope === 'all'
                        ? 'border-brand-300 bg-brand-50 text-brand-700'
                        : 'border-surface-200 bg-white text-surface-600 hover:bg-surface-50'
                    }`}
                  >
                    All images
                    <span className="block text-xs font-normal mt-0.5 opacity-70">{assetCount.toLocaleString()} images</span>
                  </button>
                </div>
              </div>

              <p className="text-sm text-surface-700">
                This will analyze <span className="font-semibold">{scopeCount.toLocaleString()}</span> image{scopeCount !== 1 ? 's' : ''} using
                OpenAI Vision and apply matching tags from your tag library.
              </p>

              <div className="bg-surface-50 rounded-xl p-4 space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium text-surface-800">
                  <DollarSign className="w-4 h-4 text-surface-500" />
                  Estimated Cost
                </div>
                <p className="text-2xl font-bold text-surface-900">
                  ${estimateCost(scopeCount).toFixed(2)}
                </p>
                <p className="text-xs text-surface-400">
                  This is an estimate based on ~1,700 input tokens per thumbnail image at gpt-4o-mini rates ($0.15/1M input, $0.60/1M output). Actual cost may vary.
                </p>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  onClick={handleAutoTag}
                  disabled={scopeCount === 0}
                  className="btn-primary text-sm flex-1 flex items-center justify-center gap-2"
                >
                  <Sparkles className="w-4 h-4" />
                  Proceed with Auto-Tag
                </button>
                <button
                  onClick={() => setShowAutoTagConfirm(false)}
                  className="btn-ghost text-sm"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
        );
      })()}
    </div>
  );
}
