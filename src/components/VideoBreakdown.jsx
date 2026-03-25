import React, { useState, useRef, useCallback } from 'react';
import { Film, Scissors, Loader2, CheckCircle, AlertCircle, X, DollarSign, Image } from 'lucide-react';
import { api } from '../services/api';

const FRAME_INTERVAL = 2; // seconds between frame captures

export default function VideoBreakdown({ asset, onComplete, onClose, autoStart = false, googlePhotosBaseUrl = null, uploadedVideoUrl = null }) {
  const [step, setStep] = useState(autoStart ? 'waiting' : 'estimate'); // estimate, waiting, extracting, analyzing, complete, error
  const [estimate, setEstimate] = useState(null);
  const [extractionProgress, setExtractionProgress] = useState(0);
  const [progressStage, setProgressStage] = useState('');
  const [extractedFrames, setExtractedFrames] = useState([]);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);

  // Step 1: Get cost estimate
  const fetchEstimate = useCallback(async () => {
    setLoading(true);
    try {
      const est = await api.videoBreakdownEstimate(asset.id);
      setEstimate(est);
    } catch (err) {
      setError(err.message);
      setStep('error');
    } finally {
      setLoading(false);
    }
  }, [asset.id]);

  // Check if we can extract frames: either has a real video file OR has a Google Photos baseUrl for proxy
  const hasVideoFile = (asset.file_url && asset.thumbnail_url && asset.file_url !== asset.thumbnail_url) || !!googlePhotosBaseUrl || !!uploadedVideoUrl;

  // Step 2: Extract frames from video using canvas
  const extractFrames = useCallback(async () => {
    if (!hasVideoFile) {
      setError(
        'This video only has a thumbnail stored — the full video file is needed for scene extraction. ' +
        'Re-import this video from Google Photos to download the full file, then try again.'
      );
      setStep('error');
      if (autoStart && onComplete) {
        setTimeout(() => onComplete(null), 2000);
      }
      return;
    }

    setStep('extracting');
    setExtractionProgress(0);

    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (!video || !canvas) {
      setError('Browser does not support video frame extraction.');
      setStep('error');
      if (autoStart && onComplete) {
        setTimeout(() => onComplete(null), 2000);
      }
      return;
    }

    try {
      if (googlePhotosBaseUrl || uploadedVideoUrl) {
        // FULLY SERVER-SIDE pipeline: extract frames + AI analysis + save results
        // No giant base64 payloads cross the wire — everything stays on the server
        const source = googlePhotosBaseUrl ? 'Google Photos' : 'uploaded video';
        console.log(`VideoBreakdown: using server-side extract-and-process (${source})...`);
        setExtractionProgress(5);
        setProgressStage('Starting...');
        setStep('extracting');

        const serverResult = await api.videoBreakdownExtractAndProcess(
          asset.id,
          {
            baseUrl: googlePhotosBaseUrl || undefined,
            videoUrl: uploadedVideoUrl || undefined,
          },
          (percent, stage) => {
            setExtractionProgress(percent);
            setProgressStage(stage);
          }
        );

        console.log(`VideoBreakdown: server processed ${serverResult.totalFramesAnalyzed} frames, found ${serverResult.uniqueScenesFound} scenes`);
        setExtractionProgress(100);
        setProgressStage('Done!');
        setResult(serverResult);
        setStep('complete');
        if (onComplete) onComplete(serverResult);
        return;
      }

      // CLIENT-SIDE extraction using canvas (for videos already in Supabase storage)
      let validFrames = [];
      video.crossOrigin = 'anonymous';
      video.src = asset.file_url;

      await new Promise((resolve, reject) => {
        let settled = false;
        const settle = (fn) => { if (!settled) { settled = true; fn(); } };
        video.onloadedmetadata = () => settle(resolve);
        video.oncanplay = () => settle(resolve);
        video.onerror = (e) => settle(() => reject(new Error(`Could not load video: ${e?.target?.error?.message || 'unsupported format'}`)));
        setTimeout(() => settle(() => reject(new Error('Video load timeout — format may not be supported'))), 30000);
      });

      const duration = video.duration || (asset.duration_seconds || 30);
      const ctx = canvas.getContext('2d');
      canvas.width = Math.min(video.videoWidth || 800, 800);
      canvas.height = Math.min(video.videoHeight || 600, 600);
      console.log(`VideoBreakdown: video loaded — ${Math.round(duration)}s, ${video.videoWidth}x${video.videoHeight}`);

      const frames = [];
      const totalFrames = Math.max(1, Math.floor(duration / FRAME_INTERVAL));

      for (let i = 0; i < totalFrames; i++) {
        const timestamp = i * FRAME_INTERVAL;
        video.currentTime = timestamp;

        await new Promise((resolve) => {
          const timer = setTimeout(resolve, 3000);
          video.onseeked = () => {
            clearTimeout(timer);
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
            frames.push({ timestamp, dataUrl });
            setExtractionProgress(Math.round(((i + 1) / totalFrames) * 100));
            resolve();
          };
        });
      }

      video.removeAttribute('src');
      video.load();
      validFrames = frames.filter(f => f.dataUrl.length > 1000);
      console.log(`VideoBreakdown: client extracted ${validFrames.length} valid frames`);

      if (validFrames.length === 0) {
        setError('Could not extract any frames from this video.');
        setStep('error');
        if (autoStart && onComplete) {
          setTimeout(() => onComplete(null), 2000);
        }
        return;
      }

      setExtractedFrames(validFrames);
      setStep('analyzing');
      await analyzeFrames(validFrames);
    } catch (videoErr) {
      console.error('Video extraction failed:', videoErr.message);
      setError(`Video extraction failed: ${videoErr.message}`);
      setStep('error');
      // In auto mode, skip errors and advance to next video
      if (autoStart && onComplete) {
        setTimeout(() => onComplete(null), 2000);
      }
    }
  }, [asset, hasVideoFile, googlePhotosBaseUrl]);

  // Step 3: Send frames to backend for AI analysis
  const analyzeFrames = async (frames) => {
    try {
      const result = await api.videoBreakdownProcess(asset.id, frames);
      setResult(result);
      setStep('complete');
      if (onComplete) onComplete(result);
    } catch (err) {
      setError(err.message);
      setStep('error');
      // In auto mode, skip errors and advance to next video
      if (autoStart && onComplete) {
        setTimeout(() => onComplete(null), 2000);
      }
    }
  };

  // Auto-fetch estimate on mount (only if not auto-starting)
  React.useEffect(() => {
    if (!autoStart) fetchEstimate();
  }, [fetchEstimate, autoStart]);

  // Auto-start extraction after mount (needs a tick for refs to be ready)
  const autoStarted = useRef(false);
  React.useEffect(() => {
    if (autoStart && !autoStarted.current && step === 'waiting') {
      autoStarted.current = true;
      setTimeout(() => extractFrames(), 100);
    }
  }, [autoStart, step, extractFrames]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-surface-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand-100 flex items-center justify-center">
              <Scissors className="w-5 h-5 text-brand-600" />
            </div>
            <div>
              <h3 className="font-semibold text-surface-900">Video Breakdown</h3>
              <p className="text-xs text-surface-500 truncate max-w-[250px]">{asset.title || asset.file_name}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-surface-100">
            <X className="w-5 h-5 text-surface-400" />
          </button>
        </div>

        <div className="p-5">
          {/* Estimate Step */}
          {step === 'estimate' && (
            <div className="space-y-4">
              <p className="text-sm text-surface-600">
                AI will extract frames from this video and identify unique outfits, products, and looks.
                Each unique scene becomes a taggable image in your library.
              </p>

              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 text-brand-500 animate-spin" />
                </div>
              ) : estimate ? (
                <div className="space-y-3">
                  <div className="bg-surface-50 rounded-xl p-4 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-surface-500">Video duration</span>
                      <span className="font-medium text-surface-800">{Math.round(estimate.durationSeconds)}s</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-surface-500">Frames to extract</span>
                      <span className="font-medium text-surface-800">{estimate.totalFramesToExtract} (every {estimate.frameInterval}s)</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-surface-500">Est. unique scenes</span>
                      <span className="font-medium text-surface-800">~{estimate.estimatedUniqueScenes}</span>
                    </div>
                    <div className="border-t border-surface-200 pt-2 mt-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-surface-600 font-medium flex items-center gap-1">
                          <DollarSign className="w-3.5 h-3.5" /> Estimated cost
                        </span>
                        <span className="font-semibold text-brand-600">{estimate.estimatedCostDisplay}</span>
                      </div>
                    </div>
                  </div>

                  {!hasVideoFile && (
                    <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-50 border border-amber-200">
                      <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                      <p className="text-xs text-amber-700">
                        Full video file not stored. Re-import this video from Google Photos to enable scene extraction.
                      </p>
                    </div>
                  )}

                  {!estimate.hasOpenAI && (
                    <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-50 border border-amber-200">
                      <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                      <p className="text-xs text-amber-700">OpenAI API key is required. Add OPENAI_API_KEY to your environment variables.</p>
                    </div>
                  )}

                  <button
                    onClick={extractFrames}
                    disabled={!estimate.hasOpenAI || !hasVideoFile}
                    className="btn-primary w-full flex items-center justify-center gap-2"
                  >
                    <Film className="w-4 h-4" />
                    Break Down Video
                  </button>
                </div>
              ) : null}
            </div>
          )}

          {/* Extracting Frames Step */}
          {step === 'extracting' && (
            <div className="space-y-4 py-4">
              <div className="flex items-center gap-3">
                <Loader2 className="w-5 h-5 text-brand-500 animate-spin" />
                <span className="text-sm font-medium text-surface-700">{progressStage || 'Processing...'}</span>
              </div>
              <div className="w-full bg-surface-200 rounded-full h-2">
                <div
                  className="bg-brand-500 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${extractionProgress}%` }}
                />
              </div>
              <p className="text-xs text-surface-400 text-center">{extractionProgress}% complete</p>
            </div>
          )}

          {/* Analyzing Step */}
          {step === 'analyzing' && (
            <div className="space-y-4 py-8 text-center">
              <Loader2 className="w-8 h-8 text-brand-500 animate-spin mx-auto" />
              <div>
                <p className="text-sm font-medium text-surface-700">AI is analyzing {extractedFrames.length} frames...</p>
                <p className="text-xs text-surface-400 mt-1">Identifying unique outfits, products, and looks</p>
              </div>
            </div>
          )}

          {/* Complete Step */}
          {step === 'complete' && result && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-3 rounded-xl bg-emerald-50 border border-emerald-200">
                <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-emerald-800">Breakdown complete!</p>
                  <p className="text-xs text-emerald-600">
                    Found {result.uniqueScenesFound} unique scene{result.uniqueScenesFound !== 1 ? 's' : ''} from {result.totalFramesAnalyzed} frames
                  </p>
                </div>
              </div>

              {result.scenes && result.scenes.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-surface-500 uppercase tracking-wide">Scenes detected</p>
                  {result.scenes.map((scene, i) => (
                    <div key={i} className="flex items-center gap-3 p-2.5 rounded-xl bg-surface-50">
                      <div className="w-8 h-8 rounded-lg bg-brand-100 flex items-center justify-center shrink-0">
                        <Image className="w-4 h-4 text-brand-600" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-surface-800 truncate">{scene.outfitOrProduct || scene.description}</p>
                        <p className="text-xs text-surface-400">at {Math.round(scene.timestamp)}s</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <p className="text-xs text-surface-400 text-center">
                {result.framesStored} frame{result.framesStored !== 1 ? 's' : ''} added to your library • Cost: {result.estimatedCostDisplay}
              </p>

              <button onClick={onClose} className="btn-primary w-full">
                Done
              </button>
            </div>
          )}

          {/* Error Step */}
          {step === 'error' && (
            <div className="space-y-4 py-4">
              <div className="flex items-start gap-3 p-3 rounded-xl bg-red-50 border border-red-200">
                <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-red-800">Breakdown failed</p>
                  <p className="text-xs text-red-600 mt-0.5">{error}</p>
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => { setError(null); setStep('estimate'); fetchEstimate(); }} className="btn-secondary flex-1">
                  Try Again
                </button>
                <button onClick={onClose} className="btn-ghost flex-1">
                  Close
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Hidden video + canvas for frame extraction */}
        <video ref={videoRef} style={{ display: 'none' }} preload="metadata" />
        <canvas ref={canvasRef} style={{ display: 'none' }} />
      </div>
    </div>
  );
}
