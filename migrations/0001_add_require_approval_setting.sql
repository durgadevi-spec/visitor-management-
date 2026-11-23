ALTER TABLE system_settings
ADD COLUMN IF NOT EXISTS require_approval boolean NOT NULL DEFAULT false;
