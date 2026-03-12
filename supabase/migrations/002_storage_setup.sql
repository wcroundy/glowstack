-- ============================================================
-- GlowStack — Supabase Storage Setup
-- ============================================================
-- Run this in the Supabase SQL Editor AFTER 001_initial_schema.sql

-- Create the media bucket for file uploads
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'media',
  'media',
  true,
  52428800,
  ARRAY[
    'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic',
    'video/mp4', 'video/quicktime', 'video/webm', 'video/x-msvideo'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- Create thumbnails bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'thumbnails',
  'thumbnails',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Allow public read access to media bucket
CREATE POLICY "Public read access for media"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'media');

-- Allow service uploads to media bucket
CREATE POLICY "Service upload access for media"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'media');

CREATE POLICY "Service update access for media"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'media');

CREATE POLICY "Service delete access for media"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'media');

-- Same policies for thumbnails
CREATE POLICY "Public read access for thumbnails"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'thumbnails');

CREATE POLICY "Service upload access for thumbnails"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'thumbnails');

CREATE POLICY "Service update access for thumbnails"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'thumbnails');

CREATE POLICY "Service delete access for thumbnails"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'thumbnails');
