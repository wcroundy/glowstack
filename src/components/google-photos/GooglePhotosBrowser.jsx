import React, { useState, useEffect, useRef } from 'react';
import {
  Image, Download, Loader2, AlertCircle, ExternalLink, Unplug,
  Check, CheckSquare, Square, RefreshCw, CheckCircle2, Scissors,
  DollarSign, X, Film, RotateCcw, Video,
} from 'lucide-react';
import { api } from '../../services/api';

// Cost constants (must match server/routes/videoBreakdown.js)
const COST_PER_FRAME_CENTS = 0.2;
const COST_PER_SCENE_DETECTION_CENTS = 0.5;
const FRAME_INTERVAL_SECONDS = 2;
const DEFAULT_VIDEO_DURATION = 30;

export default function GooglePhotosBrowser({ onImportComplete }) {
  const [status, setStatus] = useState(null);
  const [session, setSession] = useState(null); // { sessionId, pickerUri }
  const [pickerDone, setPickerDone] = useState(false);
  const [mediaItems, setMediaItems] = useState([]);
  const [duplicateIds, setDuplicateIds] = useState(new Set());
  const [selected, setSelected] = useState(new Set());
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(null); // { done, total }
  const [error, setError] = useState('');
  const [importResult, setImportResult] = useState(null);
  const [polling, setPolling] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [failedVideos, setFailedVideos] = useState([]); // [{ assetId, googleId, baseUrl, filename, retrying, retryDone }]
  const pollRef = useRef(null);

  // Check connection status
  useEffect(() => {
    api.googlePhotosStatus().then(setStatus).catch(() =>
      setStatus({ configured: false, connected: false })
    );
  }, []);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const handleConnect = async () => {
    try {
      const { url } = await api.googlePhotosAuthUrl();
      window.location.href = url;
    } catch (err) {
      setError('Failed to start auth: ' + err.message);
    }
  };

  const handleDisconnect = async () => {
    try {
      await api.googlePhotosDisconnect();
      setStatus({ configured: true, connected: false });
      setSession(null);
      setMediaItems([]);
      setSelected(new Set());
      setDuplicateIds(new Set());
      setPickerDone(false);
    } catch (err) {
      setError('Failed to disconnect: ' + err.message);
    }
  };

  // Start a picker session
  const startPicker = async () => {
    setError('');
    setLoading(true);
    setPickerDone(false);
    setMediaItems([]);
    setSelected(new Set());
    setDuplicateIds(new Set());
    setImportResult(null);
    try {
      const data = await api.googlePhotosCreateSession();
      setSession(data);

      // Open picker in new tab
      window.open(data.pickerUri, '_blank');

      // Start polling for completion
      setPolling(true);
      pollRef.current = setInterval(async () => {
        try {
          const sessionStatus = await api.googlePhotosGetSession(data.sessionId);
          if (sessionStatus.mediaItemsSet) {
            clearInterval(pollRef.current);
            pollRef.current = null;
            setPolling(false);
            setPickerDone(true);
            await loadSelectedMedia(data.sessionId);
          }
        } catch (pollErr) {
          console.error('Poll error:', pollErr);
        }
      }, 3000);
    } catch (err) {
      setError('Failed to start photo picker: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Load media items from completed session, then check for duplicates
  const loadSelectedMedia = async (sessionId, pageToken = null) => {
    setLoading(true);
    try {
      // Collect all items across pages
      let allItems = [];
      let currentPageToken = pageToken;

      const firstData = await api.googlePhotosSessionMedia(sessionId, currentPageToken);
      allItems = [...firstData.items];
      currentPageToken = firstData.nextPageToken;

      while (currentPageToken) {
        const moreData = await api.googlePhotosSessionMedia(sessionId, currentPageToken);
        allItems = [...allItems, ...moreData.items];
        currentPageToken = moreData.nextPageToken;
      }

      setMediaItems(allItems);

      // Check which ones are already imported
      const googleIds = allItems.map(i => i.id);
      try {
        const { duplicates } = await api.googlePhotosCheckDuplicates(googleIds);
        const dupSet = new Set(duplicates);
        setDuplicateIds(dupSet);

        // Auto-select only NEW items (not duplicates)
        const newIds = allItems.filter(i => !dupSet.has(i.id)).map(i => i.id);
        setSelected(new Set(newIds));
      } catch {
        // If duplicate check fails, select all
        setSelected(new Set(googleIds));
      }
    } catch (err) {
      setError('Failed to load selected photos: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const toggleSelect = (id) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllNew = () => {
    const newItems = mediaItems.filter(i => !duplicateIds.has(i.id));
    if (selected.size === newItems.length && newItems.every(i => selected.has(i.id))) {
      setSelected(new Set());
    } else {
      setSelected(new Set(newItems.map(i => i.id)));
    }
  };

  // Calculate video count and estimated scene extraction cost from selected items
  const getVideoStats = () => {
    const selectedItems = mediaItems.filter(i => selected.has(i.id));
    const videos = selectedItems.filter(i => i.type === 'VIDEO');
    const totalFrames = videos.reduce((sum, v) => {
      const duration = DEFAULT_VIDEO_DURATION; // we don't have duration from picker, use default
      return sum + Math.max(1, Math.floor(duration / FRAME_INTERVAL_SECONDS));
    }, 0);
    const costCents = Math.ceil(
      totalFrames * COST_PER_FRAME_CENTS + videos.length * COST_PER_SCENE_DETECTION_CENTS
    );
    return {
      videoCount: videos.length,
      totalItems: selectedItems.length,
      imageCount: selectedItems.length - videos.length,
      estimatedCostCents: costCents,
      estimatedCostDisplay: `$${(costCents / 100).toFixed(2)}`,
    };
  };

  const handleImportClick = () => {
    if (selected.size === 0) return;
    const stats = getVideoStats();
    if (stats.videoCount > 0) {
      setShowConfirmModal(true);
    } else {
      runImport(false);
    }
  };

  const runImport = async (extractScenes) => {
    setShowConfirmModal(false);
    if (selected.size === 0) return;
    setImporting(true);
    setError('');
    setImportResult(null);
    setImportProgress({ done: 0, total: selected.size });

    try {
      const itemsToImport = mediaItems.filter(i => selected.has(i.id));

      // Send ONE item at a time — video downloads need most of the 60s serverless limit
      const CHUNK_SIZE = 1;
      let totalImported = 0;
      let totalAlreadyExisted = 0;
      let importedItemIds = [];
      let videoFailures = [];

      // Build a lookup from google ID to picker item (for baseUrl on retry)
      const googleIdToItem = new Map(itemsToImport.map(i => [i.id, i]));

      for (let i = 0; i < itemsToImport.length; i += CHUNK_SIZE) {
        const chunk = itemsToImport.slice(i, i + CHUNK_SIZE);
        try {
          const result = await api.googlePhotosImport(chunk);
          totalImported += result.imported || 0;
          totalAlreadyExisted += result.alreadyExisted || 0;
          // Collect the actual imported asset IDs and check for video failures
          if (result.items) {
            for (const item of result.items) {
              importedItemIds.push(item.id);
              if (item.videoDownloadFailed) {
                // Find the original picker item by google_photos_id to get its baseUrl
                const pickerItem = googleIdToItem.get(item.googlePhotosId);
                videoFailures.push({
                  assetId: item.id,
                  filename: item.filename,
                  baseUrl: pickerItem?.baseUrl || '',
                  retrying: false,
                  retryDone: false,
                });
              }
            }
          }
        } catch (chunkErr) {
          console.error(`Chunk ${i / CHUNK_SIZE + 1} failed:`, chunkErr);
          // Continue with remaining chunks
        }
        setImportProgress({ done: Math.min(i + CHUNK_SIZE, itemsToImport.length), total: itemsToImport.length });
      }

      setFailedVideos(videoFailures);

      const finalResult = {
        imported: totalImported,
        alreadyExisted: totalAlreadyExisted,
        extractScenes,
        importedItemIds,
        failedVideoCount: videoFailures.length,
      };
      setImportResult(finalResult);
      setSelected(new Set());

      // Move newly imported items into the duplicate set
      setDuplicateIds(prev => {
        const next = new Set(prev);
        itemsToImport.forEach(i => next.add(i.id));
        return next;
      });

      // Only clean up the session if there are no failed videos (we need baseUrls for retry)
      if (videoFailures.length === 0 && session?.sessionId) {
        try { await api.googlePhotosDeleteSession(session.sessionId); } catch {}
      }

      if (onImportComplete) onImportComplete(finalResult);
    } catch (err) {
      setError('Import failed: ' + err.message);
    } finally {
      setImporting(false);
      setImportProgress(null);
    }
  };

  // Retry a single failed video download
  const retryVideoDownload = async (index) => {
    const failed = failedVideos[index];
    if (!failed || !failed.baseUrl) return;

    setFailedVideos(prev => prev.map((f, i) => i === index ? { ...f, retrying: true } : f));

    try {
      await api.googlePhotosRetryVideo(failed.assetId, failed.baseUrl);
      setFailedVideos(prev => prev.map((f, i) => i === index ? { ...f, retrying: false, retryDone: true } : f));
    } catch (err) {
      console.error('Retry failed:', err.message);
      setFailedVideos(prev => prev.map((f, i) => i === index ? { ...f, retrying: false, retryError: err.message } : f));
    }
  };

  // Retry all failed videos
  const retryAllVideos = async () => {
    for (let i = 0; i < failedVideos.length; i++) {
      if (!failedVideos[i].retryDone) {
        await retryVideoDownload(i);
      }
    }
  };

  const newCount = mediaItems.filter(i => !duplicateIds.has(i.id)).length;
  const dupCount = mediaItems.length - newCount;

  // Not configured
  if (status && !status.configured) {
    return (
      <div className="card p-6 text-center">
        <AlertCircle className="w-10 h-10 text-surface-300 mx-auto mb-3" />
        <h3 className="font-semibold text-surface-800 mb-1">Google Photos Not Configured</h3>
        <p className="text-sm text-surface-500 mb-4">
          Add your Google API credentials to the .env file to enable the Google Photos integration.
        </p>
        <div className="text-xs text-surface-400 bg-surface-50 rounded-lg p-3 text-left font-mono">
          GOOGLE_CLIENT_ID=your-client-id<br/>
          GOOGLE_CLIENT_SECRET=your-client-secret
        </div>
      </div>
    );
  }

  // Not connected
  if (status && !status.connected) {
    return (
      <div className="card p-6 text-center">
        <Image className="w-10 h-10 text-brand-400 mx-auto mb-3" />
        <h3 className="font-semibold text-surface-800 mb-1">Connect Google Photos</h3>
        <p className="text-sm text-surface-500 mb-4">
          Browse and import your photos directly into GlowStack.
        </p>
        <button onClick={handleConnect} className="btn-primary">
          <ExternalLink className="w-4 h-4" />
          Connect Google Photos
        </button>
      </div>
    );
  }

  // Loading status
  if (!status) {
    return (
      <div className="card p-6 flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-brand-500" />
        <span className="ml-2 text-sm text-surface-500">Checking connection...</span>
      </div>
    );
  }

  // Connected — show picker UI
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-surface-800">Google Photos</h3>
          <p className="text-xs text-surface-400">Connected as {status.account || 'Google Account'}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleDisconnect} className="btn-ghost text-xs text-red-500 hover:text-red-700">
            <Unplug className="w-3.5 h-3.5" />
            Disconnect
          </button>
        </div>
      </div>

      {error && (
        <div className="text-sm text-red-500 bg-red-50 rounded-xl px-3 py-2">{error}</div>
      )}

      {/* Import complete — show success with OK button to reset */}
      {importResult && (
        <div className="py-6 space-y-4">
          <div className="text-center">
            <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-3" />
            <h4 className="font-medium text-surface-800 mb-1">Import Complete</h4>
            <p className="text-sm text-surface-500">
              Successfully imported {importResult.imported} item{importResult.imported !== 1 ? 's' : ''} into your media library.
              {importResult.alreadyExisted > 0 && ` (${importResult.alreadyExisted} already existed)`}
            </p>
          </div>

          {/* Failed video downloads — retry UI */}
          {failedVideos.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-amber-800">
                    {failedVideos.filter(f => !f.retryDone).length} video{failedVideos.filter(f => !f.retryDone).length !== 1 ? 's' : ''} imported without full video file
                  </p>
                  <p className="text-xs text-amber-600 mt-0.5">
                    The video download timed out. You can retry the download — scene extraction requires the full video file.
                  </p>
                </div>
              </div>

              {failedVideos.map((failed, idx) => (
                <div key={failed.assetId} className="flex items-center gap-3 bg-white/60 rounded-lg px-3 py-2">
                  <Video className="w-4 h-4 text-surface-400 shrink-0" />
                  <span className="text-xs text-surface-700 truncate flex-1">{failed.filename}</span>
                  {failed.retryDone ? (
                    <span className="flex items-center gap-1 text-xs text-green-600 font-medium shrink-0">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Fixed
                    </span>
                  ) : failed.retrying ? (
                    <span className="flex items-center gap-1 text-xs text-brand-500 shrink-0">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" /> Downloading...
                    </span>
                  ) : (
                    <button
                      onClick={() => retryVideoDownload(idx)}
                      className="flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700 font-medium shrink-0"
                    >
                      <RotateCcw className="w-3.5 h-3.5" /> Retry
                    </button>
                  )}
                  {failed.retryError && !failed.retrying && !failed.retryDone && (
                    <span className="text-[10px] text-red-500 shrink-0">Failed</span>
                  )}
                </div>
              ))}

              {failedVideos.filter(f => !f.retryDone && !f.retrying).length > 1 && (
                <button onClick={retryAllVideos} className="btn-secondary text-xs w-full">
                  <RotateCcw className="w-3.5 h-3.5" />
                  Retry All
                </button>
              )}
            </div>
          )}

          <div className="text-center">
            <button
              onClick={() => {
                setImportResult(null);
                setFailedVideos([]);
                setPickerDone(false);
                setMediaItems([]);
                setSelected(new Set());
                setDuplicateIds(new Set());
                setSession(null);
              }}
              className="btn-primary"
            >
              OK
            </button>
          </div>
        </div>
      )}

      {/* No active session — show button to start picker */}
      {!polling && !pickerDone && !importResult && (
        <div className="text-center py-6">
          <button
            onClick={startPicker}
            disabled={loading}
            className="btn-primary"
          >
            {loading ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Starting...</>
            ) : (
              <><Image className="w-4 h-4" /> Select Photos from Google</>
            )}
          </button>
          <p className="text-xs text-surface-400 mt-3">
            Opens Google's photo picker in a new tab where you can select photos to import.
          </p>
        </div>
      )}

      {/* Polling — waiting for user to finish selecting */}
      {polling && (
        <div className="text-center py-8">
          <Loader2 className="w-8 h-8 animate-spin text-brand-500 mx-auto mb-3" />
          <h4 className="font-medium text-surface-800 mb-1">Waiting for your selection...</h4>
          <p className="text-sm text-surface-500 mb-4">
            Select photos in the Google Photos tab that just opened, then click "Done" there.
          </p>
          <button
            onClick={() => {
              if (pollRef.current) clearInterval(pollRef.current);
              setPolling(false);
              setSession(null);
            }}
            className="btn-ghost text-xs text-surface-400"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Picker done — show selected items for import */}
      {pickerDone && mediaItems.length > 0 && !importResult && (
        <>
          {/* Summary bar */}
          <div className="bg-surface-50 rounded-xl px-4 py-3">
            <div className="flex items-center justify-between">
              <div className="text-sm text-surface-700">
                <span className="font-medium">{mediaItems.length}</span> photo{mediaItems.length !== 1 ? 's' : ''} selected
                {dupCount > 0 && (
                  <span className="text-surface-400 ml-2">
                    ({newCount} new, {dupCount} already in library)
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button onClick={selectAllNew} className="btn-ghost text-xs">
                  {selected.size > 0 ? (
                    <><CheckSquare className="w-3.5 h-3.5" /> Deselect all</>
                  ) : (
                    <><Square className="w-3.5 h-3.5" /> Select new</>
                  )}
                </button>
                {selected.size > 0 && (
                  <button
                    onClick={handleImportClick}
                    disabled={importing}
                    className="btn-primary text-xs"
                  >
                    {importing ? (
                      <><Loader2 className="w-3.5 h-3.5 animate-spin" />
                        {importProgress ? `${importProgress.done}/${importProgress.total}` : 'Starting...'}</>
                    ) : (
                      <><Download className="w-3.5 h-3.5" /> Import {selected.size} new</>
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
            {mediaItems.map(item => {
              const isDuplicate = duplicateIds.has(item.id);
              const isSelected = selected.has(item.id);
              const thumbUrl = item.baseUrl ? `${item.baseUrl}=w300-h300-c` : '';
              return (
                <button
                  key={item.id}
                  onClick={() => !isDuplicate && toggleSelect(item.id)}
                  className={`relative aspect-square rounded-lg overflow-hidden group border-2 transition-all ${
                    isDuplicate
                      ? 'border-green-300 opacity-60 cursor-default'
                      : isSelected
                        ? 'border-brand-500 ring-2 ring-brand-200'
                        : 'border-transparent hover:border-surface-300'
                  }`}
                >
                  {thumbUrl ? (
                    <img
                      src={thumbUrl}
                      alt={item.filename}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-full bg-surface-100 flex items-center justify-center">
                      <Image className="w-6 h-6 text-surface-300" />
                    </div>
                  )}
                  {item.type === 'VIDEO' && (
                    <div className="absolute bottom-1 left-1 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded">
                      VIDEO
                    </div>
                  )}
                  {isDuplicate ? (
                    <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full flex items-center justify-center bg-green-500 text-white">
                      <CheckCircle2 className="w-3 h-3" />
                    </div>
                  ) : (
                    <div className={`absolute top-1.5 right-1.5 w-5 h-5 rounded-full flex items-center justify-center transition-all ${
                      isSelected
                        ? 'bg-brand-500 text-white'
                        : 'bg-black/30 text-white opacity-0 group-hover:opacity-100'
                    }`}>
                      <Check className="w-3 h-3" />
                    </div>
                  )}
                  {isDuplicate && (
                    <div className="absolute bottom-1 right-1 bg-green-600/80 text-white text-[9px] px-1.5 py-0.5 rounded font-medium">
                      In library
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {/* Option to pick more */}
          <div className="text-center pt-2">
            <button
              onClick={() => {
                setPickerDone(false);
                setMediaItems([]);
                setSelected(new Set());
                setDuplicateIds(new Set());
                setImportResult(null);
              }}
              className="btn-secondary text-xs"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Select different photos
            </button>
          </div>
        </>
      )}

      {pickerDone && mediaItems.length === 0 && !loading && !importResult && (
        <div className="text-center py-8">
          <p className="text-sm text-surface-400 mb-3">No photos were selected.</p>
          <button
            onClick={() => {
              setPickerDone(false);
              setSession(null);
            }}
            className="btn-secondary text-xs"
          >
            Try again
          </button>
        </div>
      )}

      {loading && (
        <div className="flex justify-center py-4">
          <Loader2 className="w-5 h-5 animate-spin text-brand-500" />
          <span className="ml-2 text-sm text-surface-500">Loading selected photos...</span>
        </div>
      )}

      {/* Confirmation Modal — shown when importing videos */}
      {showConfirmModal && (() => {
        const stats = getVideoStats();
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="bg-white rounded-2xl shadow-xl max-w-md w-full">
              <div className="flex items-center justify-between p-4 border-b border-surface-200">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-brand-100 flex items-center justify-center">
                    <Scissors className="w-5 h-5 text-brand-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-surface-900">Import & Scene Extraction</h3>
                    <p className="text-xs text-surface-500">{stats.totalItems} item{stats.totalItems !== 1 ? 's' : ''} selected</p>
                  </div>
                </div>
                <button onClick={() => setShowConfirmModal(false)} className="p-1.5 rounded-lg hover:bg-surface-100">
                  <X className="w-5 h-5 text-surface-400" />
                </button>
              </div>

              <div className="p-5 space-y-4">
                <p className="text-sm text-surface-600">
                  Your selection includes <strong>{stats.videoCount} video{stats.videoCount !== 1 ? 's' : ''}</strong>
                  {stats.imageCount > 0 && ` and ${stats.imageCount} image${stats.imageCount !== 1 ? 's' : ''}`}.
                  Would you like to automatically extract scene thumbnails from the videos after import?
                </p>

                <div className="bg-surface-50 rounded-xl p-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-surface-500">Videos to analyze</span>
                    <span className="font-medium text-surface-800">{stats.videoCount}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-surface-500">Frame interval</span>
                    <span className="font-medium text-surface-800">Every {FRAME_INTERVAL_SECONDS}s</span>
                  </div>
                  <div className="border-t border-surface-200 pt-2 mt-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-surface-600 font-medium flex items-center gap-1">
                        <DollarSign className="w-3.5 h-3.5" /> Estimated cost
                      </span>
                      <span className="font-semibold text-brand-600">{stats.estimatedCostDisplay}</span>
                    </div>
                  </div>
                </div>

                <p className="text-xs text-surface-400">
                  Scene extraction identifies unique outfits, products, and looks in each video. Each scene becomes a taggable thumbnail on the video tile.
                </p>

                <div className="space-y-2">
                  <button
                    onClick={() => runImport(true)}
                    className="btn-primary w-full flex items-center justify-center gap-2"
                  >
                    <Film className="w-4 h-4" />
                    Import & Extract Scenes ({stats.estimatedCostDisplay})
                  </button>
                  <button
                    onClick={() => runImport(false)}
                    className="btn-secondary w-full flex items-center justify-center gap-2"
                  >
                    <Download className="w-4 h-4" />
                    Import Only — Extract Later
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
