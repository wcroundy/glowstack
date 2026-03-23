-- Migration 009: Video Breakdown support
-- Adds parent_asset_id to media_assets for linking extracted frames to source videos

-- Add parent_asset_id column to media_assets
ALTER TABLE media_assets ADD COLUMN IF NOT EXISTS parent_asset_id UUID REFERENCES media_assets(id) ON DELETE CASCADE;

-- Add frame_timestamp for tracking which point in the video the frame was extracted from
ALTER TABLE media_assets ADD COLUMN IF NOT EXISTS frame_timestamp FLOAT;

-- Add scene_description for AI-generated description of what's in the frame
ALTER TABLE media_assets ADD COLUMN IF NOT EXISTS scene_description TEXT;

-- Index for quickly finding child frames of a video
CREATE INDEX IF NOT EXISTS idx_media_parent_asset ON media_assets(parent_asset_id) WHERE parent_asset_id IS NOT NULL;

-- Video breakdown runs tracking table
CREATE TABLE IF NOT EXISTS video_breakdown_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  video_asset_id UUID NOT NULL REFERENCES media_assets(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending', -- pending, processing, completed, failed
  total_frames_extracted INTEGER DEFAULT 0,
  unique_scenes_found INTEGER DEFAULT 0,
  frames_stored INTEGER DEFAULT 0,
  estimated_cost_cents INTEGER DEFAULT 0,
  actual_cost_cents INTEGER DEFAULT 0,
  error_message TEXT,
  started_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);

-- Enable RLS
ALTER TABLE video_breakdown_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public access to video_breakdown_runs" ON video_breakdown_runs FOR ALL USING (true) WITH CHECK (true);
