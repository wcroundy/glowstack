-- ============================================================
-- Content Drafts: in-progress "Create Content" wizard sessions
-- that haven't been pinned to a calendar date yet.
-- ============================================================

CREATE TABLE IF NOT EXISTS content_drafts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id TEXT DEFAULT 'default',

  title TEXT,
  idea_notes TEXT,
  shoot_notes TEXT,
  edit_notes TEXT,
  link_notes TEXT,
  platforms TEXT[] DEFAULT '{}',

  -- Which wizard steps have been explicitly finalized (idea, shoot, edit, links, post)
  completed_steps TEXT[] DEFAULT '{}',

  status TEXT DEFAULT 'draft',  -- draft, pinned
  calendar_event_id UUID REFERENCES calendar_events(id) ON DELETE SET NULL,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_content_drafts_user ON content_drafts (user_id);
CREATE INDEX IF NOT EXISTS idx_content_drafts_status ON content_drafts (status);
