ALTER TABLE system_settings
  ADD COLUMN IF NOT EXISTS reception_latitude double precision,
  ADD COLUMN IF NOT EXISTS reception_longitude double precision;

ALTER TABLE visitors
  ADD COLUMN IF NOT EXISTS current_location_latitude double precision,
  ADD COLUMN IF NOT EXISTS current_location_longitude double precision,
  ADD COLUMN IF NOT EXISTS current_location_updated_at timestamptz;
