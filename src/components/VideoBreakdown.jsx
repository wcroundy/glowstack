import React, { useState, useRef, useCallback } from 'react';
import { Film, Scissors, Loader2, CheckCircle, AlertCircle, X, DollarSign, Image } from 'lucide-react';
import { api } from '../services/api';

const FRAME_INTERVAL = 3; // seconds between frame captures

export default function VideoBreakdown({ asset, onComplete, onClose }) {
  const [step, setStep] = useState('estimate'); // estimate, extracting, analyzing, complete, error
  const [estimate, setEstimate] = useState(null);
  const [extractionProgress, setExtractionProgress] = useState(0);
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

  // Auto-fetch estimate on mount
  React.useEffect(() => {
    fetchEstimate();
  }, [fetchEstimate]);

  // Step 2: Extract frames from video using canvas
  const extractFrames = useCallback(async () => {
    const videoUrl = asset.file_url || asset.thumbnail_url;
    if (!videoUrl) {
      setError('No video URL available. The video may need to be re-imported from Google Photos.');
      setStep('error');
      return;
    }

    setStep('extracting');
    setExtractionProgress(0);

    // We'll use the video element to seek and capture frames
    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (!video || !canvas) {
      // Fallback: if we can't play the video (e.g., thumbnail only),
      // just send the thumbnail as the only frame
      setStep('analyzing');
      const frames = [{ timestamp: 0, dataUrl: videoUrl }];
      await analyzeFrames(frames);
      return;
    }

    // For Google Photos imported videos, we typically only have the thumbnail stored.
    // In that case, we'll send just the thumbnail for analysis.
    // This still gives value by describing what's in the video thumbnail.
    // Full video frame extraction works when the video is directly accessible.

    try {
      // Try loading the video
      video.crossOrigin = 'anonymous';
      video.src = videoUrl;

      await new Promise((resolve, reject) => {
        video.onloadedmetadata = resolve;
        video.onerror = () => reject(new Error('Could not load video'));
        setTimeout(() => reject(new Error('Video load timeout')), 10000);
      });

      const duration = video.duration || (asset.duration_seconds || 30);
      const ctx = canvas.getContext('2d');
      canvas.width = Math.min(video.videoWidth || 800, 800);
      canvas.height = Math.min(video.videoHeight || 600, 600);

      const frames = [];
      const totalFrames = Math.max(1, Math.floor(duration / FRAME_INTERVAL));

      for (let i = 0; i < totalFrames; i++) {
        const timestamp = i * FRAME_INTERVAL;
        video.currentTime = timestamp;

        await new Promise((resolve) => {
          video.onseeked = () => {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
            frames.push({ timestamp, dataUrl });
            setExtractionProgress(Math.round(((i + 1) / totalFrames) * 100));
            resolve();
          };
          setTimeout(resolve, 2000); // timeout per frame seek
        });
      }

      setExtractedFrames(frames);
      setStep('analyzing');
      await analyzeFrames(frames);
    } catch (videoErr) {
      console.warn('Video extraction failed, using thumbnail:', videoErr.message);
      // Fallback: use the thumbnail image as a single frame
      // Fetch the thumbnail and convert to data URL
      try {
        const thumbResponse = await fetch(videoUrl);
        const blob = await thumbResponse.blob();
        const dataUrl = await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result);
          reader.readAsDataURL(blob);
        });
        const frames = [{ timestamp: 0, dataUrl }];
        setExtractedFrames(frames);
        setStep('analyzing');
        await analyzeFrames(frames);
      } catch (thumbErr) {
        setError('Could not access video or thumbnail. Try re-importing the video from Google Photos.');
        setStep('error');
      }
    }
  }, [asset]);

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
    }
  };

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

                  {!estimate.hasOpenAI && (
                    <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-50 border border-amber-200">
                      <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                      <p className="text-xs text-amber-700">OpenAI API key is required. Add OPENAI_API_KEY to your environment variables.</p>
                    </div>
                  )}

                  <button
                    onClick={extractFrames}
                    disabled={!estimate.hasOpenAI}
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
                <span className="text-sm font-medium text-surface-700">Extracting frames...</span>
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
