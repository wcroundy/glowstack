-- Separate AI assistant chats per user, with history. Until now every message went into
-- one global stream (and the model saw the last 10 of them regardless of who sent them).
CREATE TABLE IF NOT EXISTS chat_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL DEFAULT 'default',
  title TEXT NOT NULL DEFAULT 'New chat',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS chat_conversations_user_recent ON chat_conversations (user_id, last_message_at DESC);

ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS conversation_id UUID REFERENCES chat_conversations(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS chat_messages_conversation ON chat_messages (conversation_id, created_at);

-- Existing messages become one "Earlier conversation" per user
WITH grouped AS (
  SELECT COALESCE(user_id, 'default') AS uid, min(created_at) AS first_at, max(created_at) AS last_at
  FROM chat_messages WHERE conversation_id IS NULL GROUP BY 1
), created AS (
  INSERT INTO chat_conversations (user_id, title, created_at, updated_at, last_message_at)
  SELECT uid, 'Earlier conversation', first_at, last_at, last_at FROM grouped
  RETURNING id, user_id
)
UPDATE chat_messages cm SET conversation_id = created.id
FROM created WHERE cm.conversation_id IS NULL AND COALESCE(cm.user_id, 'default') = created.user_id;

-- Private, server-side only (the API uses the service role), like the other AI tables
ALTER TABLE chat_conversations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON chat_conversations FROM anon, authenticated;
GRANT ALL ON chat_conversations TO service_role;
