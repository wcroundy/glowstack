import React, { useState, useEffect, useCallback } from 'react';
import {
  Image, FolderOpen, Check, CheckSquare, Square, Download,
  ChevronLeft, Loader2, AlertCircle, ExternalLink, RefreshCw, Unplug,
} from 'lucide-react';
import { api } from '../../services/api';

export default function GooglePhotosBrowser({ onImportComplete }) {
  const [status, setStatus] = useState(null);
  const [view, setView] = useState('albums'); // 'albums' | 'media'
  const [albums, setAlbums] = useState([]);
  const [mediaItems, setMediaItems] = useState([]);
  const [selectedAlbum, setSelectedAlbum] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [nextPageToken, setNextPageToken] = useState(null);
  const [error, setError] = useState('');
  const [importResult, setImportResult] = useState(null);

  // Check connection status
  useEffect(() => {
    api.googlePhotosStatus().then(setStatus).catch(() =>
      setStatus({ configured: false, connected: false })
    );
  }, []);

  // Load albums when connected
  useEffect(() => {
    if (status?.connected && view === 'albums') {
      loadAlbums();
    }
  }, [status?.connected]);

  const loadAlbums = async (pageToken = null) => {
    setLoading(true);
    setError('');
    try {
      const data = await api.googlePhotosAlbums(pageToken);
      setAlbums(prev => pageToken ? [...prev, ...data.albums] : data.albums);
      setNextPageToken(data.nextPageToken);
    } catch (err) {
      setError('Failed to load albums: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadMedia = async (albumId = null, pageToken = null) => {
    setLoading(true);
    setError('');
    try {
      const params = { pageSize: 25 };
      if (albumId) params.albumId = albumId;
      if (pageToken) params.pageToken = pageToken;
      const data = await api.googlePhotosMedia(params);
      setMediaItems(prev => pageToken ? [...prev, ...data.items] : data.items);
      setNextPageToken(data.nextPageToken);
    } catch (err) {
      setError('Failed to load photos: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const openAlbum = (album) => {
    setSelectedAlbum(album);
    setView('media');
    setMediaItems([]);
    setSelected(new Set());
    loadMedia(album.id);
  };

  const showAllPhotos = () => {
    setSelectedAlbum(null);
    setView('media');
    setMediaItems([]);
    setSelected(new Set());
    loadMedia();
  };

  const goBackToAlbums = () => {
    setView('albums');
    setMediaItems([]);
    setSelected(new Set());
    setNextPageToken(null);
    setImportResult(null);
  };

  const toggleSelect = (googleId) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(googleId)) next.delete(googleId);
      else next.add(googleId);
      return next;
    });
  };

  const selectAll = () => {
    if (selected.size === mediaItems.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(mediaItems.map(i => i.googleId)));
    }
  };

  const handleImport = async () => {
    if (selected.size === 0) return;
    setImporting(true);
    setError('');
    setImportResult(null);
    try {
      const result = await api.googlePhotosImport([...selected]);
      setImportResult(result);
      setSelected(new Set());
      if (onImportComplete) onImportComplete(result);
    } catch (err) {
      setError('Import failed: ' + err.message);
    } finally {
      setImporting(false);
    }
  };

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
      setAlbums([]);
      setMediaItems([]);
      setSelected(new Set());
    } catch (err) {
      setError('Failed to disconnect: ' + err.message);
    }
  };

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

  // Albums view
  if (view === 'albums') {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-surface-800">Google Photos</h3>
            <p className="text-xs text-surface-400">Connected as {status.account || 'Google Account'}</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={showAllPhotos} className="btn-secondary text-xs">
              <Image className="w-3.5 h-3.5" />
              All Photos
            </button>
            <button onClick={handleDisconnect} className="btn-ghost text-xs text-red-500 hover:text-red-700">
              <Unplug className="w-3.5 h-3.5" />
              Disconnect
            </button>
          </div>
        </div>

        {error && (
          <div className="text-sm text-red-500 bg-red-50 rounded-xl px-3 py-2">{error}</div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {albums.map(album => (
            <button
              key={album.id}
              onClick={() => openAlbum(album)}
              className="card-hover p-3 text-left group"
            >
              {album.coverUrl ? (
                <img
                  src={album.coverUrl}
                  alt={album.title}
                  className="w-full aspect-square object-cover rounded-lg mb-2"
                />
              ) : (
                <div className="w-full aspect-square bg-surface-100 rounded-lg mb-2 flex items-center justify-center">
                  <FolderOpen className="w-8 h-8 text-surface-300" />
                </div>
              )}
              <p className="text-sm font-medium text-surface-800 truncate">{album.title}</p>
              <p className="text-xs text-surface-400">{album.itemCount} items</p>
            </button>
          ))}
        </div>

        {loading && (
          <div className="flex justify-center py-4">
            <Loader2 className="w-5 h-5 animate-spin text-brand-500" />
          </div>
        )}

        {nextPageToken && !loading && (
          <button onClick={() => loadAlbums(nextPageToken)} className="btn-secondary w-full text-sm">
            Load more albums
          </button>
        )}
      </div>
    );
  }

  // Media view (all photos or album)
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <button onClick={goBackToAlbums} className="btn-ghost p-1.5">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div className="min-w-0">
            <h3 className="font-semibold text-surface-800 truncate">
              {selectedAlbum ? selectedAlbum.title : 'All Photos'}
            </h3>
            <p className="text-xs text-surface-400">
              {selected.size > 0 ? `${selected.size} selected` : `${mediaItems.length} loaded`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {mediaItems.length > 0 && (
            <button onClick={selectAll} className="btn-ghost text-xs">
              {selected.size === mediaItems.length ? (
                <><CheckSquare className="w-3.5 h-3.5" /> Deselect</>
              ) : (
                <><Square className="w-3.5 h-3.5" /> Select all</>
              )}
            </button>
          )}
          {selected.size > 0 && (
            <button
              onClick={handleImport}
              disabled={importing}
              className="btn-primary text-xs"
            >
              {importing ? (
                <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Importing...</>
              ) : (
                <><Download className="w-3.5 h-3.5" /> Import {selected.size}</>
              )}
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="text-sm text-red-500 bg-red-50 rounded-xl px-3 py-2">{error}</div>
      )}

      {importResult && (
        <div className="text-sm text-green-700 bg-green-50 rounded-xl px-3 py-2">
          Successfully imported {importResult.imported} item{importResult.imported !== 1 ? 's' : ''} into your media library.
        </div>
      )}

      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
        {mediaItems.map(item => {
          const isSelected = selected.has(item.googleId);
          return (
            <button
              key={item.googleId}
              onClick={() => toggleSelect(item.googleId)}
              className={`relative aspect-square rounded-lg overflow-hidden group border-2 transition-all ${
                isSelected
                  ? 'border-brand-500 ring-2 ring-brand-200'
                  : 'border-transparent hover:border-surface-300'
              }`}
            >
              <img
                src={item.thumbnailUrl}
                alt={item.filename}
                className="w-full h-full object-cover"
                loading="lazy"
              />
              {item.mediaType === 'VIDEO' && (
                <div className="absolute bottom-1 left-1 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded">
                  VIDEO
                </div>
              )}
              <div className={`absolute top-1.5 right-1.5 w-5 h-5 rounded-full flex items-center justify-center transition-all ${
                isSelected
                  ? 'bg-brand-500 text-white'
                  : 'bg-black/30 text-white opacity-0 group-hover:opacity-100'
              }`}>
                <Check className="w-3 h-3" />
              </div>
            </button>
          );
        })}
      </div>

      {loading && (
        <div className="flex justify-center py-4">
          <Loader2 className="w-5 h-5 animate-spin text-brand-500" />
        </div>
      )}

      {nextPageToken && !loading && (
        <button
          onClick={() => loadMedia(selectedAlbum?.id, nextPageToken)}
          className="btn-secondary w-full text-sm"
        >
          Load more photos
        </button>
      )}

      {!loading && mediaItems.length === 0 && (
        <div className="text-center py-8 text-surface-400 text-sm">
          No photos found.
        </div>
      )}
    </div>
  );
}
