-- ============================================================
-- Tag Categories — user-definable categories for organizing tags
-- ============================================================

CREATE TABLE IF NOT EXISTS tag_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,        -- internal key (lowercase, underscored)
  label TEXT NOT NULL,              -- display label
  color TEXT DEFAULT '#6366f1',     -- category accent color
  icon TEXT DEFAULT 'folder',       -- optional icon hint for frontend
  sort_order INTEGER DEFAULT 0,    -- for custom ordering
  is_default BOOLEAN DEFAULT false, -- built-in categories can't be deleted
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Seed default categories
INSERT INTO tag_categories (name, label, color, icon, sort_order, is_default) VALUES
  ('content_type', 'Content Type', '#3b82f6', 'layers', 0, true),
  ('aesthetic', 'Aesthetic', '#ec4899', 'sparkles', 1, true),
  ('product', 'Product', '#f97316', 'package', 2, true),
  ('brand', 'Brand', '#8b5cf6', 'tag', 3, true),
  ('platform', 'Platform', '#06b6d4', 'globe', 4, true),
  ('campaign', 'Campaign', '#22c55e', 'megaphone', 5, true),
  ('custom', 'Custom', '#6366f1', 'folder', 6, true)
ON CONFLICT (name) DO NOTHING;

-- Enable RLS
ALTER TABLE tag_categories ENABLE ROW LEVEL SECURITY;

-- Public read/write for now (single-user app)
CREATE POLICY "Allow all on tag_categories" ON tag_categories
  FOR ALL USING (true) WITH CHECK (true);
