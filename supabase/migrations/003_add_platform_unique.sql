-- Add unique constraint on platform for upsert support
ALTER TABLE platform_connections ADD CONSTRAINT platform_connections_platform_unique UNIQUE (platform);
