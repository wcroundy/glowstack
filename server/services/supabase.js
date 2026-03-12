import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || '';

// Use service role key for server-side operations (bypasses RLS)
const supabaseKey = supabaseServiceKey || supabaseAnonKey || 'placeholder';

export const supabase = createClient(supabaseUrl, supabaseKey);

// Helper to check if Supabase is properly configured
export const isSupabaseConfigured = () => {
  return (
    supabaseUrl !== 'https://placeholder.supabase.co' &&
    supabaseKey !== 'placeholder' &&
    supabaseUrl.includes('supabase.co')
  );
};

// Storage helpers
export const getPublicUrl = (bucket, path) => {
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data?.publicUrl || null;
};

export const uploadFile = async (bucket, path, file, contentType) => {
  const { data, error } = await supabase.storage
    .from(bucket)
    .upload(path, file, { contentType, upsert: true });
  if (error) throw error;
  return {
    path: data.path,
    publicUrl: getPublicUrl(bucket, data.path),
  };
};

export const deleteFile = async (bucket, paths) => {
  const { error } = await supabase.storage.from(bucket).remove(paths);
  if (error) throw error;
};

export default supabase;
